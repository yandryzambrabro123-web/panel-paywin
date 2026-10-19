// Función serverless de Vercel: transcribe un audio grabado a texto usando ElevenLabs Scribe
// (speech-to-text). Se usa en navegadores donde NO existe el reconocimiento de voz nativo del
// navegador (SpeechRecognition / webkitSpeechRecognition) -- en la práctica, esto es TODO
// iPhone: Apple no implementa esa API web en ningún navegador de iOS (ni Safari, ni Chrome ni
// ningún otro, porque todos corren sobre el mismo motor WebKit). Ahí, en vez de "escuchar"
// continuo, el panel graba mientras el jefe mantiene tocado el círculo y manda ese audio aquí.
//
// Reusa la misma ELEVENLABS_API_KEY que ya está configurada para la voz de Win (api/win-voz.js)
// -- no hace falta ninguna variable de entorno nueva.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar ELEVENLABS_API_KEY en Vercel.' });
    return;
  }

  try {
    const { audioBase64, mimeType } = req.body || {};
    if (!audioBase64) {
      res.status(400).json({ error: 'No llegó ningún audio.' });
      return;
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType || 'audio/mp4' });

    const form = new FormData();
    form.append('model_id', 'scribe_v1');
    form.append('language_code', 'spa');
    form.append('file', blob, 'audio.m4a');

    const apiRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de ElevenLabs (STT):', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo transcribir el audio.' });
      return;
    }

    const data = await apiRes.json();
    const text = (data && (data.text || data.transcript)) || '';
    res.status(200).json({ text: text.trim() });
  } catch (e) {
    console.error('Error en win-transcribir:', e);
    res.status(500).json({ error: 'No se pudo transcribir el audio.' });
  }
};
