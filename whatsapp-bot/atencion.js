// Segundo número de WhatsApp, solo para ATENCIÓN AL CLIENTE (separado del bot de grupos y publicaciones).
//  - Tiene su propio QR en /qr-atencion y su propia sesión guardada (AUTH_DIR/atencion).
//  - Cuando alguien le escribe (cualquier mensaje), le responde solo con la cuenta (texto de atencion-texto.js)
//    y te avisa por Telegram (nombre, teléfono y mensaje, con botón para abrir el chat). Solo recargas; retiros no.
//  - Si el número se bloquea o lo desvinculan: te llega una alerta y se genera un QR nuevo para vincular otro número.
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const alertas = require('./alertas');

const AUTH_DIR = path.join(process.env.AUTH_DIR || './auth_info', 'atencion');
const estado = { sock: null, qr: null, conectado: false, desde: Date.now(), vinculado: false, ultimoCierre: '' };
const respondidoA = new Map(); // jid -> última vez que se le mandó la respuesta automática
const avisadoDe = new Map();   // jid -> último aviso por Telegram

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// (Ya no se usa para decidir: cualquier mensaje recibe la cuenta. Queda por si se quiere volver a filtrar.)
const PIDE_RECARGA = /recarg|deposit|\bn(umero|ro|°)?\.? de cuenta|cuenta (para|de) (pagar|deposit|transfer|recarg)|(pasame|dame|mandame|enviame|envia|manda|pasa) (la |tu |su )?cuenta|donde (te |les )?(pago|transfiero|deposito|envio)|datos (de|para) (el )?(pago|transferencia|deposito)/;
const pideRecarga = (texto) => PIDE_RECARGA.test(sinAcentos(texto));

function textoDe(msg) {
  const m = msg.message || {};
  const x = m.ephemeralMessage ? m.ephemeralMessage.message || {} : m;
  return x.conversation || (x.extendedTextMessage && x.extendedTextMessage.text) || (x.imageMessage && x.imageMessage.caption) || (x.videoMessage && x.videoMessage.caption) || '';
}
const digitos = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

function vaciarSesion() {
  try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (e) { /* ya existe */ }
  for (const f of fs.readdirSync(AUTH_DIR)) fs.rmSync(path.join(AUTH_DIR, f), { recursive: true, force: true });
}

