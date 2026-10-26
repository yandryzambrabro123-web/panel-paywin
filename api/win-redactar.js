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

const PROMPTS = {
  nueva_apuesta: `Vas a redactar el texto para anunciar una apuesta/pick NUEVO a una comunidad de pronósticos deportivos llamada PayWin. Usa el código/texto que te dieron y, si hay una imagen, apóyate SOLO en lo que se ve con claridad (pick, cuota, stake) -- si la imagen no es clara o no muestra esos datos, no los inventes, quédate con lo que te dieron en texto. Tono: emocionante, directo, con 1-2 emojis relevantes, fácil de leer en WhatsApp.${BREVEDAD}`,
  ganada: `Vas a redactar el texto para anunciar una apuesta GANADA a una comunidad de pronósticos deportivos llamada PayWin. Si hay una imagen, apóyate SOLO en lo que se ve con claridad (pick, cuota, monto ganado) -- si no se ve claro, no lo inventes. Tono: celebración, con emojis de fuego/dinero, para generar confianza y ganas de unirse al VIP.${BREVEDAD}`,
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
const PAY_MAX_LIGAS = Number(process.env.ODDS_MAX_LIGAS) || 10;

// Caché de 3 horas: cada consulta gasta créditos del plan (500 al mes en el gratis).
let cacheCuotas = { t: 0, datos: null };
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

async function cuotasReales() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  if (cacheCuotas.datos && Date.now() - cacheCuotas.t < 3 * 3600 * 1000) return cacheCuotas.datos;
  // Lista de deportes activos hoy (esta consulta no gasta créditos)
  let ligas = [];
  if (process.env.ODDS_SPORTS) ligas = process.env.ODDS_SPORTS.split(',').map((x) => x.trim()).filter(Boolean);
  else {
    try {
      const r = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${key}`);
      const activos = r.ok ? (await r.json()).filter((x) => x.active && !x.has_outrights).map((x) => x.key) : [];
      for (const p of PAY_PRIORIDAD) for (const k of activos) if ((k === p || k.startsWith(p + '_')) && !ligas.includes(k)) ligas.push(k);
    } catch (e) { /* sin lista: se usan las principales */ }
    if (!ligas.length) ligas = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_uefa_champs_league', 'basketball_nba'];
  }
  ligas = ligas.slice(0, PAY_MAX_LIGAS);
  const limite = Date.now() + 40 * 3600 * 1000; // solo partidos de las próximas 40 horas
  const eventos = [];
  const evs = [];
  for (const liga of ligas) {
    try {
      const mercados = /^(soccer|basketball|icehockey|americanfootball|baseball)_/.test(liga) ? 'h2h,totals' : 'h2h';
      const r = await fetch(`https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${key}&regions=eu&markets=${mercados}&oddsFormat=decimal`);
      if (!r.ok) continue;
      const lista = await r.json();
      for (const e of lista) {
        if (Date.parse(e.commence_time) > limite) continue;
        const mk = {};
        for (const b of e.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
          const k = `${m.key}|${o.name}${o.point != null ? ' ' + o.point : ''}`;
          (mk[k] = mk[k] || []).push(o.price);
        }
        const resumen = Object.entries(mk).map(([k, v]) => `${k}: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`);
        eventos.push(`${liga} | ${e.home_team} vs ${e.away_team} | ${e.commence_time} | ${resumen.join(' ; ')}`);
        evs.push({ liga, id: e.id, casa: e.home_team, fuera: e.away_team, inicio: e.commence_time });
      }
    } catch (e) { /* esa liga no respondió: se sigue con las demás */ }
  }
  let extra = [];
  if (process.env.ODDS_PROPS === '1') { try { extra = await lineasJugadores(key, evs, limite); } catch (e) { extra = []; } }
  cacheCuotas = { t: Date.now(), datos: [...eventos.slice(0, 120), ...extra] };
  return cacheCuotas.datos;
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

async function modoPayChat(apiKey, body, res) {
  const mensajes = (Array.isArray(body.mensajes) ? body.mensajes : []).slice(-14).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) })).filter((m) => m.content);
  if (!mensajes.length || mensajes[0].role !== 'user') { res.status(400).json({ error: 'Falta el mensaje.' }); return; }
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  let datos = null;
  try { datos = await cuotasReales(); } catch (e) { datos = null; }
  const contexto = String(body.contexto || '').slice(0, 4000);
  const system = `Eres Pay, el analista deportivo de PayWin (agencia de pronósticos de Ecuador). Eres hombre. Hablas con el dueño ("jefe") por voz, en vivo, así que respondes en español natural, directo y seguro, en 3 a 6 frases cortas, sin listas ni markdown ni emojis. Hoy es ${hoy} (hora de Ecuador).
Tu trabajo: explicar tus picks con una hipótesis clara (por qué crees que pasa: forma, historial, bajas, ritmo del partido, estadísticas de la línea), decir también qué podría salir mal y cuándo NO apostarías, y responder lo que te pregunte sobre partidos, mercados (goles, corners, tarjetas, remates, puntos, rebotes, asistencias, tenis, tenis de mesa, UFC, e-sports) y cómo bajar el riesgo. Ayudas a armar combinadas de selecciones de cuota baja (1.15 a 1.50 cada una).
${PAY_PERFIL}
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

async function modoPay(apiKey, body, res) {
  const cuotaMin = Number(body.cuotaMin) || 1.8, cuotaMax = Number(body.cuotaMax) || 2;
  const lote = Array.isArray(body.cupos) && body.cupos.length ? body.cupos.slice(0, 6) : null; // revisión automática: una combinada por cupo
  const cantidad = lote ? lote.length : Math.max(1, Math.min(5, Number(body.cantidad) || 3));
  const cupo = String(body.cupo || 'apuesta').slice(0, 40);
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  let datos = null;
  try { datos = await cuotasReales(); } catch (e) { datos = null; }
  // Solo partidos de HOY (fecha de Ecuador) que todavía no han empezado
  const ahoraMs = Date.now();
  const finDiaMs = Date.parse(hoy + 'T23:59:59-05:00');
  if (datos) datos = datos.filter((l) => { const t = Date.parse((l.split(' | ')[2] || '')); return t > ahoraMs && t <= finDiaMs; });
  const conDatos = datos && datos.length;
  if (datos && !datos.length && process.env.ODDS_API_KEY) {
    if (lote) { res.status(200).json({ sugerencias: [], fuente: 'sin partidos de hoy', razon: 'No quedan partidos de hoy por empezar en las ligas activas.' }); return; }
    res.status(502).json({ error: 'Ya no quedan partidos de hoy por empezar en las ligas que reviso. Pay solo arma apuestas del día.' });
    return;
  }
  const historial = [...(Array.isArray(body.historial) ? body.historial.slice(0, 30).map((x) => String(x).slice(0, 140)) : []), ...PAY_SEMILLA];
  const system = `Eres Pay, el analista deportivo de la agencia de pronósticos PayWin (Ecuador). Hoy es ${hoy} (hora de Ecuador). ${PAY_PERFIL}
Tu trabajo es armar apuestas de BAJO RIESGO para un cupo concreto, con análisis breve y honesto. El dueño revisa y analiza cada pick antes de apostar.
${lote ? 'Cada cupo tiene su NIVEL DE SEGURIDAD, que manda sobre el resto de reglas de cuota por selección:\n' + lote.map((c) => nivelPay(c.cupo)).join('\n') : nivelPay(cupo)}
Estilo de apuesta (obligatorio): COMBINADAS de selecciones seguras. Cada selección individual debe respetar el rango del nivel de su cupo (por defecto 1.15 a 1.50). Elige cuántas selecciones (2 a 5) para que la cuota TOTAL (el producto de las cuotas) quede entre ${cuotaMin} y ${cuotaMax}. Muestra la cuota de cada selección y la cuota total.
Deportes y mercados que puedes usar, todos: fútbol (goles, corners, tarjetas, remates, faltas, ganador, doble oportunidad), baloncesto/NBA (puntos totales, puntos/rebotes/asistencias de jugador), tenis (ganador, sets, juegos/puntos), tenis de mesa (total de puntos del partido, por ejemplo más de 74.5), UFC/MMA, e-sports. Usa VARIEDAD de mercados además del ganador: goles, corners, tarjetas, remates/tiros al arco de jugadores, asistencias, rebotes, triples y puntos de jugadores, totales, hándicaps, sets/juegos de tenis. Usa las líneas de jugadores SOLO si aparecen en los datos (líneas que empiezan con JUGADORES) o si las confirmas en la web; si no, no las inventes. Usa VARIEDAD de deportes y ligas de todo el mundo (no te quedes en un solo deporte ni en una sola liga); mezcla deportes si eso baja el riesgo. Si en los datos hay fútbol, tenis, UFC u otros deportes, inclúyelos, no solo NBA.
Reglas:
- NINGUNA línea (partido + selección) puede repetirse con las que el jefe ya usó hoy (te las doy en la indicación) ni entre combinadas distintas.
- Solo partidos de HOY (${hoy}, hora de Ecuador) que todavía no hayan empezado; NUNCA de mañana ni de otro día. Deben existir de verdad (en los datos${conDatos ? ' que te doy o' : ''} que encuentres buscando en la web). NUNCA inventes partidos, horarios, líneas ni cuotas. Si no confirmas una cuota, di que es aproximada.
- Baja el riesgo: prefiere líneas con margen amplio (por ejemplo un total que el equipo o jugador supera con holgura en sus últimos partidos), evita partidos con bajas importantes, rotaciones, finales parejas o información dudosa. Si una selección no te convence, no la pongas.
- Sé honesto: nunca prometas ganancia segura; indica confianza "baja", "media" o "alta" de la combinada.
- Si el rango pedido es difícil, acércate lo más posible y dilo en el análisis; NUNCA devuelvas la lista vacía si encuentras al menos una combinada razonable. Responde SOLO con un arreglo JSON de ${cantidad} objetos dentro de <json></json> (sin más texto) con: partido (resumen corto, ej. "Combinada de 3"), liga (deportes o ligas incluidas), hora (primer partido, hora de Ecuador), pick (texto corto que resuma la apuesta), cuota (número, total), confianza, analisis (máximo 2 frases del porqué es de bajo riesgo), selecciones (arreglo de OBJETOS, uno por línea, cada uno con: partido ("Local vs Visitante"), pick (la selección clara, ej. "Más de 215.5 puntos" o "Gana Sevilla"), cuota (número) y hora (hora de Ecuador))${lote ? ', cupo (el nombre del cupo tal cual te lo doy). Cada combinada debe usar selecciones DISTINTAS a las de los otros cupos' : ''}.`;
  const userMsg = `${lote ? 'Dame UNA combinada para cada cupo: ' + lote.map((c) => `${String(c.cupo).slice(0, 30)} (cuota total ${Number(c.min)} a ${Number(c.max)})`).join('; ') + '. Si para un cupo no hay nada de bajo riesgo, omítelo.' : `Cupo: ${cupo}. Cuota total objetivo: ${cuotaMin} a ${cuotaMax}. Todos los partidos deben ser de HOY. Dame ${cantidad} combinada(s) distintas.`}${Array.isArray(body.evitar) && body.evitar.length ? '\nLÍNEAS YA USADAS HOY, prohibido repetirlas (ni el mismo partido con la misma selección; busca otras): ' + body.evitar.slice(0, 60).map((x) => String(x).slice(0, 120)).join(' ; ') : ''}${body.instruccion ? ' Indicación del dueño: ' + String(body.instruccion).slice(0, 300) : ''}${historial.length ? '\nApuestas que el jefe ya GANÓ antes (aprende qué tipo de líneas y cuotas le funcionan; NO las repitas tal cual): ' + historial.join(' ; ') : ''}${conDatos ? '\n\nAdemás busca en la web tenis, tenis de mesa, e-sports y UFC.\n\nPartidos y cuotas promedio (liga | partido | inicio UTC | mercado: cuota):\n' + datos.join('\n') : '\n\nBusca en la web SOLO los partidos de hoy que aún no empiezan, con sus cuotas aproximadas.'}`;
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
  const usadas = new Set((Array.isArray(body.evitar) ? body.evitar : []).map(norm));
  const sinRepetir = sugerencias.filter((x) => !(x.selecciones || []).some((l) => l && typeof l === 'object' && usadas.has(norm((l.partido || '') + (l.pick || '')))));
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

  if (body.modo === 'pay_diag') {
    res.status(200).json({ odds: !!process.env.ODDS_API_KEY, eventosEnCaché: cacheCuotas.datos ? cacheCuotas.datos.length : null });
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
