// Servidor del "bot" de WhatsApp de Win.
//
// Qué hace: mantiene una sesión viva de WhatsApp (como WhatsApp Web, pero corriendo
// solo, 24/7, en este servidor) usando el número dedicado que se vincula UNA SOLA VEZ
// escaneando un QR. Una vez conectado, expone una API privada (protegida con una clave)
// para que el panel PayWin le pida mandar un texto/imagen directo a uno de los grupos --
// sin que nadie tenga que copiar, pegar, ni abrir WhatsApp a mano.
//
// IMPORTANTE: este número debe ser uno DEDICADO solo para esto, nunca el número
// principal del negocio. WhatsApp no tiene una API oficial para mandar mensajes a
// grupos ya existentes -- esto usa el mismo protocolo que usa WhatsApp Web, así que
// viola los términos de servicio de WhatsApp y existe el riesgo real de que, tarde o
// temprano, WhatsApp detecte el patrón y restrinja o banee este número. Por eso debe
// ser un número aparte, no el que usas para hablar con tus clientes.
//
// Variables de entorno necesarias:
//   API_KEY  -- clave secreta que el panel debe mandar en el header "x-api-key" para
//               poder usar /grupos y /enviar. Inventa una larga y rara, y ponla también
//               en Vercel (WA_BOT_API_KEY) cuando conectemos el panel.
//   PORT     -- puerto del servidor (Railway la pone sola, no hace falta tocarla).

// La librería de WhatsApp necesita la función "crypto" disponible globalmente, pero en
// Node 18 (lo que usa Railway por defecto) no viene así de fábrica -- por eso salía el
// error "crypto is not defined" y el bot se desconectaba justo después de conectar, sin
// llegar nunca a mostrar el QR. Esto la deja disponible antes de cargar todo lo demás.
if (typeof global.crypto === 'undefined') {
  global.crypto = require('node:crypto').webcrypto;
}

const fs = require('fs');
const path = require('path');
const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const AUTH_DIR = process.env.AUTH_DIR || './auth_info';

let sock = null;
let lastQR = null;
let connected = false;
let connectingSince = Date.now();

// Pequeña pausa aleatoria antes de mandar cada mensaje -- no evita un bloqueo si
// WhatsApp decide marcar el número, pero ayuda a que el patrón de envíos no se vea
// perfectamente robótico (ráfagas instantáneas, siempre el mismo delay exacto, etc.).
function pausaHumana() {
  const ms = 1500 + Math.floor(Math.random() * 2500);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function iniciarConexion() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
    console.log('Versión de WhatsApp Web a usar:', version.join('.'));
  } catch (e) {
    console.log('No se pudo obtener la última versión de WhatsApp Web, sigo con la que trae la librería. Error:', e.message);
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Win PayWin', 'Chrome', '110.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      lastQR = qr;
      connected = false;
      console.log('Nuevo QR generado -- entra a /qr para escanearlo.');
    }

    if (connection === 'open') {
      connected = true;
      lastQR = null;
      console.log('✅ Conectado a WhatsApp.');
    }

    if (connection === 'close') {
      connected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const deslogueado = statusCode === DisconnectReason.loggedOut;
      console.log(
        'Conexión cerrada. statusCode=', statusCode,
        'mensaje=', lastDisconnect?.error?.message,
        deslogueado ? '-- el número fue desvinculado, hay que escanear el QR de nuevo.' : '-- reconectando...'
      );
      if (!deslogueado) {
        setTimeout(iniciarConexion, 3000);
      }
    }
  });
}

iniciarConexion().catch((e) => console.error('Error iniciando la conexión con WhatsApp:', e));

const app = express();
app.use(express.json({ limit: '15mb' }));
const stakes = require('./stakes');
stakes.montar(app); // registro público del Stake de pago + aprobación por Telegram
// Registro público del VIP + salida automática de los vencidos (todo por Telegram).
const vipMod = require('./vip');
vipMod.montar(app, stakes, { requireApiKey });
require('./regalito').montar(app, stakes, { requireApiKey });
require('./pay').montar(app, stakes, { requireApiKey }); // registro VIP (Telegram) + salida automática de vencidos

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'El servidor no tiene configurada API_KEY todavía.' });
  }
  // Acepta la clave como header (lo que usa el panel) o como ?key=... en la URL (para poder
  // abrir /grupos directo desde el navegador sin terminal).
  const givenKey = req.header('x-api-key') || req.query.key;
  if (givenKey !== API_KEY) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  next();
}

