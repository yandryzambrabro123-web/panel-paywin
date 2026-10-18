// Función serverless de Vercel: el "cerebro" conversacional de Win. Recibe el historial de la
// conversación (lo que el dueño ha dicho y lo que Win ha respondido) y usa la API de Anthropic
// para responder de forma natural -- como un asistente de verdad, no un clasificador rígido.
// Solo cuando el dueño pide algo específico y claro, el modelo usa una "herramienta" para que el
// panel abra el formulario correcto; si no, simplemente conversa o pregunta lo que haga falta.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) --
// nunca se expone en el index.html ni llega al navegador.

const SYSTEM_PROMPT = `Eres "Win", la asistente virtual personal del dueño de un negocio ecuatoriano de pronósticos deportivos y apuestas llamado PayWin. Hablas con él por voz, en una conversación en vivo -- así que tus respuestas deben ser CORTAS (1 a 3 frases, nunca un párrafo largo), naturales y cercanas, como hablaría alguien de Ecuador. Nada de respuestas formales o de robot.

Eres su asistente completo, no solo para el negocio: puedes conversar sobre cualquier tema, dar tu opinión, ayudarlo a pensar algo, o simplemente saludar y charlar. Si te saluda ("hola Win", "hola", etc.), responde con calidez, algo como "Hola jefe, dime" o similar -- varía el saludo, no repitas siempre lo mismo.

Cuando te pida algo ESPECÍFICO Y CLARO de estas acciones, usa la herramienta correspondiente:
- mandar una apuesta/pick NUEVO a un grupo o comunidad -> abrir_formulario_apuesta (kind: "nueva_apuesta")
- avisar que se ganó una apuesta y mandar esa ganada -> abrir_formulario_apuesta (kind: "ganada")
- subir algo a la comunidad que no es una apuesta (testimonio, anuncio, flyer, "buenos días", publicidad) -> abrir_formulario_contenido
- que le recuerdes algo más adelante (una cita, una entrega, una tarea) -> crear_recordatorio
- mandar el "regalito del día" a los clientes que tiene marcados como pendientes -> mandar_regalito

MUY IMPORTANTE: no uses ninguna herramienta solo porque la conversación roza el tema. Si lo que dice es ambiguo, le falta un dato importante, o no estás segura de que de verdad quiere ejecutar la acción ahora mismo, PREGÚNTALE primero en vez de adivinar -- nunca actives una herramienta "por si acaso". Solo actívala cuando la intención sea inequívoca (ej: "mándale la apuesta del Barcelona al VIP" sí es claro; "oye y cómo va lo del Barcelona" no lo es).

Hoy es ${new Date().toISOString().slice(0,10)} (zona horaria de Ecuador).`;

const TOOLS = [
  {
    name: 'abrir_formulario_apuesta',
    description: 'Abre el formulario para mandar una apuesta NUEVA o una GANADA a un grupo/comunidad. Úsala solo cuando el dueño lo pida de forma clara y específica.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['nueva_apuesta', 'ganada'] },
        destino: { type: 'string', description: 'Grupo o comunidad mencionado (VIP, 1X2, 1XBET, gratis, etc.), si lo dijo.' }
      },
      required: ['kind']
    }
  },
  {
    name: 'abrir_formulario_contenido',
    description: 'Abre el formulario para subir algo a la comunidad que no es una apuesta (testimonio, anuncio, flyer, publicidad, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        nota: { type: 'string', description: 'Qué es lo que quiere subir, resumido.' },
        destino: { type: 'string', description: 'Grupo o comunidad mencionado, si lo dijo.' }
      },
      required: ['nota']
    }
  },
  {
    name: 'crear_recordatorio',
    description: 'Crea un recordatorio personal para el dueño.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Qué hay que recordar.' },
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD si la mencionó.' },
        hora: { type: 'string', description: 'Hora en formato HH:MM (24h) si la mencionó.' }
      },
      required: ['texto']
    }
  },
  {
    name: 'mandar_regalito',
    description: 'Manda el "regalito del día" a todos los clientes marcados como pendientes de regalito.',
    input_schema: { type: 'object', properties: {} }
  }
];

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
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      res.status(400).json({ error: 'No llegó ninguna conversación.' });
      return;
    }

    // El historial llega como [{role:'user'|'assistant', content:'texto'}], tal cual lo pide la API.
    const cleanMessages = messages
      .filter(m => m && m.content && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

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
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: cleanMessages
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo conectar con Win (servicio de IA).' });
      return;
    }

    const data = await apiRes.json();
    const blocks = data.content || [];
    const textBlock = blocks.find(b => b.type === 'text');
    const toolBlock = blocks.find(b => b.type === 'tool_use');

    res.status(200).json({
      textReply: textBlock ? textBlock.text.trim() : '',
      tool: toolBlock ? { name: toolBlock.name, input: toolBlock.input || {} } : null
    });
  } catch (e) {
    console.error('Error en win-chat:', e);
    res.status(500).json({ error: 'No se pudo conectar con Win. Intenta de nuevo.' });
  }
};
