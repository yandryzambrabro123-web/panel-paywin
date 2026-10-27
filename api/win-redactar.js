// Función serverless de Vercel: redacta el texto final que va a acompañar un mensaje para la
// comunidad (apuesta nueva, ganada, contenido/testimonio, regalito del día o partidos del día),
// y también las variantes de un mensaje de difusión masiva -- todo usando la API de Anthropic.
// Si llega una imagen (o varias), la "lee" (visión) para apoyarse en lo que muestra. El dueño
// siempre revisa el resultado en el panel antes de mandarlo (salvo las difusiones, que se
// mandan directo, por pedido explícito del dueño).
//
// Junta en un solo archivo lo que antes era win-redactar.js + win-redactar-difusion.js, porque
// el plan de Vercel que usa este proyecto tiene un límite de 12 funciones serverless por
// despliegue, y entre todos los endpoints de Win ya se había pasado ese límite -- los
// despliegues quedaban en "Error" sin avisar claro por qué. Body: { modo, ... }, donde modo es
// uno de:
//   (vacío o cualquier otro valor, por defecto) -- redacta UN texto, igual que antes:
//     { kind, destino, code, imageBase64?, mediaType?, images? }
//   "difusion" -- redacta VARIAS versiones distintas del mismo mensaje de difusión:
//     { instruccion, cantidad? } -> responde { variantes: [...] }
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) —
// nunca se expone en el index.html ni llega al navegador.

// Regla de brevedad que se repite en TODOS los prompts -- el dueño pidió explícitamente que los
// textos sean cortos, nada de párrafos largos para pegar en WhatsApp.
const BREVEDAD = ` Sé BREVE: máximo 2-3 líneas cortas en total (sin contar emojis), nunca un párrafo largo -- si algo no es esencial, no lo escribas.`;


// Formato visual para WhatsApp/Telegram: negritas con *asteriscos*, títulos en MAYÚSCULAS, emojis, líneas ordenadas.
const FORMATO = ` FORMATO (muy importante, el dueño quiere textos bonitos, ordenados e impactantes): usa negritas de WhatsApp con UN asterisco a cada lado (*así*), un título corto en MAYÚSCULAS con emojis, una línea separadora (━━━━━━━━━━━━) arriba y abajo del bloque principal, cada selección en su propia línea con su emoji del deporte (⚽ fútbol, 🎾 tenis, 🏀 baloncesto, 🥊 UFC, ⚾ béisbol, 🏒 hockey, 🏓 tenis de mesa, 🎮 e-sports) o con números 1️⃣ 2️⃣ 3️⃣, la cuota resaltada en negrita, y la CUOTA TOTAL en una línea propia con 💰. Deja una línea en blanco entre bloques. Cierra con UNA frase corta y motivadora. Máximo 12 líneas. Conserva EXACTAMENTE los datos que te dieron (partidos, selecciones, cuotas, código); no inventes nada ni cambies cuotas. Si hay un código de apuesta, ponlo en una línea con 🎟️ *Código:*. No uses markdown con almohadillas ni guiones largos de lista.`;

const PROMPTS = {
  nueva_apuesta: `Vas a redactar el texto para anunciar una apuesta/pick NUEVO a una comunidad de pronósticos deportivos llamada PayWin. Usa el código/texto que te dieron y, si hay una imagen, apóyate SOLO en lo que se ve con claridad (pick, cuota, stake) -- si la imagen no es clara o no muestra esos datos, no los inventes, quédate con lo que te dieron en texto. Tono: emocionante, directo y elegante, con varios emojis bien puestos, fácil de leer en WhatsApp.${FORMATO}`,
  ganada: `Vas a redactar el texto para anunciar una apuesta GANADA a una comunidad de pronósticos deportivos llamada PayWin. Si hay una imagen, apóyate SOLO en lo que se ve con claridad (pick, cuota, monto ganado) -- si no se ve claro, no lo inventes. Tono: celebración, con emojis de fuego/dinero, para generar confianza y ganas de unirse al VIP.${FORMATO} Para la ganada usa un título como ✅ *¡APUESTA GANADA!* 🔥 y resalta en negrita el pick, la cuota y el monto ganado SOLO si se ven claros.`,
  contenido: `Vas a redactar el texto para publicar algo en una comunidad de pronósticos deportivos llamada PayWin (puede ser un testimonio, un anuncio, un "buenos días", publicidad de recargas/retiros o del VIP, etc.). Usa la nota/instrucción que te dieron como la fuente principal de qué decir -- si hay una imagen, apóyate en ella SOLO como apoyo visual, nunca inventes datos que no se vean con claridad en ella ni le des más peso que a la nota/instrucción. Tono: cercano, profesional, con algún emoji si calza.${BREVEDAD}`,
  regalito: `Vas a redactar el texto para mandar el "regalito del día" — una apuesta de regalo/cortesía — a un cliente VIP de PayWin como agradecimiento por su recarga. Tono: cálido, de agradecimiento, con 1-2 emojis. Si hay una imagen, apóyate SOLO en lo que se ve con claridad (pick, cuota).${BREVEDAD}`,
  partidos_dia: `Vas a redactar el texto para presentar los "PARTIDOS DEL DÍA" a una comunidad de pronósticos deportivos llamada PayWin. Te van a llegar VARIAS imágenes, una por cada partido/pick del día (cada una puede mostrar equipos, cuota, hora). Mira todas las imágenes y escribe UN SOLO texto que las presente en conjunto como el resumen de partidos del día -- no describas cada imagen en detalle, es solo el texto que acompaña a las fotos (que se mandan por separado, antes que este texto). Tono: emocionante, directo, con 1-2 emojis de fútbol/fuego. No inventes datos (equipos, cuotas, horas) que no veas claros en las imágenes.${BREVEDAD}`,
  difusion_preview: `Vas a redactar el texto BASE de un aviso/promo que se va a mandar por difusión masiva de WhatsApp a una lista de clientes de PayWin (recargas/retiros y apuestas). Usa la nota/instrucción del dueño como la fuente principal de qué decir; si además llega una imagen (la promo/pick que va a mandar junto al mensaje), apóyate en ella SOLO como apoyo visual y nunca inventes datos que no se vean claros en ella. Tono: MUY asertivo, directo, con energía y seguridad -- como los textos que ya suben a la comunidad (persuasivo, que genere ganas de actuar ya), con 1-2 emojis. Esta es solo la versión base que el dueño va a revisar antes de mandar -- a partir de ella se generan variantes distintas para cada cliente, así que no hace falta que suene "para todos", solo que el mensaje y el tono queden bien.${BREVEDAD}`,
  collage: `Vas a redactar el texto para publicar un COLLAGE de varios comprobantes de recarga/pago de clientes (ya censurados, solo se ven los montos) en una comunidad de pronósticos deportivos llamada PayWin -- el mensaje de hoy es "mira cuántos clientes confiaron en nosotros hoy". No sabes los montos exactos ni cuántos son, así que no inventes números. Tono: celebración, confianza, orgullo, con 1-2 emojis (🙌🔥💵), para generar ganas de unirse. No menciones nombres ni datos de nadie.${BREVEDAD}`
};

function extractText(text) {
  return (text || '').trim().replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
}

function parseVariantes(text, cantidad) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const variantes = [];
  for (const line of lines) {
    const m = line.match(/^\d+[\.\)]\s*(.+)$/);
    if (m) variantes.push(m[1].trim());
  }
  if (variantes.length) return variantes.slice(0, cantidad);
  return text && text.trim() ? [text.trim()] : [];
}

async function llamarAnthropic(apiKey, { system, messages, max_tokens }) {
  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens, system, messages })
  });
  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error('Error de Anthropic:', apiRes.status, errText);
    return null;
  }
  const data = await apiRes.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  return textBlock ? textBlock.text : '';
}


