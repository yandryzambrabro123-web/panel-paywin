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

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({ error: 'El servidor no tiene configurada API_KEY todavía.' });
  }
  if (req.header('x-api-key') !== API_KEY) {
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
  res.json({ conectado: connected });
});

// Lista los grupos en los que ya está metido el número dedicado, con su "id" real de
// WhatsApp (algo como "1203xxxxxxxx@g.us"). Hay que usar este id -- no el nombre -- para
// mandar mensajes. Primero hay que unir el número dedicado a cada grupo (entrando a cada
// link de invitación desde ESE número), y recién ahí aparecen aquí.
app.get('/grupos', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp todavía.' });
  }
  try {
    const grupos = await sock.groupFetchAllParticipating();
    const lista = Object.values(grupos).map((g) => ({ id: g.id, nombre: g.subject }));
    res.json({ grupos: lista });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo leer la lista de grupos.', detalle: e.message });
  }
});

// Manda un texto (y, opcionalmente, una imagen con ese texto como descripción/caption)
// directo a un grupo. "grupoId" es el id real (ver /grupos), no el nombre.
app.post('/enviar', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { grupoId, texto, imagenBase64, mediaType } = req.body || {};
  if (!grupoId || !texto) {
    return res.status(400).json({ error: 'Falta grupoId o texto.' });
  }
  try {
    await pausaHumana();
    if (imagenBase64) {
      const buffer = Buffer.from(imagenBase64, 'base64');
      await sock.sendMessage(grupoId, { image: buffer, mimetype: mediaType || 'image/jpeg', caption: texto });
    } else {
      await sock.sendMessage(grupoId, { text: texto });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Error mandando mensaje:', e);
    res.status(500).json({ error: 'No se pudo mandar el mensaje.', detalle: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor del bot de WhatsApp escuchando en el puerto ${PORT}.`);
});
