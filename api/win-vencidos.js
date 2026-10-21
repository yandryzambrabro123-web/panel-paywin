// Función serverless de Vercel: avisa por WhatsApp (a TU número personal, desde el bot) qué
// miembros VIP tienen la membresía vencida o por vencer, para que los saques y los invites a
// reconsumir. La dispara Vercel Cron todos los días a las 9am de Ecuador (ver vercel.json,
// "0 14 * * *") y no manda nada si no hay nadie que avisar.
//
// Variables de entorno en Vercel: WA_BOT_URL, WA_BOT_API_KEY (ya existen) y
//   WIN_NOTIF_NUMERO -- tu número con código de país y solo dígitos, ej: 593991234567.
// IMPORTANTE: guarda el número del bot en tu celular y escríbele "hola" una vez, para que el
// aviso te llegue como chat normal y no como mensaje de un desconocido.
//
// La lógica de vencimiento es la MISMA del panel (membershipStatus en index.html): plan
// mensual = 1 mes, trimestral = 3, anual = 12, contado desde joinDate. Si cambia allá, cambia acá.
// Los que ya se sacaron del VIP desde el panel (campo removidoVip = el joinDate que tenían al sacarlos; si renuevan, cambia y vuelven a seguirse) no vuelven a aparecer.

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

module.exports = async function handler(req, res) {
  const botUrl = process.env.WA_BOT_URL;
  const botKey = process.env.WA_BOT_API_KEY;
  const numero = String(process.env.WIN_NOTIF_NUMERO || '').replace(/\D/g, '');
  if (!botUrl || !botKey || !numero) {
    res.status(500).json({ ok: false, error: 'Falta configurar WA_BOT_URL, WA_BOT_API_KEY y/o WIN_NOTIF_NUMERO en Vercel.' });
    return;
  }

  try {
    const today = ecuadorToday();
    const sheet = await (await fetch(`${SHEETS_API_URL}?sheet=VIPs`)).json();
    const vips = (sheet.data || []).filter(v => !(v.joinDate && String(v.removidoVip) === String(v.joinDate)));

    const vencidos = [];
    const porVencer = [];
    vips.forEach(v => {
      const dias = diasRestantes(v, today);
      if (dias === null) return;
      if (dias < 0) vencidos.push({ v, dias });
      else if (dias <= AVISAR_DIAS_ANTES) porVencer.push({ v, dias });
    });

    if (!vencidos.length && !porVencer.length) {
      res.status(200).json({ ok: true, enviado: false, motivo: 'Nadie vencido ni por vencer.' });
      return;
    }

    const nombre = ({ v }) => `• ${v.name || 'Sin nombre'}${v.contact ? ` (${v.contact})` : ''}`;
    let texto = '🔔 *Win — Reconsumos VIP*\n';
    if (vencidos.length) {
      texto += `\n⛔ *Vencidos (${vencidos.length})* — para sacar y pedir reconsumo:\n`;
      texto += vencidos.slice(0, 25).map(x => `${nombre(x)} · hace ${-x.dias}d`).join('\n');
      if (vencidos.length > 25) texto += `\n… y ${vencidos.length - 25} más`;
    }
    if (porVencer.length) {
      texto += `\n\n⏳ *Por vencer (${porVencer.length})*:\n`;
      texto += porVencer.slice(0, 25).map(x => `${nombre(x)} · ${x.dias === 0 ? 'vence hoy' : `en ${x.dias}d`}`).join('\n');
    }
    texto += '\n\nAbre Win → 🔔 Reconsumos para sacarlos o escribirles.';

    const botRes = await fetch(`${botUrl.replace(/\/$/, '')}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': botKey },
      body: JSON.stringify({ grupoId: `${numero}@s.whatsapp.net`, texto, sinSeparador: true })
    });
    const data = await botRes.json().catch(() => ({}));
    if (!botRes.ok || !data.ok) throw new Error(data.error || 'El bot no pudo mandar el aviso.');

    res.status(200).json({ ok: true, enviado: true, vencidos: vencidos.length, porVencer: porVencer.length });
  } catch (e) {
    console.error('Error en aviso de vencidos:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
