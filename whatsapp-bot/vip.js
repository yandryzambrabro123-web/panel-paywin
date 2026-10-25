// Registro público del grupo VIP + salida AUTOMÁTICA de los miembros vencidos.
//
// Entrada:
//   1. El cliente abre  <url del bot>/vip  (link único), llena sus datos (la fecha de ingreso se
//      pone sola con el día de hoy).
//   2. Al jefe le llega un mensaje de Telegram con botones: Aprobar (mensual / trimestral / anual)
//      o Rechazar. El plan lo elige el jefe al aprobar.
//   3. Al aprobar: el cliente ve en su pantalla el link del grupo VIP, y queda registrado en la hoja
//      "VIPs" del panel (si ya existía con esa cédula, se renueva en vez de duplicarse).
//
// Salida (automática, sin avisar al jefe por Telegram):
//   Todos los días desde las 9am (Ecuador), a cada miembro VIP cuya membresía ya venció el bot le
//   manda un mensaje privado de WhatsApp avisándole, lo saca de los grupos VIP y lo marca como
//   removido. Solo queda una anotación en la Bandeja del panel. Medidas de seguridad:
//     - Solo toca miembros creados DESPUÉS del corte del panel (los anteriores están "ocultos").
//     - Máximo MAX_POR_DIA personas por día.
//     - Si WhatsApp está desconectado o el bot no es admin, no marca nada y reintenta luego.
//     - Interruptor de emergencia: variable de Railway VIP_AUTO_OFF=1 (apaga las salidas automáticas).

let H = null; // helpers de stakes.js (se asignan en montar)

const HOJA_VIPS = 'VIPs';
const HOJA_REGISTROS = 'RegistrosVip';
const CORTE_MS = 1792930800000; // mismo corte que el panel (PANEL_CORTE_MS en index.html)
const PLAN_MESES = { mensual: 1, trimestral: 3, anual: 12 };
const VIP_JIDS = ['120363411532196622@g.us', '120363411657541281@g.us']; // VIP y VIP Más Parley
const VIP_LINK = 'https://chat.whatsapp.com/GQ0QxxU85LTH222xshkrrA';
const TELEFONO_AGENCIA = '0963852803';
const MAX_POR_DIA = 10;
const HORA_SALIDA_MIN = 9 * 60; // 9:00 Ecuador

const idMs = (id) => { const n = parseInt(String(id || '').slice(0, -5), 36); return Number.isFinite(n) ? n : 0; };
const esVigente = (v) => idMs(v.id) >= CORTE_MS; // creado después del corte del panel
const removido = (v) => !!v.joinDate && String(v.removidoVip) === String(v.joinDate);

function diasRestantes(v, hoy) {
  if (!v.joinDate) return null;
  const meses = PLAN_MESES[String(v.plan || 'mensual').toLowerCase()] || 1;
  const d = new Date(v.joinDate);
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + meses);
  return Math.ceil((new Date(d.toISOString().slice(0, 10)) - new Date(hoy)) / 86400000);
}
function telefonoWA(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('593')) return d;
  if (d.startsWith('0')) return '593' + d.slice(1);
  return d.length === 9 ? '593' + d : d;
}

async function novedad(tipo, titulo, detalle) {
  try {
    await cambiarHojaSafe('Novedades', (filas) => [{ id: H.nuevoId(), tipo, titulo, detalle: detalle || '', createdAt: new Date().toISOString(), leido: false }, ...filas].slice(0, 300));
  } catch (e) { console.error('No se pudo guardar la novedad VIP:', e.message); }
}
const cambiarHojaSafe = (hoja, fn) => H.cambiarHoja(hoja, fn);

// ---------- Salida automática de vencidos ----------
let salidasHoy = { fecha: '', n: 0 };
let corriendo = false;
const intentosFallidos = new Map(); // id -> veces que falló (para no insistir toda la tarde)