// ---------- Pay: analista deportivo de la Fábrica de apuestas ----------
// modo "pay": { modo:'pay', cupo, cuotaMin, cuotaMax, cantidad, instruccion? } -> { sugerencias:[...], fuente }
// Con ODDS_API_KEY (the-odds-api.com) usa cuotas reales; sin ella, busca los próximos partidos en la web.
// Deportes y ligas por prioridad (se usan las que estén activas hoy en The Odds API, hasta ODDS_MAX_LIGAS).
// Se puede fijar una lista propia con la variable ODDS_SPORTS en Vercel (separada por comas).
const PAY_PRIORIDAD = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_uefa_champs_league', 'basketball_nba', 'soccer_italy_serie_a', 'soccer_germany_bundesliga', 'soccer_france_ligue_one', 'soccer_uefa_europa_league', 'soccer_conmebol_copa_libertadores', 'soccer_brazil_campeonato', 'soccer_argentina_primera_division', 'soccer_mexico_ligamx', 'soccer_usa_mls', 'tennis_atp', 'tennis_wta', 'mma_mixed_martial_arts', 'basketball_euroleague', 'icehockey_nhl', 'baseball_mlb', 'americanfootball_nfl', 'soccer_netherlands_eredivisie', 'soccer_portugal_primeira_liga', 'soccer_turkey_super_league', 'soccer_efl_champ', 'soccer_colombia_primera_a', 'soccer_chile_campeonato'];
const PAY_MAX_LIGAS = Number(process.env.ODDS_MAX_LIGAS) || 16;

// Caché de 3 horas: cada consulta gasta créditos del plan (500 al mes en el gratis).
let cacheCuotas = { t: 0, datos: null };
const cachePorFecha = {}; // cuotas por día elegido (YYYY-MM-DD, hora de Ecuador)
// Líneas de jugadores (remates, tiros al arco, asistencias, rebotes, triples, puntos). Gastan MUCHOS créditos
// (mercados x partidos), así que solo se piden si en Vercel pones ODDS_PROPS=1 (plan de pago recomendado).
async function lineasJugadores(key, eventos, limiteMs) {
  const filas = [];
  const maxPartidos = Number(process.env.ODDS_PROPS_MAX) || 5;
  const config = [
    { prefijo: 'basketball_nba', regiones: 'us', mercados: 'player_points,player_rebounds,player_assists,player_threes' },
    { prefijo: 'soccer_', regiones: 'eu,us', mercados: 'player_shots_on_target,player_shots,player_assists' }
  ];
  for (const c of config) {
    const lista = eventos.filter((e) => e.liga.startsWith(c.prefijo) && Date.parse(e.inicio) > Date.now() && Date.parse(e.inicio) <= limiteMs).slice(0, maxPartidos);
    for (const e of lista) {
      try {
        const r = await fetch(`https://api.the-odds-api.com/v4/sports/${e.liga}/events/${e.id}/odds?apiKey=${key}&regions=${c.regiones}&markets=${c.mercados}&oddsFormat=decimal`);
        if (!r.ok) continue;
        const d = await r.json();
        const mk = {};
        for (const b of d.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
          const k = `${m.key.replace('player_', '')} ${o.description || ''} ${o.name}${o.point != null ? ' ' + o.point : ''}`;
          (mk[k] = mk[k] || []).push(o.price);
        }
        const lineas = Object.entries(mk).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).filter(([, p]) => p >= 1.15 && p <= 1.9).slice(0, 40).map(([k, p]) => `${k}: ${p.toFixed(2)}`);
        if (lineas.length) filas.push(`JUGADORES ${e.liga} | ${e.casa} vs ${e.fuera} | ${e.inicio} | ${lineas.join(' ; ')}`);
      } catch (err) { /* sin líneas de ese partido */ }
    }
  }
  return filas;
}

