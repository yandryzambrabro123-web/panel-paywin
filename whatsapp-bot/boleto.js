// Dibuja el boleto de apuestas como imagen (mismo estilo que el boleto del panel) para mandarlo por Telegram.
// Se arma como SVG y se convierte a PNG con "sharp". Si sharp no está disponible, devuelve null y el
// aviso sale solo en texto (nunca se cae por esto).

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const corta = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const fmt = (v) => { const n = Number(String(v).replace(',', '.')); return isFinite(n) && n > 0 ? n.toFixed(2) : String(v || ''); };

function patas(pick) {
  let t = String(pick || '').trim();
  const bb = /^crear apuesta\s*:/i.test(t);
  t = t.replace(/^crear apuesta\s*:\s*/i, '');
  const partes = t.split(/\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
  return { bb: bb || partes.length > 1, patas: partes.length ? partes : [t] };
}

function boletoSVG({ cupo, cuota, selecciones, pick, partido }) {
  const sels = (selecciones && selecciones.length ? selecciones : [{ partido, pick, cuota }]).map((s) => ({ partido: s.partido || '', pick: s.pick || s.seleccion || '', cuota: s.cuota || '', hora: s.hora || '' }));
  const W = 900, PAD = 36;
  const bloques = sels.map((s) => ({ s, ...patas(s.pick) }));
  const H = 150 + bloques.reduce((a, b) => a + 120 + b.patas.length * 74, 0) + 150;
  const prod = sels.map((s) => Number(String(s.cuota).replace(',', '.'))).reduce((a, b) => a * b, 1);
  const total = cuota || (isFinite(prod) && prod > 1 ? prod : '');
  const hayBB = bloques.some((b) => b.bb);
  const F = 'font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"';
  let y = 150, o = '';
  o += `<rect width="${W}" height="${H}" fill="#12151d"/>`;
  o += `<text x="${PAD}" y="62" ${F} font-size="30" font-weight="800" fill="#f2b84b">MI BOLETO</text>`;
  o += `<text x="${PAD}" y="98" ${F} font-size="22" fill="#8e96ad">${esc((cupo ? cupo + ' · ' : '') + (hayBB ? 'Bet Builder' : sels.length > 1 ? 'Combinada' : 'Simple') + ' · PayWin')}</text>`;
  o += `<rect x="${PAD}" y="118" width="${W - 2 * PAD}" height="2" fill="#2a2f3d"/>`;
  for (const b of bloques) {
    o += `<text x="${PAD}" y="${y + 22}" ${F} font-size="24" fill="#8e96ad">${esc([b.s.hora, b.bb ? 'BB' : ''].filter(Boolean).join(' · '))}</text>`;
    o += `<text x="${PAD}" y="${y + 74}" ${F} font-size="34" font-weight="800" fill="#ffffff">${esc(corta(b.s.partido, 30))}</text>`;
    o += `<text x="${W - PAD}" y="${y + 74}" text-anchor="end" ${F} font-size="34" font-weight="800" fill="#f2b84b">${esc(fmt(b.s.cuota))}</text>`;
    y += 110;
    b.patas.forEach((p, i) => {
      o += `<circle cx="${PAD + 16}" cy="${y + 20}" r="11" fill="#ffd54a"/>`;
      if (i < b.patas.length - 1) o += `<rect x="${PAD + 14}" y="${y + 30}" width="4" height="60" fill="#ffd54a"/>`;
      o += `<text x="${PAD + 50}" y="${y + 46}" ${F} font-size="27" font-weight="700" fill="#ffffff">${esc(corta(p, 44))}</text>`;
      y += 74;
    });
    y += 10; o += `<rect x="${PAD}" y="${y}" width="${W - 2 * PAD}" height="2" fill="#2a2f3d"/>`; y += 30;
  }
  o += `<rect x="0" y="${H - 120}" width="${W}" height="120" fill="#f2b84b"/>`;
  o += `<text x="${PAD}" y="${H - 52}" ${F} font-size="28" font-weight="800" fill="#12151d">CUOTA TOTAL</text>`;
  o += `<text x="${W - PAD}" y="${H - 44}" text-anchor="end" ${F} font-size="58" font-weight="900" fill="#12151d">${esc(fmt(total))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o}</svg>`;
}

async function boletoPNG(x) {
  try {
    const sharp = require('sharp');
    return await sharp(Buffer.from(boletoSVG(x))).png().toBuffer();
  } catch (e) { console.error('Boleto PNG:', e.message); return null; }
}

module.exports = { boletoSVG, boletoPNG };
