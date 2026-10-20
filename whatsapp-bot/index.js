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
  res.json({ conectado: connected });
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
async function mandarSeparador(grupoId) {
  try {
    await pausaHumana();
    if (separadorStickerBuffer) {
      await sock.sendMessage(grupoId, { sticker: separadorStickerBuffer });
    } else {
      await sock.sendMessage(grupoId, { text: '━━━━━━━━━━━━━━━━━━━━' });
    }
  } catch (e) {
    console.error('No se pudo mandar el separador:', e.message);
  }
}

// Manda un texto (y, opcionalmente, una imagen con ese texto como descripción/caption)
// directo a un grupo, y después manda la línea separadora. "grupoId" es el id real
// (ver /grupos), no el nombre. La imagen puede venir como base64 (fotos subidas de nuevo) o
// como imagenUrl (publicidades guardadas en Vercel Blob, en su calidad real -- Baileys la
// descarga solo, no hace falta mandarla por el panel); si llegan las dos, gana imagenUrl.
app.post('/enviar', requireApiKey, async (req, res) => {
  if (!connected) {
    return res.status(503).json({ error: 'El bot no está conectado a WhatsApp ahora mismo. Revisa /qr.' });
  }
  const { grupoId, texto, imagenBase64, imagenUrl, mediaType } = req.body || {};
  if (!grupoId || !texto) {
    return res.status(400).json({ error: 'Falta grupoId o texto.' });
  }
  try {
    await pausaHumana();
    if (imagenUrl) {
      await sock.sendMessage(grupoId, { image: { url: imagenUrl }, caption: texto });
    } else if (imagenBase64) {
      const buffer = Buffer.from(imagenBase64, 'base64');
      await sock.sendMessage(grupoId, { image: buffer, mimetype: mediaType || 'image/jpeg', caption: texto });
    } else {
      await sock.sendMessage(grupoId, { text: texto });
    }
    await mandarSeparador(grupoId);
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

// Cola de envíos espaciados (ej: avisar uno por uno a cada cliente que ya compró un stake,
// en vez de mandarles a todos de golpe). El panel manda la lista COMPLETA una sola vez y
// este servidor (que corre 24/7, no depende de que el panel esté abierto) va descargando la
// cola solo, a un ritmo fijo -- así el patrón de envíos se parece más a una persona
// escribiendo uno por uno que a un bot mandando ráfagas, lo que baja el riesgo de que
// WhatsApp marque el número. No persiste en disco: si el servicio se reinicia a mitad de
// una cola, lo que faltaba se pierde (para este uso -- avisos de stakes del día -- no vale
// la pena la complejidad de guardarlo).
let colaEnvios = [];
let colaIntervaloMs = 60000; // 1 minuto por defecto
let colaTimer = null;

async function tickCola() {
  if (!colaEnvios.length) {
    clearInterval(colaTimer);
    colaTimer = null;
    return;
  }
  if (!connected) return; // espera a que reconecte -- no descarta el mensaje, solo lo deja en espera
  const item = colaEnvios.shift();
  try {
    await pausaHumana();
    if (item.imagenBase64) {
      const buffer = Buffer.from(item.imagenBase64, 'base64');
      await sock.sendMessage(item.grupoId, { image: buffer, mimetype: item.mediaType || 'image/jpeg', caption: item.texto });
    } else {
      await sock.sendMessage(item.grupoId, { text: item.texto });
    }
    console.log('Cola: mandado a', item.grupoId, '-- quedan', colaEnvios.length);
  } catch (e) {
    console.error('Cola: error mandando a', item.grupoId, e.message);
  }
}

function iniciarColaSiHaceFalta(nuevoIntervaloMs) {
  if (nuevoIntervaloMs && nuevoIntervaloMs >= 15000 && nuevoIntervaloMs !== colaIntervaloMs) {
    colaIntervaloMs = nuevoIntervaloMs;
    if (colaTimer) { clearInterval(colaTimer); colaTimer = null; }
  }
  if (colaTimer) return;
  // El primer aviso se manda de una, sin esperar el minuto completo -- setInterval por sí solo
  // solo dispara DESPUÉS de que pasa el intervalo completo, y eso hacía parecer que la cola no
  // estaba haciendo nada durante el primer minuto.
  tickCola();
  colaTimer = setInterval(tickCola, colaIntervaloMs);
}

// Agrega mensajes a la cola de envío espaciado. Body: { mensajes: [{grupoId, texto,
// imagenBase64?, mediaType?}, ...], intervaloMs? } -- intervaloMs es opcional (mínimo 15s
// por seguridad), si no se manda se usa el que ya esté activo (1 minuto por defecto).
app.post('/enviar-cola', requireApiKey, (req, res) => {
  const { mensajes, intervaloMs } = req.body || {};
  if (!Array.isArray(mensajes) || !mensajes.length) {
    return res.status(400).json({ error: 'Falta la lista de mensajes.' });
  }
  let agregados = 0;
  for (const m of mensajes) {
    if (m && m.grupoId && m.texto) {
      colaEnvios.push({ grupoId: m.grupoId, texto: m.texto, imagenBase64: m.imagenBase64 || '', mediaType: m.mediaType || '' });
      agregados++;
    }
  }
  iniciarColaSiHaceFalta(Number(intervaloMs) || null);
  res.json({ ok: true, agregados, pendientes: colaEnvios.length, intervaloMs: colaIntervaloMs });
});

// Para ver cuánto falta en la cola.
app.get('/cola', requireApiKey, (req, res) => {
  res.json({ pendientes: colaEnvios.length, intervaloMs: colaIntervaloMs, activa: !!colaTimer });
});

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

app.listen(PORT, () => {
  console.log(`Servidor del bot de WhatsApp escuchando en el puerto ${PORT}.`);
});