async function cuotasReales(fecha) {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? String(fecha) : '';
  if (fechaOk) { const c = cachePorFecha[fechaOk]; if (c && Date.now() - c.t < 4 * 3600 * 1000) return c.datos; }
  else if (cacheCuotas.datos && Date.now() - cacheCuotas.t < 4 * 3600 * 1000) return cacheCuotas.datos;
  // Lista de deportes activos hoy (esta consulta no gasta créditos)
  let ligas = [];
  if (process.env.ODDS_SPORTS) ligas = process.env.ODDS_SPORTS.split(',').map((x) => x.trim()).filter(Boolean);
  else {
    try {
      const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`);
      const activos = r.ok ? (await r.json()).filter((x) => x.active && !x.has_outrights).map((x) => x.key) : [];
      const orden = [];
      for (const p of PAY_PRIORIDAD) for (const k of activos) if ((k === p || k.startsWith(p + '_')) && !orden.includes(k)) orden.push(k);
      // Reparto por deporte (fútbol, básquet, tenis, UFC, béisbol, hockey, NFL): una liga de cada deporte por vuelta, para que no se llene todo de fútbol
      const grupos = {};
      for (const k of orden) (grupos[k.split('_')[0]] = grupos[k.split('_')[0]] || []).push(k);
      const cola = Object.values(grupos);
      while (cola.some((g) => g.length)) for (const g of cola) if (g.length) ligas.push(g.shift());
    } catch (e) { /* sin lista: se usan las principales */ }
    if (!ligas.length) ligas = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_uefa_champs_league', 'basketball_nba'];
  }
  ligas = ligas.slice(0, PAY_MAX_LIGAS);
  // Con fecha elegida: solo los partidos de ese día (hora de Ecuador) que no han empezado; sin fecha: próximas 40 horas
  const desde = fechaOk ? Math.max(Date.now(), Date.parse(fechaOk + 'T00:00:00-05:00')) : 0;
  const limite = fechaOk ? Date.parse(fechaOk + 'T23:59:59-05:00') : Date.now() + 40 * 3600 * 1000;
  const eventos = [];
  const evs = [];
  for (const liga of ligas) {
    try {
      const basicos = /^(soccer|basketball|icehockey|americanfootball|baseball)_/.test(liga) ? 'h2h,totals' : 'h2h';
      // Fútbol: además ambos marcan y doble oportunidad; básquet/hockey/NFL/béisbol: hándicap. Si esa liga no los trae, se pide lo básico.
      const mercados = liga.startsWith('soccer_') ? 'h2h,totals,btts,double_chance' : /^(basketball|icehockey|americanfootball|baseball)_/.test(liga) ? 'h2h,totals,spreads' : basicos;
      let r = await fetch(`https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${key}&regions=eu&markets=${mercados}&oddsFormat=decimal`);
      if (!r.ok && mercados !== basicos) r = await fetch(`https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${key}&regions=eu&markets=${basicos}&oddsFormat=decimal`);
      if (!r.ok) continue;
      const lista = await r.json();
      let porLiga = 0;
      for (const e of lista) {
        if (Date.parse(e.commence_time) > limite || Date.parse(e.commence_time) < desde) continue;
        const mk = {};
        for (const b of e.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
          const k = `${m.key}|${o.name}${o.point != null ? ' ' + o.point : ''}`;
          (mk[k] = mk[k] || []).push(o.price);
        }
        const resumen = Object.entries(mk).map(([k, v]) => `${k}: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`);
        if (++porLiga > 12) continue;
        eventos.push(`${liga} | ${e.home_team} vs ${e.away_team} | ${e.commence_time} | ${resumen.join(' ; ')}`);
        evs.push({ liga, id: e.id, casa: e.home_team, fuera: e.away_team, inicio: e.commence_time });
      }
    } catch (e) { /* esa liga no respondió: se sigue con las demás */ }
  }
  let extra = [];
  if (process.env.ODDS_PROPS === '1') { try { extra = await lineasJugadores(key, evs, limite); } catch (e) { extra = []; } }
  const resultado = [...eventos.slice(0, 220), ...extra];
  if (fechaOk) cachePorFecha[fechaOk] = { t: Date.now(), datos: resultado }; else cacheCuotas = { t: Date.now(), datos: resultado };
  return resultado;
}

// Llama a Anthropic (con búsqueda web opcional) y sigue si el turno se pausa; respeta un tiempo máximo.
async function llamarPay(apiKey, payload, maxMs) {
  const inicio = Date.now();
  const base = payload.messages;
  let texto = '', stop = '';
  for (let i = 0; i < 4; i++) {
    if (i > 0 && Date.now() - inicio > (maxMs || 35000)) break;
    let r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, thinking: { type: 'disabled' } })
    });
    if (r.status === 400) { // por si ese modelo no acepta apagar el "pensar largo": se manda sin eso
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(payload)
      });
    }
    if (!r.ok) { const t = await r.text(); console.error('Pay IA:', r.status, t.slice(0, 400)); return { ok: false, status: r.status, detalle: t.slice(0, 200) }; }
    const data = await r.json();
    stop = data.stop_reason || '';
    texto += '\n' + (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (stop !== 'pause_turn') break;
    payload = { ...payload, messages: [...base, { role: 'assistant', content: data.content }] };
  }
  return { ok: true, texto: texto.trim(), stop };
}

// Pay aprende de capturas de apuestas GANADAS del jefe: lee cada línea (deporte, partido, selección, cuota).
async function modoPayAprender(apiKey, body, res) {
  if (!body.imageBase64) { res.status(400).json({ error: 'Falta la imagen.' }); return; }
  const system = `Lees capturas de apuestas deportivas GANADAS de una casa de apuestas (simples o combinadas). Extrae cada línea/selección de la apuesta. Responde SOLO con un JSON (sin texto extra) con esta forma:
{"tipo":"simple|combinada","cuotaTotal":numero_o_null,"lineas":[{"deporte":"futbol|baloncesto|tenis|tenis de mesa|mma|esports|otro","partido":"Local vs Visitante","mercado":"ej. ganador, total de goles, remates de jugador, asistencias, triples, corners, tarjetas, handicap","pick":"la selección tal cual (ej. Más de 2.5 goles, Gana Sevilla, Haaland más de 2.5 remates)","cuota":numero_o_null}]}
No inventes nada que no se lea; si un dato no se ve, pon null o "". Si no es una apuesta, responde {"tipo":"","lineas":[]}.`;
  const payload = { model: 'claude-sonnet-5', max_tokens: 1500, system, messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: body.mediaType || 'image/jpeg', data: body.imageBase64 } },
    { type: 'text', text: 'Lee esta apuesta ganada.' }
  ] }] };
  const ia = await llamarPay(apiKey, payload, 40000);
  if (!ia.ok) { res.status(502).json({ error: `No pude leer la captura (IA ${ia.status}).` }); return; }
  const t = ia.texto, i = t.indexOf('{'), j = t.lastIndexOf('}');
  let data = null;
  try { data = JSON.parse(t.slice(i, j + 1)); } catch (e) { data = null; }
  if (!data || !Array.isArray(data.lineas)) { res.status(502).json({ error: 'No pude entender esa captura.' }); return; }
  data.lineas = data.lineas.filter((l) => l && l.pick).slice(0, 12);
  res.status(200).json(data);
}

// Pay verifica resultados de apuestas pendientes buscando en la web. Nunca marca nada: solo opina; el jefe confirma.
async function modoPayResultados(apiKey, body, res) {
  const apuestas = (Array.isArray(body.apuestas) ? body.apuestas : []).slice(0, 6);
  if (!apuestas.length) { res.status(400).json({ error: 'No hay apuestas.' }); return; }
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const system = `Eres Pay, el analista de PayWin, y verificas el RESULTADO de apuestas deportivas ya jugadas. Hoy es ${hoy} (hora de Ecuador). Para cada apuesta busca en la web el resultado final real de cada línea (marcadores, estadísticas finales de jugadores, corners, etc.).
Reglas: una apuesta combinada es "ganada" solo si TODAS sus líneas ganaron; es "perdida" si AL MENOS UNA línea perdió (aunque otras estén pendientes); es "pendiente" si algún partido aún no termina y ninguna línea ya perdió; es "no_confirmo" si no encuentras un dato claro y confiable de alguna línea (por ejemplo estadística de un jugador). NUNCA adivines ni supongas: si no puedes confirmar con una fuente clara, usa "no_confirmo".
Responde SOLO con un arreglo JSON dentro de <json></json>: [{"id":"el id que te di","estado":"ganada|perdida|pendiente|no_confirmo","detalle":"máximo 2 frases con los marcadores o datos que viste"}]`;
  const lista = apuestas.map((a) => `ID ${a.id} | ${a.tag || ''} | ${a.date || ''} | ${a.event || ''} | ${a.pick || ''} @${a.odds || ''}${(a.lines || []).length ? ' | líneas: ' + a.lines.map((l) => `${l.pick || ''} @${l.odds || ''}`).join(' + ') : ''}`).join('\n');
  const payload = { model: 'claude-sonnet-5', max_tokens: 3000, system, messages: [{ role: 'user', content: 'Verifica estas apuestas:\n' + lista }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }] };
  const ia = await llamarPay(apiKey, payload, 45000);
  if (!ia.ok) { res.status(502).json({ error: `Pay no pudo verificar (IA ${ia.status}).` }); return; }
  let resultados = [];
  const tag = ia.texto.match(/<json>([\s\S]*?)<\/json>/i);
  try { resultados = JSON.parse(tag ? tag[1] : ia.texto.slice(ia.texto.indexOf('['), ia.texto.lastIndexOf(']') + 1)); } catch (e) { resultados = []; }
  resultados = (Array.isArray(resultados) ? resultados : []).filter((r) => r && r.id && ['ganada', 'perdida', 'pendiente', 'no_confirmo'].includes(r.estado)).map((r) => ({ id: String(r.id), estado: r.estado, detalle: String(r.detalle || '').slice(0, 300) }));
  res.status(200).json({ resultados });
}

async function modoPayChat(apiKey, body, res) {
  const mensajes = (Array.isArray(body.mensajes) ? body.mensajes : []).slice(-14).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) })).filter((m) => m.content);
  if (!mensajes.length || mensajes[0].role !== 'user') { res.status(400).json({ error: 'Falta el mensaje.' }); return; }
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  let datos = null;
  try { datos = await cuotasReales(); } catch (e) { datos = null; }
  const contexto = String(body.contexto || '').slice(0, 4000) + (body.resumen ? '\nEstadística real del jefe: ' + String(body.resumen).slice(0, 300) : '');
  const system = `Eres Pay, el analista deportivo de PayWin (agencia de pronósticos de Ecuador). Eres hombre. Hablas con el dueño ("jefe") por voz, en vivo, así que respondes en español natural, directo y seguro, en 3 a 6 frases cortas, sin listas ni markdown ni emojis. Hoy es ${hoy} (hora de Ecuador).
Tu trabajo: explicar tus picks con una hipótesis clara (por qué crees que pasa: forma, historial, bajas, ritmo del partido, estadísticas de la línea), decir también qué podría salir mal y cuándo NO apostarías, y responder lo que te pregunte sobre partidos, mercados (goles, corners, tarjetas, remates, puntos, rebotes, asistencias, tenis, tenis de mesa, UFC, e-sports) y cómo bajar el riesgo. Ayudas a armar combinadas de selecciones de cuota baja (1.15 a 1.50 cada una).
${PAY_PERFIL}
${PAY_CONOCIMIENTO}
Honestidad: nunca prometas ganancia segura; no inventes partidos, estadísticas ni cuotas. Si no tienes el dato, dilo o búscalo. Las cuotas son aproximadas y el jefe las verifica en su casa de apuestas. Él también analiza cada pick.
${contexto ? '\nPicks que tienes ahora mismo en pantalla:\n' + contexto : ''}${datos && datos.length ? '\n\nCuotas promedio actuales (liga | partido | inicio UTC | mercado: cuota):\n' + datos.join('\n') : ''}`;
  // Por defecto responde rápido con lo que sabe y con las cuotas reales; busca en la web solo si el jefe lo pide ("busca...").
  const pideWeb = /\b(busca|buscar|búscame|investiga|internet|web)\b/i.test(mensajes[mensajes.length - 1].content);
  const payload = { model: 'claude-sonnet-5', max_tokens: 2500, system, messages: mensajes };
  if (pideWeb) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  let r = await llamarPay(apiKey, payload, 40000);
  if (r.ok && !r.texto && payload.tools) { delete payload.tools; r = await llamarPay(apiKey, payload, 20000); } // reintento sin web
  if (!r.ok) { res.status(502).json({ error: `Pay no pudo responder (IA ${r.status}). ${r.detalle || ''}` }); return; }
  res.status(200).json({ respuesta: r.texto || 'Pay no devolvió respuesta (fin: ' + (r.stop || '-') + '). Intenta de nuevo.' });
}

// Lo que Pay ya sabe de las apuestas GANADAS del jefe (capturas del 20 al 24 de octubre, casa Mas1x2).
// Sirve de base: lo que el jefe suba con "Enseñarle a Pay" se suma a esto.
const PAY_PERFIL = `Perfil del jefe (aprendido de sus apuestas ganadas): apuesta en la casa Mas1x2. Casi siempre combinadas de 2 a 3 líneas con cuota total de 1.50 a 2.15, y cada línea entre 1.20 y 1.47. Mercados que le han ganado: triples de jugadores NBA "más de 1.5 triples" (cuotas 1.20 a 1.47), tiros de esquina totales (más de 5.5, 7.5 y 9.5), remates totales de un equipo (más de 14.5), ambos equipos marcan "Sí", más de 1.5 goles, más de 2.5 goles, doble oportunidad (empate o el favorito) y favoritos grandes 1x2 (cuota 1.22 a 1.26). También usa "crear apuesta" (ambos marcan + total de goles o de corners en el mismo partido). Arma líneas de ligas grandes (Champions, Premier, Bundesliga, Eredivisie, Liga Saudí, NBA). Prefiere líneas con mucho margen y cuotas bajas.
IMPORTANTE: esto es solo una REFERENCIA de lo que le ha funcionado, NO un límite ni una plantilla. El jefe se deja guiar por ti: usa todo tu conocimiento deportivo y estadístico y propón la mejor opción que veas (más segura o con mejor valor), aunque sea de un mercado, liga o deporte distinto a lo que él suele apostar, y en el análisis di claramente por qué es mejor. Varía los mercados; no copies sus apuestas anteriores.`;
// Base de conocimiento de estrategia (criterio general de apuestas de bajo riesgo; no son datos en vivo).
const PAY_CONOCIMIENTO = `ESTRATEGIA Y CONOCIMIENTO BASE (úsalo como criterio, siempre contrastado con las cuotas reales que te doy):
- BET BUILDER = "Crear apuesta" en la casa del jefe (Mas1x2): varios mercados del MISMO partido en una sola selección (ej. "Ambos equipos marcan Sí + más de 2.5 goles", "Gana el favorito + más de 1.5 goles", "Más de 8.5 corners + más de 2.5 goles", "Jugador más de 1.5 triples + su equipo gana"). Las líneas se correlacionan, así que la cuota real es MENOR que multiplicar las cuotas sueltas (aprox. 10 a 25% menos); la casa da la cuota exacta al armarla. Ponlo como UNA sola selección con el pick empezando con "Crear apuesta:" y marca la cuota como aproximada. Úsalo cuando los mercados se refuerzan entre sí (partido abierto, dos ataques fuertes y defensas flojas; favorito claro que además anota; partido con ritmo alto) y NUNCA mezcles mercados que se contradicen (favorito gana + pocos goles en un duelo parejo). Cada selección Bet Builder debe seguir el rango de cuota del nivel del cupo.
- Cuotas de 1.12 a 1.30 equivalen a 77-89% de probabilidad implícita: solo vale la pena si el análisis dice que la probabilidad real es MAYOR a la implícita; no apiles muchas líneas bajas sin análisis, porque la cuota total baja y el margen de la casa se acumula.
- Líneas de bajo riesgo que suelen tener margen: más de 0.5 y 1.5 goles (ligas ofensivas), doble oportunidad al favorito jugando en casa, "gana al menos 1 set" para el favorito del tenis, totales de corners y remates por debajo de la media del equipo, triples/puntos de jugador por debajo de su promedio reciente con minutos seguros, hándicaps asiáticos +1.5 al favorito.
- Líneas que suelen fallar: ganador a secas de partidos parejos, "ambos marcan" en equipos defensivos, props de jugadores con minutos inciertos (rotaciones, back-to-back, lesionados), tenis en superficie o con jugador recién vuelto de lesión, ligas menores con poca información, partidos de copa con rotaciones.
- Riesgo de correlación en combinadas: no pongas dos líneas que dependan del mismo hecho (ej. gana A y más de 1.5 goles de A en el mismo partido por separado; usa Bet Builder).
- Antes de proponer algo, pregúntate: ¿qué tiene que pasar para que pierda? Si es algo común (un gol tardío, una rotación), descártalo.
- Gestión: el jefe dice que pierde más de lo que gana. Prioriza consistencia sobre cuota alta: 2 a 3 líneas sólidas valen más que 5 justas. Sé honesto con la confianza.`;
const PAY_SEMILLA = [
  'baloncesto CHI Bulls vs WAS Wizards: Trae Young más de 1.5 triples @1.20 (triples de jugador)',
  'baloncesto CLE Cavaliers vs BKN Nets: Donovan Mitchell más de 1.5 triples @1.29 (triples de jugador)',
  'baloncesto PHI 76ers vs MIL Bucks: Tyrese Maxey más de 1.5 triples @1.23 (triples de jugador)',
  'baloncesto SA Spurs vs HOU Rockets: Julian Champagnie más de 1.5 triples @1.47 (triples de jugador)',
  'baloncesto LA Lakers vs LA Clippers: Rui Hachimura más de 1.5 triples @1.45 (triples de jugador)',
  'futbol Atlante FC vs Atlético San Luis: Atlante más de 14.5 remates totales @1.63 (remates de equipo)',
  'futbol Al Qadisiyah vs Al Hilal: Ambos equipos marcan Sí + más de 2.5 goles @1.64 (crear apuesta)',
  'futbol FC Eindhoven vs PSV Eindhoven: Ambos equipos marcan Sí @1.40',
  'futbol Ipswich vs Nottingham Forest: Empate o Nottingham Forest @1.33 (doble oportunidad)',
  'futbol Hoffenheim vs Olympique Lyon: más de 9.5 tiros de esquina @1.66 (corners)',
  'futbol Bournemouth vs AC Milan: más de 1.5 goles @1.22',
  'futbol AC Omonia vs SL Benfica: más de 7.5 tiros de esquina @1.25 (corners)',
  'futbol OFI vs Bayer Leverkusen: gana Bayer Leverkusen @1.22 (1x2)',
  'futbol Real Madrid vs RB Leipzig: gana Real Madrid @1.26 (1x2)',
  'futbol Bayern Munich vs Arsenal: Bayern o empate @1.42 (doble oportunidad)',
  'futbol Lille vs Galatasaray: más de 1.5 goles @1.20',
  'futbol Lille vs Galatasaray: Ambos equipos marcan Sí @1.55',
  'futbol Inter Milan vs Shakhtar Donetsk: gana Inter @1.26 (1x2)',
  'futbol VfB Stuttgart vs Atlético de Madrid: Ambos marcan Sí + más de 5.5 tiros de esquina @1.53 (crear apuesta)'
];

// Nivel de seguridad por cupo (qué tan conservadora debe ser la combinada)
function nivelPay(cupo) {
  const c = String(cupo || '').toLowerCase();
  if (/stake/.test(c) || /regalito/.test(c)) return `NIVEL MÁXIMA SEGURIDAD (${cupo}): es lo más conservador de todo. Solo selecciones de cuota 1.10 a 1.40 (favoritos dominantes, doble oportunidad, líneas de goles/puntos con mucho margen) en ligas grandes con información sólida. Nada de mercados frágiles (jugadores, tarjetas, corners, tenis de bajo nivel, e-sports), ni partidos parejos, ni equipos con bajas importantes o que rotan. Usa las líneas necesarias para llegar al rango, pero cada una debe ser casi segura. Si no estás convencido de una línea, no la pongas.`;
  if (/vip/.test(c)) return `NIVEL CONSERVADOR (${cupo}): selecciones de cuota 1.15 a 1.45, favoritos claros o líneas con buen margen. Evita mercados frágiles. Un poco más flexible que el stake de pago, pero siempre prudente.`;
  return `NIVEL MODERADO (${cupo}): selecciones de cuota 1.20 a 1.60, buena información y valor; puedes usar más variedad de mercados. No tiene que ser ultra segura.`;
}

// Analiza UN partido que el jefe elige (foto de las cuotas/mercados de su casa y/o texto) y propone sus mejores líneas.
async function modoPayPartido(apiKey, body, res) {
  const imgs = (Array.isArray(body.imagenes) ? body.imagenes : []).filter((i) => i && i.base64).slice(0, 3);
  const nota = String(body.nota || '').slice(0, 400);
  if (!imgs.length && !nota) { res.status(400).json({ error: 'Sube una foto del partido o escribe cuál es.' }); return; }
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const cupo = String(body.cupo || 'apuesta').slice(0, 40);
  const evitar = (Array.isArray(body.evitar) ? body.evitar : []).slice(0, 60).map((x) => String(x).slice(0, 120)).join(' ; ');
  const descartadas = (Array.isArray(body.descartadas) ? body.descartadas : []).slice(0, 40).map((x) => String(x).slice(0, 120)).join(' ; ');
  const system = `Eres Pay, el analista deportivo de PayWin (Ecuador). Hoy es ${hoy} (hora de Ecuador). El jefe te da UN partido concreto (foto de la pantalla de su casa de apuestas Mas1x2 con mercados y cuotas, y/o texto) y quiere saber qué se puede sacar de ahí con el menor riesgo.
${PAY_CONOCIMIENTO}
${nivelPay(cupo)}
Trabajo:
1) Identifica el partido, la competición, el día y la hora si se ven. Si en la foto hay mercados con cuotas, esas son las cuotas REALES de su casa: úsalas tal cual (no las cambies). Lo que no esté en la foto, estímalo y márcalo "aprox".
2) Analiza el partido con lo que veas y lo que busques en la web (forma reciente, bajas, historial, ritmo, estilo, estadísticas de la línea). No inventes datos: si no encuentras algo, dilo.
3) Propón de 3 a 5 OPCIONES, de la más conservadora a la más atrevida. Cada opción es UNA selección del partido o una selección Bet Builder ("Crear apuesta:" con 2 mercados que se refuerzan). No mezcles dos selecciones sueltas del mismo partido como si fueran combinada. Incluye mercados variados (goles, corners, tarjetas, remates, doble oportunidad, sets/juegos, puntos, jugadores) solo si hay base.
4) Sé honesto: si el partido es parejo o con poca información, dilo y baja la confianza; si no recomiendas apostar nada, devuelve las opciones con confianza "baja" y explícalo en el análisis. Nunca prometas ganancia segura.
${evitar ? 'Líneas ya usadas hoy (no las repitas): ' + evitar + '.' : ''} ${descartadas ? 'Líneas que el jefe descartó porque no le gustan: ' + descartadas + '.' : ''}
Responde SOLO con un arreglo JSON dentro de <json></json>, de objetos con: partido ("Local vs Visitante"), liga, hora (hora de Ecuador o ""), pick (la selección clara), cuota (número), confianza ("baja","media" o "alta"), analisis (máximo 3 frases: por qué sí y qué podría salir mal), selecciones (arreglo con UN objeto {partido, pick, cuota, hora}).`;
  const content = [];
  imgs.forEach((i) => content.push({ type: 'image', source: { type: 'base64', media_type: i.mediaType || 'image/jpeg', data: i.base64 } }));
  content.push({ type: 'text', text: nota ? 'Partido / lo que busco: ' + nota : 'Analiza el partido que aparece en la imagen.' });
  const payload = { model: 'claude-sonnet-5', max_tokens: 5000, system, messages: [{ role: 'user', content }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] };
  let ia = await llamarPay(apiKey, payload, 38000);
  if (ia.ok && !ia.texto) { delete payload.tools; ia = await llamarPay(apiKey, payload, 20000); } // reintento sin web
  if (!ia.ok) { res.status(502).json({ error: `Pay no pudo analizar ese partido (IA ${ia.status}).` }); return; }
  const t = ia.texto;
  const cand = [];
  const tag = t.match(/<json>([\s\S]*?)<\/json>/i); if (tag) cand.push(tag[1]);
  if (t.indexOf('[') >= 0 && t.lastIndexOf(']') > t.indexOf('[')) cand.push(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
  let lista = [];
  for (const c of cand) { try { const j = JSON.parse(c.trim()); if (Array.isArray(j)) { lista = j; break; } } catch (e) { /* siguiente */ } }
  lista = lista.filter((x) => x && x.pick).slice(0, 5);
  if (!lista.length) { res.status(502).json({ error: 'Pay no sacó opciones claras de ese partido. Lo que dijo: ' + (t.replace(/\s+/g, ' ').trim().slice(0, 240) || '(sin respuesta)') }); return; }
  res.status(200).json({ sugerencias: lista, fuente: 'tu foto del partido' });
}

// Bajar el riesgo de UNA línea: misma selección/partido pero más segura (cuota menor).
async function modoPayBajar(apiKey, body, res) {
  const l = body.linea || {};
  const partido = String(l.partido || '').slice(0, 120), pick = String(l.pick || '').slice(0, 160), cuota = Number(String(l.cuota || '').replace(',', '.')) || 0;
  if (!pick) { res.status(400).json({ error: 'Falta la línea.' }); return; }
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  let datos = null;
  try { datos = await cuotasReales(); } catch (e) { datos = null; }
  const palabras = (partido + ' ' + pick).toLowerCase().split(/[^a-záéíóúñ]+/).filter((w) => w.length > 3);
  const delPartido = (datos || []).filter((x) => { const t = x.toLowerCase(); return palabras.filter((w) => t.includes(w)).length >= 2; }).slice(0, 6);
  const evitar = (Array.isArray(body.evitar) ? body.evitar : []).slice(0, 40).join(' ; ').slice(0, 2500);
  const system = `Eres Pay, el analista deportivo de PayWin. Hoy es ${hoy} (hora de Ecuador). El jefe tiene esta línea: "${pick}" en ${partido || 'un partido de hoy'}, cuota ${cuota || '?'}. Quiere BAJARLE EL RIESGO a esa misma línea: darle 3 alternativas del MISMO partido/jugador (o muy relacionadas) que sean más fáciles de que salgan, con cuota MENOR que ${cuota || 'la actual'} (ideal entre 1.12 y 1.40), ordenadas de menos a más conservadora. Ejemplos: en tenis, "gana el partido" -> "gana al menos 1 set" o "más de X juegos del jugador"; en fútbol, "gana el equipo" -> "doble oportunidad" o "más de 0.5 goles del equipo"; en NBA, "más de 3.5 triples" -> "más de 1.5 triples" o puntos más bajos; en totales, una línea más baja.
