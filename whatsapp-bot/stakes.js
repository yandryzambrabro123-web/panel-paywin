// Registro de compradores del "Stake de pago" + aprobación por Telegram.
//
// Flujo:
//   1. El cliente abre  <url del bot>/stake  (link único), escribe su cédula (si ya compró antes se
//      le llenan los datos) y manda el registro.
//   2. Al jefe le llega un mensaje de Telegram con botones Aprobar / Rechazar.
//   3. Al aprobar: el cliente ve en esa misma pantalla el link del canal de Telegram de hoy (el que
//      se pegó al publicar el stake) y queda anotado como comprador en la sección de hoy de
//      "Venta de Stakes".
//   4. Si el link del canal pide aprobación para entrar, el bot acepta solo a quien ya fue
//      aprobado (comparando el usuario de Telegram). A cualquier otro le avisa al jefe con botones.
//
// No manda NADA a WhatsApp ni a ningún grupo: solo habla con el jefe por Telegram.
//
// Variables en Railway: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (las mismas de los recordatorios).
// El bot de Telegram debe ser administrador del canal (con permiso para invitar usuarios) para
// poder aceptar las solicitudes de ingreso.

const SHEETS = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
const HOJA_REGISTROS = 'RegistrosStake';
const HOJA_VENTAS = 'VentaStakes';
const HOJA_SECCIONES = 'SeccionesStakes';

const TG_TOKEN = () => String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TG_ADMIN = () => String(process.env.TELEGRAM_CHAT_ID || '').trim();

// Mensaje de bienvenida que recibe por privado quien entra al canal del stake de pago.
const MENSAJE_STAKE = (nombre) => `Hola${nombre ? ' ' + nombre : ''} 👋 ¿Qué tal?\n\nAcabas de adquirir el stake de pago de hoy. ¡Mucha suerte! 🍀\n\nRecuerda apostar siempre con responsabilidad y solo lo que puedas permitirte perder.`;

const hoyEC = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const normUser = (s) => String(s || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '').toLowerCase();
const limpio = (s, max = 80) => String(s || '').replace(/[<>]/g, '').trim().slice(0, max);

// ---- Hojas (leer / agregar o cambiar una fila, sin pisar lo que escriba el panel) ----
let cola = Promise.resolve();
function enCola(fn) { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; }

async function leerHoja(hoja) {
  const r = await fetch(`${SHEETS}?sheet=${hoja}`);
  const j = await r.json();
  return Array.isArray(j.data) ? j.data : [];
}
async function guardarHoja(hoja, data) {
  const r = await fetch(SHEETS, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ sheet: hoja, data }) });
  if (!r.ok) throw new Error('No se pudo guardar ' + hoja);
}
// Lee, aplica el cambio y guarda. Si la lectura falla NO guarda (así nunca se borra nada).
function cambiarHoja(hoja, fn) {
  return enCola(async () => {
    const filas = await leerHoja(hoja);
    const nuevas = fn(filas);
    await guardarHoja(hoja, nuevas);
    return nuevas;
  });
}

// Secciones de "Stake de pago" de los últimos 7 días, la más nueva primero.
async function seccionesAbiertas() {
  const desde = new Date(Date.now() - 5 * 60 * 60 * 1000 - 7 * 86400000).toISOString().slice(0, 10);
  const lista = (await leerHoja(HOJA_SECCIONES)).filter((s) => /stake de pago/i.test(String(s.title || '')) && String(s.day || '').slice(0, 10) >= desde);
  lista.sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.id).localeCompare(String(a.id)));
  return lista;
}

async function seccionDeHoy() {
  const hoy = hoyEC();
  const secs = (await leerHoja(HOJA_SECCIONES)).filter((s) => String(s.day || '').slice(0, 10) === hoy);
  const pago = secs.filter((s) => /stake de pago/i.test(String(s.title || '')));
  const lista = pago.length ? pago : [];
  lista.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return lista[0] || null;
}

