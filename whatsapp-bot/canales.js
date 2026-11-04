// Canales privados de TELEGRAM: "Stake de pago" y "Regalito del día".
//
// Configuración (una sola vez): crea cada canal privado y agrega al bot como ADMINISTRADOR
// (publicar, borrar mensajes, invitar por enlace, banear usuarios). El bot detecta el canal solo por su
// nombre (que contenga "stake" o "regalito") y te avisa por Telegram. Si el nombre no coincide, escribe
// /canalstake o /canalregalito dentro del canal.
//
// Qué hace:
//   - Publica fotos/textos en el canal (desde el panel).
//   - Crea un link de UN SOLO USO por cliente aprobado, con el nombre del canal/fecha.
//   - Anota los miembros que entran y los mensajes del canal.
//   - "Vaciar" (solo cuando TÚ lo pides desde el panel): saca a los miembros y borra el contenido anotado.
//     Nunca se vacía solo.

let H = null;

const HOJA_CANALES = 'CanalesTg';
const HOJA_MSGS = 'CanalMsgs';
const HOJA_MIEMBROS = 'CanalMiembros';
const CLAVES = ['stake', 'regalito'];
const MAX_MSGS = 3000;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const aHtml = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
const claveDeTitulo = (t) => (/regalito/i.test(t || '') ? 'regalito' : /stake/i.test(t || '') ? 'stake' : '');

async function canalDe(clave) {
  const fila = (await H.leerHoja(HOJA_CANALES)).find((f) => f.clave === clave);
  return fila && fila.chatId ? fila : null;
}
async function guardarCanal(clave, chat) {
  await H.cambiarHoja(HOJA_CANALES, (filas) => [...filas.filter((f) => f.clave !== clave), { clave, chatId: String(chat.id), titulo: chat.title || '', actualizado: new Date().toISOString() }]);
}
async function anotarMsg(chatId, msgId) {
  if (!chatId || !msgId) return;
  await H.cambiarHoja(HOJA_MSGS, (filas) => {
    if (filas.some((f) => String(f.chatId) === String(chatId) && String(f.msgId) === String(msgId))) return filas;
    return [...filas, { chatId: String(chatId), msgId: String(msgId), at: new Date().toISOString() }].slice(-MAX_MSGS);
  });
}

// Link de un solo uso para un cliente. Devuelve '' si el canal no está configurado.
// Sin "pedir ingreso": el jefe ya aprobó al registrarlo, así que la persona entra de una (el link sirve a 1 sola persona).
async function linkUnico(clave, nombre) {
  const c = await canalDe(clave);
  if (!c) return '';
  const r = await H.tg('createChatInviteLink', { chat_id: c.chatId, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 72 * 3600, name: String(nombre || c.titulo || clave).slice(0, 32) });
  return r.invite_link || '';
}

// Link de WhatsApp para abrir el chat de ese número (Ecuador).
function waLink(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length < 9) return '';
  if (d.startsWith('593')) return 'https://wa.me/' + d;
  if (d.startsWith('0')) d = d.slice(1);
  return 'https://wa.me/593' + d;
}

// Al aprobar un registro: crea (o reutiliza) su link de un solo uso y se lo manda al jefe con el teléfono,
// para que pueda pasárselo por WhatsApp aunque la persona ya haya cerrado la página. No manda nada al cliente.
async function avisarLinkAprobado(clave, hoja, reg) {
  try {
    const c = await canalDe(clave);
    if (!c || !reg) return;
    const fila = (await H.leerHoja(hoja)).find((f) => String(f.id) === String(reg.id)) || reg;
    let unico = fila.linkUnico || '';
    if (!unico) {
      const nombre = `${clave === 'stake' ? 'Stake' : 'Regalito'} ${fila.day || H.hoyEC()} ${fila.nombre || ''}`.trim();
      unico = await linkUnico(clave, nombre);
      if (unico) await H.cambiarHoja(hoja, (filas) => filas.map((f) => String(f.id) === String(fila.id) ? { ...f, linkUnico: unico } : f));
    }
    if (!unico) return;
    const quien = `${fila.nombre || ''} ${fila.apellido || ''}`.trim() || 'cliente';
    const wa = waLink(fila.telefono);
    await H.tg('sendMessage', {
      chat_id: H.TG_ADMIN(), parse_mode: 'HTML', disable_web_page_preview: true,
      text: `🔗 <b>${H.esc(quien)}</b> — ${clave === 'stake' ? 'stake de pago' : 'regalito'}\nTeléfono: ${H.esc(fila.telefono || 'sin teléfono')}\n\nLink de un solo uso (entra directo, sin que apruebes otra vez). Si no lo ve en pantalla, mándaselo tú:\n${unico}`,
      ...(wa ? { reply_markup: { inline_keyboard: [[{ text: '💬 Abrir su chat de WhatsApp', url: wa }]] } } : {})
    });
  } catch (e) { console.error('Aviso de link aprobado:', e.message); }
}