${PAY_CONOCIMIENTO}
Honestidad: usa las cuotas reales que te doy cuando existan; si una alternativa no está en los datos, pon tu cuota estimada y márcala con "aprox". No inventes que es seguro. ${evitar ? 'NO repitas estas líneas ya usadas hoy: ' + evitar + '.' : ''}
${delPartido.length ? 'Cuotas promedio de ese partido (liga | partido | inicio UTC | mercado: cuota):\n' + delPartido.join('\n') : 'No tengo cuotas reales de ese partido; estima con tu conocimiento y márcalas "aprox".'}
Responde SOLO con un arreglo JSON: [{"pick":"texto claro de la línea","cuota":1.20,"nota":"por qué es más segura, 1 frase","aprox":true|false}]`;
  const r = await llamarPay(apiKey, { model: 'claude-sonnet-5', max_tokens: 1500, system, messages: [{ role: 'user', content: 'Dame las 3 alternativas más seguras.' }] }, 30000);
  if (!r.ok) { res.status(502).json({ error: `Pay no pudo responder (IA ${r.status}).` }); return; }
  let lista = [];
  try { lista = JSON.parse(r.texto.slice(r.texto.indexOf('['), r.texto.lastIndexOf(']') + 1)); } catch (e) { lista = []; }
  lista = (Array.isArray(lista) ? lista : []).filter((a) => a && a.pick && Number(a.cuota) > 1).slice(0, 4).map((a) => ({ partido, hora: l.hora || '', pick: String(a.pick).slice(0, 160), cuota: Number(a.cuota).toFixed(2), nota: String(a.nota || '').slice(0, 200), aprox: !!a.aprox }));
  if (!lista.length) { res.status(200).json({ alternativas: [], aviso: 'Pay no encontró alternativas más seguras. Intenta de nuevo.' }); return; }
  res.status(200).json({ alternativas: lista });
}

const descartadas0 = (b) => (Array.isArray(b.descartadas) ? b.descartadas : []).slice(0, 60).map((x) => String(x).slice(0, 120)).join(' ; ');
async function modoPay(apiKey, body, res) {
  const cuotaMin = Number(body.cuotaMin) || 1.8, cuotaMax = Number(body.cuotaMax) || 2;
  const lote = Array.isArray(body.cupos) && body.cupos.length ? body.cupos.slice(0, 6) : null; // revisión automática: una combinada por cupo
  const cantidad = lote ? lote.length : Math.max(1, Math.min(5, Number(body.cantidad) || 3));
  const cupo = String(body.cupo || 'apuesta').slice(0, 40);
  const hoyReal = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const maxFecha = new Date(Date.now() - 5 * 3600e3 + 6 * 86400e3).toISOString().slice(0, 10);
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || '')) && body.fecha >= hoyReal && body.fecha <= maxFecha ? String(body.fecha) : hoyReal;
  const esOtroDia = hoy !== hoyReal;
  let datos = null;
  try { datos = await cuotasReales(esOtroDia ? hoy : ''); } catch (e) { datos = null; }
  // Solo partidos de HOY (fecha de Ecuador) que todavía no han empezado
  const ahoraMs = Date.now();
  const finDiaMs = Date.parse(hoy + 'T23:59:59-05:00');
  if (datos) datos = datos.filter((l) => { const t = Date.parse((l.split(' | ')[2] || '')); return t > ahoraMs && t <= finDiaMs; });
  const conDatos = datos && datos.length;
  if (datos && !datos.length && process.env.ODDS_API_KEY) {
    if (lote) { res.status(200).json({ sugerencias: [], fuente: 'sin partidos de hoy', razon: 'No quedan partidos de hoy por empezar en las ligas activas.' }); return; }
    res.status(502).json({ error: esOtroDia ? `No encontré partidos del ${hoy} en las ligas que reviso (a veces las casas todavía no los publican). Prueba otra fecha o activa la búsqueda en la web.` : 'Ya no quedan partidos de hoy por empezar en las ligas que reviso. Prueba con la fecha de mañana.' });
    return;
  }
  const historial = [...(Array.isArray(body.historial) ? body.historial.slice(0, 30).map((x) => String(x).slice(0, 140)) : []), ...PAY_SEMILLA];
  const system = `Eres Pay, el analista deportivo de la agencia de pronósticos PayWin (Ecuador). Hoy es ${hoyReal} (hora de Ecuador). ${esOtroDia ? 'Los partidos que armas son del día ' + hoy + ' (NO de hoy).' : ''} ${PAY_PERFIL}
