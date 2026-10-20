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
    const systemPrompt = PROMPTS[kind] || PROMPTS.contenido;

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