async function enviarFoto(chat_id, img, caption) {
  if (img.url) return H.tg('sendPhoto', { chat_id, photo: img.url, ...(caption ? { caption: aHtml(caption), parse_mode: 'HTML' } : {}) });
  const fd = new FormData();
  fd.append('chat_id', chat_id);
  if (caption) { fd.append('caption', aHtml(caption)); fd.append('parse_mode', 'HTML'); }
  fd.append('photo', new Blob([Buffer.from(img.base64, 'base64')], { type: img.mediaType || 'image/jpeg' }), 'foto.jpg');
  const r = await fetch(`https://api.telegram.org/bot${H.TG_TOKEN()}/sendPhoto`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram sendPhoto: ' + (j.description || r.status));
  return j.result;
}

async function publicar({ clave, texto, imagenes, titulo }) {
  const c = await canalDe(clave);
  if (!c) throw new Error(`Falta el canal de ${clave}: crea el canal privado, agrega al bot como administrador y avísame.`);
  if (titulo) { // renombra el canal solo si cambió el nombre (ej. "STAKE DE PAGO 1 DE NOVIEMBRE DE 2026")
    const nuevo = String(titulo).slice(0, 128);
    if (nuevo !== c.titulo) {
      try { await H.tg('setChatTitle', { chat_id: c.chatId, title: nuevo }); await guardarCanal(clave, { id: c.chatId, title: nuevo }); }
      catch (e) { console.error('No pude renombrar el canal:', e.message); }
    }
  }
  const fotos = (imagenes || []).filter((i) => i && (i.base64 || i.url));
  const t = String(texto || '');
  const enviados = [];
  if (fotos.length === 1 && t.length <= 1000) enviados.push(await enviarFoto(c.chatId, fotos[0], t));
  else {
    for (const f of fotos) enviados.push(await enviarFoto(c.chatId, f, ''));
    if (t) enviados.push(await H.tg('sendMessage', { chat_id: c.chatId, text: aHtml(t), parse_mode: 'HTML' }));
  }
  for (const m of enviados) await anotarMsg(c.chatId, m.message_id);
  return { ok: true, enviados: enviados.length };
}

// Saca a los miembros anotados (ban + unban: pueden volver con un link nuevo) y borra los mensajes anotados.
async function vaciar({ clave, conservar }) {
  const c = await canalDe(clave);
  if (!c) throw new Error(`Falta el canal de ${clave}.`);
  const fijos = new Set((conservar || []).map(String));
  const miembros = (await H.leerHoja(HOJA_MIEMBROS)).filter((m) => String(m.chatId) === String(c.chatId));
  let sacados = 0, fallos = 0, conservados = 0;
  const quedan = [];
  for (const m of miembros) {
    if (fijos.has(String(m.userId))) { conservados++; quedan.push(m); continue; }
    try {
      await H.tg('banChatMember', { chat_id: c.chatId, user_id: Number(m.userId) });
      await H.tg('unbanChatMember', { chat_id: c.chatId, user_id: Number(m.userId), only_if_banned: true });
      sacados++;
    } catch (e) { fallos++; quedan.push(m); }
    await pausa(120);
  }
  // Borra TODO el contenido: manda un mensaje de prueba para saber cuál es el último código y borra de 1 hasta ese
  // código en tandas de 100 (lo que no existe se ignora).
  let borrados = 0, noBorrados = 0;
  const pendientes = [];
  try {
    const sonda = await H.tg('sendMessage', { chat_id: c.chatId, text: '🧹', disable_notification: true });
    const ultimo = sonda.message_id;
    for (let ini = 1; ini <= ultimo; ini += 100) {
      const ids = []; for (let i = ini; i < ini + 100 && i <= ultimo; i++) ids.push(i);
      try { await H.tg('deleteMessages', { chat_id: c.chatId, message_ids: ids }); borrados += ids.length; }
      catch (e) {
        for (const id of ids) { try { await H.tg('deleteMessage', { chat_id: c.chatId, message_id: id }); borrados++; } catch (e2) { noBorrados++; } }
      }
      await pausa(150);
    }
  } catch (e) { throw new Error('No pude borrar el contenido: ' + e.message); }
  await H.cambiarHoja(HOJA_MIEMBROS, (filas) => [...filas.filter((m) => String(m.chatId) !== String(c.chatId)), ...quedan]);
  await H.cambiarHoja(HOJA_MSGS, (filas) => filas.filter((f) => String(f.chatId) !== String(c.chatId)));
  return { ok: true, sacados, conservados, fallos, borrados, noBorrados };
}

function montar(app, stakes, extra) {
  H = stakes;
  const requireApiKey = (extra && extra.requireApiKey) || ((req, res) => res.status(500).json({ error: 'Sin clave configurada.' }));

  H.hooks.push(async (u) => {
    // El bot fue agregado como administrador de un canal -> lo guarda y avisa
    const mc = u.my_chat_member;
    if (mc && mc.chat && mc.chat.type === 'channel' && mc.new_chat_member && mc.new_chat_member.status === 'administrator') {
      const clave = claveDeTitulo(mc.chat.title);
      if (clave) {
        await guardarCanal(clave, mc.chat);
        await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `✅ Canal de ${clave === 'stake' ? 'stake de pago' : 'regalito'} guardado: "${mc.chat.title}" (código ${mc.chat.id}).` }).catch(() => {});
      } else {
        await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `Me agregaron como admin al canal "${mc.chat.title}" pero su nombre no dice "stake" ni "regalito". Escribe /canalstake o /canalregalito dentro del canal para guardarlo.` }).catch(() => {});
      }
    }
    // Mensajes del canal (los anota para poder borrarlos) y comandos de configuración
    const cp = u.channel_post;
    if (cp && cp.chat) {
      const c1 = CLAVES.find((k) => new RegExp('^/canal' + k + '(@\\w+)?$', 'i').test(String(cp.text || '').trim()));
      if (c1) {
        await guardarCanal(c1, cp.chat);
        await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `✅ Canal de ${c1 === 'stake' ? 'stake de pago' : 'regalito'} guardado: "${cp.chat.title}".` }).catch(() => {});
        await H.tg('deleteMessage', { chat_id: cp.chat.id, message_id: cp.message_id }).catch(() => {});
        return;
      }
      const guardados = await H.leerHoja(HOJA_CANALES);
      if (guardados.some((f) => String(f.chatId) === String(cp.chat.id))) await anotarMsg(cp.chat.id, cp.message_id);
    }
    // Alguien entró o salió del canal
    const cm = u.chat_member;
    if (cm && cm.chat && cm.new_chat_member) {
      const guardados = await H.leerHoja(HOJA_CANALES);
      if (!guardados.some((f) => String(f.chatId) === String(cm.chat.id))) return;
      const us = cm.new_chat_member.user;
      if (['member', 'administrator'].includes(cm.new_chat_member.status) && !us.is_bot) {
        await H.cambiarHoja(HOJA_MIEMBROS, (filas) => filas.some((m) => String(m.chatId) === String(cm.chat.id) && String(m.userId) === String(us.id)) ? filas
          : [...filas, { chatId: String(cm.chat.id), userId: String(us.id), usuario: us.username || '', nombre: `${us.first_name || ''} ${us.last_name || ''}`.trim(), link: (cm.invite_link && cm.invite_link.name) || '', at: new Date().toISOString() }]);
      } else if (['left', 'kicked'].includes(cm.new_chat_member.status)) {
        await H.cambiarHoja(HOJA_MIEMBROS, (filas) => filas.filter((m) => !(String(m.chatId) === String(cm.chat.id) && String(m.userId) === String(us.id))));
      }
    }
  });

  app.get('/canal/estado', requireApiKey, async (req, res) => {
    try {
      const out = {};
      for (const k of CLAVES) {
        const c = await canalDe(k);
        out[k] = c ? { configurado: true, titulo: c.titulo, miembros: (await H.leerHoja(HOJA_MIEMBROS)).filter((m) => String(m.chatId) === String(c.chatId)).length } : { configurado: false };
      }
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/canal/publicar', requireApiKey, async (req, res) => {
    try {
      const b = req.body || {};
      if (!CLAVES.includes(b.clave)) return res.status(400).json({ error: 'Canal inválido.' });
      res.json(await publicar({ clave: b.clave, texto: b.texto, imagenes: b.imagenes, titulo: b.titulo }));
    } catch (e) { console.error('Publicar en canal:', e); res.status(500).json({ error: e.message }); }
  });

  app.post('/canal/vaciar', requireApiKey, async (req, res) => {
    try {
      const b = req.body || {};
      if (!CLAVES.includes(b.clave)) return res.status(400).json({ error: 'Canal inválido.' });
      res.json(await vaciar({ clave: b.clave, conservar: b.conservar }));
    } catch (e) { console.error('Vaciar canal:', e); res.status(500).json({ error: e.message }); }
  });
}

