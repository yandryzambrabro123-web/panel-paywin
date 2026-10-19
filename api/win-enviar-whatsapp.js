// Función serverless de Vercel: puente entre el panel y el bot de WhatsApp (que vive
// en Railway, no aquí -- ver /whatsapp-bot/README.md). El panel nunca habla directo
// con el bot porque así la clave del bot (WA_BOT_API_KEY) se queda solo en el servidor,
// sin exponerse en el navegador.
//
// Variables de entorno necesarias en Vercel (Settings -> Environment Variables):
//   WA_BOT_URL      -- la URL pública que te dio Railway (sin "/" al final), ej:
//                      https://win-whatsapp-bot-production.up.railway.app
//   WA_BOT_API_KEY  -- la misma API_KEY que configuraste en Railway para el bot.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
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
    const { grupoId, texto, imagenBase64, mediaType } = req.body || {};
    if (!grupoId || !texto) {
      res.status(400).json({ error: 'Falta grupoId o texto.' });
      return;
    }

    const botRes = await fetch(`${botUrl.replace(/\/$/, '')}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
      body: JSON.stringify({ grupoId, texto, imagenBase64, mediaType })
    });

    const data = await botRes.json().catch(() => ({}));
    if (!botRes.ok) {
      res.status(502).json({ error: data.error || 'El bot de WhatsApp no pudo mandar el mensaje.' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Error hablando con el bot de WhatsApp:', e);
    res.status(500).json({ error: 'No se pudo conectar con el bot de WhatsApp.' });
  }
};
