// Función serverless de Vercel: procesa una captura de recarga/transferencia para publicarla
// como testimonio, usando la API de Anthropic (visión). En vez de pedirle al modelo que
// "tape los datos sensibles" (arriesgado si se le pasa algo), le pedimos lo CONTRARIO: que
// diga EXACTAMENTE dónde está el monto (lo único que debe quedar visible) y el panel tapa con
// negro TODO lo demás. Así, cualquier dato que el modelo no reconozca igual queda oculto por
// default -- el error seguro es "tapar de más", nunca "dejar algo sin tapar".
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) --
// nunca se expone en el index.html ni llega al navegador.

const SYSTEM_PROMPT = `Eres un asistente que prepara capturas de recargas/transferencias para publicarlas como TESTIMONIO público en WhatsApp, para un negocio ecuatoriano de recargas y retiros llamado PayWin.

La imagen puede traer uno o dos comprobantes (por ejemplo: un comprobante de transferencia bancaria y/o una captura de que se acreditó la recarga). Contienen datos privados del cliente (teléfono, nombre, cédula, número de cuenta, número de referencia/comprobante) que NUNCA deben publicarse -- lo ÚNICO que se puede mostrar públicamente es el/los MONTOS (el valor en dólares).

Tu tarea tiene dos partes:

1) Ubica, con la mayor precisión posible, el o los rectángulos que contienen SOLO el texto del monto en dólares (ej: "$100.00", "100,00 USD") -- nada más alrededor, ni la palabra "monto" ni otro texto si puedes evitarlo, aunque está bien si el rectángulo incluye un pedacito de la etiqueta de al lado. Da las coordenadas como FRACCIONES de 0 a 1 del ancho/alto total de la imagen: x,y = esquina superior izquierda del rectángulo; w,h = ancho y alto. Si hay dos montos (recarga y transferencia), da un rectángulo para cada uno. Si no encuentras ningún monto con certeza razonable, devuelve una lista vacía -- NUNCA inventes una posición.

2) Redacta un texto corto, cercano y persuasivo en español para publicar como testimonio en WhatsApp (negocio de recargas y retiros de casas de apuestas). Usa ÚNICAMENTE el/los montos que detectaste -- JAMÁS incluyas en el texto ningún nombre, teléfono, cédula, número de cuenta o número de comprobante, aunque los veas en la imagen. Tono: cercano, genera confianza, 1-2 emojis, pocas líneas.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin bloques de código markdown (sin \`\`\`), con EXACTAMENTE estos campos:
{"montos": [{"valor": "texto_del_monto_tal_cual_se_lee", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0}], "texto": "texto_del_testimonio", "confidence": "alta|media|baja", "reason": "explicación breve de qué detectaste"}`;

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
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'Procesa esta captura y responde solo con el JSON pedido.' }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo procesar la imagen (servicio de IA). Intenta de nuevo.' });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const parsed = extractJson(textBlock ? textBlock.text : '');

    if (!parsed || !Array.isArray(parsed.montos)) {
      // Si algo salió mal interpretando la respuesta, por seguridad NO se deja nada visible --
      // mejor una imagen toda negra (que el dueño puede rehacer) que arriesgar un dato filtrado.
      res.status(200).json({
        montos: [], texto: '',
        confidence: 'baja', reason: 'No se pudo interpretar la imagen con certeza. Vuelve a intentar o sube otra captura más clara.'
      });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Error leyendo testimonio:', e);
    res.status(500).json({ error: 'No se pudo procesar la imagen. Intenta de nuevo.' });
  }
};