// ---- Telegram ----
async function tg(metodo, cuerpo) {
  const token = TG_TOKEN();
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description || r.status}`);
  return j.result;
}
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function avisarJefe(reg, sec) {
  const texto = `🆕 <b>Registro de stake de pago</b>\n\n` +
    `Nombre: <b>${esc(reg.nombre)} ${esc(reg.apellido)}</b>\n` +
    `Cédula: ${esc(reg.cedula)}\n` +
    `Telegram: @${esc(reg.telegram)}\n` +
    `Teléfono: ${esc(reg.telefono)}\n` +
    `${reg.recurrente ? '🔁 Ya había comprado antes\n' : '✨ Cliente nuevo\n'}` +
    `Sección: ${esc(sec ? sec.title : 'sin sección')}`;
  await tg('sendMessage', {
    chat_id: TG_ADMIN(), text: texto, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✅ Aprobar', callback_data: 'ap:' + reg.id }, { text: '❌ Rechazar', callback_data: 're:' + reg.id }]] }
  });
}

// ---- Aprobar / rechazar un registro ----
async function resolverRegistro(id, aprobar) {
  let reg = null, ya = false;
  await cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => {
    if (String(f.id) !== String(id)) return f;
    reg = f;
    if (f.estado !== 'pendiente') { ya = true; return f; }
    return { ...f, estado: aprobar ? 'aprobado' : 'rechazado', resueltoAt: new Date().toISOString() };
  }));
  if (!reg) return { error: 'No encontré ese registro.' };
  if (ya) return { error: `Ese registro ya estaba ${reg.estado}.`, reg };
  if (aprobar) {
    // anota la venta en la sección de hoy (una sola vez por registro)
    const sec = reg.sectionId ? { id: reg.sectionId, price: Number(reg.price) || 0, day: reg.day || hoyEC() } : null;
    if (sec) {
      await cambiarHoja(HOJA_VENTAS, (filas) => {
        if (filas.some((v) => String(v.registroId || '') === String(reg.id))) return filas;
        return [...filas, {
          id: nuevoId(), sectionId: sec.id, day: sec.day,
          name: reg.nombre, apellido: reg.apellido, cedula: reg.cedula, telegram: reg.telegram,
          phone: reg.telefono, amount: sec.price, status: 'paid', registroId: reg.id
        }];
      });
    }
  }
  return { ok: true, reg };
}

// ---- Escucha de Telegram (botones y solicitudes de ingreso al canal) ----
let offset = 0;
let escuchando = false;
// Otros módulos (ej. vip.js) registran aquí sus botones de Telegram: prefijo -> función(cq, partes)
const manejadores = {};
const hooks = []; // funciones(update) que reciben TODOS los updates de Telegram (mensajes, miembros, etc.)
async function procesarUpdate(u) {
  for (const h of hooks) { try { await h(u); } catch (e) { console.error('Hook de Telegram:', e.message); } }
  if (u.callback_query) {
    const cq = u.callback_query;
    const deAdmin = String(cq.from && cq.from.id) === TG_ADMIN();
    const [accion, a, b] = String(cq.data || '').split(':');
    if (!deAdmin) { await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'No autorizado.' }).catch(() => {}); return; }
    try {
      if (accion === 'ap' || accion === 're') {
        const r = await resolverRegistro(a, accion === 'ap');
        const txt = r.error ? `⚠️ ${r.error}` : (accion === 'ap' ? '✅ Aprobado' : '❌ Rechazado');
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt });
        if (cq.message) await tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
      } else if (manejadores[accion]) {
        await manejadores[accion](cq, [a, b]);
      } else if (accion === 'jo' || accion === 'jn') {
        // solicitud de ingreso sin registro aprobado: a = chat_id del canal, b = user_id
        if (accion === 'jo') await tg('approveChatJoinRequest', { chat_id: a, user_id: Number(b) });
        else await tg('declineChatJoinRequest', { chat_id: a, user_id: Number(b) });
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: accion === 'jo' ? '✅ Dejé entrar' : '❌ Rechazado' });
        if (cq.message) await tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: accion === 'jo' ? '✅ Entró' : '❌ Rechazado', callback_data: 'x' }]] } }).catch(() => {});
      } else {
        await tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
      }
    } catch (e) {
      console.error('Error en botón de Telegram:', e.message);
      await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Error: ' + e.message.slice(0, 150), show_alert: true }).catch(() => {});
    }
    return;
  }
  if (u.chat_join_request) {
    const jr = u.chat_join_request;
    const usuario = normUser(jr.from && jr.from.username);
    let ok = false, regMatch = null;
    try {
      const hoy = hoyEC();
      const filas = await leerHoja(HOJA_REGISTROS);
      const limite48 = Date.now() - 48 * 3600e3;
      regMatch = !!usuario && filas.find((f) => f.estado === 'aprobado' && new Date(f.resueltoAt || f.createdAt || 0).getTime() >= limite48 && normUser(f.telegram) === usuario);
      ok = !!regMatch;
    } catch (e) { console.error('No pude revisar registros para la solicitud de ingreso:', e.message); }
    try {
      if (ok) {
        await tg('approveChatJoinRequest', { chat_id: jr.chat.id, user_id: jr.from.id });
        // Mensaje de bienvenida por privado (Telegram deja escribirle a quien pidió entrar, hasta 5 minutos después)
        try { await tg('sendMessage', { chat_id: jr.user_chat_id || jr.from.id, text: MENSAJE_STAKE(regMatch && regMatch.nombre) }); }
        catch (e) { console.error('No pude mandar la bienvenida del stake:', e.message); }
        await tg('sendMessage', { chat_id: TG_ADMIN(), text: `✅ Entró al canal @${jr.from.username} (ya estaba aprobado).` }).catch(() => {});
      } else {
        const quien = `${jr.from.first_name || ''} ${jr.from.last_name || ''}`.trim() + (jr.from.username ? ` (@${jr.from.username})` : ' (sin usuario)');
        await tg('sendMessage', {
          chat_id: TG_ADMIN(), parse_mode: 'HTML',
          text: `⚠️ <b>${esc(quien)}</b> pidió entrar al canal "${esc(jr.chat.title)}" pero NO tiene un registro aprobado hoy.`,
          reply_markup: { inline_keyboard: [[{ text: '✅ Dejar entrar', callback_data: `jo:${jr.chat.id}:${jr.from.id}` }, { text: '❌ Rechazar', callback_data: `jn:${jr.chat.id}:${jr.from.id}` }]] }
        });
      }
    } catch (e) { console.error('Error con la solicitud de ingreso:', e.message); }
  }
}

async function escuchar() {
  if (escuchando || !TG_TOKEN() || !TG_ADMIN()) return;
  escuchando = true;
  await tg('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
  for (;;) {
    try {
      const ups = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['callback_query', 'chat_join_request', 'message', 'channel_post', 'chat_member'] });
      for (const u of ups) { offset = u.update_id + 1; await procesarUpdate(u); }
    } catch (e) {
      console.error('Telegram (escucha):', e.message);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
}

// ---- Límite simple de peticiones por IP ----
const golpes = new Map();
function limite(req, res, max, ventanaMs) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const ahora = Date.now();
  const arr = (golpes.get(ip) || []).filter((t) => ahora - t < ventanaMs);
  if (arr.length >= max) { res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' }); return false; }
  arr.push(ahora); golpes.set(ip, arr); return true;
}

// ---- Buscar un cliente por cédula (registros anteriores + compras) ----
async function buscarCliente(cedula) {
  const ced = soloDigitos(cedula);
  if (ced.length < 8) return null;
  const regs = (await leerHoja(HOJA_REGISTROS)).filter((f) => soloDigitos(f.cedula) === ced && f.estado === 'aprobado');
  regs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (regs[0]) return { nombre: regs[0].nombre, apellido: regs[0].apellido, telegram: regs[0].telegram, telefono: regs[0].telefono };
  const ventas = (await leerHoja(HOJA_VENTAS)).filter((v) => soloDigitos(v.cedula) === ced);
  const v = ventas[ventas.length - 1];
  if (v) return { nombre: v.name || '', apellido: v.apellido || '', telegram: v.telegram || '', telefono: v.phone || '' };
  return null;
}

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro Stake de pago</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0d12;color:#f3ead6;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:20px}
.w{width:100%;max-width:440px}h1{font-size:22px;margin:18px 0 4px}p{color:#9aa3b2;font-size:14px;line-height:1.45}
.c{background:linear-gradient(180deg,#161a23,#10131a);border:1px solid rgba(212,175,106,.3);border-radius:16px;padding:20px;margin-top:16px}
label{display:block;font-size:12.5px;color:#9aa3b2;margin:14px 0 6px}input{width:100%;padding:13px;border-radius:10px;border:1px solid #2a3040;background:#0b0d12;color:#fff;font-size:16px}
select{width:100%;padding:13px;border-radius:10px;border:1px solid #2a3040;background:#0b0d12;color:#fff;font-size:16px}input:focus{outline:2px solid #D4AF6A;border-color:transparent}button,a.b{display:block;width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:linear-gradient(180deg,#e6c47e,#c79d4f);color:#1a1405;font-weight:700;font-size:16px;text-align:center;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5}.n{font-size:12.5px;color:#D4AF6A;margin-top:6px;min-height:16px}.e{color:#ff7a7a;font-size:13.5px;margin-top:12px}
</style></head><body><div class="w"><h1>Stake de pago</h1><p id="sub">Cargando…</p><div class="c" id="box"></div></div>
<script>
const $=s=>document.querySelector(s);let sec=null,timer=null;
const box=$('#box');
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function init(){
  try{const r=await fetch('/stake/hoy');const d=await r.json();
    if(!d.abierto){$('#sub').textContent='Hoy todavía no hay un stake de pago abierto. Vuelve a intentarlo cuando se anuncie.';box.style.display='none';return}
    sec=d;$('#sub').textContent='Elige el stake que compraste y completa tus datos para que aprobemos tu acceso.';form()
  }catch(e){$('#sub').textContent='No se pudo cargar. Intenta de nuevo.';box.style.display='none'}
}
function form(){
  box.innerHTML='<label>¿Qué stake compraste?</label><select id="sec">'+sec.secciones.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.titulo)+' · $'+s.precio+'</option>').join('')+'</select><label>Número de cédula</label><input id="ced" inputmode="numeric" maxlength="10" placeholder="1700000000" autocomplete="off"><div class="n" id="nota"></div>'+
  '<div id="resto" style="display:none"><label>Nombre</label><input id="nom" autocomplete="given-name"><label>Apellido</label><input id="ape" autocomplete="family-name">'+
  '<label>Usuario de Telegram</label><input id="tgu" placeholder="@tuusuario" autocapitalize="none" autocomplete="off"><label>Número de teléfono</label><input id="tel" inputmode="tel" maxlength="10" placeholder="0999999999">'+
  '<div class="e" id="err"></div><button id="env">Enviar registro</button></div>';
  let t=null;$('#ced').oninput=e=>{const v=e.target.value.replace(/\\D/g,'');e.target.value=v;clearTimeout(t);$('#nota').textContent='';
    if(v.length===10){t=setTimeout(()=>buscar(v),250)}else{$('#resto').style.display='none'}};
  $('#env').onclick=enviar;
}
async function buscar(c){
  $('#nota').textContent='Buscando…';
  try{const r=await fetch('/stake/cedula/'+c);const d=await r.json();
    if(d.found){$('#nom').value=d.nombre||'';$('#ape').value=d.apellido||'';$('#tgu').value=d.telegram?'@'+d.telegram:'';$('#tel').value=d.telefono||'';$('#nota').textContent='Ya estás registrado. Revisa tus datos y envía.'}
    else{$('#nom').value=$('#ape').value=$('#tgu').value=$('#tel').value='';$('#nota').textContent='Primera vez: completa tus datos.'}
    $('#resto').style.display='block';
  }catch(e){$('#nota').textContent='No pude buscar. Completa tus datos.';$('#resto').style.display='block'}
}
async function enviar(){
  const b=$('#env'),er=$('#err');er.textContent='';
  const body={sectionId:$('#sec').value,cedula:$('#ced').value,nombre:$('#nom').value,apellido:$('#ape').value,telegram:$('#tgu').value,telefono:$('#tel').value};
  if(!body.nombre.trim()||!body.apellido.trim()||!body.telegram.trim().replace('@','')||body.telefono.replace(/\\D/g,'').length<9){er.textContent='Completa todos los campos.';return}
  b.disabled=true;b.textContent='Enviando…';
  try{const r=await fetch('/stake/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error');espera(d.id)}catch(e){er.textContent=e.message;b.disabled=false;b.textContent='Enviar registro'}
}
function espera(id){
  box.innerHTML='<p style="color:#f3ead6;font-size:16px">⏳ Registro enviado. Estamos revisando tu pago; no cierres esta pantalla.</p>';
  const tick=async()=>{try{const r=await fetch('/stake/estado/'+id);const d=await r.json();
    if(d.estado==='aprobado'){clearInterval(timer);box.innerHTML='<p style="color:#7ee2a8;font-size:17px">✅ ¡Aprobado!</p><p>Entra al canal con el botón. Si te pide unirte, solicítalo con tu usuario de Telegram registrado.</p>'+(d.link?'<a class="b" href="'+esc(d.link)+'" target="_blank" rel="noopener">Entrar al canal de Telegram</a>':'<p>En un momento te pasamos el link por mensaje.</p>')}
    else if(d.estado==='rechazado'){clearInterval(timer);box.innerHTML='<p style="color:#ff7a7a;font-size:16px">No pudimos aprobar tu registro. Comunícate con la agencia.</p>'}
  }catch(e){}};
  timer=setInterval(tick,4000);
}
init();
</script></body></html>`;

