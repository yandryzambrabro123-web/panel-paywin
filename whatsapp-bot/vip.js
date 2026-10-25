// Registro público del grupo VIP (en TELEGRAM) + salida AUTOMÁTICA de los miembros vencidos.
//
// Todo pasa por Telegram: NO se manda nada a WhatsApp.
//
// Configuración (una sola vez): crea el grupo/canal VIP en Telegram, agrega al bot como
// ADMINISTRADOR (con permiso de invitar y de banear usuarios) y escribe  /vipgrupo  dentro del
// grupo. El bot guarda cuál es y desde ahí genera los links de ingreso solo.
//
// Entrada:
//   1. El cliente abre  <url del bot>/vip  (link único) y llena sus datos (la fecha de ingreso se
//      pone sola con el día de hoy).
//   2. Al jefe le llega un mensaje de Telegram con botones: Aprobar (mensual / trimestral / anual)
//      o Rechazar. El plan lo elige el jefe al aprobar.
//   3. Al aprobar: se crea un link de UN SOLO USO para esa persona, que se le muestra en pantalla
//      junto con un botón para activar los avisos de su membresía (abre el bot en Telegram). Queda
//      registrado en la hoja "VIPs" del panel (si ya existía esa cédula, se renueva).
//   4. Cuando la persona entra con su link, el bot anota su id de Telegram (así puede sacarla
//      después).
//
// Salida (automática, sin avisar al jefe por Telegram):
//   Todos los días desde las 9am (Ecuador), a cada miembro VIP con la membresía vencida el bot le
//   manda un mensaje por Telegram (si activó los avisos) y lo saca del grupo VIP. Solo queda una
//   anotación en la Bandeja del panel. Medidas de seguridad:
//     - Solo toca miembros creados DESPUÉS del corte del panel (los anteriores están "ocultos").
//     - Máximo MAX_POR_DIA personas por día.
//     - Al salir se ELIMINAN todos sus datos (fila de VIPs y registros); para volver tiene que registrarse de nuevo.
//     - Si el bot no es admin del grupo o no tiene el id de Telegram de la persona, no marca nada
//       y deja un aviso en la Bandeja.
//     - Interruptor de emergencia: variable de Railway VIP_AUTO_OFF=1 (apaga las salidas automáticas).

let H = null; // helpers de stakes.js (se asignan en montar)

const HOJA_VIPS = 'VIPs';
const HOJA_REGISTROS = 'RegistrosVip';
const HOJA_CONFIG = 'ConfigVip';
const CORTE_MS = 1792930800000; // mismo corte que el panel (PANEL_CORTE_MS en index.html)
const PLAN_MESES = { mensual: 1, trimestral: 3, anual: 12 };
const TELEFONO_AGENCIA = '0963852803';
const MAX_POR_DIA = 10;
const HORA_SALIDA_MIN = 9 * 60; // 9:00 Ecuador

const idMs = (id) => { const n = parseInt(String(id || '').slice(0, -5), 36); return Number.isFinite(n) ? n : 0; };
const esVigente = (v) => idMs(v.id) >= CORTE_MS; // creado después del corte del panel
const removido = (v) => !!v.joinDate && String(v.removidoVip) === String(v.joinDate);

function diasRestantes(v, hoy) {
  if (!v.joinDate) return null;
  const meses = PLAN_MESES[String(v.plan || 'mensual').toLowerCase()] || 1;
  const d = new Date(v.joinDate);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + meses);
  return Math.ceil((new Date(d.toISOString().slice(0, 10)) - new Date(hoy)) / 86400000);
}
async function novedad(tipo, titulo, detalle) {
  try {
    await cambiarHojaSafe('Novedades', (filas) => [{ id: H.nuevoId(), tipo, titulo, detalle: detalle || '', createdAt: new Date().toISOString(), leido: false }, ...filas].slice(0, 300));
  } catch (e) { console.error('No se pudo guardar la novedad VIP:', e.message); }
}
const cambiarHojaSafe = (hoja, fn) => H.cambiarHoja(hoja, fn);

