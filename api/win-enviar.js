// Función serverless de Vercel: puente entre el panel y el bot de WhatsApp (que vive en
// Railway, no aquí -- ver /whatsapp-bot/README.md). El panel nunca habla directo con el bot
// porque así la clave del bot (WA_BOT_API_KEY) se queda solo en el servidor, sin exponerse en
// el navegador.
//
// Junta en un solo archivo los tres modos de mandar (antes eran 3 funciones serverless
// separadas: win-enviar-whatsapp.js, win-enviar-cola.js y win-enviar-multiple.js) porque el
// plan de Vercel que usa este proyecto tiene un límite de 12 funciones por despliegue, y entre
// todos los endpoints de Win ya se había pasado ese límite -- los despliegues quedaban en
// "Error" sin avisar claro por qué. Body: { modo, ...}, donde modo es uno de:
//   "directo"   (por defecto) -- un mensaje (+ imagen opcional) directo a un grupo/chat.
//                { grupoId, texto, imagenBase64?, mediaType? }
//   "multiple"  -- varias fotos + un texto final (ej. "partidos del día").
//                { grupoId, imagenes: [{base64, mediaType}], texto }
//   "cola"      -- lista de mensajes espaciados, uno por minuto (ej. avisos de stake de pago,
//                difusiones). { mensajes: [{grupoId, texto, imagenBase64?, mediaType?}], intervaloMs? }
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

  const body = req.body || {};
  const modo = body.modo || 'directo';
  const base = botUrl.replace(/\/$/, '');

  try {
    if (modo === 'cola') {
      const { mensajes, intervaloMs } = body;
      if (!Array.isArray(mensajes) || !mensajes.length) {
        res.status(400).json({ error: 'Falta la lista de mensajes.' });
        return;
      }
      const botRes = await fetch(`${base}/enviar-cola`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ mensajes, intervaloMs })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot de WhatsApp no pudo encolar los mensajes.' });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (modo === 'multiple') {
      const { grupoId, imagenes, texto } = body;
      if (!grupoId || !Array.isArray(imagenes) || !imagenes.length) {
        res.status(400).json({ error: 'Falta grupoId o las imágenes.' });
        return;
      }
      const botRes = await fetch(`${base}/enviar-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ grupoId, imagenes, texto })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot de WhatsApp no pudo mandar el paquete de fotos.' });
        return;
      }
      res.status(200).json(data);
      return;
    }

    // modo "directo" (por defecto)
    const { grupoId, texto, imagenBase64, mediaType } = body;
    if (!grupoId || !texto) {
      res.status(400).json({ error: 'Falta grupoId o texto.' });
      return;
    }
    const botRes = await fetch(`${base}/enviar`, {
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
