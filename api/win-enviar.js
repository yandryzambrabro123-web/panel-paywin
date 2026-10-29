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
//   "directo"   (por defecto) -- un mensaje (+ imagen opcional) directo a un grupo/chat. La
//                imagen puede venir como base64 (fotos nuevas, comprimidas en el navegador) o
//                como imagenUrl (publicidades guardadas en Vercel Blob, en su calidad real --
//                ver api/win-imagen.js); si llegan las dos, gana imagenUrl.
//                { grupoId, texto, imagenBase64?, imagenUrl?, mediaType? }
//   "multiple"  -- varias fotos + un texto final (ej. "partidos del día").
//                { grupoId, imagenes: [{base64, mediaType}], texto }
//   (el modo "cola" -- envíos masivos espaciados -- se eliminó: causaba bloqueos del WhatsApp)
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
    if (modo === 'vip_desactivar') {
      const botRes = await fetch(`${base}/vip/desactivar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ id: String(body.id || '') })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot no pudo desactivar al miembro.' });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (modo === 'grupo_crear') {
      const botRes = await fetch(`${base}/grupo/crear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ nombre: String(body.nombre || ''), descripcion: String(body.descripcion || '') })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) { res.status(502).json({ error: data.error || 'El bot no pudo crear el grupo.' }); return; }
      res.status(200).json(data);
      return;
    }

    if (modo === 'regalito_url') {
      res.status(200).json({ url: `${base}/regalito` });
      return;
    }

    if (modo === 'regalito_publicar') {
      const botRes = await fetch(`${base}/regalito/publicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ link: String(body.link || '') })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot no pudo publicar el regalito.' });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (modo === 'vip_url') {
      res.status(200).json({ url: `${base}/vip` });
      return;
    }

    if (modo === 'stake_url') {
      res.status(200).json({ url: `${base}/stake` });
      return;
    }

    if (modo === 'revisar') {
      const { numeros, grupoIds } = body;
      if (!Array.isArray(numeros) || !Array.isArray(grupoIds) || !grupoIds.length) {
        res.status(400).json({ error: 'Faltan los números o los grupos.' });
        return;
      }
      const botRes = await fetch(`${base}/revisar-miembros`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ numeros, grupoIds })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot no pudo revisar los grupos.' });
        return;
      }
      res.status(200).json(data);
      return;
    }

    if (modo === 'sacar') {
      const { numero, grupoIds } = body;
      if (!numero || !Array.isArray(grupoIds) || !grupoIds.length) {
        res.status(400).json({ error: 'Falta el número o los grupos.' });
        return;
      }
      const botRes = await fetch(`${base}/sacar-del-grupo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
        body: JSON.stringify({ numero, grupoIds })
      });
      const data = await botRes.json().catch(() => ({}));
      if (!botRes.ok) {
        res.status(502).json({ error: data.error || 'El bot no pudo sacar a la persona del grupo.' });
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
    const { grupoId, texto, imagenBase64, imagenUrl, mediaType, banner } = body;
    if (!grupoId || !texto) {
      res.status(400).json({ error: 'Falta grupoId o texto.' });
      return;
    }
    const botRes = await fetch(`${base}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
      body: JSON.stringify({ grupoId, texto, imagenBase64, imagenUrl, mediaType, banner: !!banner })
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
