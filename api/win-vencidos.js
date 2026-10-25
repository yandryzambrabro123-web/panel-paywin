// Función serverless de Vercel: avisa por TELEGRAM (al celular y a la computadora, sin riesgo de
// bloqueo de WhatsApp) qué miembros VIP tienen la membresía vencida o por vencer, para que los
// saques y los invites a reconsumir. La dispara Vercel Cron todos los días a las 9am de Ecuador
// (ver vercel.json, "0 14 * * *") y no manda nada si no hay nadie que avisar.
// Para probar que Telegram quedó bien conectado, abre /api/win-vencidos?test=1 en el navegador.
//
// Variables de entorno en Vercel: TELEGRAM_BOT_TOKEN (el token que te da @BotFather) y
// TELEGRAM_CHAT_ID (tu número de chat, que te da @userinfobot).
//
// La lógica de vencimiento es la MISMA del panel (membershipStatus en index.html): plan
// mensual = 1 mes, trimestral = 3, anual = 12, contado desde joinDate. Si cambia allá, cambia acá.
// Los que ya se sacaron del VIP desde el panel (campo removidoVip = el joinDate que tenían al
// sacarlos; si renuevan, cambia y vuelven a seguirse) no vuelven a aparecer.

const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const PLAN_MONTHS = { mensual: 1, trimestral: 3, anual: 12 };
const AVISAR_DIAS_ANTES = 3;

function ecuadorToday() {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function diasRestantes(v, today) {
  if (!v.joinDate) return null;
  const months = PLAN_MONTHS[String(v.plan || 'mensual').toLowerCase()] || 1;
  const d = new Date(v.joinDate);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + months);
  return Math.ceil((new Date(d.toISOString().slice(0, 10)) - new Date(today)) / 86400000);
}

async function telegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: 'Abrir el panel', url: 'https://panel-paywin.vercel.app' }]] }
    })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) throw new Error(data.description || 'Telegram rechazó el mensaje.');
}

module.exports = async function handler(req, res) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    res.status(500).json({ ok: false, error: 'Falta configurar TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID en Vercel.' });
    return;
  }
  const esPrueba = !!(req.query && req.query.test);

  try {
    const today = ecuadorToday();
    const sheet = await (await fetch(`${SHEETS_API_URL}?sheet=VIPs`)).json();
    // Corte del panel (25-oct-2026, 7:20am Ecuador): lo registrado antes de esta hora no se muestra ni se avisa (sigue en el Excel).
    const CORTE_MS = 1792930800000;
    const creadoMs = v => { const n = parseInt(String((v && v.id) || '').slice(0, -5), 36); return Number.isFinite(n) ? n : 0; };
    const vips = (sheet.data || []).filter(v => creadoMs(v) >= CORTE_MS).filter(v => !(v.joinDate && String(v.removidoVip) === String(v.joinDate)));

    const vencidos = [];
    const porVencer = [];
    vips.forEach(v => {
      const dias = diasRestantes(v, today);
      if (dias === null) return;
      if (dias < 0) vencidos.push({ v, dias });
      else if (dias <= AVISAR_DIAS_ANTES) porVencer.push({ v, dias });
    });

    if (esPrueba) {
      await telegram(token, chatId, '✅ Win conectado a Telegram. Aquí te llegarán los avisos de reconsumos VIP.');
      res.status(200).json({ ok: true, enviado: true, prueba: true });
      return;
    }

    if (!vencidos.length && !porVencer.length) {
      res.status(200).json({ ok: true, enviado: false, motivo: 'Nadie vencido ni por vencer.' });
      return;
    }

    const nombre = ({ v }) => `• ${v.name || 'Sin nombre'}${v.contact ? ` (${v.contact})` : ''}`;
    let texto = '🔔 Win — Reconsumos VIP\n';
    if (vencidos.length) {
      texto += `\n⛔ Vencidos (${vencidos.length}) — para sacar y pedir reconsumo:\n`;
      texto += vencidos.slice(0, 25).map(x => `${nombre(x)} · hace ${-x.dias}d`).join('\n');
      if (vencidos.length > 25) texto += `\n… y ${vencidos.length - 25} más`;
    }
    if (porVencer.length) {
      texto += `\n\n⏳ Por vencer (${porVencer.length}):\n`;
      texto += porVencer.slice(0, 25).map(x => `${nombre(x)} · ${x.dias === 0 ? 'vence hoy' : `en ${x.dias}d`}`).join('\n');
    }
    texto += '\n\nAbre Win → 🔔 Reconsumos para sacarlos o escribirles.';

    await telegram(token, chatId, texto);

    res.status(200).json({ ok: true, enviado: true, vencidos: vencidos.length, porVencer: porVencer.length });
  } catch (e) {
    console.error('Error en aviso de vencidos:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
