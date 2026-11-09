// Textos que el número de ATENCIÓN AL CLIENTE le manda solo a quien le escribe.
// Escríbelos tal como quieres que le lleguen al cliente (puedes usar *negrita* de WhatsApp y emojis).
// {saludo} se cambia solo por "Muy buenos días / buenas tardes / buenas noches" según la hora de Ecuador.
// Si un tema queda sin saludo ni texto, el bot NO responde: solo te avisa por Telegram (el aviso sale siempre).
module.exports = {
  // ---- Saludo que va primero en cada tema ----
  SALUDO_RECARGA: '{saludo} 👋 Claro que sí, en este momento le ayudamos. Le dejo ahora mismo la cuenta de banco:',
  SALUDO_VIP: '{saludo} 👋 Claro que sí, en este momento le ayudamos. Le dejo la información del grupo VIP:',
  SALUDO_STAKE: '{saludo} 👋 Claro que sí, en este momento le ayudamos. Le explico cómo funciona el stake:',
  SALUDO_REGALITO: '{saludo} 👋 Claro que sí, en este momento le ayudamos. Le dejo la información del regalito:',
  SALUDO_OTRO: '{saludo} 👋 Ya te atendemos, danos un momento por favor.',

  // ---- Texto fijo (la cuenta de banco; y respaldo de los demás si no hay publicidad guardada) ----
  RECARGA: `💛🖤 CUENTAS OFICIALES — AGENCIA PAYWIN 🖤💛

💰 RECARGAS DESDE $5
💸 RETIROS DESDE $10

🏦 BANCO PICHINCHA
Cuenta de ahorros: 2206953692
Titular: Gloria Herrera

🟢 PRODUBANCO
Cuenta de ahorros: 20009425568
Titular: Yandry Marcelo Zambrano
C.I.: 1316755212

⚠️ IMPORTANTE: Realiza tus operaciones únicamente a nuestras CUENTAS OFICIALES PAYWIN.

🔥 PAYWIN
RECARGA • RETIRA • DISFRUTA`,
  VIP: '',
  STAKE: '',
  REGALITO: '',
  OTRO: '',

  // ---- Publicidad guardada en el panel (Imágenes guardadas) que se manda con cada tema ----
  // Se busca por nombre (igual que Win). Si no la encuentra, usa el texto fijo de arriba.
  PUBLICIDAD: { vip: 'vip', stake: 'stake', regalito: 'protocolo apuesta gratis' }
};
