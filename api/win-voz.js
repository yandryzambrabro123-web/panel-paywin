// Función serverless de Vercel: convierte el texto que Win va a decir en audio real usando la
// voz elegida en ElevenLabs. El panel llama aquí en vez de usar la voz gratis del navegador;
// si esto falla por cualquier motivo, el navegador (index.html) cae solo de vuelta a la voz
// gratis, así que esto nunca deja a Win muda.
//
// Variables de entorno necesarias en Vercel (Settings -> Environment Variables):
//   ELEVENLABS_API_KEY   -- tu API key de ElevenLabs (elevenlabs.io -> perfil -> API Keys)
//   ELEVENLABS_VOICE_ID  -- el ID de la voz que elegiste (en ElevenLabs: Voices -> la voz -> ... -> Copy Voice ID)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    res.status(500).json({ error: 'Falta configurar ELEVENLABS_API_KEY y/o ELEVENLABS_VOICE_ID en Vercel.' });
    return;
  }

  try {
    const { text } = req.body || {};
    const clean = (text || '').trim().slice(0, 1000);
    if (!clean) {
      res.status(400).json({ error: 'No llegó texto para convertir a voz.' });
      return;
    }

    const apiRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        'accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_turbo_v2_5', // rápido y soporta español -- bueno para conversación en vivo
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true }
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de ElevenLabs:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo generar la voz.' });
      return;
    }

    const buf = Buffer.from(await apiRes.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (e) {
    console.error('Error en win-voz:', e);
    res.status(500).json({ error: 'No se pudo generar la voz.' });
  }
};
