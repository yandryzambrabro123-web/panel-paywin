// Función serverless de Vercel: redacta varias VERSIONES distintas del mismo mensaje de
// difusión (misma oferta/aviso, palabras distintas) para que una lista de clientes no reciba
// todos exactamente el mismo texto copiado y pegado. Se usa en las "listas de difusión" de Win
// (ver index.html, openWinDifusionComposeModal/submitWinDifusion) -- las variantes se van
// rotando entre los contactos antes de mandarlas, una por minuto, con api/win-enviar-cola.js.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) --
// nunca se expone en el index.html ni llega al navegador.

function parseVariantes(text, cantidad) {
  const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
  const variantes = [];
  for (const line of lines) {
    const m = line.match(/^\d+[\.\)]\s*(.+)$/);
    if (m) variantes.push(m[1].trim());
  }
  if (variantes.length) return variantes.slice(0, cantidad);
  // Si el modelo no numeró (no debería pasar, pero por si acaso), se usa el texto completo
  // como una sola variante -- mejor mandar algo que no mandar nada.
  return text && text.trim() ? [text.trim()] : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Vercel.', variantes: [] });
    return;
  }

  try {
    const { instruccion, cantidad } = req.body || {};
    const n = Math.max(1, Math.min(8, Number(cantidad) || 5));
    if (!instruccion) {
      res.status(400).json({ error: 'Falta la instrucción del mensaje.', variantes: [] });
      return;
    }

    const systemPrompt = `Vas a redactar un mensaje de difusión corto para enviar por WhatsApp a clientes de una agencia de pronósticos deportivos/apuestas llamada PayWin, avisando algo puntual (una promo, un stake disponible, un aviso) según la instrucción que te den. Tono: cercano, directo, 1-2 emojis como máximo, pocas líneas, fácil de leer en el celular. No inventes datos (montos, horarios, cuotas) que no te hayan dado.

Debes devolver EXACTAMENTE ${n} versiones DIFERENTES del mismo mensaje -- mismo contenido y oferta, pero con palabras, orden y tono ligeramente distintos entre sí, para que no se vean como una copia exacta mandada a todos. Responde ÚNICAMENTE con las ${n} versiones, cada una en su propia línea, numeradas así: "1. texto", "2. texto", etc. Sin explicaciones, sin encabezados, sin markdown.`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Instrucción del dueño: ${instruccion}` }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo redactar las variantes (servicio de IA).', variantes: [instruccion] });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const variantes = parseVariantes(textBlock ? textBlock.text : '', n);

    res.status(200).json({ variantes: variantes.length ? variantes : [instruccion] });
  } catch (e) {
    console.error('Error redactando variantes de difusión:', e);
    res.status(500).json({ error: 'No se pudo redactar las variantes.', variantes: [] });
  }
};
