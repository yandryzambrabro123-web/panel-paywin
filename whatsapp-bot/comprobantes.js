// Capturas de pago (comprobantes) de los registros de stake de pago y regalito.
//
// - Valida que lo subido sea una imagen de verdad.
// - Guarda su "huella" (no la foto): una exacta (sha256) y una visual (parecido). Se guarda en la hoja "Comprobantes".
// - Misma captura exacta  -> se rechaza (no se puede usar dos veces, ni en stake ni en regalito).
// - Captura MUY parecida   -> se deja pasar pero se le avisa al jefe con una alerta (dos pagos distintos de la misma
//                             app se parecen mucho; no se bloquea para no perjudicar a clientes honestos).
// - La foto original se la manda al jefe por Telegram junto con el link.

const crypto = require('crypto');
const sharp = require('sharp');

let H = null;
const HOJA = 'Comprobantes';
const MAX_BYTES = 8 * 1024 * 1024;
const UMBRAL_PARECIDO = 10; // bits distintos (de 256) para avisar "se parece a otra"

function leerDataUrl(s) {
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(s || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  return buf.length && buf.length <= MAX_BYTES ? buf : null;
}

async function huellas(buf) {
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) throw new Error('La imagen es muy pequeña. Sube la captura completa de tu pago.');
  const px = await sharp(buf).rotate().greyscale().resize(17, 16, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += px[y * 17 + x] > px[y * 17 + x + 1] ? '1' : '0';
  let dh = '';
  for (let i = 0; i < 256; i += 4) dh += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return { sha: crypto.createHash('sha256').update(buf).digest('hex'), dh };
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
function distancia(a, b) {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

// Revisa y anota la huella en una sola operación. Devuelve { repetido, parecido }.
async function revisarYGuardar(h, datos) {
  let repetido = null, parecido = null;
  await H.cambiarHoja(HOJA, (filas) => {
    repetido = filas.find((f) => f.sha === h.sha) || null;
    if (repetido) return filas;
    parecido = filas.find((f) => distancia(f.dh, h.dh) <= UMBRAL_PARECIDO) || null;
    return [...filas, { id: H.nuevoId(), sha: h.sha, dh: h.dh, tipo: datos.tipo, registroId: datos.registroId, nombre: datos.nombre || '', telefono: datos.telefono || '', createdAt: new Date().toISOString() }].slice(-5000);
  });
  return { repetido, parecido };
}

// Procesa el comprobante que mandó el cliente. Devuelve { buf, repetido, parecido }; lanza Error con mensaje para el cliente.
async function procesar(dataUrl, datos) {
  const buf = leerDataUrl(dataUrl);
  if (!buf) throw Object.assign(new Error('Sube la captura de tu pago (una imagen).'), { status: 400 });
  let h;
  try { h = await huellas(buf); } catch (e) { throw Object.assign(new Error(/pequeña/.test(e.message) ? e.message : 'No pude leer esa imagen. Sube la captura de tu pago.'), { status: 400 }); }
  const r = await revisarYGuardar(h, datos);
  return { buf, ...r };
}

function montar(stakes) {
  H = stakes;
  // 🚫 Revocar el link de un registro (si la captura no era válida): rv:<stake|regalito>:<id>
  H.manejadores.rv = async (cq, [clave, id]) => {
    let txt = '⚠️ No pude revocar el link';
    try {
      const hoja = clave === 'regalito' ? 'RegistrosRegalito' : 'RegistrosStake';
      const reg = (await H.leerHoja(hoja)).find((f) => String(f.id) === String(id));
      const canal = (await H.leerHoja('CanalesTg')).find((f) => f.clave === clave);
      if (reg && reg.linkUnico && canal) {
        await H.tg('revokeChatInviteLink', { chat_id: canal.chatId, invite_link: reg.linkUnico });
        await H.cambiarHoja(hoja, (filas) => filas.map((f) => String(f.id) === String(id) ? { ...f, estado: 'rechazado', linkUnico: '' } : f));
        txt = '🚫 Link revocado';
      }
    } catch (e) { console.error('Revocar link:', e.message); }
    await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
    if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
  };
}

module.exports = { montar, procesar, leerDataUrl, huellas, distancia };
