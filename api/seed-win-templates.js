// Endpoint de un solo uso para cargar las 4 publicidades fijas del protocolo de la mañana
// en la hoja WinPlantillas, con los nombres exactos que usa api/win-protocolo-manana.js.
//
// Se corre UNA VEZ abriendo esta URL en el navegador (no desde el entorno de Claude, que no
// tiene salida de red hacia script.google.com). Hace upsert por "nombre": si ya existe una
// plantilla con ese nombre la reemplaza, si no, la agrega -- se puede llamar más de una vez
// sin duplicar filas.
//
// Después de usarla, borra este archivo y api/_seed-win-templates-data.json del repo (ya no
// hace falta y no vale la pena dejar las imágenes en base64 dando vueltas en el código).

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
        thumb: seed.thumbSrc || '', // dataURL completo (con prefijo), así lo usa <img src="..."> en el panel
        createdAt: existing ? (existing.createdAt || new Date().toISOString()) : new Date().toISOString()
      };
      byName.set(key, row);
      resultado.push(seed.nombre + (existing ? ' (actualizada)' : ' (nueva)'));
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
