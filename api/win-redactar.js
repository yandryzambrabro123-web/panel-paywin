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
const PAY_LIGAS = (process.env.ODDS_SPORTS || 'soccer_spain_la_liga,soccer_epl,soccer_uefa_champs_league,basketball_nba').split(',');

// Caché de 30 min: cada consulta gasta créditos del plan (500 al mes en el gratis).
let cacheCuotas = { t: 0, datos: null };
async function cuotasReales() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return null;
  if (cacheCuotas.datos && Date.now() - cacheCuotas.t < 30 * 60 * 1000) return cacheCuotas.datos;
  const eventos = [];
  for (const liga of PAY_LIGAS) {
    try {
      const r = await fetch(`https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${key}&regions=eu&markets=h2h,totals&oddsFormat=decimal`);
      if (!r.ok) continue;
      const lista = await r.json();
      for (const e of lista) {
        const mercados = {};
        for (const b of e.bookmakers || []) for (const m of b.markets || []) for (const o of m.outcomes || []) {
          const k = `${m.key}|${o.name}${o.point != null ? ' ' + o.point : ''}`;
          (mercados[k] = mercados[k] || []).push(o.price);
        }
        const resumen = Object.entries(mercados).map(([k, v]) => `${k}: ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`);
        eventos.push(`${liga} | ${e.home_team} vs ${e.away_team} | ${e.commence_time} | ${resumen.join(' ; ')}`);
      }
    } catch (e) { /* esa liga no respondió: se sigue con las demás */ }
  }
  cacheCuotas = { t: Date.now(), datos: eventos.slice(0, 80) };
  return cacheCuotas.datos;
}

async function modoPay(apiKey, body, res) {
  const cuotaMin = Number(body.cuotaMin) || 1.8, cuotaMax = Number(body.cuotaMax) || 2;
  const cantidad = Math.max(1, Math.min(5, Number(body.cantidad) || 3));
  const cupo = String(body.cupo || 'apuesta').slice(0, 40);
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  let datos = null;
  try { datos = await cuotasReales(); } catch (e) { datos = null; }
  const conDatos = datos && datos.length;
  const system = `Eres Pay, el analista deportivo de la agencia de pronósticos PayWin (Ecuador). Hoy es ${hoy} (hora de Ecuador). Tu trabajo es armar apuestas de BAJO RIESGO para un cupo concreto, con análisis breve y honesto. El dueño revisa y analiza cada pick antes de apostar.
Estilo de apuesta (obligatorio): COMBINADAS de selecciones seguras. Cada selección individual debe tener cuota entre 1.15 y 1.50 (mejor 1.20 a 1.40). Elige cuántas selecciones (2 a 5) para que la cuota TOTAL (el producto de las cuotas) quede entre ${cuotaMin} y ${cuotaMax}. Muestra la cuota de cada selección y la cuota total.
Deportes y mercados que puedes usar, todos: fútbol (goles, corners, tarjetas, remates, faltas, ganador, doble oportunidad), baloncesto/NBA (puntos totales, puntos/rebotes/asistencias de jugador), tenis (ganador, sets, juegos/puntos), tenis de mesa (total de puntos del partido, por ejemplo más de 74.5), UFC/MMA, e-sports. Mezcla deportes si eso baja el riesgo.
Reglas:
- Solo partidos que se juegan en las próximas 36 horas y que existan de verdad (en los datos${conDatos ? ' que te doy o' : ''} que encuentres buscando en la web). NUNCA inventes partidos, horarios, líneas ni cuotas. Si no confirmas una cuota, di que es aproximada.
- Baja el riesgo: prefiere líneas con margen amplio (por ejemplo un total que el equipo o jugador supera con holgura en sus últimos partidos), evita partidos con bajas importantes, rotaciones, finales parejas o información dudosa. Si una selección no te convence, no la pongas.
- Sé honesto: nunca prometas ganancia segura; indica confianza "baja", "media" o "alta" de la combinada.
- Responde SOLO con un arreglo JSON de ${cantidad} objetos (sin texto extra, sin markdown) con: partido (resumen corto, ej. "Combinada de 3"), liga (deportes o ligas incluidas), hora (primer partido, hora de Ecuador), pick (texto corto que resuma la apuesta), cuota (número, total), confianza, analisis (máximo 2 frases del porqué es de bajo riesgo), selecciones (arreglo de textos, uno por selección, con partido, línea y cuota, ej. "Lakers vs Suns: más de 215.5 puntos @1.30").`;
  const userMsg = `Cupo: ${cupo}. Cuota total objetivo: ${cuotaMin} a ${cuotaMax}. Dame ${cantidad} combinada(s) distintas.${body.instruccion ? ' Indicación del dueño: ' + String(body.instruccion).slice(0, 300) : ''}${conDatos ? '\n\nAdemás busca en la web tenis, tenis de mesa, e-sports y UFC.\n\nPartidos y cuotas promedio (liga | partido | inicio UTC | mercado: cuota):\n' + datos.join('\n') : '\n\nBusca en la web los partidos de hoy y mañana con sus cuotas aproximadas.'}`;
  const payload = { model: 'claude-sonnet-5', max_tokens: 3000, system, messages: [{ role: 'user', content: userMsg }] };
  payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }]; // los datos de cuotas cubren lo principal; la web completa tenis de mesa, e-sports y mercados de jugadores
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  if (!r.ok) {
    console.error('Pay:', r.status, await r.text());
    res.status(502).json({ error: 'Pay no pudo analizar ahora (servicio de IA). Intenta de nuevo.' });
    return;
  }
  const data = await r.json();
  const texto = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const m = texto.match(/\[[\s\S]*\]/);
  let sugerencias = [];
  try { sugerencias = JSON.parse(m ? m[0] : '[]'); } catch (e) { sugerencias = []; }
  sugerencias = sugerencias.filter((x) => x && x.pick).slice(0, cantidad);
  if (!sugerencias.length) { res.status(502).json({ error: 'Pay no encontró una apuesta clara en ese rango. Prueba con otro rango o más tarde.' }); return; }
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
