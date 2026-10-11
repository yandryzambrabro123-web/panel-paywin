// Función serverless de Vercel: lee una imagen de comprobante (transferencia bancaria o
// captura de caja de una casa de apuestas) usando la API de Anthropic, y devuelve los datos
// que detecta en JSON para que el panel los muestre y la persona los confirme.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) —
// nunca se expone en el index.html ni llega al navegador.

const ACCOUNTS_INFO = `
Cuentas posibles del negocio "PayWin" (usa exactamente este "id"):
- pichincha  -> Banco Pichincha (banco)
- guayaquil  -> Banco Guayaquil (banco)
- ecuabet    -> Caja Ecuabet (caja interna de la casa de apuestas Ecuabet)
- onexbet    -> Caja OneXBet (caja interna de la casa de apuestas OneXBet)
- masparley  -> Caja Más Parley (caja interna de la casa de apuestas Más Parley)
`;

const SYSTEM_PROMPT = `Eres un lector de comprobantes financieros para "PayWin", un negocio ecuatoriano de pronósticos deportivos y apuestas.

Vas a recibir una captura de pantalla que normalmente es una de estas dos cosas:
(a) Un comprobante o notificación de transferencia/depósito bancario (Banco Pichincha o Banco Guayaquil) donde ENTRA dinero a esa cuenta.
(b) Una captura del panel o saldo de una casa de apuestas (Ecuabet, OneXBet o Más Parley) mostrando un retiro o salida de dinero de su caja interna (por ejemplo, para efectivizar una recarga).

${ACCOUNTS_INFO}

Reglas para decidir "type":
- Si es un comprobante BANCARIO de dinero recibido/depositado -> type: "in", accountId del banco correspondiente.
- Si es una captura de una CASA DE APUESTAS mostrando que salió/se retiró dinero de su caja -> type: "out", accountId de esa caja.
- Si la imagen no deja claro algún dato, pon null en ese campo específico en vez de adivinar. No inventes montos ni cuentas que no puedas leer con razonable certeza.

Responde ÚNICAMENTE con un JSON válido, sin texto antes ni después, sin bloques de código markdown (sin \`\`\`), con EXACTAMENTE estos campos:
{"accountId": "pichincha|guayaquil|ecuabet|onexbet|masparley|null (sin comillas si es null)", "type": "in|out|null", "amount": numero_o_null, "confidence": "alta|media|baja", "detectedText": "texto breve clave que leíste (banco, monto, referencia)", "reason": "explicación breve de por qué leíste esto"}`;

function extractJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  // por si el modelo igual lo envuelve en ```json ... ```
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
            { type: 'text', text: 'Lee este comprobante y responde solo con el JSON pedido.' }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'La lectura falló (servicio de IA). Intenta de nuevo o regístralo manual.' });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const parsed = extractJson(textBlock ? textBlock.text : '');

    if (!parsed) {
      res.status(200).json({
        accountId: null, type: null, amount: null,
        confidence: 'baja', detectedText: '', reason: 'No se pudo interpretar la respuesta. Completa los datos manualmente.'
      });
      return;
    }

    res.status(200).json(parsed);
  } catch (e) {
    console.error('Error leyendo comprobante:', e);
    res.status(500).json({ error: 'No se pudo leer el comprobante. Intenta de nuevo o regístralo manual.' });
  }
};
