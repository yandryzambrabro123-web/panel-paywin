// Pay vigilando: revisa los partidos solo, guarda los picks en la hoja "PaySugerencias" (se ven en
// Fábrica de apuestas del panel) y te avisa por Telegram. NO publica nada en ningún grupo.
//
// Horas de revisión (hora de Ecuador): variable de Railway PAY_HORAS, por defecto "9,15" (9am y 3pm).
// Apagar: PAY_AUTO_OFF=1.  Usa el análisis de Pay del panel (Vercel), no necesita claves nuevas.

let H = null;
const HOJA = 'PaySugerencias';
const PANEL = (process.env.PANEL_URL || 'https://panel-paywin.vercel.app').replace(/\/$/, '');
// Lo que Pay debe completar cada día (en orden de prioridad) y el rango de cuota total de cada uno.
const META_DIA = [
  { cupo: 'Stake de pago', cuantos: 1, min: 2.5, max: 4.0 },
  { cupo: 'Regalito', cuantos: 1, min: 1.75, max: 1.9 },
  { cupo: 'Gratis', cuantos: 2, min: 1.75, max: 1.9 },
  { cupo: 'VIP', cuantos: 3, min: 1.8, max: 2.0 }
];
const MAX_POR_REVISION = 4;

// Lo que falta del día: cada revisión completa lo pendiente (la mañana saca el stake primero).
async function faltantes() {
  const hoy = H.hoyEC();
  let hechas = [];
  try { hechas = (await H.leerHoja(HOJA)).filter((f) => new Date(Date.parse(f.createdAt) - 5 * 3600e3).toISOString().slice(0, 10) === hoy); } catch (e) { hechas = []; }
  const lista = [];
  for (const m of META_DIA) {
    const ya = hechas.filter((f) => f.cupo === m.cupo).length;
    for (let i = ya; i < m.cuantos; i++) lista.push({ cupo: m.cupo, min: m.min, max: m.max });
  }
  return lista.slice(0, MAX_POR_REVISION);
}

const CORTE_APUESTAS_MS = 1792990800000; // el panel muestra apuestas desde el 26/oct 00:00 (Ecuador)
const idMs = (id) => { const n = parseInt(String(id || '').slice(0, -5), 36); return Number.isFinite(n) ? n : 0; };
const HOJAS_APUESTAS = [['ApuestasVIP', 'VIP'], ['ApuestasGratis', 'Gratis'], ['ApuestasLive', 'Live']];

const horasEC = () => String(process.env.PAY_HORAS || '9,15').split(',').map((x) => Number(x.trim())).filter((n) => n >= 0 && n < 24);
const ahoraEC = () => new Date(Date.now() - 5 * 3600e3);

// Líneas ya usadas hoy (tomadas, sugeridas antes y apuestas registradas) para no repetirlas.
async function evitarHoy() {
  const hoy = H.hoyEC(), l = [];
  const sel = (x) => { try { return JSON.parse(x.selecciones || '[]'); } catch (e) { return []; } };
  try { (await H.leerHoja('PayTomadas')).filter((f) => f.day === hoy).forEach((f) => l.push(`${f.partido}: ${f.pick}`)); } catch (e) { /* sin tomadas */ }
  try { (await H.leerHoja(HOJA)).forEach((f) => sel(f).forEach((s) => { if (s && s.pick) l.push(`${s.partido || ''}: ${s.pick}`); })); } catch (e) { /* sin sugerencias */ }
  for (const h of ['ApuestasVIP', 'ApuestasGratis', 'ApuestasLive']) {
    try { (await H.leerHoja(h)).filter((b) => String(b.date || '').slice(0, 10) === hoy).forEach((b) => l.push(`${b.event || ''}: ${b.pick || ''}`)); } catch (e) { /* sin esa hoja */ }
  }
  return [...new Set(l)].slice(0, 100);
}

// Lo que Pay aprendió de las capturas de ganadas del jefe (hoja PayGanadas).
async function historialGanadas() {
  try { return (await H.leerHoja('PayGanadas')).slice(-40).map((f) => `${f.deporte || ''} ${f.partido || ''} ${f.pick || ''} @${f.cuota || ''} (${f.mercado || ''})`.replace(/\s+/g, ' ').trim()); } catch (e) { return []; }
}