async function procesarVencidos(bot) {
  if (corriendo || process.env.VIP_AUTO_OFF === '1') return;
  const ahora = new Date(Date.now() - 5 * 3600e3);
  const hoy = ahora.toISOString().slice(0, 10);
  const minutos = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();
  if (minutos < HORA_SALIDA_MIN) return;
  if (!bot.conectado()) return;
  if (salidasHoy.fecha !== hoy) salidasHoy = { fecha: hoy, n: 0 };
  corriendo = true;
  try {
    // solo miembros activos creados después del corte; los que ya están "inactivos" o removidos se respetan
    const vips = (await H.leerHoja(HOJA_VIPS)).filter((v) => esVigente(v) && !removido(v) && String(v.status || 'active') !== 'inactive');
    const vencidos = vips.filter((v) => { const d = diasRestantes(v, hoy); return d !== null && d < 0; });
    for (const v of vencidos) {
      if (salidasHoy.n >= MAX_POR_DIA) break;
      if ((intentosFallidos.get(v.id) || 0) >= 3) continue;
      const num = telefonoWA(v.contact);
      if (num.length < 11) {
        intentosFallidos.set(v.id, 99);
        await novedad('alerta', `No pude sacar a ${v.name || 'un miembro'} del VIP`, 'Venció su membresía pero no tiene un teléfono válido. Sácalo a mano.');
        continue;
      }
      try {
        // 1) aviso privado (una sola vez por vencimiento)
        if (String(v.avisoVip) !== String(v.joinDate)) {
          const nombre = String(v.name || '').split(' ')[0] || '';
          const texto = `Hola ${nombre} 👋\n\nTu membresía VIP llegó a su fin. Gracias por haber sido parte del grupo 🙌\n\nSi quieres renovar y seguir recibiendo las apuestas, escríbenos al ${TELEFONO_AGENCIA} y te reactivamos.`;
          try {
            await bot.privado(num, texto);
            await cambiarHojaSafe(HOJA_VIPS, (filas) => filas.map((f) => String(f.id) === String(v.id) ? { ...f, avisoVip: String(f.joinDate) } : f));
          } catch (e) { console.error('No pude avisarle por privado a', v.name, e.message); }
        }
        // 2) sacarlo de los grupos VIP
        const res = await bot.sacar(num, VIP_JIDS);
        const todoBien = res.length > 0 && res.every((r) => r.ok);
        if (!todoBien) {
          intentosFallidos.set(v.id, (intentosFallidos.get(v.id) || 0) + 1);
          const motivo = res.filter((r) => !r.ok).map((r) => r.error || r.status).join(' | ');
          if ((intentosFallidos.get(v.id) || 0) >= 3) await novedad('alerta', `No pude sacar a ${v.name || 'un miembro'} del VIP`, `Venció su membresía. Motivo: ${motivo}. Sácalo a mano.`);
          continue;
        }
        // 3) marcarlo como removido (igual que el botón del panel)
        await cambiarHojaSafe(HOJA_VIPS, (filas) => filas.map((f) => String(f.id) === String(v.id) ? { ...f, removidoVip: String(f.joinDate), status: 'inactive' } : f));
        salidasHoy.n++;
        await novedad('vip', `${v.name || 'Un miembro'} salió del VIP por vencimiento`, `Se le avisó por WhatsApp y se le sacó de los grupos VIP.`);
      } catch (e) {
        console.error('Error sacando vencido', v.name, e.message);
        intentosFallidos.set(v.id, (intentosFallidos.get(v.id) || 0) + 1);
      }
    }
  } catch (e) {
    console.error('Revisión de vencidos VIP:', e.message);
  } finally { corriendo = false; }
}