// Página de salud simple -- útil para que Railway confirme que el servicio está vivo.
app.get('/', (req, res) => {
  res.send(`Bot de WhatsApp de Win -- estado: ${connected ? 'conectado ✅' : 'no conectado ❌'}`);
});

// Abre esta URL en el navegador del TELÉFONO que tiene el número dedicado, y escanea el
// QR desde WhatsApp -> Ajustes -> Dispositivos vinculados -> Vincular un dispositivo.
app.get('/qr', async (req, res) => {
  if (connected) {
    return res.send('<h2 style="font-family:sans-serif;">Ya está conectado. No hace falta escanear nada.</h2>');
  }
  if (!lastQR) {
    return res.send('<html><head><meta http-equiv="refresh" content="3"></head><body style="font-family:sans-serif; text-align:center; margin-top:60px;"><h2>Generando el código...</h2><p>Esta página se actualiza sola cada 3 segundos.</p></body></html>');
  }
  const png = await qrcode.toDataURL(lastQR);
  res.send(`
    <html>
      <head><meta http-equiv="refresh" content="20"></head>
      <body style="font-family:sans-serif; text-align:center; margin-top:40px;">
        <h2>Escanea con el WhatsApp del número dedicado</h2>
        <img src="${png}" style="width:280px; height:280px;">
        <p>WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo</p>
        <p style="color:#888; font-size:13px;">El código cambia cada rato -- si ya no sirve, espera a que esta página se refresque sola.</p>
      </body>
    </html>
  `);
});

app.get('/estado', requireApiKey, (req, res) => {
  const idBot = connected && sock && sock.user ? String(sock.user.id || '').split('@')[0].split(':')[0] : null;
  res.json({ conectado: connected, numero: idBot ? '+' + idBot : null });
});

// Lista los grupos en los que ya está metido el número dedicado, con su "id" real de
// WhatsApp (algo como "1203xxxxxxxx@g.us"). Hay que usar este id -- no el nombre -- para
// mandar mensajes. Primero hay que unir el número dedicado a cada grupo (entrando a cada
// link de invitación desde ESE número), y recién ahí aparecen aquí.
app.get('/grupos', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).send('El bot no está conectado a WhatsApp todavía.');
  }
  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.values(grupos).map((g) => ({ id: g.id, nombre: g.subject }));
    res.send(`
      <html>
        <body style="font-family:sans-serif; padding:24px; max-width:600px; margin:0 auto;">
          <h2>Grupos donde está metido el número dedicado</h2>
          <p style="color:#666;">Copia y pásame esta lista completa (nombre + id de cada uno).</p>
          ${lista.map(g => `<div style="margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:8px;">
            <strong>${g.nombre}</strong><br>
            <code style="font-size:13px; color:#555;">${g.id}</code>
          </div>`).join('')}
        </body>
      </html>
    `);
  } catch (e) {
    console.error(e);
    res.status(500).send('No se pudo leer la lista de grupos: ' + e.message);
  }
});

