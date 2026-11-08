// Número de WhatsApp "activo" de la agencia: el que va en los textos (CTA), flyers y mensajes.
// Se cambia desde el panel (Win > Números) y vive en la hoja "WinNumeros" (una fila con estado "activo").
// Si la hoja no se puede leer o no tiene ninguno activo, se usa el de siempre.
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const NUMERO_POR_DEFECTO = '0987264212';

let cache = { at: 0, valor: NUMERO_POR_DEFECTO };
async function numeroVigente() {
  if (Date.now() - cache.at < 20000) return cache.valor;
  try {
    const r = await fetch(`${SHEETS_API_URL}?sheet=WinNumeros&_=${Date.now()}`);
    const j = await r.json();
    if (Array.isArray(j.data)) {
      const f = j.data.find((x) => String(x.estado) === 'activo' && /^09\d{8}$/.test(String(x.numero || '').replace(/\D/g, '').replace(/^593/, '0')));
      cache = { at: Date.now(), valor: f ? String(f.numero).replace(/\D/g, '').replace(/^593/, '0') : NUMERO_POR_DEFECTO };
    }
  } catch (e) { /* se queda con el último conocido */ }
  return cache.valor;
}

// Cambia cualquier otro celular ecuatoriano que aparezca en un texto por el número activo.
function corregirTelefono(t, vigente) {
  const v = vigente || NUMERO_POR_DEFECTO;
  return String(t || '').replace(/(?:\+?593[\s-]?|0)9(?:[\s-]?\d){8}/g, (m) => {
    const d = m.replace(/\D/g, '').replace(/^593/, '0');
    return d === v ? m : v;
  });
}

module.exports = { numeroVigente, corregirTelefono, NUMERO_POR_DEFECTO };