function montar(app) {
  app.get('/stake', (req, res) => { res.set('Cache-Control', 'no-store').type('html').send(PAGINA); });

  // Diagnóstico (no muestra secretos): ¿el bot ve las variables de Telegram y el token funciona?
  app.get('/stake/diag', async (req, res) => {
    const out = { tokenConfigurado: !!TG_TOKEN(), chatIdConfigurado: !!TG_ADMIN(), escuchando };
    if (TG_TOKEN()) {
      try { const me = await tg('getMe', {}); out.bot = '@' + me.username; out.tokenValido = true; }
      catch (e) { out.tokenValido = false; out.error = e.message; }
    }
    res.json(out);
  });

  app.get('/stake/hoy', async (req, res) => {
    try {
      const secs = await seccionesAbiertas();
      if (!secs.length) return res.json({ abierto: false });
      res.json({ abierto: true, secciones: secs.map((x) => ({ id: x.id, titulo: x.title, precio: Number(x.price) || 0 })) });
    } catch (e) { res.status(500).json({ error: 'No se pudo consultar.' }); }
  });

  app.get('/stake/cedula/:ced', async (req, res) => {
    if (!limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      const c = await buscarCliente(req.params.ced);
      res.json(c ? { found: true, ...c } : { found: false });
    } catch (e) { res.json({ found: false }); }
  });

  app.post('/stake/registro', async (req, res) => {
    if (!limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      if (!TG_TOKEN() || !TG_ADMIN()) return res.status(500).json({ error: 'El registro no está configurado todavía.' });
      const b = req.body || {};
      const cedula = soloDigitos(b.cedula);
      const telefono = soloDigitos(b.telefono);
      const nombre = limpio(b.nombre), apellido = limpio(b.apellido);
      const telegram = normUser(limpio(b.telegram, 60));
      if (cedula.length !== 10) return res.status(400).json({ error: 'La cédula debe tener 10 dígitos.' });
      if (!nombre || !apellido) return res.status(400).json({ error: 'Falta tu nombre y apellido.' });
      if (!/^[a-z0-9_]{4,32}$/.test(telegram)) return res.status(400).json({ error: 'Revisa tu usuario de Telegram (sin espacios).' });
      if (telefono.length < 9 || telefono.length > 10) return res.status(400).json({ error: 'Revisa tu número de teléfono.' });
      const secs = await seccionesAbiertas();
      const sec = secs.find((x) => String(x.id) === String(b.sectionId)) || secs[0];
      if (!sec) return res.status(409).json({ error: 'No hay un stake de pago abierto.' });
      const hoy = hoyEC();
      const previo = !!(await buscarCliente(cedula));
      let reg = null, repetido = null;
      await cambiarHoja(HOJA_REGISTROS, (filas) => {
        repetido = filas.find((f) => f.sectionId === sec.id && soloDigitos(f.cedula) === cedula && f.estado !== 'rechazado');
        if (repetido) return filas;
        reg = { id: nuevoId(), createdAt: new Date().toISOString(), day: hoy, sectionId: sec.id, price: Number(sec.price) || 0, cedula, nombre, apellido, telegram, telefono, estado: 'pendiente', recurrente: previo, resueltoAt: '' };
        return [...filas, reg];
      });
      if (repetido) return res.json({ id: repetido.id, repetido: true });
      await avisarJefe(reg, sec).catch((e) => console.error('No pude avisar al jefe:', e.message));
      res.json({ id: reg.id });
    } catch (e) {
      console.error('Registro de stake:', e);
      res.status(500).json({ error: 'No se pudo enviar el registro. Intenta de nuevo.' });
    }
  });

  app.get('/stake/estado/:id', async (req, res) => {
    if (!limite(req, res, 20000, 10 * 60 * 1000)) return;
    try {
      const reg = (await leerHoja(HOJA_REGISTROS)).find((f) => String(f.id) === String(req.params.id));
      if (!reg) return res.json({ estado: 'desconocido' });
      if (reg.estado !== 'aprobado') return res.json({ estado: reg.estado });
      const sec = (await leerHoja(HOJA_SECCIONES)).find((s) => String(s.id) === String(reg.sectionId));
      res.json({ estado: 'aprobado', link: (sec && sec.telegramLink) || '' });
    } catch (e) { res.json({ estado: 'pendiente' }); }
  });

  escuchar().catch((e) => console.error('No arrancó la escucha de Telegram:', e.message));
}

module.exports = { montar, leerHoja, guardarHoja, cambiarHoja, tg, esc, hoyEC, nuevoId, soloDigitos, limpio, limite, manejadores, hooks, TG_ADMIN, TG_TOKEN };