// Sticker separador (en vez de la línea de texto de antes) que se manda solo, como mensaje
// aparte, justo después de cada publicación a un grupo -- para que en el feed del chat quede
// claro dónde termina una publicidad/aviso y empieza lo que sigue. Es siempre el mismo sticker
// fijo (logo "PayWin", generado una sola vez como assets/separador.webp -- ver ese archivo si
// hay que rediseñarlo). Es "mejor esfuerzo": si falla, no tumba el envío principal.
const SEPARADOR_STICKER_PATH = path.join(__dirname, 'assets', 'separador.webp');
let separadorStickerBuffer = null;
try {
  separadorStickerBuffer = fs.readFileSync(SEPARADOR_STICKER_PATH);
} catch (e) {
  console.error('No se encontró el sticker separador en', SEPARADOR_STICKER_PATH, '-- se usará una línea de texto de respaldo.', e.message);
}
// Banner "APUESTA GRATIS": se manda ANTES de la apuesta, solo en los grupos gratis (sin sticker en medio).
let bannerGratisBuffer = null;
try { bannerGratisBuffer = fs.readFileSync(path.join(__dirname, 'assets', 'banner-gratis.jpg')); } catch (e) { console.error('No se encontró el banner de apuesta gratis:', e.message); }
async function mandarBannerGratis(grupoId) {
  if (!bannerGratisBuffer) return;
  try { await sock.sendMessage(grupoId, { image: bannerGratisBuffer, mimetype: 'image/jpeg' }); }
  catch (e) { console.error('No se pudo mandar el banner a', grupoId, '--', e && e.message); }
}
async function mandarSeparador(grupoId) {
  try {
    await pausaHumana();
    if (separadorStickerBuffer) {
      try {
        await sock.sendMessage(grupoId, { sticker: separadorStickerBuffer, mimetype: 'image/webp' });
        return;
      } catch (e) {
        // Si el sticker falla, se avisa en los logs con el detalle y se manda la línea de
        // texto de respaldo para que igual quede marcado dónde termina la publicación.
        console.error('No se pudo mandar el sticker separador a', grupoId, '--', e && (e.stack || e.message || e));
      }
    }
    await sock.sendMessage(grupoId, { text: '━━━━━━━━━━━━━━━━━━━━' });
  } catch (e) {
    console.error('No se pudo mandar el separador:', e && (e.stack || e.message || e));
  }
}

