// Función serverless de Vercel: redacta el texto final que va a acompañar un mensaje para la
// comunidad (apuesta nueva, ganada, contenido/testimonio o regalito del día), usando la API de
// Anthropic. Si llega una imagen, la "lee" (visión) para apoyarse en lo que muestra. El dueño
// siempre revisa el resultado en el panel antes de mandarlo — esto solo redacta el borrador.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) —
// nunca se expone en el index.html ni llega al navegador.

const PROMPTS = {
  nueva_apuesta: `Vas a redactar el texto para anunciar una apuesta/pick NUEVO a una comunidad de pronósticos deportivos llamada PayWin. Usa el código/texto que te dieron y, si hay una imagen, apóyate en lo que muestra (pick, cuota, stake). Tono: emocionante, directo, con 1-2 emojis relevantes, pocas líneas, fácil de leer en WhatsApp. No inventes datos (cuota, monto) que no te hayan dado o no veas claro en la imagen.`,
  ganada: `Vas a redactar el texto para anunciar una apuesta GANADA a una comunidad de pronósticos deportivos llamada PayWin. Si hay una imagen, apóyate en lo que muestra (pick, cuota, monto ganado). Tono: celebración, corto, con emojis de fuego/dinero, para generar confianza y ganas de unirse al VIP. No inventes montos que no veas claro.`,
  contenido: `Vas a redactar el texto para publicar algo en una comunidad de pronósticos deportivos llamada PayWin (puede ser un testimonio, un anuncio, un "buenos días", publicidad de recargas/retiros o del VIP, etc.). Usa la nota/instrucción que te dieron y, si hay una imagen, describe o apóyate en lo que muestra sin inventar datos que no se vean claros. Tono: cercano, profesional, con algún emoji si calza, pocas líneas.`,
  regalito: `Vas a redactar el texto para mandar el "regalito del día" — una apuesta de regalo/cortesía — a un cliente VIP de PayWin como agradecimiento por su recarga. Tono: cálido, de agradecimiento, breve, con 1-2 emojis. Si hay una imagen, apóyate en lo que muestra (pick, cuota).`
};

function extractText(text) {
  return (text || '').trim().replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
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

  try {
    const { kind, destino, code, imageBase64, mediaType } = req.body || {};
    const systemPrompt = PROMPTS[kind] || PROMPTS.contenido;

    const userContent = [];
    if (imageBase64) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } });
    }
    let instructionText = `Destino: ${destino || 'comunidad'}.`;
    if (code) instructionText += ` Instrucción/código/nota del dueño: ${code}`;
    instructionText += ' Responde ÚNICAMENTE con el texto final listo para pegar en WhatsApp, sin explicaciones, sin comillas envolventes, sin markdown.';
    userContent.push({ type: 'text', text: instructionText });

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo redactar el texto (servicio de IA).', caption: code || '' });
      return;
    }

    const data = await apiRes.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    const caption = extractText(textBlock ? textBlock.text : '') || code || '';

    res.status(200).json({ caption });
  } catch (e) {
    console.error('Error redactando:', e);
    res.status(500).json({ error: 'No se pudo redactar el texto.', caption: '' });
  }
};
