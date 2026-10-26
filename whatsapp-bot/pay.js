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

const horasEC = () => String(process.env.PAY_HORAS || '9,15').split(',').map((x) => Number(x.trim())).filter((n) => n >= 0 && n < 24);
const ahoraEC = () => new Date(Date.now() - 5 * 3600e3);

async function revisar(motivo) {
  const CUPOS = await faltantes();
  if (!CUPOS.length) return { n: 0, completo: true };
  const r = await fetch(`${PANEL}/api/win-redactar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modo: 'pay', cupos: CUPOS })
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
  setInterval(ciclo, 5 * 60 * 1000);

  // Para probar a mano:  POST /pay/revisar  (con la clave del bot)
  app.post('/pay/revisar', requireApiKey, async (req, res) => {
    try { res.json(await revisar('manual')); } catch (e) { res.status(502).json({ error: e.message }); }
  });
}

module.exports = { montar };
