// Función serverless de Vercel: lee una captura de un stake (pick/cuota) para la publicidad
// del "stake de pago", usando la API de Anthropic (visión), y devuelve cuota/hora/valor para
// que el panel arme el texto automáticamente -- el dueño confirma antes de publicar.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) --
// nunca se expone en el index.html ni llega al navegador.

const SYSTEM_PROMPT = `Eres un lector de capturas de apuestas/picks para "PayWin", un negocio ecuatoriano de pronósticos deportivos. Vas a recibir una captura de un "stake de pago" (una apuesta/pick que se vende a los clientes) de alguna casa de apuestas (Ecuabet, OneXBet, Bet365, Más Parley, etc.).

Extrae:
- "cuota": la cuota/momio de la apuesta, tal cual aparece (ej: "1.85").
- "hora": la hora del evento/partido, tal cual aparece (ej: "15:30" o "3:30 PM"). Si ves la fecha también, inclúyela junto con la hora.
- "valor": el valor/monto que se está apostando (stake), tal cual aparece, con el símbolo de moneda si lo tiene.
- "pick": una descripción breve de la selección/pick (equipo, mercado) si se puede leer.

Si algún dato no queda claro, pon null en ese campo específico -- no inventes.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin bloques de código markdown (sin \`\`\`), con EXACTAMENTE estos campos:
{"cuota": "texto_o_null", "hora": "texto_o_null", "valor": "texto_o_null", "pick": "texto_o_null", "confidence": "alta|media|baja", "reason": "explicación breve de qué detectaste"}`;

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
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64) {
      res.status(400).json({ error: 'No llegó ninguna imagen.' });
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
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Lee este stake y responde solo con el JSON pedido.' }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'La lectura falló (servicio de IA). Intenta de nuevo o completa los datos a mano.' });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const parsed = extractJson(textBlock ? textBlock.text : '');

    if (!parsed) {
      res.status(200).json({
        cuota: null, hora: null, valor: null, pick: null,
        confidence: 'baja', reason: 'No se pudo interpretar la respuesta. Completa los datos a mano.'
      });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Error leyendo stake:', e);
    res.status(500).json({ error: 'No se pudo leer el stake. Intenta de nuevo o completa los datos a mano.' });
  }
};