// ---------- Salida automática de vencidos ----------
let salidasHoy = { fecha: '', n: 0 };
let corriendo = false;
const intentosFallidos = new Map(); // id -> veces que falló (para no insistir toda la tarde)

async function procesarVencidos() {
  if (corriendo || process.env.VIP_AUTO_OFF === '1') return;
  const ahora = new Date(Date.now() - 5 * 3600e3);
  const hoy = ahora.toISOString().slice(0, 10);
  const minutos = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  if (minutos < HORA_SALIDA_MIN) return;
  if (!H.TG_TOKEN()) return;
  if (salidasHoy.fecha !== hoy) salidasHoy = { fecha: hoy, n: 0 };
  corriendo = true;
  try {
    // solo miembros activos creados después del corte; los "inactivos" o ya removidos se respetan
    const vips = (await H.leerHoja(HOJA_VIPS)).filter((v) => esVigente(v) && !removido(v) && String(v.status || 'active') !== 'inactive');
    const vencidos = vips.filter((v) => { const d = diasRestantes(v, hoy); return d !== null && d < 0; });
    if (!vencidos.length) return;
    const cfg = (await H.leerHoja(HOJA_CONFIG))[0];
    for (const v of vencidos) {
      if (salidasHoy.n >= MAX_POR_DIA) break;
      if ((intentosFallidos.get(v.id) || 0) >= 3) continue;
      const nombre = v.name || 'un miembro';
      if (!cfg || !cfg.chatId) {
        if (!intentosFallidos.get('cfg')) { intentosFallidos.set('cfg', 1); await novedad('alerta', 'No puedo sacar vencidos del VIP', 'Falta decirle al bot cuál es el grupo VIP: escribe /vipgrupo dentro del grupo de Telegram.'); }
        break;
      }
      const tid = String(v.telegramId || '').replace(/\D/g, '');
      if (!tid) {
        intentosFallidos.set(v.id, 99);
        await novedad('alerta', `No pude sacar a ${nombre} del VIP`, 'Venció su membresía pero el bot no tiene su id de Telegram (no entró con su link). Sácalo a mano.');
        continue;
      }
      try {
        // 1) aviso por Telegram (una sola vez por vencimiento; solo llega si la persona activó los avisos)
        if (String(v.avisoVip) !== String(v.joinDate)) {
          const primero = String(v.name || '').split(' ')[0] || '';
          const texto = `Hola ${primero} 👋\n\nTu membresía VIP llegó a su fin y te saqué del grupo. Gracias por haber sido parte 🙌\n\nSi quieres renovar y seguir recibiendo las apuestas, escríbenos al ${TELEFONO_AGENCIA} y te reactivamos.`;
          await H.tg('sendMessage', { chat_id: tid, text: texto }).catch((e) => console.error('No pude avisarle por Telegram a', nombre, e.message));
          await cambiarHojaSafe(HOJA_VIPS, (filas) => filas.map((f) => String(f.id) === String(v.id) ? { ...f, avisoVip: String(f.joinDate) } : f));
        }
        // 2) sacarlo del grupo (ban + unban: queda fuera pero puede volver a entrar si renueva)
        await H.tg('banChatMember', { chat_id: cfg.chatId, user_id: Number(tid) });
        await H.tg('unbanChatMember', { chat_id: cfg.chatId, user_id: Number(tid), only_if_banned: true });
        // 3) ELIMINAR todos sus datos del sistema (su fila de VIPs y sus registros). Si la persona
        //    quiere volver, tiene que hacer todo el registro otra vez.
        const ced = String(v.cedula || '').replace(/\D/g, '');
        await cambiarHojaSafe(HOJA_VIPS, (filas) => filas.filter((f) => String(f.id) !== String(v.id)));
        await cambiarHojaSafe(HOJA_REGISTROS, (filas) => filas.filter((f) => String(f.id) !== String(v.registroId || '') && !(ced && String(f.cedula || '').replace(/\D/g, '') === ced)));
        salidasHoy.n++;
        const primero = String(v.name || '').split(' ')[0] || 'Un miembro';
        await novedad('vip', `${primero} salió del VIP por vencimiento`, 'Se le avisó por Telegram (si activó los avisos), se le sacó del grupo y se borraron sus datos.');
      } catch (e) {
        console.error('Error sacando vencido', nombre, e.message);
        const n = (intentosFallidos.get(v.id) || 0) + 1;
        intentosFallidos.set(v.id, n);
        if (n >= 3) await novedad('alerta', `No pude sacar a ${nombre} del VIP`, `Venció su membresía. Motivo: ${e.message}. Revisa que el bot sea admin con permiso de banear. Sácalo a mano.`);
      }
    }
  } catch (e) {
    console.error('Revisión de vencidos VIP:', e.message);
  } finally { corriendo = false; }
}

