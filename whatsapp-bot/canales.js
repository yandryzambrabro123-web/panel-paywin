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
async function linkUnico(clave, nombre) {
  const c = await canalDe(clave);
  if (!c) return '';
  const r = await H.tg('createChatInviteLink', { chat_id: c.chatId, member_limit: 1, name: String(nombre || c.titulo || clave).slice(0, 32) });
  return r.invite_link || '';
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
  if (titulo) await H.tg('setChatTitle', { chat_id: c.chatId, title: String(titulo).slice(0, 128) }).catch(() => {});
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
  const msgs = (await H.leerHoja(HOJA_MSGS)).filter((f) => String(f.chatId) === String(c.chatId));
  let borrados = 0, noBorrados = 0;
  const pendientes = [];
  for (const f of msgs) {
    try { await H.tg('deleteMessage', { chat_id: c.chatId, message_id: Number(f.msgId) }); borrados++; }
    catch (e) { if (/not found|can't be deleted|message to delete/i.test(e.message)) noBorrados++; else { noBorrados++; pendientes.push(f); } }
    await pausa(60);
  }
  await H.cambiarHoja(HOJA_MIEMBROS, (filas) => [...filas.filter((m) => String(m.chatId) !== String(c.chatId)), ...quedan]);
  await H.cambiarHoja(HOJA_MSGS, (filas) => [...filas.filter((f) => String(f.chatId) !== String(c.chatId)), ...pendientes]);
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

module.exports = { montar, linkUnico, canalDe, publicar, vaciar };