// Solicitud de ingreso a uno de los canales (stake/regalito). Devuelve true si el canal es de los nuestros (ya se atendió).
// Entra solo si el link usado es el de un registro aprobado y nadie más lo ha usado; en cualquier otro caso pregunta al jefe.
async function manejarIngreso(jr) {
  const canales = await H.leerHoja(HOJA_CANALES);
  const canal = canales.find((f) => String(f.chatId) === String(jr.chat.id));
  if (!canal) return false;
  const url = (jr.invite_link && jr.invite_link.invite_link) || '';
  const hoja = canal.clave === 'regalito' ? 'RegistrosRegalito' : 'RegistrosStake';
  const reg = url ? (await H.leerHoja(hoja)).find((f) => f.estado === 'aprobado' && f.linkUnico === url) : null;
  const quien = `${jr.from.first_name || ''} ${jr.from.last_name || ''}`.trim() + (jr.from.username ? ` (@${jr.from.username})` : ' (sin usuario)');
  if (reg && (!reg.entroId || String(reg.entroId) === String(jr.from.id))) {
    await H.tg('approveChatJoinRequest', { chat_id: jr.chat.id, user_id: jr.from.id });
    if (!reg.entroId) await H.cambiarHoja(hoja, (filas) => filas.map((f) => String(f.id) === String(reg.id) ? { ...f, entroId: String(jr.from.id) } : f));
    return true;
  }
  const motivo = reg ? `Ese link ya lo usó otra persona (de ${reg.nombre || 'un cliente'}).` : 'Entró con un link que no corresponde a un registro aprobado.';
  await H.tg('sendMessage', {
    chat_id: H.TG_ADMIN(), parse_mode: 'HTML',
    text: `⚠️ <b>${H.esc(quien)}</b> pidió entrar a "${H.esc(jr.chat.title)}".\n${motivo}`,
    reply_markup: { inline_keyboard: [[{ text: '✅ Dejar entrar', callback_data: `jo:${jr.chat.id}:${jr.from.id}` }, { text: '❌ Rechazar', callback_data: `jn:${jr.chat.id}:${jr.from.id}` }]] }
  });
  return true;
}

module.exports = { montar, linkUnico, waLink, avisarLinkAprobado, canalDe, publicar, vaciar, manejarIngreso };