${PAY_CONOCIMIENTO}
Tu trabajo es armar apuestas de BAJO RIESGO para un cupo concreto, con análisis breve y honesto. El dueño revisa y analiza cada pick antes de apostar.
${lote ? 'Cada cupo tiene su NIVEL DE SEGURIDAD, que manda sobre el resto de reglas de cuota por selección:\n' + lote.map((c) => nivelPay(c.cupo)).join('\n') : nivelPay(cupo)}
Estilo de apuesta (obligatorio): COMBINADAS de selecciones seguras. Cada selección individual debe respetar el rango del nivel de su cupo (por defecto 1.15 a 1.50). Elige cuántas selecciones (2 a 5) para que la cuota TOTAL (el producto de las cuotas) quede entre ${cuotaMin} y ${cuotaMax}. Muestra la cuota de cada selección y la cuota total.
Deportes y mercados que puedes usar, todos: fútbol (goles, corners, tarjetas, remates, faltas, ganador, doble oportunidad), baloncesto/NBA (puntos totales, puntos/rebotes/asistencias de jugador), tenis (ganador, sets, juegos/puntos), tenis de mesa (total de puntos del partido, por ejemplo más de 74.5), UFC/MMA, e-sports. Usa VARIEDAD de mercados además del ganador: goles, corners, tarjetas, remates/tiros al arco de jugadores, asistencias, rebotes, triples y puntos de jugadores, totales, hándicaps, sets/juegos de tenis. Usa las líneas de jugadores SOLO si aparecen en los datos (líneas que empiezan con JUGADORES) o si las confirmas en la web; si no, no las inventes. Usa VARIEDAD de deportes y ligas de todo el mundo (no te quedes en un solo deporte ni en una sola liga); mezcla deportes si eso baja el riesgo. Si en los datos hay fútbol, tenis, UFC u otros deportes, inclúyelos, no solo NBA.
Reglas:
- VARIEDAD DE EVENTOS: cada combinada debe usar PARTIDOS DISTINTOS a los de las otras combinadas de esta respuesta (ningún partido aparece en dos combinadas) y distintos a los ya usados. Reparte entre deportes y ligas. Incluye al menos una combinada con una línea Bet Builder (\"Crear apuesta:\") cuando haya un partido adecuado.
- NINGUNA línea (partido + selección) puede repetirse con las que el jefe ya usó hoy (te las doy en la indicación) ni entre combinadas distintas.
- Solo partidos del día ${hoy} (hora de Ecuador) que todavía no hayan empezado; NUNCA de otro día. Deben existir de verdad (en los datos${conDatos ? ' que te doy o' : ''} que encuentres buscando en la web). NUNCA inventes partidos, horarios, líneas ni cuotas. Si no confirmas una cuota, di que es aproximada.
- Baja el riesgo: prefiere líneas con margen amplio (por ejemplo un total que el equipo o jugador supera con holgura en sus últimos partidos), evita partidos con bajas importantes, rotaciones, finales parejas o información dudosa. Si una selección no te convence, no la pongas.
- Sé honesto: nunca prometas ganancia segura; indica confianza "baja", "media" o "alta" de la combinada.
- Si el rango pedido es difícil, acércate lo más posible y dilo en el análisis; NUNCA devuelvas la lista vacía si encuentras al menos una combinada razonable. Responde SOLO con un arreglo JSON de ${cantidad} objetos dentro de <json></json> (sin más texto) con: partido (resumen corto, ej. "Combinada de 3"), liga (deportes o ligas incluidas), hora (primer partido, hora de Ecuador), pick (texto corto que resuma la apuesta), cuota (número, total), confianza, analisis (máximo 2 frases del porqué es de bajo riesgo), selecciones (arreglo de OBJETOS, uno por línea, cada uno con: partido ("Local vs Visitante"), pick (la selección clara, ej. "Más de 215.5 puntos" o "Gana Sevilla"), cuota (número) y hora (hora de Ecuador))${lote ? ', cupo (el nombre del cupo tal cual te lo doy). Cada combinada debe usar selecciones DISTINTAS a las de los otros cupos' : ''}.`;
  const userMsg = `${lote ? 'Dame UNA combinada para cada cupo: ' + lote.map((c) => `${String(c.cupo).slice(0, 30)} (cuota total ${Number(c.min)} a ${Number(c.max)})`).join('; ') + '. Si para un cupo no hay nada de bajo riesgo, omítelo.' : `Cupo: ${cupo}. Cuota total objetivo: ${cuotaMin} a ${cuotaMax}. Todos los partidos deben ser del día ${hoy}. Dame ${cantidad} combinada(s) distintas.`}${Array.isArray(body.evitar) && body.evitar.length ? '\nLÍNEAS YA USADAS HOY, prohibido repetirlas (ni el mismo partido con la misma selección; busca otras): ' + body.evitar.slice(0, 100).map((x) => String(x).slice(0, 120)).join(' ; ') : ''}${descartadas0(body) ? '\nLÍNEAS QUE EL JEFE DESCARTÓ porque no le gustan (no las pongas, y evita líneas del mismo tipo y mismo estilo de riesgo): ' + descartadas0(body) : ''}${body.instruccion ? ' Indicación del dueño: ' + String(body.instruccion).slice(0, 300) : ''}${body.resumen ? '\nEstadística real del jefe: ' + String(body.resumen).slice(0, 300) + '. Si el acierto es bajo, sé MÁS conservador de lo normal.' : ''}${Array.isArray(body.perdidas) && body.perdidas.length ? '\nApuestas que el jefe PERDIÓ (analiza el patrón: mercados, cuotas y tipos de línea que le fallan, y EVÍTALOS): ' + body.perdidas.slice(0, 40).map((x) => String(x).slice(0, 140)).join(' ; ') : ''}${historial.length ? '\nApuestas que el jefe ya GANÓ antes (aprende qué tipo de líneas y cuotas le funcionan; NO las repitas tal cual): ' + historial.join(' ; ') : ''}${conDatos ? '\n\nAdemás busca en la web tenis, tenis de mesa, e-sports y UFC.\n\nPartidos y cuotas promedio (liga | partido | inicio UTC | mercado: cuota):\n' + datos.join('\n') : '\n\nBusca en la web SOLO los partidos del día ${hoy} que aún no empiezan, con sus cuotas aproximadas.'}`;
  const payload = { model: 'claude-sonnet-5', max_tokens: 6000, system, messages: [{ role: 'user', content: userMsg }] };
  // Con cuotas reales NO se usa la web (rápido y confiable); sin ellas, Pay busca en la web.
  if (!conDatos || body.web) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }];
  const ia = await llamarPay(apiKey, payload, 35000);
  if (!ia.ok) {
    res.status(502).json({ error: `Pay no pudo analizar ahora (servicio de IA, código ${ia.status}). ${ia.detalle || ''}` });
    return;
  }
  let texto = ia.texto;
  if (!texto && payload.tools && conDatos) { // se quedó buscando en la web: se reintenta solo con las cuotas reales
    delete payload.tools;
    const ia2 = await llamarPay(apiKey, payload, 25000);
    if (ia2.ok) texto = ia2.texto;
  }
  // Busca el arreglo JSON: primero dentro de <json>, luego el último bloque [ ... ] que sea válido
  let sugerencias = [];
  const cand = [];
  const tag = texto.match(/<json>([\s\S]*?)<\/json>/i);
  if (tag) cand.push(tag[1]);
  const fence = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cand.push(fence[1]);
  for (let ini = texto.indexOf('['); ini >= 0 && cand.length < 12; ini = texto.indexOf('[', ini + 1)) {
    const fin = texto.lastIndexOf(']');
    if (fin > ini) cand.push(texto.slice(ini, fin + 1));
  }
  for (const c of cand) {
    try { const j = JSON.parse(c.trim()); if (Array.isArray(j)) { sugerencias = j; break; } } catch (e) { /* siguiente candidato */ }
  }
  sugerencias = sugerencias.filter((x) => x && x.pick);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const descartadas = (Array.isArray(body.descartadas) ? body.descartadas : []).slice(0, 60);
  const usadas = new Set([...(Array.isArray(body.evitar) ? body.evitar : []), ...descartadas].map(norm));
  // Repetida si es exacta o si el mismo partido/jugador ya aparece en algo que el jefe mandó o registró hoy
  const palabrasDe = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !/^(gana|mas|menos|mayor|menor|total|juegos|goles|sets|partido|equipo|apuesta|cuota|linea|combinada)$/.test(w));
  const textosUsados = (Array.isArray(body.evitar) ? body.evitar : []).map((e) => new Set(palabrasDe(e)));
  const yaUsada = (l) => {
    if (!l || typeof l !== 'object') return false;
    if (usadas.has(norm((l.partido || '') + (l.pick || '')))) return true;
    const pw = [...new Set(palabrasDe(l.partido))];
    return pw.length >= 2 && textosUsados.some((set) => pw.filter((w) => set.has(w)).length >= 2);
  };
  const partidosVistos = new Set();
  const sinRepetir = sugerencias.filter((x) => {
    const sels = (x.selecciones || []).filter((l) => l && typeof l === 'object');
    if (sels.some(yaUsada)) return false;
    const claves = sels.map((l) => [...new Set(palabrasDe(l.partido))].sort().join('|')).filter(Boolean);
    if (claves.some((k) => partidosVistos.has(k))) return false; // mismo partido ya usado en otra combinada de esta respuesta
    claves.forEach((k) => partidosVistos.add(k));
    return true;
  });
  const hubo = sugerencias.length;
  sugerencias = sinRepetir.slice(0, cantidad);
  if (hubo && !sugerencias.length && !lote) { res.status(502).json({ error: 'Pay solo encontró combinadas con líneas que ya usaste hoy. Toca generar de nuevo para que busque otras.' }); return; }
  if (!sugerencias.length && lote) { res.status(200).json({ sugerencias: [], fuente: 'sin picks claros', razon: texto.trim().slice(0, 400) }); return; }
  if (!sugerencias.length) {
    console.error('Pay sin picks. Respuesta:', texto.slice(0, 600));
    res.status(502).json({ error: 'Pay no armó una combinada en ese rango. Lo que dijo: ' + (texto.replace(/\s+/g, ' ').trim().slice(0, 220) || `(sin respuesta; fuente: ${conDatos ? 'cuotas reales, ' + datos.length + ' eventos' : 'solo web, sin ODDS_API_KEY'}; fin: ${ia.stop || '-'})`) });
    return;
  }
  res.status(200).json({ sugerencias, fuente: conDatos ? 'cuotas reales (The Odds API) + búsqueda web para otros deportes' : 'búsqueda en la web (cuotas aproximadas)' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.' });
    return;
  }

  const body = req.body || {};

  if (body.modo === 'pay_aprender') {
    try { await modoPayAprender(apiKey, body, res); }
    catch (e) { console.error('Pay aprender:', e); res.status(500).json({ error: 'No pude leer la captura.' }); }
    return;
  }

  if (body.modo === 'pay_resultados') {
    try { await modoPayResultados(apiKey, body, res); }
    catch (e) { console.error('Pay resultados:', e); res.status(500).json({ error: 'No pude verificar los resultados.' }); }
    return;
  }

  if (body.modo === 'pay_diag') {
    res.status(200).json({ odds: !!process.env.ODDS_API_KEY, eventosEnCaché: cacheCuotas.datos ? cacheCuotas.datos.length : null });
    return;
  }

  if (body.modo === 'pay_partido') {
    try { await modoPayPartido(apiKey, body, res); }
    catch (e) { console.error('Pay partido:', e); res.status(500).json({ error: 'Pay tuvo un problema. Intenta de nuevo.' }); }
    return;
  }

  if (body.modo === 'pay_bajar') {
    try { await modoPayBajar(apiKey, body, res); }
    catch (e) { console.error('Pay bajar:', e); res.status(500).json({ error: 'Pay tuvo un problema. Intenta de nuevo.' }); }
    return;
  }

  if (body.modo === 'pay_chat') {
    try { await modoPayChat(apiKey, body, res); }
    catch (e) { console.error('Pay chat:', e); res.status(500).json({ error: 'Pay tuvo un problema. Intenta de nuevo.' }); }
    return;
  }

  if (body.modo === 'pay') {
    try { await modoPay(apiKey, body, res); }
    catch (e) { console.error('Pay:', e); res.status(500).json({ error: 'Pay tuvo un problema. Intenta de nuevo.' }); }
    return;
  }

  if (body.modo === 'difusion') {
    try {
      const { instruccion, cantidad } = body;
      const n = Math.max(1, Math.min(8, Number(cantidad) || 5));
      if (!instruccion) {
        res.status(400).json({ error: 'Falta la instrucción del mensaje.', variantes: [] });
        return;
      }
      const systemPrompt = `Vas a redactar un mensaje de difusión corto para enviar por WhatsApp a clientes de una agencia de pronósticos deportivos/apuestas llamada PayWin, avisando algo puntual (una promo, un stake disponible, un aviso) según la instrucción que te den. Tono: cercano, directo, 1-2 emojis como máximo, pocas líneas, fácil de leer en el celular. No inventes datos (montos, horarios, cuotas) que no te hayan dado.

Debes devolver EXACTAMENTE ${n} versiones DIFERENTES del mismo mensaje -- mismo contenido y oferta, pero con palabras, orden y tono ligeramente distintos entre sí, para que no se vean como una copia exacta mandada a todos. Responde ÚNICAMENTE con las ${n} versiones, cada una en su propia línea, numeradas así: "1. texto", "2. texto", etc. Sin explicaciones, sin encabezados, sin markdown.`;

      const text = await llamarAnthropic(apiKey, {
        system: systemPrompt,
        messages: [{ role: 'user', content: `Instrucción del dueño: ${instruccion}` }],
        max_tokens: 700
      });
      if (text === null) {
        res.status(502).json({ error: 'No se pudo redactar las variantes (servicio de IA).', variantes: [instruccion] });
        return;
      }
      const variantes = parseVariantes(text, n);
      res.status(200).json({ variantes: variantes.length ? variantes : [instruccion] });
    } catch (e) {
      console.error('Error redactando variantes de difusión:', e);
      res.status(500).json({ error: 'No se pudo redactar las variantes.', variantes: [] });
    }
    return;
  }

  // Modo por defecto: redactar un texto (apuesta, contenido, regalito, partidos del día, etc.)
  // "anterior" (el texto que ya se había generado) y "ajuste" (lo que el dueño pidió cambiar,
  // escrito o dictado por voz) son opcionales -- los manda el botón "Generar otro texto" / el
  // micrófono "Decirle cómo" del panel, para pedir una versión distinta o corregir algo que
  // salió sin sentido, sin tener que volver a subir la imagen ni reescribir todo a mano.
  try {
    const { kind, destino, code, imageBase64, mediaType, images, anterior, ajuste } = body;
    let systemPrompt = PROMPTS[kind] || PROMPTS.contenido;
    // CTA con el número de teléfono: siempre, adaptado a lo que se publica (no aplica a regalitos
    // ni a la base de difusión). Si el modelo igual lo omite, el panel lo agrega (winAsegurarCTA).
    const telefono = String(body.telefono || '').trim();
    const dests = String(destino || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (dests.length && dests.every((x) => /vip/i.test(x))) {
      systemPrompt += `\n\nIMPORTANTE: este texto va SOLO a miembros que YA están dentro del grupo VIP. NO incluyas ningún llamado a la acción, NO invites a entrar, unirse, escribir o pagar por el VIP, y NO pongas teléfono. Solo da la información (pick, cuota, ganada, etc.) en tono directo de equipo.`;
    }
    if (telefono && kind !== 'regalito' && kind !== 'difusion_preview') {
      systemPrompt += `\n\nIMPORTANTE: termina el texto con una línea breve de llamado a la acción (CTA), adaptada a lo que se está publicando (apuesta nueva, ganada, testimonio, partidos, etc.), que incluya SIEMPRE este número de teléfono tal cual: ${telefono}. Una sola línea, con un emoji.`;
    }

    const userContent = [];
    if (Array.isArray(images) && images.length) {
      images.forEach(img => {
        if (img && img.base64) {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } });
        }
      });
    } else if (imageBase64) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } });
    }
    let instructionText = `Destino: ${destino || 'comunidad'}.`;
    if (code) instructionText += ` Instrucción/código/nota del dueño: ${code}`;
    if (ajuste) {
      instructionText += ` El dueño ya vio una versión anterior y pidió este AJUSTE -- es lo más importante, síguelo al pie de la letra: "${ajuste}"`;
      if (anterior) instructionText += ` (el texto anterior, antes del ajuste, era: "${anterior}")`;
    } else if (anterior) {
      instructionText += ` Ya generaste esta versión antes: "${anterior}" -- el dueño quiere OTRA versión distinta (mismo contenido/tono, pero redactada diferente, no la repitas casi igual).`;
    }
    instructionText += ' Responde ÚNICAMENTE con el texto final listo para pegar en WhatsApp, sin explicaciones, sin comillas envolventes, sin markdown.';
    userContent.push({ type: 'text', text: instructionText });

    const text = await llamarAnthropic(apiKey, { system: systemPrompt, messages: [{ role: 'user', content: userContent }], max_tokens: 220 });
    if (text === null) {
      res.status(502).json({ error: 'No se pudo redactar el texto (servicio de IA).', caption: code || '' });
      return;
    }
    const caption = extractText(text) || code || '';
    res.status(200).json({ caption });
  } catch (e) {
    console.error('Error redactando:', e);
    res.status(500).json({ error: 'No se pudo redactar el texto.', caption: '' });
  }
};
