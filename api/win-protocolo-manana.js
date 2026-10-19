// Función serverless de Vercel: manda sola, sin que nadie tenga que abrir el panel, la
// secuencia fija de la mañana a las comunidades gratis (y el "buenos días" también al VIP).
//
// La dispara Vercel Cron todos los días a las 8am de Ecuador (ver vercel.json en la raíz --
// "0 13 * * *" porque Ecuador siempre es UTC-5, sin horario de verano). También se puede
// disparar a mano antes de esa hora desde Win, con el tool "mandar_protocolo_manana" (ver
// api/win-chat.js e index.html) -- en ese caso, el envío automático de las 8am ese mismo día
// ya no se repite (se guarda la fecha del último envío en la hoja "WinProtocoloManana").
//
// Las imágenes y textos del protocolo viven en "Publicidades guardadas" (la hoja
// WinPlantillas de siempre -- lo mismo que usa Win para "manda la publicidad de..."), con
// estos nombres FIJOS. Así se pueden actualizar las imágenes (por ejemplo la de "beneficios
// recargar", que hay que cambiar) desde el panel, sin tocar ningún código:
//   "protocolo buenos días"         -> Gratis 1, Gratis 2, Gratis 3 y VIP
//   "protocolo recargas y retiros"  -> Gratis 1, Gratis 2, Gratis 3
//   "protocolo beneficios recargar" -> Gratis 1, Gratis 2, Gratis 3
//   "protocolo apuesta gratis"      -> Gratis 1, Gratis 2, Gratis 3
// Si todavía falta guardar alguna de estas cuatro, ese paso se salta solo (no tumba el resto
// del protocolo) hasta que la guardes con ese nombre exacto.

const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const TEMPLATES_SHEET = 'WinPlantillas';
const DEDUPE_SHEET = 'WinProtocoloManana';

// Mismos grupos/jids que WIN_GROUPS en index.html -- si esos cambian allá, hay que actualizar
// estos también (son solo 4, no vale la pena traerlos por red en cada corrida).
const GRATIS_JIDS = [
  '120363407344055933@g.us', // Gratis 1
  '120363429858156393@g.us', // Gratis 2
  '120363429029021293@g.us'  // Gratis 3
];
const VIP_JID = '120363411532196622@g.us';

const PROTOCOLO_STEPS = [
  { nombre: 'protocolo buenos días', destinos: [...GRATIS_JIDS, VIP_JID] },
  { nombre: 'protocolo recargas y retiros', destinos: GRATIS_JIDS },
  { nombre: 'protocolo beneficios recargar', destinos: GRATIS_JIDS },
  { nombre: 'protocolo apuesta gratis', destinos: GRATIS_JIDS }
];

// Ecuador siempre es UTC-5, sin horario de verano -- no hace falta ninguna librería de zonas.
function ecuadorDateStr() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getLastSentDate() {
  try {
    const res = await fetch(`${SHEETS_API_URL}?sheet=${DEDUPE_SHEET}`);
    const json = await res.json();
    const row = (json.data || [])[0];
    return row ? row.lastSentDate || '' : '';
  } catch (e) {
    return ''; // si falla la lectura, se prefiere mandar de más que no mandar nada
  }
}

async function setLastSentDate(dateStr) {
  await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheet: DEDUPE_SHEET, data: [{ id: 'estado', lastSentDate: dateStr }] })
  });
}

async function fetchTemplatesByName() {
  const res = await fetch(`${SHEETS_API_URL}?sheet=${TEMPLATES_SHEET}`);
  const json = await res.json();
  const rows = json.data || [];
  const norm = s => (s || '').toLowerCase().trim();
  const map = new Map();
  rows.forEach(r => map.set(norm(r.nombre), r));
  return map;
}

async function enviarAlBot(botUrl, botKey, grupoId, texto, imagenBase64, mediaType) {
  const res = await fetch(`${botUrl.replace(/\/$/, '')}/enviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
    body: JSON.stringify({ grupoId, texto, imagenBase64, mediaType })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'El bot de WhatsApp no pudo mandar el mensaje.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const botUrl = process.env.WA_BOT_URL;
  const botKey = process.env.WA_BOT_API_KEY;
  if (!botUrl || !botKey) {
    res.status(500).json({ error: 'Falta configurar WA_BOT_URL y/o WA_BOT_API_KEY en Vercel.' });
    return;
  }

  try {
    const today = ecuadorDateStr();
    const lastSent = await getLastSentDate();
    if (lastSent === today) {
      res.status(200).json({ ok: true, skipped: true, reason: 'El protocolo de hoy ya se había mandado.' });
      return;
    }

    const templates = await fetchTemplatesByName();
    let sentSteps = 0;
    let missing = [];

    for (const step of PROTOCOLO_STEPS) {
      const tpl = templates.get(step.nombre.toLowerCase().trim());
      if (!tpl) {
        missing.push(step.nombre);
        continue; // todavía no se guardó esa publicidad -- se salta sin tumbar el resto
      }
      for (const jid of step.destinos) {
        await enviarAlBot(botUrl, botKey, jid, tpl.texto || '', tpl.base64 || '', tpl.mediaType || 'image/jpeg');
      }
      sentSteps++;
    }

    await setLastSentDate(today);
    res.status(200).json({ ok: true, skipped: false, sentSteps, totalSteps: PROTOCOLO_STEPS.length, missing });
  } catch (e) {
    console.error('Error en el protocolo de la mañana:', e);
    res.status(500).json({ error: 'No se pudo mandar el protocolo completo.', detalle: e.message });
  }
};
