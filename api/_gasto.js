// Registro del gasto de IA en el Google Sheet (hoja "GastoIA"): una fila por día y por función, con llamadas,
// tokens y un costo ESTIMADO. Nunca rompe lo que se estaba haciendo: si algo falla, solo se ignora.
// La hoja "GastoIA" hay que crearla a mano con estos encabezados en la fila 1:
//   dia | funcion | llamadas | tokens_entrada | tokens_salida | busquedas_web | costo_estimado
// Precios por millón de tokens (se pueden cambiar en Vercel con GASTO_PRECIO_ENTRADA y GASTO_PRECIO_SALIDA).
const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const HOJA = 'GastoIA';
const P_IN = Number(process.env.GASTO_PRECIO_ENTRADA) || 3;
const P_OUT = Number(process.env.GASTO_PRECIO_SALIDA) || 15;
const P_WEB = 0.01; // 10 USD por cada 1000 búsquedas web

async function guardar(funcion, usage) {
  const u = usage || {};
  const tin = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const tout = u.output_tokens || 0;
  const web = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
  const costo = (tin * P_IN + tout * P_OUT) / 1e6 + web * P_WEB;
  const dia = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // día en Ecuador
  let filas = [];
  const r = await fetch(`${SHEETS_API_URL}?sheet=${HOJA}`, { redirect: 'follow' });
  const j = await r.json().catch(() => ({}));
  filas = Array.isArray(j.data) ? j.data : [];
  const i = filas.findIndex((f) => String(f.dia).slice(0, 10) === dia && f.funcion === funcion);
  if (i >= 0) {
    const f = filas[i];
    filas[i] = { ...f, dia, funcion, llamadas: (Number(f.llamadas) || 0) + 1, tokens_entrada: (Number(f.tokens_entrada) || 0) + tin, tokens_salida: (Number(f.tokens_salida) || 0) + tout, busquedas_web: (Number(f.busquedas_web) || 0) + web, costo_estimado: Math.round(((Number(f.costo_estimado) || 0) + costo) * 10000) / 10000 };
  } else {
    filas.push({ dia, funcion, llamadas: 1, tokens_entrada: tin, tokens_salida: tout, busquedas_web: web, costo_estimado: Math.round(costo * 10000) / 10000 });
  }
  await fetch(SHEETS_API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ sheet: HOJA, data: filas }) });
}

// data = la respuesta completa de Anthropic (trae "usage"). Espera como máximo 4 s para que Vercel no corte el guardado.
async function anotarGasto(funcion, data) {
  try {
    if (!data || !data.usage) return;
    await Promise.race([guardar(funcion, data.usage), new Promise((ok) => setTimeout(ok, 4000))]);
  } catch (e) { console.error('No pude anotar el gasto de IA:', e.message); }
}
module.exports = { anotarGasto };
