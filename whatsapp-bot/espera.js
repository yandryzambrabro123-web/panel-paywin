// Rescate de clientes en espera / en cola / por corregir.
//   - Botón de Telegram  lb:<s|r|v>:<id>  "🔓 Sacar de espera y dar link": pasa al cliente a aprobado y te manda su link de un solo uso.
//   - Comando /espera en el chat del bot: lista a todos los que siguen sin entrar (últimos 5 días), cada uno con su botón.
// Tipos: s = stake de pago, r = regalito, v = VIP (mensual).
let H = null;

const HOJAS = { s: 'RegistrosStake', r: 'RegistrosRegalito', v: 'RegistrosVip' };
const NOMBRE = { s: 'Stake de pago', r: 'Regalito', v: 'VIP' };
const SIN_ENTRAR = { s: ['pendiente', 'cola', 'corregir'], r: ['pendiente', 'cola', 'corregir'], v: ['pendiente', 'corregir'] };
const DIAS = 5;

async function marcar(cq, txt) {
  await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt.slice(0, 180) }).catch(() => {});
  if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt.slice(0, 60), callback_data: 'x' }]] } }).catch(() => {});
}

// Deja el registro en "pendiente" para que el flujo normal de aprobación lo acepte. Devuelve { reg, previo }.
async function reabrir(hoja, id) {
  let reg = null, previo = null;
  await H.cambiarHoja(hoja, (filas) => filas.map((f) => {
    if (String(f.id) !== String(id)) return f;
    reg = f; previo = f.estado;
    if (['cola', 'corregir', 'rechazado'].includes(f.estado)) return { ...f, estado: 'pendiente', reabiertoAt: new Date().toISOString() };
    return f;
  }));
  return { reg, previo };
}

async function liberar(cq, tipo, id) {
  const hoja = HOJAS[tipo];
  if (!hoja) return marcar(cq, '⚠️ Tipo desconocido');
  const { reg, previo } = await reabrir(hoja, id);
  if (!reg) return marcar(cq, '⚠️ No encontré ese registro');
  const canales = require('./canales');

  // Ya estaba aprobado: solo se vuelve a mandar su link.
  if (previo === 'aprobado') {
    if (tipo === 'v') {
      if (reg.link) await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), disable_web_page_preview: true, text: `🔗 ${reg.nombre || ''} ${reg.apellido || ''} — VIP\nTeléfono: ${reg.telefono || ''}\nSu link de un solo uso:\n${reg.link}` });
      else await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `⚠️ ${reg.nombre || ''} ya estaba aprobado en el VIP pero no tiene link guardado.` });
    } else {
      await canales.avisarLinkAprobado(tipo === 's' ? 'stake' : 'regalito', hoja, reg);
    }
    return marcar(cq, '🔗 Ya estaba aprobado: te mandé su link');
  }

  if (tipo === 's') {
    const r = await H.resolverRegistro(id, true, reg);
    if (r.error) return marcar(cq, '⚠️ ' + r.error);
    await canales.avisarLinkAprobado('stake', hoja, r.reg);
    await require('./cuadre').ofrecer({ tipo: 'st', regId: id, monto: 20, etiqueta: `Stake de pago — ${r.reg.nombre || ''} ${r.reg.apellido || ''}`.trim() }).catch(() => {});
    return marcar(cq, '🔓 Salió de espera: ya puede entrar');
  }
  if (tipo === 'r') {
    await H.manejadores.ga({ ...cq, message: null, id: cq.id }, [id]); // aprueba y manda el link al jefe
    return marcar(cq, '🔓 Salió de espera: ya puede entrar');
  }
  // VIP: usa el mismo aprobar mensual de siempre (crea link, registra al VIP y cuadre)
  await H.manejadores.vp({ ...cq, message: null }, [id, 'm']);
  return marcar(cq, '🔓 Salió de espera: ya puede entrar');
}

function hace(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!iso || isNaN(min)) return '';
  return min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
}

async function listar() {
  const limite = Date.now() - DIAS * 86400000;
  const salida = [];
  for (const tipo of Object.keys(HOJAS)) {
    let filas = [];
    try { filas = await H.leerHoja(HOJAS[tipo]); } catch (e) { continue; }
    for (const f of filas) {
      if (!SIN_ENTRAR[tipo].includes(f.estado)) continue;
      if (f.createdAt && new Date(f.createdAt).getTime() < limite) continue;
      salida.push({ tipo, f });
    }
  }
  salida.sort((a, b) => String(a.f.createdAt || '').localeCompare(String(b.f.createdAt || '')));
  return salida;
}

async function mandarLista() {
  const lista = await listar();
  if (!lista.length) return H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: '✅ No hay nadie en espera ni en cola (últimos 5 días).' });
  await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `⏳ Hay ${lista.length} cliente(s) sin entrar. Te mando uno por mensaje con su botón:` });
  for (const { tipo, f } of lista.slice(0, 20)) {
    const wa = require('./canales').waLink(f.telefono);
    const estado = f.estado === 'cola' ? '🕒 en cola' : f.estado === 'corregir' ? '✏️ por corregir' : '⏳ en espera';
    const texto = `${estado} — <b>${NOMBRE[tipo]}</b>\nNombre: <b>${H.esc(`${f.nombre || ''} ${f.apellido || ''}`.trim() || 'sin nombre')}</b>\nTeléfono: ${H.esc(f.telefono || 'sin teléfono')}\nHace: ${hace(f.createdAt) || '—'}`;
    const filas = [[{ text: '🔓 Sacar de espera y dar link', callback_data: `lb:${tipo}:${f.id}` }]];
    if (wa) filas.push([{ text: '💬 Abrir su chat de WhatsApp', url: wa }]);
    await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), parse_mode: 'HTML', text: texto, reply_markup: { inline_keyboard: filas } }).catch((e) => console.error('Lista de espera:', e.message));
    await new Promise((ok) => setTimeout(ok, 350));
  }
  if (lista.length > 20) await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `Faltan ${lista.length - 20} más. Resuelve estos y vuelve a escribir /espera.` });
}

function montar(stakes) {
  H = stakes;
  H.manejadores.lb = async (cq, [tipo, id]) => {
    try { await liberar(cq, tipo, id); }
    catch (e) { console.error('Sacar de espera:', e.message); await marcar(cq, '⚠️ ' + e.message.slice(0, 120)); }
  };
  H.hooks.push(async (u) => {
    const m = u.message;
    if (!m || !m.text || String(m.from && m.from.id) !== H.TG_ADMIN()) return;
    if (/^\/espera(@\w+)?\b/i.test(m.text.trim())) await mandarLista();
  });
}

module.exports = { montar, liberar, listar };
