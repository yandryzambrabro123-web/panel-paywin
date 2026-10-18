// Función serverless de Vercel: recibe el comando en lenguaje natural que el usuario le dice
// a "Win" (por texto o por voz transcrita) y usa la API de Anthropic para clasificar qué
// quiere hacer, para que el panel abra el formulario correcto.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) —
// nunca se expone en el index.html ni llega al navegador.

const SYSTEM_PROMPT = `Eres "Win", el asistente virtual de un negocio ecuatoriano de pronósticos deportivos y apuestas llamado PayWin. El dueño te habla por texto o por voz (transcrita) para darte una orden rápida. Tu única tarea es CLASIFICAR la orden en una de estas intenciones:

- "nueva_apuesta": quiere mandar una apuesta/pick/stake nuevo a un grupo o comunidad.
- "ganada": avisa que se ganó una apuesta y quiere mandar esa ganada a un grupo.
- "contenido": quiere subir algo a la comunidad que no es una apuesta ni una ganada (un testimonio, un flyer, un anuncio, un "buenos días", publicidad de recargas/VIP, etc.).
- "recordatorio": quiere que le recuerdes algo más adelante (una cita, una entrega, una tarea pendiente) — NO es algo para mandar a una comunidad.
- "regalito": quiere mandar el "regalito del día" a los clientes que tiene marcados como pendientes de regalito.
- "desconocido": no se entiende bien la intención o no calza en ninguna de las anteriores.

También extrae, si están claros en el texto:
- "destino": a qué grupo/comunidad se refiere (ej: "VIP", "grupo 1X2", "comunidad gratis", "todas"). Si no lo menciona, deja null.
- "nota": el contenido o idea principal de lo que quiere mandar/recordar, resumido en pocas palabras, tal como lo dijo (si aplica).
- "fecha": SOLO si es un recordatorio y menciona una fecha concreta, en formato YYYY-MM-DD (asumiendo que "hoy" es ${new Date().toISOString().slice(0,10)}; si dice un día de la semana como "el martes", calcula la fecha del próximo martes). Si no hay fecha clara, null.
- "hora": SOLO si es un recordatorio y menciona una hora, en formato HH:MM de 24 horas. Si no hay hora clara, null.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin bloques de código markdown, con EXACTAMENTE estos campos:
{"intent": "nueva_apuesta|ganada|contenido|recordatorio|regalito|desconocido", "destino": "texto_o_null", "nota": "texto_o_null", "fecha": "YYYY-MM-DD_o_null", "hora": "HH:MM_o_null"}`;

function extractJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.' });
    return;
  }

  try {
    const { texto } = req.body || {};
    if (!texto || !texto.trim()) {
      res.status(400).json({ error: 'No llegó ningún texto.' });
      return;
    }

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: texto.trim() }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo entender el comando (servicio de IA). Intenta de nuevo.' });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const parsed = extractJson(textBlock ? textBlock.text : '');

    if (!parsed) {
      res.status(200).json({ intent: 'desconocido', destino: null, nota: texto, fecha: null, hora: null });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Error interpretando comando:', e);
    res.status(500).json({ error: 'No se pudo entender el comando. Intenta de nuevo.' });
  }
};
