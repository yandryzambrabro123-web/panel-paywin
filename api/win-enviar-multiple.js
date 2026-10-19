// Función serverless de Vercel: puente hacia el bot de WhatsApp para mandar un paquete de
// varias fotos + un texto final (ej: "partidos del día") -- igual que win-enviar-whatsapp.js,
// el panel nunca habla directo con el bot, así la clave del bot se queda solo en el servidor.

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
    const { grupoId, imagenes, texto } = req.body || {};
    if (!grupoId || !Array.isArray(imagenes) || !imagenes.length) {
      res.status(400).json({ error: 'Falta grupoId o las imágenes.' });
      return;
    }

    const botRes = await fetch(`${botUrl.replace(/\/$/, '')}/enviar-multiple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
      body: JSON.stringify({ grupoId, imagenes, texto })
    });

    const data = await botRes.json().catch(() => ({}));
    if (!botRes.ok) {
      res.status(502).json({ error: data.error || 'El bot de WhatsApp no pudo mandar los partidos del día.' });
      return;
    }
    res.status(200).json(data);
  } catch (e) {
    console.error('Error hablando con el bot de WhatsApp (múltiple):', e);
    res.status(500).json({ error: 'No se pudo conectar con el bot de WhatsApp.' });
  }
};