// Manda un texto (y, opcionalmente, una imagen con ese texto como descripción/caption)
// directo a un grupo, y después manda la línea separadora. "grupoId" es el id real
// (ver /grupos), no el nombre. La imagen puede venir como base64 (fotos subidas de nuevo) o
// como imagenUrl (publicidades guardadas en Vercel Blob, en su calidad real -- Baileys la
// descarga solo, no hace falta mandarla por el panel); si llegan las dos, gana imagenUrl.
app.post('/enviar', requireApiKey, async (req, res) => {
  // El grupo VIP ya NO está en WhatsApp: lo que iba ahí sale por el grupo VIP de Telegram.
  if (req.body && req.body.grupoId === vipMod.VIP_WHATSAPP_JID) {
    const { texto, imagenBase64, imagenUrl, mediaType } = req.body;
    if (!texto && !imagenBase64 && !imagenUrl) return res.status(400).json({ error: 'Falta el texto.' });
    try {
      await vipMod.enviarAlGrupoVip({ texto, imagenes: (imagenUrl || imagenBase64) ? [{ url: imagenUrl || '', base64: imagenUrl ? '' : imagenBase64, mediaType }] : [] });
      return res.json({ ok: true, via: 'telegram' });
    } catch (e) {
      console.error('Envío al VIP de Telegram:', e);
      return res.status(500).json({ error: 'No se pudo mandar al grupo VIP de Telegram: ' + e.message });
    }
  }
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { grupoId, texto, imagenBase64, imagenUrl, mediaType, sinSeparador, banner } = req.body || {};
  if (!grupoId || !texto) {
    return res.status(400).json({ error: 'Falta grupoId o texto.' });
  }
  try {
    await pausaHumana();
    if (banner) await mandarBannerGratis(grupoId);
    if (imagenUrl) {
      await sock.sendMessage(grupoId, { image: { url: imagenUrl }, caption: texto });
    } else if (imagenBase64) {
      const buffer = Buffer.from(imagenBase64, 'base64');
      await sock.sendMessage(grupoId, { image: buffer, mimetype: mediaType || 'image/jpeg', caption: texto });
    } else {
      await sock.sendMessage(grupoId, { text: texto });
    }
    if (!sinSeparador) await mandarSeparador(grupoId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error mandando mensaje:', e);
    res.status(500).json({ error: 'No se pudo mandar el mensaje.', detalle: e.message });
  }
});

// Manda un paquete de VARIAS fotos + un texto final a un grupo (ej: "partidos del día"): cada
// foto se manda por separado, sin texto encima, en el orden recibido; al final se manda el
// texto, y después la línea separadora -- así el feed del grupo muestra todas las fotos
// juntas y el resumen justo después. Body: { grupoId, imagenes: [{base64, mediaType}], texto }.
app.post('/enviar-multiple', requireApiKey, async (req, res) => {
  if (req.body && req.body.grupoId === vipMod.VIP_WHATSAPP_JID) {
    const { imagenes, texto } = req.body;
    try {
      await vipMod.enviarAlGrupoVip({ texto, imagenes: (Array.isArray(imagenes) ? imagenes : []).map((m) => ({ base64: m && m.base64, mediaType: m && m.mediaType })) });
      return res.json({ ok: true, via: 'telegram' });
    } catch (e) {
      console.error('Envío múltiple al VIP de Telegram:', e);
      return res.status(500).json({ error: 'No se pudo mandar al grupo VIP de Telegram: ' + e.message });
    }
  }
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { grupoId, imagenes, texto } = req.body || {};
  if (!grupoId || !Array.isArray(imagenes) || !imagenes.length) {
    return res.status(400).json({ error: 'Falta grupoId o las imágenes.' });
  }
  try {
    for (const img of imagenes) {
      if (!img || !img.base64) continue;
      await pausaHumana();
      const buffer = Buffer.from(img.base64, 'base64');
      await sock.sendMessage(grupoId, { image: buffer, mimetype: img.mediaType || 'image/jpeg' });
    }
    if (texto) {
      await pausaHumana();
      await sock.sendMessage(grupoId, { text: texto });
    }
    await mandarSeparador(grupoId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error mandando los partidos del día:', e);
    res.status(500).json({ error: 'No se pudo mandar el paquete de fotos.', detalle: e.message });
  }
});

// (La cola de envíos masivos espaciados se eliminó: la difusión automática causaba bloqueos del
// número. La difusión ahora es solo manual desde el panel.)

// Ruta de uso único para identificar, a mano, cuál id de /grupos corresponde a cuál grupo
// real cuando salen nombres duplicados -- manda un texto cortito directo desde el navegador
// (sin necesitar el panel ni curl) para ver en qué grupo aparece.
// Ejemplo: /probar?key=TU_API_KEY&grupoId=1203...@g.us&texto=PRUEBA A
app.get('/probar', requireApiKey, async (req, res) => {
  if (!connected) return res.status(503).send('El bot no está conectado a WhatsApp todavía.');
  const { grupoId, texto } = req.query;
  if (!grupoId || !texto) return res.status(400).send('Faltan los parámetros grupoId y texto en la URL.');
  try {
    await sock.sendMessage(grupoId, { text: String(texto) });
    res.send(`Mandado. Revisa en tu WhatsApp (como miembro normal) en qué grupo apareció "${texto}".`);
  } catch (e) {
    res.status(500).send('No se pudo mandar: ' + e.message);
  }
});

// Para cambiar de número dedicado (ej: si WhatsApp bloqueó el actual) sin tener que entrar a
// Railway a borrar archivos a mano: borra la sesión guardada (AUTH_DIR) y vuelve a conectar
// desde cero, lo que genera un QR nuevo en /qr para escanear con el número nuevo. Ojo: esto
// desvincula el número actual -- solo úsalo cuando de verdad quieras cambiar de número. Acepta
// GET además de POST para poder abrirlo directo desde el navegador con ?key=... (como /grupos).
async function resetSessionHandler(req, res) {
  try {
    if (sock) { try { sock.end(undefined); } catch (e) {} }
    connected = false;
    lastQR = null;
    sock = null;
    // AUTH_DIR es un volumen montado de Railway: la carpeta en sí no se puede borrar (EBUSY),
    // así que se borra solo lo que hay adentro.
    if (fs.existsSync(AUTH_DIR)) {
      for (const f of fs.readdirSync(AUTH_DIR)) {
        fs.rmSync(path.join(AUTH_DIR, f), { recursive: true, force: true });
      }
    }
    await iniciarConexion();
    res.json({ ok: true, mensaje: 'Sesión borrada. Entra a /qr en unos segundos para escanear el código nuevo.' });
  } catch (e) {
    console.error('Error reseteando la sesión:', e);
    res.status(500).json({ error: 'No se pudo resetear la sesión: ' + e.message });
  }
}

const soloDigitosJid = (x) => String(x || '').split('@')[0].split(':')[0].replace(/\D/g, '');
// Devuelve los participantes del grupo y si se puede confirmar quién está: WhatsApp a veces guarda
// a algunos con un id interno "@lid" sin número. Si hay de esos, "no lo encontré" NO prueba que
// la persona no esté (verificable=false) y el panel no debe darla por fuera.
async function leerGrupo(grupoId) {
  const meta = await sock.groupMetadata(grupoId);
  const parts = meta.participants || [];
  const tieneNumero = (p) => [p.id, p.phoneNumber, p.jid].some(x => /@s\.whatsapp\.net$/.test(String(x || '')));
  const sinNumero = parts.filter(p => !tieneNumero(p)).length;
  return { parts, verificable: sinNumero === 0, sinNumero, total: parts.length };
}

// Revisa, SIN sacar a nadie, en cuáles grupos está cada número. Body: { numeros: [...], grupoIds: [...] }
// Devuelve { grupos: {grupoId: {verificable, sinNumero, total}}, presentes: { numero: [grupoIds] } }
app.post('/revisar-miembros', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { numeros, grupoIds } = req.body || {};
  if (!Array.isArray(numeros) || !Array.isArray(grupoIds) || !grupoIds.length) {
    return res.status(400).json({ error: 'Falta numeros o grupoIds.' });
  }
  try {
    const grupos = {};
    const presentes = {};
    numeros.forEach(n => { presentes[String(n).replace(/\D/g, '')] = []; });
    for (const grupoId of grupoIds) {
      const { parts, verificable, sinNumero, total } = await leerGrupo(grupoId);
      grupos[grupoId] = { verificable, sinNumero, total };
      const enGrupo = new Set();
      parts.forEach(p => [p.id, p.phoneNumber, p.jid].forEach(x => { const d = soloDigitosJid(x); if (d) enGrupo.add(d); }));
      Object.keys(presentes).forEach(n => { if (enGrupo.has(n)) presentes[n].push(grupoId); });
    }
    res.json({ ok: true, grupos, presentes });
  } catch (e) {
    console.error('Error revisando miembros:', e);
    res.status(500).json({ error: 'No se pudo revisar los grupos: ' + e.message });
  }
});

// Saca a una persona de uno o varios grupos (ej: membresía VIP vencida). El número del bot tiene
// que ser ADMIN de cada grupo, si no WhatsApp rechaza la acción. Body: { numero, grupoIds: [...] }
// donde numero va con código de país y solo dígitos (ej: 593991234567). Devuelve el resultado
// por grupo, así un grupo que falle no tumba al otro.
async function sacarDeGrupos(digitos, grupoIds) {
  const soloDigitos = (x) => String(x || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  const resultados = [];
  for (const grupoId of grupoIds) {
    try {
      // Se busca a la persona DENTRO del grupo (WhatsApp a veces la guarda con un id interno
      // "@lid" en vez del número, y entonces borrar por número no hace nada).
      const { parts, verificable } = await leerGrupo(grupoId);
      const objetivo = parts.find(p => [p.id, p.phoneNumber, p.jid].some(x => soloDigitos(x) === digitos));
      const yo = parts.find(p => [p.id, p.lid, p.phoneNumber, p.jid].some(x => x && (soloDigitos(x) === soloDigitos(sock.user && sock.user.id) || soloDigitos(x) === soloDigitos(sock.user && sock.user.lid))));
      const botEsAdmin = !!(yo && (yo.admin === 'admin' || yo.admin === 'superadmin'));
      if (!objetivo) {
        resultados.push(verificable
          ? { grupoId, ok: true, encontrado: false, botEsAdmin, status: 'no-estaba' }
          : { grupoId, ok: false, encontrado: false, botEsAdmin, status: 'no-confirmado', error: 'No lo encontré, pero este grupo tiene miembros sin número visible, así que no puedo confirmar si está.' });
        continue;
      }
      if (!botEsAdmin) {
        resultados.push({ grupoId, ok: false, encontrado: true, botEsAdmin, error: 'El número del bot NO es administrador de este grupo.' });
        continue;
      }
      const r = await sock.groupParticipantsUpdate(grupoId, [objetivo.id], 'remove');
      const status = r && r[0] && String(r[0].status);
      resultados.push({ grupoId, ok: status === '200', encontrado: true, botEsAdmin, status: status || 'sin-respuesta', error: status === '200' ? undefined : `WhatsApp respondió ${status || 'nada'}` });
    } catch (e) {
      console.error('Error sacando del grupo:', grupoId, e);
      resultados.push({ grupoId, ok: false, error: e.message });
    }
  }
  return resultados;
}

// ---- Grupo global de WhatsApp (stake de pago + regalito) ----
// Un solo grupo para todos los clientes del día. El bot NO vacía nada solo: únicamente cuando se pulsa el botón
// "Vaciar grupo global" del panel saca a todos los miembros (menos los administradores y él mismo) y renueva el link.
// Hay que poner la variable GRUPO_GLOBAL_JID en Railway (el id sale de /grupos) y el número del bot debe ser ADMIN del grupo.
// WhatsApp NO permite borrar los mensajes del grupo desde un bot: lo que se vacía son los miembros.
const grupoGlobalJid = (b) => String((b && b.jid) || process.env.GRUPO_GLOBAL_JID || '').trim();
async function vaciarGrupoGlobal(jid) {
  if (!connected) throw new Error('El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.');
  if (!jid) throw new Error('Falta la variable GRUPO_GLOBAL_JID en Railway (el id del grupo, termina en @g.us).');
  const meta = await sock.groupMetadata(jid);
  const digitosBot = [sock.user && sock.user.id, sock.user && sock.user.lid].map((x) => soloDigitosJid(x));
  const esBot = (p) => [p.id, p.lid, p.phoneNumber, p.jid].some((x) => x && digitosBot.includes(soloDigitosJid(x)));
  const yo = (meta.participants || []).find(esBot);
  if (!(yo && (yo.admin === 'admin' || yo.admin === 'superadmin'))) throw new Error('El número del bot NO es administrador de ese grupo.');
  const sacar = (meta.participants || []).filter((p) => !p.admin && !esBot(p)).map((p) => p.id);
  let quitados = 0, fallidos = 0;
  for (let i = 0; i < sacar.length; i += 8) {
    const lote = sacar.slice(i, i + 8);
    try {
      const r = await sock.groupParticipantsUpdate(jid, lote, 'remove');
      (r || []).forEach((x) => { if (String(x.status) === '200') quitados++; else fallidos++; });
    } catch (e) { fallidos += lote.length; console.error('Vaciar grupo:', e.message); }
    await new Promise((ok) => setTimeout(ok, 2500)); // despacio, para no levantar sospechas en WhatsApp
  }
  let link = '';
  try { const code = await sock.groupRevokeInvite(jid); link = code ? `https://chat.whatsapp.com/${code}` : ''; } catch (e) { console.error('Renovar link:', e.message); }
  return { ok: true, quitados, fallidos, link, miembrosAntes: (meta.participants || []).length };
}
app.post('/grupo-global/vaciar', requireApiKey, async (req, res) => {
  try { res.json(await vaciarGrupoGlobal(grupoGlobalJid(req.body))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/grupo-global/link', requireApiKey, async (req, res) => {
  try {
    if (!connected) throw new Error('El bot no está conectado a WhatsApp ahora mismo.');
    const jid = grupoGlobalJid(req.query);
    if (!jid) throw new Error('Falta la variable GRUPO_GLOBAL_JID en Railway.');
    const code = await sock.groupInviteCode(jid);
    res.json({ ok: true, link: `https://chat.whatsapp.com/${code}` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/sacar-del-grupo', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { numero, grupoIds } = req.body || {};
  const digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 8 || !Array.isArray(grupoIds) || !grupoIds.length) {
    return res.status(400).json({ error: 'Falta numero o grupoIds.' });
  }
  const resultados = await sacarDeGrupos(digitos, grupoIds);
  res.json({ ok: resultados.every(r => r.ok), resultados });
});

app.get('/reset-session', requireApiKey, resetSessionHandler);
app.post('/reset-session', requireApiKey, resetSessionHandler);

app.listen(PORT, () => {
  console.log(`Servidor del bot de WhatsApp escuchando en el puerto ${PORT}.`);
});

// ---------------------------------------------------------------------------------------------
// Recordatorios diarios por Telegram: lo que hay que subir todos los días hasta las 7pm (hora de
// Ecuador): 3 apuestas VIP, 1 apuesta gratis, 1 regalito y 1 stake. Se vigila SOLO, mirando las
// hojas del panel: apenas registras la apuesta/regalito/stake en el panel (con la fecha de hoy),
// cuenta como hecho. Cada rato revisa qué falta y te escribe SOLO si falta algo; cuando todo está
// listo, deja de insistir. Vive aquí (y no en Vercel) porque Vercel gratis solo deja correr tareas
// una vez al día, y esto necesita revisar varias veces.
//
// Variables en Railway: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (las mismas que en Vercel).
// ---------------------------------------------------------------------------------------------
const SHEETS_API_URL_RECORD = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const METAS_DIARIAS = [
  { hoja: 'ApuestasVIP', campo: 'date', meta: 3, nombre: 'apuestas VIP' },
  { hoja: 'ApuestasGratis', campo: 'date', meta: 1, nombre: 'apuesta gratis' },
  { hoja: 'Regalitos', campo: 'date', meta: 1, nombre: 'regalito del día' },
  { hoja: 'Stakes', campo: 'date', meta: 1, nombre: 'stake del día', alt: { hoja: 'SeccionesStakes', campo: 'day' } } // cuenta si registras el stake o creas su sección de venta de hoy
];
// Minutos desde la medianoche (hora Ecuador) en que se revisa y se avisa si falta algo.
const HORAS_AVISO = [10 * 60, 12 * 60, 14 * 60, 16 * 60, 17 * 60 + 30, 18 * 60 + 15, 18 * 60 + 45, 19 * 60];
const avisosHechos = new Set(); // "YYYY-MM-DD|minuto"

function ecuadorAhora() {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return { fecha: d.toISOString().slice(0, 10), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

async function contarHoy(hoja, campo, hoy) {
  const r = await fetch(`${SHEETS_API_URL_RECORD}?sheet=${hoja}`);
  const json = await r.json();
  return (json.data || []).filter(x => String(x[campo] || '').slice(0, 10) === hoy).length;
}

async function revisarPendientesDiarios() {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) return;
  const { fecha, minutos } = ecuadorAhora();
  // el aviso toca si ya pasó la hora marcada y no han pasado más de 10 minutos (así un reinicio
  // del bot tarde en el día no dispara una ráfaga de avisos viejos)
  const toca = HORAS_AVISO.find(h => minutos >= h && minutos < h + 10 && !avisosHechos.has(`${fecha}|${h}`));
  if (toca === undefined) return;
  avisosHechos.add(`${fecha}|${toca}`);
  try {
    const faltan = [];
    for (const m of METAS_DIARIAS) {
      let n = await contarHoy(m.hoja, m.campo, fecha);
      if (m.alt) n = Math.max(n, await contarHoy(m.alt.hoja, m.alt.campo, fecha));
      if (n < m.meta) faltan.push(m.meta > 1 ? `• ${m.nombre}: llevas ${n} de ${m.meta}` : `• ${m.nombre}: falta`);
    }
    if (!faltan.length) return; // todo listo, no molesta
    const restan = 19 * 60 - minutos;
    let encabezado;
    if (toca >= 19 * 60) encabezado = '🚨 Son las 7pm y NO se subió todo:';
    else if (toca >= 18 * 60) encabezado = `🔥 Quedan ${restan} min para las 7pm y falta:`;
    else if (toca >= 16 * 60) encabezado = '⏰ Ya va cayendo la tarde, todavía falta subir:';
    else encabezado = '📋 Pendientes de hoy para el VIP:';
    const texto = `${encabezado}\n${faltan.join('\n')}\n\nCuando lo registres en el panel (con la fecha de hoy), deja de salir aquí.`;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: texto, reply_markup: { inline_keyboard: [[{ text: 'Abrir el panel', url: 'https://panel-paywin.vercel.app' }]] } })
    });
    if (!r.ok) console.error('Telegram rechazó el recordatorio:', await r.text().catch(() => ''));
  } catch (e) {
    console.error('Error en recordatorios diarios:', e.message);
    avisosHechos.delete(`${fecha}|${toca}`); // si falló, se reintenta en el próximo minuto
  }
}
setInterval(revisarPendientesDiarios, 60 * 1000);
