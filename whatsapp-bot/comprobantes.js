// Capturas de pago (comprobantes) de los registros de stake de pago y regalito.
//
// - Valida que lo subido sea una imagen de verdad.
// - La IA (Anthropic, clave ANTHROPIC_API_KEY en Railway) lee la captura: si no es un comprobante, si la fecha NO es de hoy
//   o si su número de referencia ya se usó, se RECHAZA al instante y solo entonces se le avisa al jefe (con foto, teléfono y
//   botón de WhatsApp). Las capturas válidas entran directo y no mandan nada. Si no hay clave o la IA no pudo leer la fecha,
//   entra igual pero se le manda la foto al jefe para que la mire.
// - Guarda su "huella" (no la foto): una exacta (sha256) y una visual (parecido). Se guarda en la hoja "Comprobantes".
// - Misma captura exacta  -> se rechaza (no se puede usar dos veces, ni en stake ni en regalito).
// - Captura MUY parecida   -> se deja pasar pero se le avisa al jefe con una alerta (dos pagos distintos de la misma
//                             app se parecen mucho; no se bloquea para no perjudicar a clientes honestos).
// - La foto original se la manda al jefe por Telegram junto con el link.

const crypto = require('crypto');
const sharp = require('sharp');

let H = null;
const HOJA = 'Comprobantes';
// Monto mínimo de la recarga para el regalito (se puede cambiar con REGALITO_MINIMO en Railway).
const MINIMO_REGALITO = () => Number(process.env.REGALITO_MINIMO) > 0 ? Number(process.env.REGALITO_MINIMO) : 20;
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

// Revisa y anota la huella en una sola operación (también la referencia de pago). Devuelve { repetido, parecido }.
async function revisarYGuardar(h, datos, ia) {
  let repetido = null, parecido = null;
  const ref = ia && ia.referencia && ia.referencia.length >= 6 ? ia.referencia.toLowerCase() : '';
  await H.cambiarHoja(HOJA, (filas) => {
    repetido = filas.find((f) => f.sha === h.sha || (ref && String(f.ref || '').toLowerCase() === ref && (!ia.monto || !f.monto || Number(f.monto) === ia.monto))) || null;
    if (repetido) return filas;
    parecido = filas.find((f) => distancia(f.dh, h.dh) <= UMBRAL_PARECIDO) || null;
    return [...filas, { id: H.nuevoId(), sha: h.sha, dh: h.dh, ref: ref || '', monto: (ia && ia.monto) || '', fecha: (ia && ia.fecha) || '', tipo: datos.tipo, registroId: datos.registroId, nombre: datos.nombre || '', telefono: datos.telefono || '', createdAt: new Date().toISOString() }].slice(-5000);
  });
  return { repetido, parecido };
}

// Procesa el comprobante que mandó el cliente.
// Devuelve { buf, rechazo: { motivo, cliente }|null, parecido, atencion }.
//   rechazo  -> hay que rechazar el registro (motivo = para el jefe, cliente = lo que ve la persona).
//   atencion -> entró, pero conviene que el jefe vea la foto (no hay IA, no se pudo leer la fecha o se parece a otra).
// Lanza Error (con .status) solo si ni siquiera es una imagen válida.
async function procesar(dataUrl, datos) {
  const buf = leerDataUrl(dataUrl);
  if (!buf) throw Object.assign(new Error('Sube la captura de tu pago (una imagen).'), { status: 400 });
  let h;
  try { h = await huellas(buf); } catch (e) { throw Object.assign(new Error(/pequeña/.test(e.message) ? e.message : 'No pude leer esa imagen. Sube la captura de tu pago.'), { status: 400 }); }
  const usada = { motivo: 'Es una captura que ya se usó antes.', cliente: 'Esa captura ya fue usada. Sube la captura de tu pago de hoy.' };
  // 1) misma imagen exacta: se rechaza sin gastar IA
  if ((await H.leerHoja(HOJA)).some((f) => f.sha === h.sha)) return { buf, rechazo: usada, parecido: null, atencion: false };
  // 2) la IA lee la captura
  const ia = await leerConIA(buf, datos.tipo);
  const hoy = H.hoyEC();
  if (ia) {
    if (!ia.esComprobante) return { buf, rechazo: { motivo: 'La imagen no parece un comprobante de pago.', cliente: 'Esa imagen no parece un comprobante de pago. Sube la captura de tu pago.' }, parecido: null, atencion: false };
    if (ia.fecha && ia.fecha !== hoy) {
      const f = ia.fecha.split('-').reverse().join('/');
      return { buf, rechazo: { motivo: `El comprobante es de otra fecha (${f}), no de hoy.`, cliente: `Esa captura es del ${f}. Sube la captura de tu pago de hoy.` }, parecido: null, atencion: false };
    }
  }
  if (ia && datos.tipo === 'regalito' && ia.monto != null && ia.monto < MINIMO_REGALITO()) {
    const min = MINIMO_REGALITO();
    return { buf, rechazo: { motivo: `La recarga es de $${ia.monto}, menos del mínimo de $${min}.`, cliente: `La recarga mínima para el regalito es de $${min}. Tu captura muestra $${ia.monto}.` }, parecido: null, atencion: false };
  }
  // 3) se anota (aquí también se detecta la misma referencia de pago ya usada)
  const r = await revisarYGuardar(h, datos, ia);
  if (r.repetido) return { buf, rechazo: usada, parecido: null, atencion: false };
  const sinLeer = !ia || (!ia.fecha && !ia.referencia) || (datos.tipo === 'regalito' && ia.monto == null);
  return { buf, rechazo: null, parecido: r.parecido, atencion: sinLeer || !!(r.parecido && !(ia && ia.referencia)), ia };
}

