// Seguro del número del CTA: TODO texto que sale del bot hacia un grupo/canal de WhatsApp pasa por aquí justo antes de
// mandarse, y cualquier celular ecuatoriano que traiga se cambia por el número ACTIVO de la hoja "WinNumeros".
// Así, aunque el panel tuviera un texto ya armado (o estuviera abierto en otro aparato con el número viejo), no sale el bloqueado.
let H = null;
let cache = { at: 0, activo: '', bloqueados: [] };
let ultimoAviso = 0;
const normal = (t) => String(t || '').replace(/\D/g, '').replace(/^593/, '0');
const valido = (n) => /^09\d{8}$/.test(n);

function montar(stakes) { H = stakes; }

async function leer() {
  if (Date.now() - cache.at < 3000) return cache;
  try {
    const filas = await H.leerHoja('WinNumeros');
    const act = filas.find((f) => String(f.estado) === 'activo' && valido(normal(f.numero)));
    cache = { at: Date.now(), activo: act ? normal(act.numero) : '', bloqueados: filas.filter((f) => String(f.estado) === 'bloqueado').map((f) => normal(f.numero)).filter(valido) };
  } catch (e) { /* se queda con el último conocido */ }
  return cache;
}

function corregirTelefono(t, vigente) {
  return String(t || '').replace(/(?:\+?593[\s-]?|0)9(?:[\s-]?\d){8}/g, (m) => (normal(m) === vigente ? m : vigente));
}

// Devuelve el texto con el número activo. Si no hay ninguno activo, no toca el texto pero avisa al jefe si lleva un número bloqueado.
async function alVigente(texto) {
  const c = await leer();
  if (c.activo) return corregirTelefono(texto, c.activo);
  const t = String(texto || '');
  const malo = c.bloqueados.find((b) => normal(t).includes(b));
  if (malo && Date.now() - ultimoAviso > 10 * 60 * 1000 && H) {
    ultimoAviso = Date.now();
    H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `⚠️ Mandé un texto con el número bloqueado ${malo} porque no hay NINGÚN número en uso. En el panel: Win → Números → "Usar este".` }).catch(() => {});
  }
  return t;
}

module.exports = { montar, alVigente, corregirTelefono, leer };
