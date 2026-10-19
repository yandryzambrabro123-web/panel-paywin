// Función serverless de Vercel: manda sola, sin que nadie tenga que abrir el panel, la
// secuencia fija de la mañana a las comunidades gratis (y el "buenos días" también al VIP).
//
// La dispara Vercel Cron todos los días a las 8am de Ecuador (ver vercel.json en la raíz --
// "0 13 * * *" porque Ecuador siempre es UTC-5, sin horario de verano). También se puede
// disparar a mano antes de esa hora desde Win, con los tools "mandar_protocolo_manana" (todo
// lo que falte) y "mandar_paso_protocolo_manana" (una sola pieza) -- ver api/win-chat.js e
// index.html.
//
// El control de qué ya se mandó hoy es POR PASO, no por el día completo: si a las 7am pides
// nada más la de "buenos días", a las 8am el cron manda el resto (recargas y retiros,
// beneficios, apuesta gratis) pero NO repite buenos días. Si no pides nada a mano, el cron
// manda las 4. Se guarda en la hoja "WinProtocoloManana" (fecha + lista de pasos ya mandados
// hoy, separados por coma) y se reinicia solo cuando cambia la fecha.
//
// Las imágenes y textos del protocolo viven en "Publicidades guardadas" (la hoja
// WinPlantillas de siempre -- lo mismo que usa Win para "manda la publicidad de..."), con
// estos nombres FIJOS. Así se pueden actualizar las imágenes (por ejemplo si cambia la de
// "beneficios recargar") desde el panel, sin tocar ningún código:
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

const norm = s => (s || '').toLowerCase().trim();

// Ecuador siempre es UTC-5, sin horario de verano -- no hace falta ninguna librería de zonas.
function ecuadorDateStr() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Devuelve { date, sentSteps: Set<nombre normalizado> } -- si la fecha guardada no es hoy,
// sentSteps viene vacío (es un día nuevo, no se arrastra nada del día anterior).
async function getDedupeState(today) {
  try {
    const res = await fetch(`${SHEETS_API_URL}?sheet=${DEDUPE_SHEET}`);
    const json = await res.json();
    const row = (json.data || [])[0];
    if (!row || row.lastSentDate !== today) return { sentSteps: new Set() };
    const list = (row.sentSteps || '').split('|').map(norm).filter(Boolean);
    return { sentSteps: new Set(list) };
  } catch (e) {
    return { sentSteps: new Set() }; // si falla la lectura, se prefiere mandar de más que no mandar nada
  }
}

async function setDedupeState(today, sentStepsSet) {
  await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      sheet: DEDUPE_SHEET,
      data: [{ id: 'estado', lastSentDate: today, sentSteps: Array.from(sentStepsSet).join('|') }]
    })
  });
}

async function fetchTemplatesByName() {
  const res = await fetch(`${SHEETS_API_URL}?sheet=${TEMPLATES_SHEET}`);
  const json = await res.json();
  const rows = json.data || [];
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

async function enviarPaso(step, templates, botUrl, botKey) {
  const tpl = templates.get(norm(step.nombre));
  if (!tpl) return false; // todavía no se guardó esa publicidad -- se salta sin tumbar el resto
  for (const jid of step.destinos) {
    await enviarAlBot(botUrl, botKey, jid, tpl.texto || '', tpl.base64 || '', tpl.mediaType || 'image/jpeg');
  }
  return true;
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

  // Pedido de un solo paso suelto (ej: "manda ya la de buenos días"): viene en el body del POST.
  let soloPaso = '';
  if (req.method === 'POST' && req.body) {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    soloPaso = norm(body.step || '');
  }

  try {
    const today = ecuadorDateStr();
    const { sentSteps } = await getDedupeState(today);

    if (soloPaso) {
      const step = PROTOCOLO_STEPS.find(s => norm(s.nombre) === soloPaso);
      if (!step) {
        res.status(400).json({ ok: false, error: 'No reconozco ese paso del protocolo.' });
        return;
      }
      if (sentSteps.has(norm(step.nombre))) {
        res.status(200).json({ ok: true, skipped: true, paso: step.nombre, reason: 'Esa pieza ya se había mandado hoy.' });
        return;
      }
      const templates = await fetchTemplatesByName();
      try {
        const enviado = await enviarPaso(step, templates, botUrl, botKey);
        if (!enviado) {
          res.status(200).json({ ok: true, skipped: true, paso: step.nombre, reason: 'Todavía no está guardada esa publicidad.' });
          return;
        }
      } catch (stepErr) {
        console.error(`Error mandando el paso "${step.nombre}":`, stepErr);
        res.status(200).json({ ok: false, paso: step.nombre, error: stepErr.message });
        return;
      }
      sentSteps.add(norm(step.nombre));
      await setDedupeState(today, sentSteps);
      res.status(200).json({ ok: true, skipped: false, paso: step.nombre });
      return;
    }

    // Modo completo (cron de las 8am, o "manda ya todo el protocolo"): manda solo lo que
    // falte -- lo que ya se mandó hoy (a mano, paso por paso) se saltea sin repetirlo.
    if (sentSteps.size === PROTOCOLO_STEPS.length) {
      res.status(200).json({ ok: true, skipped: true, reason: 'El protocolo de hoy ya se había mandado completo.' });
      return;
    }

    const templates = await fetchTemplatesByName();
    const enviadosAhora = [];
    const yaEstaban = [];
    const missing = [];
    const fallidos = [];

    // IMPORTANTE: cada paso va en su propio try/catch. Si uno falla (ej. el bot no responde a
    // tiempo con un grupo), los pasos anteriores que SÍ se mandaron bien no se deben perder --
    // si una excepción se escapara del for y cortara el guardado de abajo, el próximo intento
    // repetiría desde el primer paso una y otra vez (eso fue justo el bug: se quedaba
    // repitiendo solo "buenos días" porque un paso siguiente fallaba y nunca se guardaba el
    // progreso).
    for (const step of PROTOCOLO_STEPS) {
      if (sentSteps.has(norm(step.nombre))) { yaEstaban.push(step.nombre); continue; }
      try {
        const enviado = await enviarPaso(step, templates, botUrl, botKey);
        if (!enviado) { missing.push(step.nombre); continue; }
        sentSteps.add(norm(step.nombre));
        enviadosAhora.push(step.nombre);
      } catch (stepErr) {
        console.error(`Error mandando el paso "${step.nombre}":`, stepErr);
        fallidos.push({ paso: step.nombre, error: stepErr.message });
      }
    }

    await setDedupeState(today, sentSteps);
    res.status(200).json({ ok: true, skipped: false, enviadosAhora, yaEstaban, missing, fallidos, totalSteps: PROTOCOLO_STEPS.length });
  } catch (e) {
    console.error('Error en el protocolo de la mañana:', e);
    res.status(500).json({ error: 'No se pudo mandar el protocolo.', detalle: e.message });
  }
};
