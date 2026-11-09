// Textos que el número de ATENCIÓN AL CLIENTE le manda solo a quien le escribe.
// Escríbelos tal como quieres que le lleguen al cliente (puedes usar *negrita* de WhatsApp y emojis).
// Si uno está vacío, para ese tema el bot NO responde nada: solo te avisa por Telegram (el aviso sale siempre).
// Si pones una imagen en assets/atencion/<tema>.jpg (recarga, vip, stake, regalito), el texto se manda como pie de esa foto.
module.exports = {
  // Piden una recarga (recarga, depositar, número de cuenta, pásame la cuenta...): la cuenta de banco.
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
  // Preguntan por el VIP (vip, membresía...).
  VIP: '',
  // Preguntan por el stake.
  STAKE: '',
  // Preguntan por el regalito (regalito, apuesta gratis, bono...).
  REGALITO: '',
  // Cualquier otra cosa (hola, preguntas, etc.): un mensaje corto, por ejemplo "Hola, ya te atendemos".
  OTRO: ''
};