// ---------- Registro público ----------
async function buscarVip(cedula) {
  const ced = String(cedula || '').replace(/\D/g, '');
  if (ced.length < 8) return null;
  const filas = (await H.leerHoja(HOJA_VIPS)).filter((v) => String(v.cedula || '').replace(/\D/g, '') === ced);
  filas.sort((a, b) => idMs(b.id) - idMs(a.id));
  return filas[0] || null;
}

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro VIP</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0d12;color:#f3ead6;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:20px}
.w{width:100%;max-width:440px}h1{font-size:22px;margin:18px 0 4px}p{color:#9aa3b2;font-size:14px;line-height:1.45}
.c{background:linear-gradient(180deg,#161a23,#10131a);border:1px solid rgba(212,175,106,.3);border-radius:16px;padding:20px;margin-top:16px}
label{display:block;font-size:12.5px;color:#9aa3b2;margin:14px 0 6px}input{width:100%;padding:13px;border-radius:10px;border:1px solid #2a3040;background:#0b0d12;color:#fff;font-size:16px}
input:focus{outline:2px solid #D4AF6A;border-color:transparent}input[disabled]{opacity:.7}button,a.b{display:block;width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:linear-gradient(180deg,#e6c47e,#c79d4f);color:#1a1405;font-weight:700;font-size:16px;text-align:center;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5}.n{font-size:12.5px;color:#D4AF6A;margin-top:6px;min-height:16px}.e{color:#ff7a7a;font-size:13.5px;margin-top:12px}
</style></head><body><div class="w"><h1>Registro VIP</h1><p>Completa tus datos para que aprobemos tu ingreso al grupo VIP.</p><div class="c" id="box"></div></div>
<script>
const $=s=>document.querySelector(s);let timer=null;const box=$('#box');
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function hoy(){const d=new Date(Date.now()-5*3600e3);return d.toISOString().slice(0,10)}
function form(){
  box.innerHTML='<label>Número de cédula</label><input id="ced" inputmode="numeric" maxlength="10" placeholder="1700000000" autocomplete="off"><div class="n" id="nota"></div>'+
  '<div id="resto" style="display:none"><label>Nombre</label><input id="nom" autocomplete="given-name"><label>Apellido</label><input id="ape" autocomplete="family-name">'+
  '<label>Ciudad</label><input id="ciu" autocomplete="address-level2"><label>Correo electrónico</label><input id="cor" type="email" inputmode="email" autocapitalize="none" autocomplete="email">'+
  '<label>Número de teléfono</label><input id="tel" inputmode="tel" maxlength="10" placeholder="0999999999"><label>Fecha de ingreso</label><input id="fec" disabled value="'+hoy()+'">'+
  '<div class="e" id="err"></div><button id="env">Enviar registro</button></div>';
  let t=null;$('#ced').oninput=e=>{const v=e.target.value.replace(/\\D/g,'');e.target.value=v;clearTimeout(t);$('#nota').textContent='';
    if(v.length===10){t=setTimeout(()=>buscar(v),250)}else{$('#resto').style.display='none'}};
  $('#env').onclick=enviar;
}
async function buscar(c){
  $('#nota').textContent='Buscando…';
  try{const r=await fetch('/vip/cedula/'+c);const d=await r.json();
    if(d.found){$('#nom').value=d.nombre||'';$('#ape').value=d.apellido||'';$('#ciu').value=d.ciudad||'';$('#cor').value=d.correo||'';$('#tel').value=d.telefono||'';$('#nota').textContent='Ya estás registrado. Revisa tus datos y envía.'}
    else{['nom','ape','ciu','cor','tel'].forEach(i=>$('#'+i).value='');$('#nota').textContent='Primera vez: completa tus datos.'}
    $('#resto').style.display='block';
  }catch(e){$('#nota').textContent='No pude buscar. Completa tus datos.';$('#resto').style.display='block'}
}
async function enviar(){
  const b=$('#env'),er=$('#err');er.textContent='';
  const body={cedula:$('#ced').value,nombre:$('#nom').value,apellido:$('#ape').value,ciudad:$('#ciu').value,correo:$('#cor').value,telefono:$('#tel').value};
  if(!body.nombre.trim()||!body.apellido.trim()||!body.ciudad.trim()||!body.correo.includes('@')||body.telefono.replace(/\\D/g,'').length<9){er.textContent='Completa todos los campos.';return}
  b.disabled=true;b.textContent='Enviando…';
  try{const r=await fetch('/vip/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error');espera(d.id)}catch(e){er.textContent=e.message;b.disabled=false;b.textContent='Enviar registro'}
}
function espera(id){
  box.innerHTML='<p style="color:#f3ead6;font-size:16px">⏳ Registro enviado. Estamos revisando tu pago; no cierres esta pantalla.</p>';
  const tick=async()=>{try{const r=await fetch('/vip/estado/'+id);const d=await r.json();
    if(d.estado==='aprobado'){clearInterval(timer);box.innerHTML='<p style="color:#7ee2a8;font-size:17px">✅ ¡Aprobado! Bienvenido al VIP.</p><p>Entra al grupo con el botón.</p><a class="b" href="'+esc(d.link)+'" target="_blank" rel="noopener">Entrar al grupo VIP</a>'}
    else if(d.estado==='rechazado'){clearInterval(timer);box.innerHTML='<p style="color:#ff7a7a;font-size:16px">No pudimos aprobar tu registro. Comunícate con la agencia.</p>'}
  }catch(e){}};
  timer=setInterval(tick,4000);
}
form();
</script></body></html>`;

function montar(app, stakes, bot) {
  H = stakes;

  // Botones de Telegram:  vp:<id>:<m|t|a> = aprobar con ese plan   vr:<id> = rechazar
  const PLANES = { m: 'mensual', t: 'trimestral', a: 'anual' };
  const marcar = async (cq, txt) => {
    await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
    if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
  };
  H.manejadores.vp = async (cq, [id, p]) => {
    const r = await aprobar(id, PLANES[p] || 'mensual');
    await marcar(cq, r.error ? `⚠️ ${r.error}` : `✅ Aprobado (${PLANES[p] || 'mensual'})`);
  };
  H.manejadores.vr = async (cq, [id]) => {
    let hecho = false, previo = null;
    await H.cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => {
      if (String(f.id) !== String(id)) return f;
      previo = f.estado; if (f.estado !== 'pendiente') return f; hecho = true;
      return { ...f, estado: 'rechazado', resueltoAt: new Date().toISOString() };
    }));
    await marcar(cq, hecho ? '❌ Rechazado' : `⚠️ Ya estaba ${previo || 'resuelto'}`);
  };

  async function aprobar(id, plan) {
    let reg = null, ya = false;
    await H.cambiarHoja(HOJA_REGISTROS, (filas) => filas.map((f) => {
      if (String(f.id) !== String(id)) return f;
      reg = f; if (f.estado !== 'pendiente') { ya = true; return f; }
      return { ...f, estado: 'aprobado', plan, resueltoAt: new Date().toISOString() };
    }));
    if (!reg) return { error: 'No encontré ese registro.' };
    if (ya) return { error: `Ese registro ya estaba ${reg.estado}.` };
    const hoy = H.hoyEC();
    const notas = `Correo: ${reg.correo}`;
    await H.cambiarHoja(HOJA_VIPS, (filas) => {
      const ced = String(reg.cedula).replace(/\D/g, '');
      const idx = filas.findIndex((v) => String(v.cedula || '').replace(/\D/g, '') === ced && esVigente(v));
      if (idx >= 0) { // renovación: la misma persona vuelve a pagar
        const f = filas[idx];
        const nuevas = filas.slice();
        nuevas[idx] = { ...f, name: `${reg.nombre} ${reg.apellido}`, contact: reg.telefono, city: reg.ciudad, plan, joinDate: hoy, status: 'active', removidoVip: '', avisoVip: '', notes: notas };
        return nuevas;
      }
      return [...filas, { id: H.nuevoId(), name: `${reg.nombre} ${reg.apellido}`, contact: reg.telefono, cedula: reg.cedula, city: reg.ciudad, plan, joinDate: hoy, notes: notas, status: 'active', noReconsumo: false, giftPending: false, removidoVip: '', avisoVip: '' }];
    });
    return { ok: true };
  }

  app.get('/vip', (req, res) => { res.set('Cache-Control', 'no-store').type('html').send(PAGINA); });

  app.get('/vip/cedula/:ced', async (req, res) => {
    if (!H.limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      const v = await buscarVip(req.params.ced);
      if (!v) return res.json({ found: false });
      const partes = String(v.name || '').trim().split(' ');
      const correo = (String(v.notes || '').match(/Correo:\s*(\S+)/) || [])[1] || '';
      res.json({ found: true, nombre: partes[0] || '', apellido: partes.slice(1).join(' '), ciudad: v.city || '', correo, telefono: v.contact || '' });
    } catch (e) { res.json({ found: false }); }
  });

  app.post('/vip/registro', async (req, res) => {
    if (!H.limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      if (!H.TG_TOKEN() || !H.TG_ADMIN()) return res.status(500).json({ error: 'El registro no está configurado todavía.' });
      const b = req.body || {};
      const cedula = H.soloDigitos(b.cedula), telefono = H.soloDigitos(b.telefono);
      const nombre = H.limpio(b.nombre), apellido = H.limpio(b.apellido), ciudad = H.limpio(b.ciudad), correo = H.limpio(b.correo, 100).toLowerCase();
      if (cedula.length !== 10) return res.status(400).json({ error: 'La cédula debe tener 10 dígitos.' });
      if (!nombre || !apellido || !ciudad) return res.status(400).json({ error: 'Completa nombre, apellido y ciudad.' });
      if (!/^\S+@\S+\.\S+$/.test(correo)) return res.status(400).json({ error: 'Revisa tu correo electrónico.' });
      if (telefono.length < 9 || telefono.length > 10) return res.status(400).json({ error: 'Revisa tu número de teléfono.' });
      const previo = await buscarVip(cedula);
      const hoy = H.hoyEC();
      let reg = null, repetido = null;
      await H.cambiarHoja(HOJA_REGISTROS, (filas) => {
        repetido = filas.find((f) => f.cedula === cedula && f.estado === 'pendiente');
        if (repetido) return filas;
        reg = { id: H.nuevoId(), createdAt: new Date().toISOString(), day: hoy, cedula, nombre, apellido, ciudad, correo, telefono, estado: 'pendiente', plan: '', recurrente: !!previo, resueltoAt: '' };
        return [...filas, reg];
      });
      if (repetido) return res.json({ id: repetido.id, repetido: true });
      const texto = `🆕 <b>Registro VIP</b>\n\nNombre: <b>${H.esc(nombre)} ${H.esc(apellido)}</b>\nCédula: ${H.esc(cedula)}\nCiudad: ${H.esc(ciudad)}\nCorreo: ${H.esc(correo)}\nTeléfono: ${H.esc(telefono)}\nIngreso: ${hoy}\n${previo ? '🔁 Ya había estado antes (se renueva)' : '✨ Cliente nuevo'}\n\nAprueba con el plan que pagó:`;
      await H.tg('sendMessage', {
        chat_id: H.TG_ADMIN(), text: texto, parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Mensual', callback_data: 'vp:' + reg.id + ':m' }, { text: '✅ Trimestral', callback_data: 'vp:' + reg.id + ':t' }, { text: '✅ Anual', callback_data: 'vp:' + reg.id + ':a' }], [{ text: '❌ Rechazar', callback_data: 'vr:' + reg.id }]] }
      }).catch((e) => console.error('No pude avisar al jefe (VIP):', e.message));
      res.json({ id: reg.id });
    } catch (e) {
      console.error('Registro VIP:', e);
      res.status(500).json({ error: 'No se pudo enviar el registro. Intenta de nuevo.' });
    }
  });

  app.get('/vip/estado/:id', async (req, res) => {
    if (!H.limite(req, res, 20000, 10 * 60 * 1000)) return;
    try {
      const reg = (await H.leerHoja(HOJA_REGISTROS)).find((f) => String(f.id) === String(req.params.id));
      if (!reg) return res.json({ estado: 'desconocido' });
      res.json(reg.estado === 'aprobado' ? { estado: 'aprobado', link: VIP_LINK } : { estado: reg.estado });
    } catch (e) { res.json({ estado: 'pendiente' }); }
  });

  // Revisión de vencidos cada 10 minutos (hace algo solo desde las 9am y si hay alguien vencido).
  setInterval(() => { procesarVencidos(bot).catch((e) => console.error('vencidos VIP:', e.message)); }, 10 * 60 * 1000);
  setTimeout(() => { procesarVencidos(bot).catch(() => {}); }, 90 * 1000);
}

module.exports = { montar, diasRestantes, procesarVencidos };
