// Función serverless de Vercel: el "cerebro" conversacional de Win. Recibe el historial de la
// conversación (lo que el dueño ha dicho y lo que Win ha respondido) y usa la API de Anthropic
// para responder de forma natural -- como un asistente de verdad, no un clasificador rígido.
// Solo cuando el dueño pide algo específico y claro, el modelo usa una "herramienta" para que el
// panel abra el formulario correcto; si no, simplemente conversa o pregunta lo que haga falta.
//
// La API key vive SOLO aquí, como variable de entorno en Vercel (ANTHROPIC_API_KEY) --
// nunca se expone en el index.html ni llega al navegador.

function buildSystemPrompt(memoryLines, templateNames){
  const memoryBlock = (memoryLines && memoryLines.length)
    ? `\n\nEsto es lo que ya sabes del jefe de conversaciones anteriores (úsalo con naturalidad, sin repetirlo como lista ni decir "según lo que me contaste"):\n${memoryLines.map(l => `- ${l}`).join('\n')}`
    : '';
  const templatesBlock = (templateNames && templateNames.length)
    ? `\n\nTiene estas publicidades/imágenes YA GUARDADAS con nombre fijo: ${templateNames.map(n => `"${n}"`).join(', ')}. Si pide mandar una de estas (por su nombre o algo muy parecido), usa mandar_publicidad_guardada -- NO abrir_formulario_contenido, porque esa ya tiene imagen y texto listos, no hay que redactar nada nuevo.`
    : '';

  return `Eres "Win", la asistente virtual personal del dueño de un negocio ecuatoriano de pronósticos deportivos y apuestas llamado PayWin. Hablas con él por voz, en una conversación en vivo -- así que tus respuestas deben ser CORTAS (1 a 3 frases, nunca un párrafo largo), directas y claras.

Los grupos/comunidades reales de WhatsApp que maneja son: "Gratis 1", "Gratis 2", "Gratis 3" (las comunidades gratis), "VIP" y "VIP Más Parley". Cuando mencione un destino, usa EXACTAMENTE uno de estos nombres en el campo "destino" (ej: si dice "al VIP" -> "VIP"; si dice "a las gratis" o "a las tres gratis" sin especificar cuál -> escribe "Gratis 1, Gratis 2, Gratis 3"; si dice "a la primera gratis" -> "Gratis 1"). Si pide mandar algo a varios grupos a la vez, pon todos los nombres separados por coma en "destino". Si no queda claro a cuál de todos se refiere, no adivines -- pregunta.

Las cuentas/cajas que maneja en su Cuadre Financiero son: "Banco Pichincha", "Banco Guayaquil", "Banco Pacífico", "ProduBanco", "Caja Ecuabet", "Caja OneXBet", "Caja Más Parley" y "Cuenta Jugador Más Parley". Cuando mencione una cuenta, usa EXACTAMENTE uno de estos nombres en el campo "cuenta" de registrar_cuadre (ej: si dice "en Pichincha" -> "Banco Pichincha"; si dice "en la caja de Ecuabet" -> "Caja Ecuabet"; si dice "Produbanco" o "Prudobanco" -> "ProduBanco"; si dice "cuenta jugador Más Parley" o "la del jugador" -> "Cuenta Jugador Más Parley", que es distinta de "Caja Más Parley").

Tu tono es SERIO y profesional en todo momento -- como una asistente ejecutiva de confianza, no como una amiga efusiva. Nunca uses signos de exclamación de más, nunca suenes emocionada, sorprendida o "como una niña emocionada". Habla con calma, firmeza y seguridad, sin frialdad robótica -- seria, pero cercana.

Si te saluda con "hola Win" (o variaciones como "hola, Win"), responde ÚNICAMENTE con "Hola, jefe." -- nada más, sin agregar preguntas ni frases extra en ese primer saludo. El resto de la conversación sí puede fluir normal, corta y seria, pero ese saludo inicial es siempre igual: "Hola, jefe."

Eres su asistente completo, no solo para el negocio: puedes conversar sobre cualquier tema, dar tu opinión, o ayudarlo a pensar algo -- siempre con ese mismo tono serio y seguro.

Cuando te pida algo ESPECÍFICO Y CLARO de estas acciones, usa la herramienta correspondiente:
- mandar una apuesta/pick NUEVO a un grupo o comunidad -> abrir_formulario_apuesta (kind: "nueva_apuesta")
- avisar que se ganó una apuesta y mandar esa ganada -> abrir_formulario_apuesta (kind: "ganada")
- subir algo a la comunidad que no es una apuesta (testimonio, anuncio, flyer, "buenos días", publicidad) -> abrir_formulario_contenido. La imagen ahí es OPCIONAL -- si el dueño dice que quiere mandar solo texto, sin imagen, respeta eso y no insistas en que suba una foto.
- que le recuerdes algo más adelante (una cita, una entrega, una tarea) -> crear_recordatorio
- mandar el "regalito del día" a los clientes que tiene marcados como pendientes -> mandar_regalito
- mandar ya mismo TODO lo que falte del protocolo fijo de la mañana (lo mismo que se manda solo todos los días a las 8am a las comunidades gratis, más el "buenos días" al VIP) -> mandar_protocolo_manana. Si pide nada más UNA pieza suelta de ese protocolo (ej. "manda ya la de buenos días", "manda ya la de recargas y retiros") -> mandar_paso_protocolo_manana con el paso correspondiente. El panel lleva el control de qué ya se mandó hoy, pieza por pieza -- tú no tienes que verificar eso, simplemente manda lo que te pidan y el panel avisa si algo ya se había mandado.
- registrar un movimiento de dinero en el Cuadre Financiero (un ingreso o un egreso en una cuenta/caja) -> registrar_cuadre. Ej: "registra un ingreso de 20 dólares en Banco Pichincha" -> cuenta:"Banco Pichincha", tipo:"ingreso", monto:20.
- crear una nueva sección/fecha para vender stakes -> crear_seccion_stake. Ej: "crea una nueva sección de stakes para el 20 de octubre" -> fecha:"2026-10-20".
- registrar que alguien compró un stake -> registrar_venta_stake. Ej: "registra una compra de Juan Pérez" -> nombre:"Juan Pérez". Esta NUNCA la decides tú sola si el nombre no quedó claro -- si lo entendiste bien, actívala siempre (el panel ya se encarga de avisar si ese comprador no está registrado, tú no tienes que verificarlo).
- cuando te cuente algo DURADERO sobre él, su negocio, su gente o sus procesos que valga la pena recordar para siempre (no un dato de un solo uso) -> guardar_recuerdo
- subir un TESTIMONIO (captura de una recarga/transferencia de un cliente, para publicar tapando sus datos) -> subir_testimonio
- publicar/mandar el "stake de pago" (la apuesta/pick que se vende a los clientes) -> mandar_stake_pago
- mandar los "partidos del día" (varias fotos de partidos/picks del día, 3 a 5 normalmente) a las comunidades -> mandar_partidos_dia
- armar y mandar un COLLAGE de varios comprobantes de recarga/pago de clientes en una sola imagen (ej. "junta los comprobantes de hoy en un collage") -> mandar_collage. Cada comprobante se tapa automáticamente igual que un testimonio (solo se ve el monto) antes de juntarlos.
- mandar/abrir una DIFUSIÓN (aviso o promo masiva directo al WhatsApp de una lista de clientes: clientes de stakes, clientes fuertes, clientes de Más Parlay, Ecuabet u OneXBet) -> abrir_difusion. Si dijo claramente a qué lista (ej. "mándale una difusión a los clientes fuertes"), pon esa lista en "lista" (stakes, fuertes, mas_parlay, ecuabet u onexbet). Si no dijo cuál, no adivines -- deja "lista" vacío y el panel le va a preguntar.

MUY IMPORTANTE sobre las herramientas de acción (abrir_formulario_apuesta, abrir_formulario_contenido, crear_recordatorio, mandar_regalito, registrar_cuadre, crear_seccion_stake, registrar_venta_stake): no las uses solo porque la conversación roza el tema. Si lo que dice es ambiguo, le falta un dato importante, o no estás segura de que de verdad quiere ejecutar la acción ahora mismo, PREGÚNTALE primero en vez de adivinar -- nunca actives una herramienta "por si acaso". Solo actívala cuando la intención sea inequívoca (ej: "mándale la apuesta del Barcelona al VIP" sí es claro; "oye y cómo va lo del Barcelona" no lo es). Para registrar_cuadre en particular, nunca adivines el monto o la cuenta si no los dijo claro -- pregúntale.

Sobre guardar_recuerdo: úsala con más soltura que las demás -- cada vez que te diga algo sobre sí mismo, su negocio, su gente, sus procesos o sus preferencias que tenga sentido recordar en el futuro (ej: "mi colaborador se llama Ayrton", "los lunes reviso comisiones", "no me gusta que me manden la ganada sin el pick"), guárdalo, aunque también sigas conversando normal en el mismo turno. No guardes datos triviales de un solo momento (la hora actual, el clima, algo que claramente ya no aplicará mañana).${memoryBlock}${templatesBlock}

Hoy es ${new Date().toISOString().slice(0,10)} (zona horaria de Ecuador).`;
}

