// Cuadre financiero AUTOMÁTICO: al aprobar un pago (stake de pago o membresía VIP), el bot te pregunta por Telegram
// a qué banco/caja llegó el dinero y, con un toque, lo acredita en el Cuadre Financiero del panel (hoja
// "CuadreMovimientos"). Si lo tocas dos veces no se duplica.
//
// Precios de la membresía VIP (Railway, opcional): VIP_PRECIOS="mensual:50,trimestral:150,anual:600"
// Siempre se muestra el monto en el mensaje; si no es el correcto, toca "No registrar" y regístralo a mano en el panel.

let H = null;
const HOJA = 'CuadreMovimientos';
const CUENTAS = [ // mismos ids que FINANCE_ACCOUNTS del panel
  ['pichincha', 'Banco Pichincha'], ['guayaquil', 'Banco Guayaquil'], ['pacifico', 'Banco Pacífico'], ['produbanco', 'ProduBanco'],
  ['ecuabet', 'Caja Ecuabet'], ['onexbet', 'Caja OneXBet'], ['masparley', 'Caja Más Parley'], ['jugadormasparley', 'Cuenta Jugador Más Parley']
];

function precioVip(plan) {
  const base = { mensual: 50, trimestral: 150, anual: 600 };
  String(process.env.VIP_PRECIOS || '').split(',').forEach((p) => { const [k, v] = p.split(':'); if (k && Number(v) > 0) base[k.trim().toLowerCase()] = Number(v); });
  return base[String(plan || '').toLowerCase()] || 0;
}

// tipo: 'st' (stake) | 'vp' (VIP). Manda el mensaje con las cuentas.
async function ofrecer({ tipo, regId, monto, etiqueta }) {
  if (!H || !(Number(monto) > 0)) return;
  const filas = [];
  for (let i = 0; i < CUENTAS.length; i += 2) filas.push(CUENTAS.slice(i, i + 2).map(([, n], j) => ({ text: n, callback_data: `cu:${tipo}${regId}:${i + j}:${Math.round(monto * 100)}` })));
  filas.push([{ text: 'No registrar en el cuadre', callback_data: 'cu:x:0' }]);
  await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), parse_mode: 'HTML', text: `💰 <b>${H.esc(etiqueta)}</b> — $${Number(monto).toFixed(2)}\n¿A qué cuenta llegó? Se acredita solo en el cuadre.`, reply_markup: { inline_keyboard: filas } }).catch((e) => console.error('Cuadre:', e.message));
}

function montar(stakes) {
  H = stakes;
  H.manejadores.cu = async (cq) => {
    const [, clave, idx, cent] = String(cq.data).split(':');
    const resp = async (txt) => {
      await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
      if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
    };
    if (clave === 'x') return resp('Sin registrar en el cuadre');
    const cuenta = CUENTAS[Number(idx)];
    const monto = Number(cent) / 100;
    if (!cuenta || !(monto > 0)) return resp('⚠️ Datos inválidos');
    const marca = 'auto:' + clave;
    let ya = false;
    const texto = (cq.message && cq.message.text) || '';
    const etiqueta = texto.split(' — ')[0].replace(/^💰\s*/, '').trim() || 'Pago aprobado';
    await H.cambiarHoja(HOJA, (filas) => {
      if (filas.some((m) => String(m.createdBy) === marca)) { ya = true; return filas; }
      return [...filas, { id: H.nuevoId(), date: H.hoyEC(), accountId: cuenta[0], type: 'in', amount: monto, note: etiqueta, transferId: '', comprobanteNumero: '', receiptImage: '', createdAt: new Date().toISOString(), createdBy: marca }];
    });
    await resp(ya ? '⚠️ Ya estaba acreditado' : `✅ Acreditado en ${cuenta[1]}`);
  };
}

module.exports = { montar, ofrecer, precioVip };