// Estadística real y perdidas del panel (hojas de apuestas) para que Pay evite lo que le falla al jefe.
async function perdidasYResumen() {
  const r = { perdidas: [], resumen: '' };
  const partes = [];
  for (const [hoja, tag] of HOJAS_APUESTAS) {
    try {
      const f = (await H.leerHoja(hoja)).filter((b) => idMs(b.id) >= CORTE_APUESTAS_MS);
      const g = f.filter((b) => b.result === 'won').length, p = f.filter((b) => b.result === 'lost');
      if (g + p.length) partes.push(`${tag}: ${g} ganadas y ${p.length} perdidas (${Math.round(100 * g / (g + p.length))}% de acierto)`);
      p.slice(-15).forEach((b) => r.perdidas.push(`${tag} ${b.sport || ''} ${b.event || ''} ${b.pick || ''} @${b.odds || ''}`.replace(/\s+/g, ' ').trim()));
    } catch (e) { /* sin esa hoja */ }
  }
  r.resumen = partes.join(' | ');
  return r;
}

async function revisar(motivo) {
  const CUPOS = await faltantes();
  if (!CUPOS.length) return { n: 0, completo: true };
  const r = await fetch(`${PANEL}/api/win-redactar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modo: 'pay', cupos: CUPOS, evitar: await evitarHoy(), historial: await historialGanadas(), ...(await perdidasYResumen()) })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
  const nuevas = (d.sugerencias || []).filter((x) => x && x.pick).map((x) => ({
    id: H.nuevoId(), createdAt: new Date().toISOString(), cupo: String(x.cupo || ''), partido: x.partido || '', liga: x.liga || '', hora: x.hora || '',
    pick: x.pick, cuota: x.cuota || '', confianza: x.confianza || '', analisis: x.analisis || '', selecciones: JSON.stringify(x.selecciones || []), fuente: d.fuente || '', estado: 'nueva'
  }));
  if (!nuevas.length) return { n: 0 };
  // se conservan solo los últimos 3 días para que la hoja no crezca
  const corte = Date.now() - 3 * 86400e3;
  await H.cambiarHoja(HOJA, (filas) => [...filas.filter((f) => Date.parse(f.createdAt) >= corte), ...nuevas]);
  const lista = nuevas.map((n) => `• <b>${H.esc(n.cupo || 'Pick')}</b> @ ${H.esc(String(n.cuota))} — ${H.esc(n.pick)}`).join('\n');
  await H.tg('sendMessage', {
    chat_id: H.TG_ADMIN(), parse_mode: 'HTML',
    text: `🧠 <b>Pay encontró ${nuevas.length} pick(s)</b>\n\n${lista}\n\nRevisa el análisis y decide en la Fábrica de apuestas. Verifica la cuota en tu casa antes de apostar.`,
    reply_markup: { inline_keyboard: [[{ text: 'Abrir la Fábrica', url: PANEL }]] }
  });
  return { n: nuevas.length };
}

// ---- Resultados: Pay revisa si las apuestas pendientes ya se ganaron o perdieron y te avisa ----
// Nunca marca nada solo: te manda un mensaje con botones y tú confirmas. Horas (Ecuador): PAY_RESULT_HORAS, por defecto "18,23,8".
const HOJA_RES = 'PayResultados';
const horasRes = () => String(process.env.PAY_RESULT_HORAS || '18,23,8').split(',').map((x) => Number(x.trim())).filter((n) => n >= 0 && n < 24);

async function pendientes() {
  const lista = [];
  const desde = Date.now() - 3 * 86400e3;
  for (const [hoja, tag] of HOJAS_APUESTAS) {
    try {
      (await H.leerHoja(hoja)).filter((b) => b.result === 'pending' && idMs(b.id) >= CORTE_APUESTAS_MS && idMs(b.id) >= desde)
        .forEach((b) => { let lines = []; try { lines = JSON.parse(b.lines || '[]'); } catch (e) { lines = []; } lista.push({ id: String(b.id), tag, hoja, date: b.date, event: b.event, pick: b.pick, odds: b.odds, lines }); });
    } catch (e) { /* sin esa hoja */ }
  }
  return lista;
}

async function revisarResultados() {
  if (process.env.PAY_AUTO_OFF === '1') return { n: 0 };
  const todas = await pendientes();
  if (!todas.length) return { n: 0 };
  let ya = [];
  try { ya = (await H.leerHoja(HOJA_RES)).filter((f) => f.notificado === 'si').map((f) => String(f.betId)); } catch (e) { ya = []; }
  const lista = todas.filter((a) => !ya.includes(a.id)).slice(0, 12);
  let avisos = 0;
  for (let i = 0; i < lista.length; i += 6) {
    const lote = lista.slice(i, i + 6);
    const r = await fetch(`${PANEL}/api/win-redactar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: 'pay_resultados', apuestas: lote }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('Pay resultados:', d.error || r.status); continue; }
    for (const x of d.resultados || []) {
      if (x.estado !== 'ganada' && x.estado !== 'perdida') continue;
      const a = lote.find((b) => b.id === x.id); if (!a) continue;
      const gano = x.estado === 'ganada';
      const texto = `${gano ? '🏆 <b>Pay cree que se GANÓ</b>' : '❌ <b>Pay cree que se PERDIÓ</b>'}\n\n[${H.esc(a.tag)}] ${H.esc(a.event || '')}\n${H.esc(a.pick || '')} @${H.esc(String(a.odds || ''))}\n\n${H.esc(x.detalle)}\n\nPay puede equivocarse: confírmalo tú.`;
      await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), parse_mode: 'HTML', text: texto, reply_markup: { inline_keyboard: [[gano ? { text: '✅ Marcar ganada', callback_data: 'rw:' + a.id } : { text: '❌ Marcar perdida', callback_data: 'rl:' + a.id }, { text: '🕒 Aún no', callback_data: 'rx:' + a.id }]] } }).catch((e) => console.error('Aviso de resultado:', e.message));
      await H.cambiarHoja(HOJA_RES, (fs) => [...fs.filter((f) => String(f.betId) !== a.id), { betId: a.id, estado: x.estado, notificado: 'si', at: new Date().toISOString() }]);
      avisos++;
      await new Promise((ok) => setTimeout(ok, 400));
    }
  }
  return { n: avisos };
}