const TOOLS = [
  {
    name: 'abrir_formulario_apuesta',
    description: 'Abre el formulario para mandar una apuesta NUEVA o una GANADA a un grupo/comunidad. Úsala solo cuando el dueño lo pida de forma clara y específica.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['nueva_apuesta', 'ganada'] },
        destino: { type: 'string', description: 'Grupo o comunidad mencionado (VIP, gratis, etc.), si lo dijo.' }
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
  },
  {
    name: 'mandar_protocolo_manana',
    description: 'Manda ya mismo TODO lo que falte del protocolo fijo de la mañana (buenos días + publicidades de siempre) a las comunidades gratis, y el "buenos días" también al VIP -- lo mismo que se manda solo todos los días a las 8am. Si ya se mandó todo hoy, no hace nada. Si ya se mandó una parte a mano (con mandar_paso_protocolo_manana), solo manda lo que faltaba -- no repite lo ya enviado.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'mandar_paso_protocolo_manana',
    description: 'Manda ya mismo UNA SOLA pieza suelta del protocolo de la mañana (por ejemplo, solo "buenos días", sin el resto). Úsala cuando pida mandar nada más una parte específica del protocolo antes de las 8am. Esa pieza queda marcada como mandada hoy, así que ni el envío automático de las 8am ni un "manda todo el protocolo" posterior la repiten -- solo mandan lo que siga pendiente.',
    input_schema: {
      type: 'object',
      properties: {
        paso: {
          type: 'string',
          enum: ['buenos_dias', 'recargas_retiros', 'beneficios_recargar', 'apuesta_gratis'],
          description: 'Qué pieza mandar: buenos_dias, recargas_retiros, beneficios_recargar o apuesta_gratis.'
        }
      },
      required: ['paso']
    }
  },
  {
    name: 'subir_testimonio',
    description: 'Arranca el flujo para subir un TESTIMONIO: el dueño va a cargar una foto de un comprobante de recarga y/o transferencia de un cliente. El panel tapa automáticamente con negro todo lo que no sea el monto (teléfono, nombre, cédula, comprobante) y redacta un texto de testimonio usando solo el monto -- el dueño revisa antes de publicar. No necesita ningún dato más de ti, solo activa el flujo.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'mandar_stake_pago',
    description: 'Arranca el flujo para publicar un "stake de pago": el dueño va a cargar una foto del pick/stake, el panel lee la cuota, la hora y el valor de la imagen, arma la publicidad y la manda a los grupos -- y además prepara en la bandeja un mensaje individual para cada cliente que ya ha comprado stakes antes, avisándoles que hay uno disponible. No necesita ningún dato más de ti, solo activa el flujo.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'mandar_partidos_dia',
    description: 'Arranca el flujo para mandar los "partidos del día": el dueño va a cargar varias fotos (3 a 5, una por partido/pick) y el panel redacta UN SOLO texto que los presenta en conjunto. Se manda primero cada foto por separado y al final ese texto. No necesita ningún dato más de ti, solo activa el flujo.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'mandar_collage',
    description: 'Arranca el flujo para armar un COLLAGE: el dueño va a cargar varias capturas de comprobantes de recarga/pago (2 a 10) y el panel tapa automáticamente cada una (igual que un testimonio, solo queda visible el monto) y las junta en una sola imagen con un texto para publicar. No necesita ningún dato más de ti, solo activa el flujo.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'abrir_difusion',
    description: 'Abre (o manda directo, si ya sabe a cuál lista) una difusión: un aviso o promo masiva por WhatsApp a una lista de clientes (compradores de stakes, clientes fuertes, de Más Parlay, Ecuabet u OneXBet). Se manda uno por minuto, con varias versiones distintas del mismo texto, directo al número de cada cliente, sin revisión manual.',
    input_schema: {
      type: 'object',
      properties: {
        lista: { type: 'string', enum: ['stakes', 'fuertes', 'mas_parlay', 'ecuabet', 'onexbet'], description: 'A qué lista va la difusión, si lo dijo claro.' }
      }
    }
  },
  {
    name: 'mandar_publicidad_guardada',
    description: 'Manda una publicidad/imagen que el dueño YA TIENE GUARDADA con nombre fijo (ver la lista de publicidades guardadas abajo) a un grupo/comunidad. Úsala cuando pida mandar algo que ya existe guardado por su nombre -- no algo nuevo para redactar.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre (o algo muy parecido) de la publicidad guardada que pidió, tal como la mencionó.' },
        destino: { type: 'string', description: 'Grupo o comunidad al que debe ir, si lo dijo.' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'registrar_cuadre',
    description: 'Registra directamente un movimiento (ingreso o egreso de dinero) en el Cuadre Financiero, en la cuenta/caja que mencionó. No abre ningún formulario -- se registra solo y Win confirma hablando.',
    input_schema: {
      type: 'object',
      properties: {
        cuenta: { type: 'string', description: 'Cuenta o caja exacta (ver la lista de cuentas arriba), tal como la mencionó.' },
        tipo: { type: 'string', enum: ['ingreso', 'egreso'] },
        monto: { type: 'number', description: 'Monto en dólares.' },
        nota: { type: 'string', description: 'Nota corta sobre el movimiento, si la dio (ej: "depósito de Jhon").' }
      },
      required: ['cuenta', 'tipo', 'monto']
    }
  },
  {
    name: 'crear_seccion_stake',
    description: 'Crea una nueva sección/fecha de venta de stakes. No abre ningún formulario -- se crea sola y Win confirma hablando.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título de la sección si lo dijo (ej: "Stake Champions"). Si no dijo uno, déjalo vacío.' },
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD si la mencionó. Si no, déjalo vacío (se usa hoy).' },
        precio: { type: 'number', description: 'Precio por stake en dólares, si lo dijo.' }
      },
      required: []
    }
  },
  {
    name: 'registrar_venta_stake',
    description: 'Registra que una persona compró un stake en la sección actual/más reciente (o en la que mencionó). No abre ningún formulario para registrar -- el panel ya revisa solo si el comprador es conocido; si no lo es, el panel mismo avisa "contacto no encontrado" y abre el formulario manual, tú no tienes que decidir eso.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del comprador, tal como lo dijo.' },
        telefono: { type: 'string', description: 'Número de teléfono del comprador, si lo dio.' },
        seccion: { type: 'string', description: 'Título o fecha de la sección mencionada, si dijo a cuál se refiere. Si no, déjalo vacío (se usa la más reciente).' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'guardar_recuerdo',
    description: 'Guarda permanentemente algo duradero que el jefe contó (sobre él, su negocio, su gente o sus procesos) para poder usarlo en conversaciones futuras.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'El dato a recordar, resumido en una frase clara y corta, en tercera persona (ej: "Su colaborador se llama Ayrton").' }
      },
      required: ['texto']
    }
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
    const { messages, memory, publicidades } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      res.status(400).json({ error: 'No llegó ninguna conversación.' });
      return;
    }

    // El historial llega como [{role:'user'|'assistant', content:'texto'}], tal cual lo pide la API.
    // Anthropic EXIGE que los roles se alternen (user, assistant, user, assistant...) y que el
    // primer mensaje sea de "user" -- si dos mensajes seguidos quedan del mismo lado (ej: si una
    // llamada anterior falló a medio camino y no se guardó la respuesta de Win), la API devuelve
    // un 400 "invalid_request_error" y la conversación se queda trabada para siempre, repitiendo
    // el mismo error en cada intento. Por eso acá se fusionan los mensajes seguidos del mismo rol
    // (con salto de línea entre ellos) y se descarta cualquier mensaje de "assistant" que quede
    // primero, antes de mandarlo a la API.
    const rawMessages = messages
      .filter(m => m && m.content && typeof m.content === 'string')
      .slice(-20)
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
    const cleanMessages = [];
    for (const m of rawMessages) {
      const last = cleanMessages[cleanMessages.length - 1];
      if (last && last.role === m.role) last.content += `\n${m.content}`;
      else cleanMessages.push({ role: m.role, content: m.content });
    }
    while (cleanMessages.length && cleanMessages[0].role !== 'user') cleanMessages.shift();
    if (!cleanMessages.length) {
      res.status(400).json({ error: 'No llegó ninguna conversación válida.' });
      return;
    }

    const memoryLines = Array.isArray(memory) ? memory.filter(x => typeof x === 'string').slice(-80) : [];
    const templateNames = Array.isArray(publicidades) ? publicidades.filter(x => typeof x === 'string').slice(-60) : [];

    // A veces Anthropic devuelve un error pasajero (529 "overloaded", 429 por límite de
    // velocidad, o un 500/502/503 suyo) que se resuelve solo si se reintenta una vez -- antes
    // esto tumbaba la conversación con "No se pudo conectar con Win" aunque fuera cosa de un
    // segundo. Se reintenta UNA vez después de una pausa corta antes de darlo por fallido.
    async function llamarClaude() {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 500,
          system: buildSystemPrompt(memoryLines, templateNames),
          tools: TOOLS,
          messages: cleanMessages
        })
      });
    }

    let apiRes = await llamarClaude();
    if (!apiRes.ok && [429, 500, 502, 503, 529].includes(apiRes.status)) {
      await new Promise(r => setTimeout(r, 1200));
      apiRes = await llamarClaude();
    }

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error('Error de Anthropic:', apiRes.status, errText);
      res.status(502).json({ error: 'No se pudo conectar con Win (servicio de IA).', detalle: `${apiRes.status}: ${errText}`.slice(0, 300) });
      return;
    }

    const data = await apiRes.json();
    const blocks = data.content || [];
    const textBlock = blocks.find(b => b.type === 'text');
    const toolBlocks = blocks.filter(b => b.type === 'tool_use');

    res.status(200).json({
      textReply: textBlock ? textBlock.text.trim() : '',
      tools: toolBlocks.map(b => ({ name: b.name, input: b.input || {} }))
    });
  } catch (e) {
    console.error('Error en win-chat:', e);
    res.status(500).json({ error: 'No se pudo conectar con Win. Intenta de nuevo.' });
  }
};