// ---------- Registro público ----------

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro VIP</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0d12;color:#f3ead6;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:20px}
.w{width:100%;max-width:440px}h1{font-size:22px;margin:18px 0 4px}p{color:#9aa3b2;font-size:14px;line-height:1.45}
.c{background:linear-gradient(180deg,#161a23,#10131a);border:1px solid rgba(212,175,106,.3);border-radius:16px;padding:20px;margin-top:16px}
label{display:block;font-size:12.5px;color:#9aa3b2;margin:14px 0 6px}input{width:100%;padding:13px;border-radius:10px;border:1px solid #2a3040;background:#0b0d12;color:#fff;font-size:16px}
input:focus{outline:2px solid #D4AF6A;border-color:transparent}input[disabled]{opacity:.7}button,a.b{display:block;width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:linear-gradient(180deg,#e6c47e,#c79d4f);color:#1a1405;font-weight:700;font-size:16px;text-align:center;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5}.n{font-size:12.5px;color:#D4AF6A;margin-top:6px;min-height:16px}.e{color:#ff7a7a;font-size:13.5px;margin-top:12px}
</style></head><body><div class="w"><h1>Registro VIP</h1><p>Completa tus datos para que aprobemos tu ingreso al grupo VIP.</p><div class="c" id="box"></div></div>
<script>
const $=s=>document.querySelector(s);let timer=null;const box=$('#box');
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function hoy(){const d=new Date(Date.now()-5*3600e3);return d.toISOString().slice(0,10)}
function form(){
  box.innerHTML='<label>Nombre</label><input id="nom" autocomplete="given-name"><label>Apellido</label><input id="ape" autocomplete="family-name">'+
  '<label>Número de cédula</label><input id="ced" inputmode="numeric" maxlength="10" placeholder="1700000000" autocomplete="off">'+
  '<label>Ciudad</label><input id="ciu" autocomplete="address-level2"><label>Correo electrónico</label><input id="cor" type="email" inputmode="email" autocapitalize="none" autocomplete="email">'+
  '<label>Número de teléfono</label><input id="tel" inputmode="tel" maxlength="10" placeholder="0999999999"><label>Fecha de ingreso</label><input id="fec" disabled value="'+hoy()+'">'+
  '<div class="e" id="err"></div><button id="env">Enviar registro</button>';
  $('#ced').oninput=e=>{e.target.value=e.target.value.replace(/\\D/g,'')};
  $('#env').onclick=enviar;
}
async function enviar(){
  const b=$('#env'),er=$('#err');er.textContent='';
  const body={cedula:$('#ced').value,nombre:$('#nom').value,apellido:$('#ape').value,ciudad:$('#ciu').value,correo:$('#cor').value,telefono:$('#tel').value};
  if(!body.nombre.trim()||!body.apellido.trim()||body.cedula.replace(/\\D/g,'').length!==10||!body.ciudad.trim()||!body.correo.includes('@')||body.telefono.replace(/\\D/g,'').length<9){er.textContent='Completa todos los campos.';return}
  b.disabled=true;b.textContent='Enviando…';
  try{const r=await fetch('/vip/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error');espera(d.id)}catch(e){er.textContent=e.message;b.disabled=false;b.textContent='Enviar registro'}
}
function espera(id){
  box.innerHTML='<p style="color:#f3ead6;font-size:16px">⏳ Registro enviado. Estamos revisando tu pago; no cierres esta pantalla.</p>';
  const tick=async()=>{try{const r=await fetch('/vip/estado/'+id);const d=await r.json();
    if(d.estado==='aprobado'){clearInterval(timer);box.innerHTML='<p style="color:#7ee2a8;font-size:17px">✅ ¡Aprobado! Bienvenido al VIP.</p><p>1. Entra al grupo con tu link personal (sirve una sola vez, no lo compartas).</p><a class="b" href="'+esc(d.link)+'" target="_blank" rel="noopener">Entrar al grupo VIP</a>'+(d.bot?'<p style="margin-top:18px">2. Activa los avisos de tu membresía (te avisamos antes de que termine).</p><a class="b" style="background:#232a38;color:#f3ead6;margin-top:8px" href="https://t.me/'+esc(d.bot)+'?start=vip_'+esc(id)+'" target="_blank" rel="noopener">Activar avisos</a>':'')}
    else if(d.estado==='rechazado'){clearInterval(timer);box.innerHTML='<p style="color:#ff7a7a;font-size:16px">No pudimos aprobar tu registro. Comunícate con la agencia.</p>'}
  }catch(e){}};
  timer=setInterval(tick,4000);
}
form();
</script></body></html>`;

let botUsername = '';
async function nombreBot() {
  if (botUsername) return botUsername;
  try { const me = await H.tg('getMe', {}); botUsername = me.username || ''; } catch (e) { /* sin nombre: la página no muestra el botón de avisos */ }
  return botUsername;
}

// Guarda el id de Telegram de la persona (en su registro y en su fila de VIPs) para poder sacarla y avisarle después.
async function vincularTelegram(regId, userId) {
  if (!regId || !userId) return;
  await H.cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => String(f.id) === String(regId) ? { ...f, telegramId: String(userId) } : f));
  await H.cambiarHoja(HOJA_VIPS, (filas) => filas.map((f) => String(f.registroId || '') === String(regId) ? { ...f, telegramId: String(userId) } : f));
}

function montar(app, stakes) {
  H = stakes;

  // Escucha de Telegram: /vipgrupo, /start vip_<id> y entradas al grupo con un link personal
  H.hooks.push(async (u) => {
    const m = u.message || u.channel_post;
    if (m && typeof m.text === 'string') {
      const t = m.text.trim();
      const esAdmin = !m.from || String(m.from.id) === H.TG_ADMIN();
      if (/^\/vipgrupo(@\w+)?$/i.test(t) && m.chat.type !== 'private' && esAdmin) {
        await H.cambiarHoja(HOJA_CONFIG, () => [{ chatId: String(m.chat.id), titulo: m.chat.title || '', actualizado: new Date().toISOString() }]);
        await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `✅ Grupo VIP guardado: "${m.chat.title || m.chat.id}". Desde ahora los clientes aprobados reciben un link de ingreso a este grupo.` }).catch(() => {});
        return;
      }
      const st = t.match(/^\/start\s+vip_(\w+)$/i);
      if (st && m.chat.type === 'private' && m.from) {
        await vincularTelegram(st[1], m.from.id);
        await H.tg('sendMessage', { chat_id: m.chat.id, text: '✅ Listo. Aquí te voy a avisar cuando tu membresía VIP esté por terminar.' }).catch(() => {});
        return;
      }
    }
    const cm = u.chat_member;
    if (cm && cm.invite_link && /^vip:/.test(cm.invite_link.name || '') && ['member', 'administrator'].includes(cm.new_chat_member && cm.new_chat_member.status)) {
      await vincularTelegram(cm.invite_link.name.slice(4), cm.new_chat_member.user.id);
    }
  });

  // Botones de Telegram:  vp:<id>:<m|t|a> = aprobar con ese plan   vr:<id> = rechazar
  const PLANES = { m: 'mensual', t: 'trimestral', a: 'anual' };
  const marcar = async (cq, txt) => {
    await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
    if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
  };
  H.manejadores.vp = async (cq, [id, p]) => {
    const r = await aprobar(id, PLANES[p] || 'mensual');
    await marcar(cq, r.error ? `⚠️ ${r.error}` : `✅ Aprobado (${PLANES[p] || 'mensual'})`);
  };
  H.manejadores.vr = async (cq, [id]) => {
    let hecho = false, previo = null;
    await H.cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => {
      if (String(f.id) !== String(id)) return f;
      previo = f.estado; if (f.estado !== 'pendiente') return f; hecho = true;
      return { ...f, estado: 'rechazado', resueltoAt: new Date().toISOString() };
    }));
    await marcar(cq, hecho ? '❌ Rechazado' : `⚠️ Ya estaba ${previo || 'resuelto'}`);
  };

  async function aprobar(id, plan) {
    let reg = null, ya = false;
    // Antes de aprobar: tiene que existir el grupo VIP y poder crear el link de un solo uso
    const cfg = (await H.leerHoja(HOJA_CONFIG))[0];
    if (!cfg || !cfg.chatId) return { error: 'Falta configurar el grupo VIP: escribe /vipgrupo dentro del grupo de Telegram.' };
    let link = '';
    try {
      const l = await H.tg('createChatInviteLink', { chat_id: cfg.chatId, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 72 * 3600, name: 'vip:' + id });
      link = l.invite_link;
    } catch (e) { return { error: 'No pude crear el link del grupo. ¿El bot es admin con permiso de invitar? (' + e.message.slice(0, 80) + ')' }; }
    await H.cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => {
      if (String(f.id) !== String(id)) return f;
      reg = f; if (f.estado !== 'pendiente') { ya = true; return f; }
      return { ...f, estado: 'aprobado', plan, link, resueltoAt: new Date().toISOString() };
    }));
    if (!reg) return { error: 'No encontré ese registro.' };
    if (ya) return { error: `Ese registro ya estaba ${reg.estado}.` };
    const hoy = H.hoyEC();
    const notas = `Correo: ${reg.correo}`;
    await H.cambiarHoja(HOJA_VIPS, (filas) => {
      const ced = String(reg.cedula).replace(/\D/g, '');
      const idx = filas.findIndex((v) => String(v.cedula || '').replace(/\D/g, '') === ced && esVigente(v));
      if (idx >= 0) { // renovación: la misma persona vuelve a pagar
        const f = filas[idx];
        const nuevas = filas.slice();
        nuevas[idx] = { ...f, name: `${reg.nombre} ${reg.apellido}`, contact: reg.telefono, city: reg.ciudad, plan, joinDate: hoy, status: 'active', removidoVip: '', avisoVip: '', notes: notas, registroId: reg.id };
        return nuevas;
      }
      return [...filas, { id: H.nuevoId(), name: `${reg.nombre} ${reg.apellido}`, contact: reg.telefono, cedula: reg.cedula, city: reg.ciudad, plan, joinDate: hoy, notes: notas, status: 'active', noReconsumo: false, giftPending: false, removidoVip: '', avisoVip: '', telegramId: '', registroId: reg.id }];
    });
    return { ok: true };
  }

  app.get('/vip', (req, res) => { res.set('Cache-Control', 'no-store').type('html').send(PAGINA); });

  app.post('/vip/registro', async (req, res) => {
    if (!H.limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      if (!H.TG_TOKEN() || !H.TG_ADMIN()) return res.status(500).json({ error: 'El registro no está configurado todavía.' });
      const b = req.body || {};
      const cedula = H.soloDigitos(b.cedula), telefono = H.soloDigitos(b.telefono);
      const nombre = H.limpio(b.nombre), apellido = H.limpio(b.apellido), ciudad = H.limpio(b.ciudad), correo = H.limpio(b.correo, 100).toLowerCase();
      if (cedula.length !== 10) return res.status(400).json({ error: 'La cédula debe tener 10 dígitos.' });
      if (!nombre || !apellido || !ciudad) return res.status(400).json({ error: 'Completa nombre, apellido y ciudad.' });
      if (!/^\S+@\S+\.\S+$/.test(correo)) return res.status(400).json({ error: 'Revisa tu correo electrónico.' });
      if (telefono.length < 9 || telefono.length > 10) return res.status(400).json({ error: 'Revisa tu número de teléfono.' });
      const previo = (await H.leerHoja(HOJA_VIPS)).some((v) => esVigente(v) && !removido(v) && String(v.cedula || '').replace(/\D/g, '') === cedula);
      const hoy = H.hoyEC();
      let reg = null, repetido = null;
      await H.cambiarHoja(HOJA_REGISTROS, (filas) => {
        repetido = filas.find((f) => f.cedula === cedula && f.estado === 'pendiente');
        if (repetido) return filas;
        reg = { id: H.nuevoId(), createdAt: new Date().toISOString(), day: hoy, cedula, nombre, apellido, ciudad, correo, telefono, estado: 'pendiente', plan: '', recurrente: !!previo, resueltoAt: '' };
        return [...filas, reg];
      });
      if (repetido) return res.json({ id: repetido.id, repetido: true });
      const texto = `🆕 <b>Registro VIP</b>\n\nNombre: <b>${H.esc(nombre)} ${H.esc(apellido)}</b>\nCédula: ${H.esc(cedula)}\nCiudad: ${H.esc(ciudad)}\nCorreo: ${H.esc(correo)}\nTeléfono: ${H.esc(telefono)}\nIngreso: ${hoy}\n${previo ? '🔁 Esa cédula ya es miembro activo (se renueva)' : '✨ Nuevo'}\n\nAprueba con el plan que pagó:`;
      await H.tg('sendMessage', {
        chat_id: H.TG_ADMIN(), text: texto, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Mensual', callback_data: 'vp:' + reg.id + ':m' }, { text: '✅ Trimestral', callback_data: 'vp:' + reg.id + ':t' }, { text: '✅ Anual', callback_data: 'vp:' + reg.id + ':a' }], [{ text: '❌ Rechazar', callback_data: 'vr:' + reg.id }]] }
      }).catch((e) => console.error('No pude avisar al jefe (VIP):', e.message));
      res.json({ id: reg.id });
    } catch (e) {
      console.error('Registro VIP:', e);
      res.status(500).json({ error: 'No se pudo enviar el registro. Intenta de nuevo.' });
    }
  });

  app.get('/vip/estado/:id', async (req, res) => {
    if (!H.limite(req, res, 20000, 10 * 60 * 1000)) return;
    try {
      const reg = (await H.leerHoja(HOJA_REGISTROS)).find((f) => String(f.id) === String(req.params.id));
      if (!reg) return res.json({ estado: 'desconocido' });
      res.json(reg.estado === 'aprobado' ? { estado: 'aprobado', link: reg.link || '', bot: await nombreBot() } : { estado: reg.estado });
    } catch (e) { res.json({ estado: 'pendiente' }); }
  });

  // Revisión de vencidos cada 10 minutos (hace algo solo desde las 9am y si hay alguien vencido).
  setInterval(() => { procesarVencidos().catch((e) => console.error('vencidos VIP:', e.message)); }, 10 * 60 * 1000);
  setTimeout(() => { procesarVencidos().catch(() => {}); }, 90 * 1000);
}

module.exports = { montar, diasRestantes, procesarVencidos };