async function marcarResultado(id, result) {
  let hecho = false;
  for (const [hoja] of HOJAS_APUESTAS) {
    await H.cambiarHoja(hoja, (filas) => filas.map((b) => { if (String(b.id) !== String(id)) return b; hecho = true; return { ...b, result }; }));
    if (hecho) break;
  }
  return hecho;
}

function montar(app, stakes, extra) {
  H = stakes;
  const requireApiKey = (extra && extra.requireApiKey) || ((req, res) => res.status(500).json({ error: 'Sin clave configurada.' }));
  let ultima = ''; // "AAAA-MM-DD-HH" de la última revisión hecha, para no repetir en la misma hora

  const ciclo = async () => {
    if (process.env.PAY_AUTO_OFF === '1') return;
    const d = ahoraEC();
    const hora = d.getUTCHours();
    const clave = `${d.toISOString().slice(0, 10)}-${hora}`;
    if (!horasEC().includes(hora) || ultima === clave) return;
    ultima = clave;
    try { await revisar('auto'); } catch (e) { console.error('Pay (auto):', e.message); }
  };
  let ultimaRes = '';
  const cicloRes = async () => {
    const d = ahoraEC(), hora = d.getUTCHours(), clave = `${d.toISOString().slice(0, 10)}-${hora}`;
    if (!horasRes().includes(hora) || ultimaRes === clave) return;
    ultimaRes = clave;
    try { await revisarResultados(); } catch (e) { console.error('Pay (resultados):', e.message); }
  };
  setInterval(() => { ciclo(); cicloRes(); }, 5 * 60 * 1000);

  const marcar = async (cq, txt) => {
    await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
    if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
  };
  H.manejadores.rw = async (cq, [id]) => {
    const ok = await marcarResultado(id, 'won');
    await marcar(cq, ok ? '✅ Marcada como ganada' : '⚠️ No encontré esa apuesta');
    if (ok) await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: '🏆 Listo. Para publicarla: en el panel, Win → "Mandar apuesta ganada" y sube la captura.' }).catch(() => {});
  };
  H.manejadores.rl = async (cq, [id]) => { const ok = await marcarResultado(id, 'lost'); await marcar(cq, ok ? '❌ Marcada como perdida' : '⚠️ No encontré esa apuesta'); };
  H.manejadores.rx = async (cq, [id]) => {
    await H.cambiarHoja(HOJA_RES, (fs) => fs.filter((f) => String(f.betId) !== String(id))); // se vuelve a revisar en la próxima ronda
    await marcar(cq, '🕒 Lo reviso más tarde');
  };

  // Para probar a mano:  POST /pay/resultados  (con la clave del bot)
  app.post('/pay/resultados', requireApiKey, async (req, res) => {
    try { res.json(await revisarResultados()); } catch (e) { res.status(502).json({ error: e.message }); }
  });
  // Para probar a mano:  POST /pay/revisar  (con la clave del bot)
  app.post('/pay/revisar', requireApiKey, async (req, res) => {
    try { res.json(await revisar('manual')); } catch (e) { res.status(502).json({ error: e.message }); }
  });
}

module.exports = { montar };
