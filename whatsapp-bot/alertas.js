// Alertas por Telegram cuando algo se atasca o falla. Todo llega al mismo chat del jefe (TELEGRAM_CHAT_ID).
//
// Regla para no molestar: cada problema tiene una "clave". El primer aviso sale al instante; si el problema sigue,
// se repite como mucho una vez por hora (según la clave); y cuando se arregla llega un solo "✅ ya volvió".
//
// Qué vigila:
//   - WhatsApp desconectado más de 5 minutos, o número desvinculado/bloqueado (hay que escanear el QR).
//   - La IA que lee las capturas: avisa cuando falla con un cliente real (clave inválida, sin saldo, límite o caída). No hace pruebas programadas.
//   - Registros de stake/regalito que se quedaron "pendiente" más de 10 minutos.
//   - Fallas al publicar (grupos de WhatsApp, VIP, canales) y al crear el link de un solo uso del cliente.
//   - Errores que tumban o sacuden al programa (se avisa y Railway lo levanta de nuevo).

const TOKEN = () => String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT = () => String(process.env.TELEGRAM_CHAT_ID || '').trim();
const activos = new Map(); // clave -> { desde, ultimo }

async function enviar(texto, silencioso) {
  if (!TOKEN() || !CHAT()) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT(), text: String(texto).slice(0, 3900), disable_notification: !!silencioso, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000)
    });
    return r.ok;
  } catch (e) { console.error('Alertas: no pude escribirle al jefe:', e.message); return false; }
}

// Avisa de un problema. Devuelve true si mandó el mensaje (false si todavía está en espera por el aviso anterior).
async function avisar(clave, texto, { cooldownMin = 60 } = {}) {
  const ahora = Date.now();
  const a = activos.get(clave);
  if (a && ahora - a.ultimo < cooldownMin * 60000) return false;
  activos.set(clave, { desde: a ? a.desde : ahora, ultimo: ahora });
  return enviar('🚨 ' + texto);
}

// Marca el problema como arreglado. Solo escribe si antes se había avisado.
async function resuelto(clave, texto) {
  if (!activos.has(clave)) return false;
  activos.delete(clave);
  return enviar('✅ ' + texto);
}

const hace = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

function montar(stakes, estadoWA, comprobantes) {
  // --- 1) Errores que sacuden al programa ---
  process.on('unhandledRejection', (e) => {
    console.error('Promesa sin atender:', e);
    avisar('error-promesa', `Error inesperado en el bot (sigue funcionando):\n${String((e && e.message) || e).slice(0, 400)}`, { cooldownMin: 30 });
  });
  process.on('uncaughtException', async (e) => {
    console.error('Error que tumbó el bot:', e);
    await Promise.race([avisar('error-fatal', `El bot se cayó por un error y se reinicia solo:\n${String((e && e.message) || e).slice(0, 400)}`, { cooldownMin: 0 }), new Promise((r) => setTimeout(r, 4000))]);
    process.exit(1);
  });

  // --- 3) WhatsApp ---
  setInterval(() => {
    try {
      const s = estadoWA();
      if (s.conectado) { resuelto('wa', 'WhatsApp volvió a conectarse.'); resuelto('wa-baja', 'WhatsApp volvió a conectarse.'); return; }
      const desde = s.desde || Date.now();
      if (Date.now() - desde > 5 * 60000) {
        avisar('wa', `WhatsApp lleva ${hace(Date.now() - desde)} desconectado.${s.ultimoCierre ? '\nÚltimo cierre: ' + s.ultimoCierre : ''}\nSi sigue así, abre /qr del bot y escanea el código con el número dedicado.`, { cooldownMin: 60 });
      }
    } catch (e) { console.error('Alertas WhatsApp:', e.message); }
  }, 60 * 1000);

  // --- 4) IA que lee las capturas ---
  // Sin pruebas programadas (para no gastar crédito): el aviso sale solo cuando un cliente real es rechazado porque la IA falló (ver comprobantes.js).

  // --- 5) Registros atascados ---
  const revisarRegistros = async () => {
    try {
      const atascados = [];
      for (const [hoja, nombre] of [['RegistrosStake', 'stake'], ['RegistrosRegalito', 'regalito']]) {
        for (const f of await stakes.leerHoja(hoja)) {
          if (f.estado === 'pendiente' && f.createdAt && Date.now() - new Date(f.createdAt).getTime() > 10 * 60000) {
            atascados.push(`• ${nombre}: ${f.nombre || ''} ${f.apellido || ''} ${f.telefono ? '(' + f.telefono + ')' : ''} — hace ${hace(Date.now() - new Date(f.createdAt).getTime())}`.replace(/\s+/g, ' '));
          }
        }
      }
      if (atascados.length) await avisar('registros', `Hay ${atascados.length} registro(s) que se quedaron sin resolver más de 10 minutos:\n${atascados.slice(0, 8).join('\n')}\nRevísalos en el panel o escríbele al cliente.`, { cooldownMin: 60 });
      else await resuelto('registros', 'Ya no hay registros atascados.');
    } catch (e) { console.error('Alertas registros:', e.message); }
  };
  setTimeout(revisarRegistros, 2 * 60 * 1000);
  setInterval(revisarRegistros, 5 * 60 * 1000);
}

function iaTexto(r) {
  if (!r.configurada) return 'Falta la variable ANTHROPIC_API_KEY en Railway: la IA no puede revisar capturas, así que los registros del regalito y del stake se están rechazando.';
  let causa = `error ${r.estado || ''} ${r.error || ''}`.trim();
  if (r.estado === 401) causa = 'la clave de Anthropic no es válida (revisa ANTHROPIC_API_KEY en Railway)';
  else if (r.estado === 402 || /credit|balance|billing/i.test(r.error || '')) causa = 'se acabó el saldo de la cuenta de Anthropic (recarga en console.anthropic.com → Billing)';
  else if (r.estado === 429) causa = 'se pasó el límite de uso de Anthropic';
  return `La IA que revisa las capturas no está funcionando: ${causa}.\nMientras tanto los registros del regalito y del stake se rechazan y los clientes no entran.`;
}

module.exports = { montar, avisar, resuelto, enviar, iaTexto };