async function procesarMensaje(stakes, msg) {
  const jid = msg.key && msg.key.remoteJid;
  if (!jid || msg.key.fromMe || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return;
  const ts = Number(msg.messageTimestamp && (msg.messageTimestamp.low !== undefined ? msg.messageTimestamp.low : msg.messageTimestamp)) || 0;
  if (ts && Date.now() / 1000 - ts > 120) return; // mensajes viejos (al reconectar) no se contestan
  const m0 = msg.message || {}, m1 = m0.ephemeralMessage ? m0.ephemeralMessage.message || {} : m0;
  const esMedia = !!(m1.imageMessage || m1.videoMessage || m1.audioMessage || m1.documentMessage || m1.stickerMessage);
  const texto = textoDe(msg) || (esMedia ? '[envió una imagen, audio o archivo]' : '');
  if (!texto) return; // reacciones, avisos del sistema, etc.

  const RECARGA = String(require('./atencion-texto').RECARGA || '').trim();
  const hace = Date.now() - (respondidoA.get(jid) || 0);
  let respuesta = 'no';
  if (!RECARGA) respuesta = 'sin_texto';
  else if (hace < 3 * 3600e3) respuesta = 'ya_respondido';
  else {
    try {
      await estado.sock.sendPresenceUpdate('composing', jid);
      await new Promise((ok) => setTimeout(ok, 2000 + Math.floor(Math.random() * 2500)));
      await estado.sock.sendMessage(jid, { text: RECARGA });
      respondidoA.set(jid, Date.now());
      respuesta = 'ok';
    } catch (e) { console.error('Atención: no pude responder:', e.message); respuesta = 'error:' + e.message; }
  }

  if (Date.now() - (avisadoDe.get(jid) || 0) < 10 * 60000) return;
  avisadoDe.set(jid, Date.now());
  const num = jid.endsWith('@s.whatsapp.net') ? digitos(jid) : '';
  const nota = respuesta === 'ok' ? '✅ Ya le respondí con la cuenta.'
    : respuesta === 'ya_respondido' ? '↩️ Ya le había mandado la cuenta hace poco, no se la repetí.'
    : respuesta === 'sin_texto' ? '⚠️ No le respondí: todavía no hay texto de respuesta configurado.'
    : '⚠️ No pude responderle (' + respuesta.replace('error:', '') + '). Escríbele tú.';
  try {
    await stakes.tg('sendMessage', {
      chat_id: stakes.TG_ADMIN(), parse_mode: 'HTML', disable_web_page_preview: true,
      text: `💬 <b>Escribieron al WhatsApp de atención</b>\nNombre: ${stakes.esc(msg.pushName || 'sin nombre')}\nTeléfono: ${num ? '+' + num : 'no visible'}\nMensaje: «${stakes.esc(texto.slice(0, 300))}»\n${nota}`,
      reply_markup: num ? { inline_keyboard: [[{ text: '💬 Abrir en WhatsApp', url: 'https://wa.me/' + num }]] } : undefined
    });
  } catch (e) { console.error('Atención: no pude avisar por Telegram:', e.message); }
}

async function iniciar(stakes) {
  try { fs.mkdirSync(AUTH_DIR, { recursive: true }); } catch (e) { /* ya existe */ }
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  estado.vinculado = !!(state.creds && state.creds.registered);
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch (e) { /* usa la de la librería */ }
  const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false, browser: ['Ubuntu', 'Chrome', '22.04.4'] }); // nombre estándar: WhatsApp rechaza la vinculación por código con nombres raros
  estado.sock = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) procesarMensaje(stakes, m).catch((e) => console.error('Atención:', e.message));
  });
  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) { estado.qr = qr; estado.conectado = false; console.log('Atención: QR nuevo — entra a /qr-atencion.'); }
    if (connection === 'open') { estado.conectado = true; estado.vinculado = true; estado.desde = null; estado.qr = null; console.log('✅ WhatsApp de atención conectado.'); }
    if (connection === 'close') {
      estado.conectado = false;
      if (!estado.desde) estado.desde = Date.now();
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      estado.ultimoCierre = `statusCode=${code} ${(lastDisconnect && lastDisconnect.error && lastDisconnect.error.message) || ''} (${new Date().toISOString()})`;
      if (code === DisconnectReason.loggedOut || code === 403) {
        estado.vinculado = false;
        alertas.avisar('at-baja', `El número de ATENCIÓN AL CLIENTE fue ${code === 403 ? 'bloqueado' : 'desvinculado'} (código ${code}). Abre /qr-atencion del bot y escanea el código con el número nuevo.`, { cooldownMin: 30 }).catch(() => {});
        try { vaciarSesion(); } catch (e) { console.error('Atención: no pude borrar la sesión:', e.message); }
        setTimeout(() => iniciar(stakes).catch((e) => console.error('Atención:', e.message)), 2000);
      } else setTimeout(() => iniciar(stakes).catch((e) => console.error('Atención:', e.message)), 3000);
    }
  });
}

