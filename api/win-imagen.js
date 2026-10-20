// Función serverless de Vercel: guarda una imagen en Vercel Blob (almacenamiento de archivos,
// fuera de Google Sheets) y devuelve su URL pública. Se usa para las "publicidades guardadas"
// (las que se mandan solas todos los días en el protocolo de la mañana, o a pedido con
// mandar_publicidad_guardada) -- antes se guardaban comprimidas DENTRO de una celda de Sheets
// (límite ~50.000 caracteres), lo que las dejaba pixeladas (hasta 320px de ancho). Guardándolas
// acá se mantienen en su calidad real; en la hoja solo queda guardada la URL (un texto cortito).
//
// Necesita que el proyecto tenga un "Blob Store" conectado en Vercel (Storage -> Create Database
// -> Blob, o Connect to Project si ya existe uno). En teoría Vercel conecta los stores nuevos
// solo con OIDC (variables BLOB_STORE_ID + VERCEL_OIDC_TOKEN, automáticas), pero en la práctica
// eso no siempre le llega bien a este tipo de función -- por eso este proyecto usa el token
// clásico BLOB_READ_WRITE_TOKEN como respaldo (Storage -> tu Blob Store -> pestaña ".env.local",
// copiarlo y pegarlo en Settings -> Environment Variables del proyecto).
//
// cleanToken() le quita comillas/espacios de más por si se pegó mal el valor en Vercel (pasó una
// vez: se copió la línea completa BLOB_READ_WRITE_TOKEN="xxx" en vez de solo el valor de adentro,
// y el token con comillas de sobra hacía que el SDK lo rechazara igual que si no existiera).

const { put } = require('@vercel/blob');

function extensionFromMediaType(mediaType) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return map[(mediaType || '').toLowerCase()] || 'jpg';
}

function cleanToken(v) {
  if (!v) return '';
  return v.trim().replace(/^['"]+|['"]+$/g, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
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

    const putOptions = { access: 'public', contentType: mediaType || 'image/jpeg', addRandomSuffix: true };
    const token = cleanToken(process.env.BLOB_READ_WRITE_TOKEN);
    if (token) putOptions.token = token; // si no hay token clásico, deja que el SDK intente OIDC solo

    const blob = await put(path, buffer, putOptions);

    res.status(200).json({ url: blob.url });
  } catch (e) {
    console.error('Error guardando imagen en Blob:', e);
    const esProblemaDeCredenciales = /token|credential|unauthorized|no store/i.test(e.message || '');
    const error = esProblemaDeCredenciales
      ? 'No se pudo guardar: revisa en Vercel -> Settings -> Environment Variables que BLOB_READ_WRITE_TOKEN exista y que su valor NO tenga comillas al inicio/final, y que el último despliegue (Deployments) diga "Ready" después de guardar esa variable.'
      : 'No se pudo guardar la imagen. Intenta de nuevo.';
    res.status(500).json({ error, detalle: e.message });
  }
};
