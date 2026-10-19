// Endpoint de un solo uso para RE-cargar las 4 publicidades fijas del protocolo de la mañana
// en WinPlantillas, esta vez con el base64 recortado para que quepa en una celda de Google
// Sheets (límite ~50.000 caracteres). La primera carga se guardó con imágenes demasiado
// pesadas (160KB-500KB de base64) y la celda quedó truncada/corrupta -- por eso Win mandaba
// el texto pero nunca la imagen. Esta vez el base64 va recortado a ~48.000 caracteres.
//
// Se corre UNA VEZ abriendo esta URL en el navegador. Hace upsert por "nombre" -- no duplica
// si se corre más de una vez. Después de usarla se puede borrar.

const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const TEMPLATES_SHEET = 'WinPlantillas';

const seeds = require('./_seed-win-templates-data.json');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

module.exports = async function handler(req, res) {
  try {
    const getRes = await fetch(`${SHEETS_API_URL}?sheet=${TEMPLATES_SHEET}`);
    const getJson = await getRes.json();
    const rows = getJson.data || [];

    const norm = s => (s || '').toLowerCase().trim();
    const byName = new Map();
    rows.forEach(r => byName.set(norm(r.nombre), r));

    const resultado = [];
    for (const seed of seeds) {
      const key = norm(seed.nombre);
      const existing = byName.get(key);
      const row = {
        id: existing ? existing.id : uid(),
        nombre: seed.nombre,
        texto: seed.texto,
        base64: seed.base64,
        mediaType: 'image/jpeg',
        thumb: seed.thumbSrc || '',
        createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString()
      };
      byName.set(key, row);
      resultado.push(`${seed.nombre} (base64: ${seed.base64.length} caracteres)`);
    }

    const finalArr = Array.from(byName.values());

    await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ sheet: TEMPLATES_SHEET, data: finalArr })
    });

    res.status(200).json({ ok: true, procesadas: resultado, totalEnHoja: finalArr.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