function montar(app, stakes, { requireApiKey } = {}) {
  iniciar(stakes).catch((e) => console.error('Atención: error iniciando:', e));
  montarCodigo(app, requireApiKey);
  app.get('/qr-atencion', async (req, res) => {
    if (estado.conectado) return res.send('<h2 style="font-family:sans-serif;">El número de atención ya está conectado. No hace falta escanear nada.</h2>');
    if (!estado.qr) return res.send('<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif;text-align:center;margin-top:60px;"><h2>Generando el código...</h2><p>Espera unos segundos, esta página se actualiza sola.</p></body></html>');
    const png = await qrcode.toDataURL(estado.qr);
    res.send(`<html><head><meta http-equiv="refresh" content="20"></head><body style="font-family:sans-serif;text-align:center;margin-top:40px;"><h2>Escanea con el WhatsApp del número de ATENCIÓN</h2><img src="${png}" style="width:280px;height:280px;"><p>WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo</p><p style="color:#888;font-size:13px;">El código cambia cada rato; si ya no sirve, espera a que la página se refresque sola.</p></body></html>`);
  });
}

// Vincular con CÓDIGO de 8 caracteres en vez de QR (WhatsApp → Dispositivos vinculados → Vincular con el número de teléfono).
function montarCodigo(app, requireApiKey) {
  const pagina = (cuerpo) => `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;text-align:center;margin:40px 16px;">${cuerpo}</body></html>`;
  app.get('/codigo-atencion', requireApiKey || ((q, r, n) => n()), async (req, res) => {
    const key = String(req.query.key || '');
    const numero = String(req.query.numero || '').replace(/\D/g, '');
    if (estado.conectado) return res.send(pagina('<h2>El número de atención ya está conectado.</h2>'));
    if (!numero) {
      return res.send(pagina(`<h2>Vincular el número de atención con código</h2><p>Escribe el número del celular con código de país y sin signos. Ecuador: 593 y el número sin el 0 inicial, por ejemplo <b>593991234567</b>.</p><form method="get"><input type="hidden" name="key" value="${key.replace(/[^\w-]/g, '')}"><input name="numero" inputmode="numeric" placeholder="593991234567" style="font-size:20px;padding:10px;width:260px"><br><br><button style="font-size:18px;padding:10px 24px">Darme el código</button></form>`));
    }
    if (numero.length < 9 || numero.length > 15) return res.send(pagina('<h2>El número no parece válido.</h2><p>Usa código de país y sin signos, por ejemplo 593991234567.</p>'));
    if (!estado.sock) return res.send(pagina('<h2>El bot todavía está arrancando.</h2><p>Espera 10 segundos y recarga.</p>'));
    try {
      // Código SOLO con números (dígitos 1-9: el 0 no está permitido en los códigos de vinculación). Si esta versión de la librería no deja elegirlo, se usa el normal.
      const numerico = Array.from({ length: 8 }, () => 1 + Math.floor(Math.random() * 9)).join('');
      let codigo;
      try { codigo = await estado.sock.requestPairingCode(numero, numerico); }
      catch (e1) { console.error('Atención: código numérico no aceptado, uso el normal:', e1.message); codigo = await estado.sock.requestPairingCode(numero); }
      const c = String(codigo).replace(/(.{4})(.{4})/, '$1-$2');
      res.send(pagina(`<h2>Tu código de vinculación</h2><div style="font-size:44px;letter-spacing:6px;font-weight:800;margin:20px 0">${c}</div><ol style="text-align:left;max-width:380px;margin:0 auto;line-height:1.6"><li>En el celular de ese número abre WhatsApp.</li><li>Ajustes → Dispositivos vinculados → Vincular un dispositivo.</li><li>Toca <b>Vincular con el número de teléfono</b> (abajo).</li><li>Escribe este código antes de que caduque (unos 2 minutos).</li></ol>`));
    } catch (e) {
      console.error('Atención: no pude pedir el código:', e.message);
      res.send(pagina(`<h2>No se pudo generar el código</h2><p>${String(e.message).replace(/[<>]/g, '')}</p><p>Espera unos segundos y recarga.</p>`));
    }
  });
}

module.exports = { _procesar: procesarMensaje, _interno: estado, montar, estado: () => ({ conectado: estado.conectado, desde: estado.desde, ultimoCierre: estado.ultimoCierre, vinculado: estado.vinculado }), pideRecarga };
