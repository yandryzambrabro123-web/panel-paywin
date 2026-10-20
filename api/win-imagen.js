// Función serverless de Vercel: guarda una imagen en Vercel Blob (almacenamiento de archivos,
// fuera de Google Sheets) y devuelve su URL pública. Se usa para las "publicidades guardadas"
// (las que se mandan solas todos los días en el protocolo de la mañana, o a pedido con
// mandar_publicidad_guardada) -- antes se guardaban comprimidas DENTRO de una celda de Sheets
// (límite ~50.000 caracteres), lo que las dejaba pixeladas (hasta 320px de ancho). Guardándolas
// acá se mantienen en su calidad real; en la hoja solo queda guardada la URL (un texto cortito).
//
// Necesita que el proyecto tenga un "Blob Store" conectado en Vercel (Storage -> Create Database
// -> Blob, o Connect Store si ya existe uno) -- eso agrega sola la variable de entorno
// BLOB_READ_WRITE_TOKEN que esta función necesita. Sin eso, devuelve un error claro en vez de
// fallar en silencio.

const { put } = require('@vercel/blob');

function extensionFromMediaType(mediaType) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return map[(mediaType || '').toLowerCase()] || 'jpg';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(500).json({
      error: 'Falta conectar un Blob Store en Vercel (Storage -> Create Database -> Blob) para poder guardar imágenes en buena calidad.'
    });
    return;
  }

  try {
    const { base64, mediaType, nombre } = req.body || {};
    if (!base64) {
      res.status(400).json({ error: 'No llegó ninguna imagen.' });
      return;
    }
    const buffer = Buffer.from(base64, 'base64');
    const ext = extensionFromMediaType(mediaType);
    const safeName = (nombre || 'publicidad').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'publicidad';
    const path = `publicidades/${safeName}-${Date.now()}.${ext}`;

    const blob = await put(path, buffer, {
      access: 'public',
      contentType: mediaType || 'image/jpeg',
      addRandomSuffix: true
    });

    res.status(200).json({ url: blob.url });
  } catch (e) {
    console.error('Error guardando imagen en Blob:', e);
    res.status(500).json({ error: 'No se pudo guardar la imagen. Intenta de nuevo.', detalle: e.message });
  }
};