const MODELOS = () => [process.env.COMPROBANTE_MODELO, 'claude-haiku-5-5', 'claude-sonnet-5'].filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);

// Lee la captura con IA. Devuelve { esComprobante, fecha('YYYY-MM-DD'|null), monto, referencia, emisor } o null si no se pudo leer.
async function leerConIA(buf, tipo) {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) return null;
  const hoy = H.hoyEC();
  const ayer = new Date(Date.parse(hoy + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const sistema = `Eres un verificador de capturas de pago para una agencia de Ecuador. El cliente sube la captura de ${tipo === 'regalito' ? 'una recarga a una casa de apuestas' : 'su pago (transferencia, depósito o recarga)'}.
Hoy es ${hoy} (ayer fue ${ayer}). En Ecuador las fechas se escriben día/mes/año. Si la captura dice "hoy" usa ${hoy}; si dice "ayer" usa ${ayer}.
Responde SOLO un JSON, sin texto extra: {"esComprobante":true|false,"fecha":"AAAA-MM-DD"|null,"monto":numero|null,"referencia":"texto"|null,"emisor":"banco o casa"|null}
- esComprobante: true solo si la imagen muestra un comprobante, notificación o historial de transferencia, depósito, pago o recarga. false para cualquier otra imagen (fotos, memes, capturas sin relación).
- fecha: la fecha de la transacción que se VE en la imagen. null si no aparece o no estás seguro. No la inventes.
- referencia: número de comprobante / documento / transacción / secuencial, tal cual se ve. null si no hay.`;
  for (const modelo of MODELOS()) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelo, max_tokens: 300, system: sistema, messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } },
          { type: 'text', text: 'Verifica esta captura.' }] }] }),
        signal: AbortSignal.timeout(30000)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.error('Lector de capturas (' + modelo + '):', r.status, (j.error && j.error.message) || ''); continue; }
      const txt = ((j.content || []).find((c) => c.type === 'text') || {}).text || '';
      const m = /\{[\s\S]*\}/.exec(txt);
      if (!m) continue;
      const o = JSON.parse(m[0]);
      return {
        esComprobante: o.esComprobante !== false,
        fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(o.fecha || '')) ? o.fecha : null,
        monto: Number(o.monto) > 0 ? Number(o.monto) : null,
        referencia: o.referencia ? String(o.referencia).replace(/\s+/g, '').slice(0, 40) : null,
        emisor: o.emisor ? String(o.emisor).slice(0, 40) : null
      };
    } catch (e) { console.error('Lector de capturas:', e.message); }
  }
  return null;
}

// Aviso al jefe de un registro RECHAZADO: foto, nombre, teléfono, motivo y botón para abrir su WhatsApp.
async function avisarRechazo(clave, datos, motivo, buf) {
  try {
    const wa = require('./canales').waLink(datos.telefono);
    const texto = `🚫 <b>Rechacé un registro de ${clave === 'stake' ? 'stake de pago' : 'regalito'}</b>\n\nNombre: <b>${H.esc(datos.nombre)}</b>\nTeléfono: <b>${H.esc(datos.telefono || 'sin teléfono')}</b>\nMotivo: ${H.esc(motivo)}`;
    const fd = new FormData();
    fd.append('chat_id', H.TG_ADMIN()); fd.append('caption', texto.slice(0, 1020)); fd.append('parse_mode', 'HTML');
    if (wa) fd.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: '💬 Abrir su chat de WhatsApp', url: wa }]] }));
    fd.append('photo', new Blob([buf], { type: 'image/jpeg' }), 'captura.jpg');
    const r = await fetch(`https://api.telegram.org/bot${H.TG_TOKEN()}/sendPhoto`, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.description || r.status);
  } catch (e) { console.error('Aviso de rechazo:', e.message); }
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

module.exports = { montar, procesar, avisarRechazo, leerDataUrl, huellas, distancia };
