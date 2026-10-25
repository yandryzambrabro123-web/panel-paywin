// Regalito del día (Telegram) + disponibilidad de stakes de pago.
//
// REGALITO
//   - Desde el panel (Win > "Mandar regalito del día") se publica el regalito con el link del grupo de
//     Telegram: queda HABILITADO 8 horas.
//   - Link fijo para los clientes:  <url del bot>/regalito . El cliente escribe a nombre de quién va el
//     regalito y le llega al jefe un mensaje de Telegram: Aprobar / A la cola / Rechazar.
//   - Aprobar con el regalito habilitado -> al cliente le sale el link del grupo.
//   - Si el regalito no está habilitado (ya se jugó, pasaron las 8 horas o todavía no sale), el cliente queda
//     EN COLA ("todavía no está disponible, estás en la cola"). Cuando el jefe publica el regalito siguiente,
//     cada persona en cola le llega al jefe como un mensaje de aprobación aparte.
//   - A las 5 horas de publicado, el bot le pregunta al jefe si el regalito sigue disponible o ya se jugó.
//
// STAKES DE PAGO
//   - A las 5 horas de publicado el stake, el bot pregunta si sigue disponible. Si dice que ya se jugó, los
//     pagos que apruebe después quedan "en cola" (cobrados) y el link se les muestra cuando se publique el
//     siguiente stake de pago.

let H = null;

const HOJA_DIA = 'RegalitosDia';
const HOJA_REG = 'RegistrosRegalito';
const HOJA_DISP = 'DispStake';
const HOJA_SECCIONES = 'SeccionesStakes';
const HOJA_REGISTROS_STAKE = 'RegistrosStake';
const HORAS_HABILITADO = 8;
const HORAS_PREGUNTA = 5;
const idMs = (id) => { const n = parseInt(String(id || '').slice(0, -5), 36); return Number.isFinite(n) ? n : 0; };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGINA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Regalito del día</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0d12;color:#f3ead6;font-family:Inter,system-ui,sans-serif;display:flex;justify-content:center;padding:20px}
.w{width:100%;max-width:440px}h1{font-size:22px;margin:18px 0 4px}p{color:#9aa3b2;font-size:14px;line-height:1.45}
.c{background:linear-gradient(180deg,#161a23,#10131a);border:1px solid rgba(212,175,106,.3);border-radius:16px;padding:20px;margin-top:16px}
label{display:block;font-size:12.5px;color:#9aa3b2;margin:0 0 6px}input{width:100%;padding:13px;border-radius:10px;border:1px solid #2a3040;background:#0b0d12;color:#fff;font-size:16px}
input:focus{outline:2px solid #D4AF6A;border-color:transparent}button,a.b{display:block;width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:linear-gradient(180deg,#e6c47e,#c79d4f);color:#1a1405;font-weight:700;font-size:16px;text-align:center;text-decoration:none;cursor:pointer}
button:disabled{opacity:.5}.e{color:#ff7a7a;font-size:13.5px;margin-top:12px}
</style></head><body><div class="w"><h1>Regalito del día 🎁</h1><p>Escribe a nombre de quién va el regalito. Lo revisamos y te mostramos el link del grupo.</p><div class="c" id="box"></div></div>
<script>
const $=s=>document.querySelector(s);let timer=null;const box=$('#box');
function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function guardar(id){try{localStorage.setItem('rgId',id)}catch(e){}}
function leer(){try{return localStorage.getItem('rgId')||''}catch(e){return ''}}
function limpiar(){try{localStorage.removeItem('rgId')}catch(e){}}
function form(){
  box.innerHTML='<label>Asignar el regalito a nombre de</label><input id="nom" autocomplete="name" placeholder="Nombre y apellido"><div class="e" id="err"></div><button id="env">Pedir mi regalito</button>';
  $('#env').onclick=enviar;
}
async function enviar(){
  const b=$('#env'),er=$('#err');er.textContent='';
  const nombre=$('#nom').value.trim();
  if(nombre.length<3){er.textContent='Escribe el nombre completo.';return}
  b.disabled=true;b.textContent='Enviando…';
  try{const r=await fetch('/regalito/registro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre})});const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error');guardar(d.id);espera(d.id)}catch(e){er.textContent=e.message;b.disabled=false;b.textContent='Pedir mi regalito'}
}
function pinta(d,id){
  if(d.estado==='aprobado'){clearInterval(timer);limpiar();box.innerHTML='<p style="color:#7ee2a8;font-size:17px">✅ ¡Aprobado! Tu regalito está listo.</p><a class="b" href="'+esc(d.link)+'" target="_blank" rel="noopener">Entrar al grupo del regalito</a>';return true}
  if(d.estado==='rechazado'){clearInterval(timer);limpiar();box.innerHTML='<p style="color:#ff7a7a;font-size:16px">No pudimos aprobar tu solicitud. Comunícate con la agencia.</p>';return true}
  if(d.estado==='cola'){box.innerHTML='<p style="color:#D4AF6A;font-size:16px">🕒 El regalito todavía no está disponible, pero ya estás en la cola.</p><p>Cuando salga el siguiente regalito te lo mostramos aquí. Puedes cerrar esta pantalla y volver a abrir este mismo link.</p>';return false}
  box.innerHTML='<p style="color:#f3ead6;font-size:16px">⏳ Solicitud enviada. La estamos revisando; no cierres esta pantalla.</p>';return false;
}
function espera(id){
  clearInterval(timer);
  const tick=async()=>{try{const r=await fetch('/regalito/estado/'+id);const d=await r.json();
    if(d.estado==='desconocido'){clearInterval(timer);limpiar();form();return}
    pinta(d,id)}catch(e){}};
  tick();timer=setInterval(tick,5000);
}
const previo=leer();
if(previo){fetch('/regalito/estado/'+previo).then(r=>r.json()).then(d=>{if(d.estado==='pendiente'||d.estado==='cola'){espera(previo)}else{limpiar();form()}}).catch(form)}else form();
</script></body></html>`;

// ---- Regalito vigente ----
async function regalitoVigente() {
  const filas = await H.leerHoja(HOJA_DIA);
  const hab = filas.filter((r) => r.estado === 'habilitado').sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0];
  if (!hab) return null;
  if (Date.now() >= Date.parse(hab.publishedAt) + HORAS_HABILITADO * 3600e3) return null;
  return hab;
}

async function avisarRegistro(reg, extra) {
  const texto = `🎁 <b>Regalito del día${extra ? ' (de la cola)' : ''}</b>\n\nA nombre de: <b>${H.esc(reg.nombre)}</b>\nPedido: ${H.esc(reg.day)}\n\n¿Lo apruebo?`;
  await H.tg('sendMessage', {
    chat_id: H.TG_ADMIN(), text: texto, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '✅ Aprobar', callback_data: 'ga:' + reg.id }, { text: '🕒 A la cola', callback_data: 'gq:' + reg.id }, { text: '❌ Rechazar', callback_data: 'gx:' + reg.id }]] }
  });
}

// Publica el regalito del día (lo llama el panel). Cierra el anterior y pasa la cola a aprobación.
async function publicar(link) {
  const ahora = new Date().toISOString();
  const nuevo = { id: H.nuevoId(), publishedAt: ahora, day: H.hoyEC(), link, estado: 'habilitado', preguntado: '' };
  await H.cambiarHoja(HOJA_DIA, (filas) => [...filas.map((f) => f.estado === 'habilitado' ? { ...f, estado: 'cerrado' } : f), nuevo]);
  let liberados = [];
  await H.cambiarHoja(HOJA_REG, (filas) => filas.map((f) => {
    if (f.estado !== 'cola') return f;
    const n = { ...f, estado: 'pendiente' }; liberados.push(n); return n;
  }));
  // un mensaje de aprobación por persona (tuk, tuk, tuk)
  for (const r of liberados) { await avisarRegistro(r, true).catch((e) => console.error('Aviso de cola:', e.message)); await pausa(400); }
  return { ok: true, id: nuevo.id, enCola: liberados.length };
}

// ---- Stakes: disponibilidad ----
async function stakeCerrado(sectionId) {
  if (!sectionId) return false;
  const f = (await H.leerHoja(HOJA_DISP)).find((r) => String(r.sectionId) === String(sectionId));
  return !!f && f.estado === 'cerrado';
}

async function revisarStakes() {
  const secs = (await H.leerHoja(HOJA_SECCIONES)).filter((s) => /stake de pago/i.test(String(s.title || '')));
  if (!secs.length) return;
  secs.sort((a, b) => idMs(b.id) - idMs(a.id));
  const disp = await H.leerHoja(HOJA_DISP);
  const conocidas = new Set(disp.map((d) => String(d.sectionId)));
  const nuevas = secs.filter((s) => !conocidas.has(String(s.id)));
  if (nuevas.length) {
    const masNueva = secs[0];
    const primeraVez = disp.length === 0;
    await H.cambiarHoja(HOJA_DISP, (filas) => {
      const base = filas.map((f) => f);
      for (const s of nuevas) {
        const esUltima = String(s.id) === String(masNueva.id);
        const reciente = Date.now() - idMs(s.id) < 12 * 3600e3;
        // las secciones viejas que encuentra por primera vez no preguntan nada
        base.push({ sectionId: s.id, publishedAt: new Date(idMs(s.id)).toISOString(), estado: esUltima && (reciente || !primeraVez) ? 'habilitado' : 'cerrado', preguntado: esUltima && reciente ? '' : 'si' });
      }
      // al salir un stake nuevo, los anteriores terminaron
      return base.map((f) => (String(f.sectionId) !== String(masNueva.id) && f.estado === 'habilitado' && nuevas.some((s) => String(s.id) === String(masNueva.id))) ? { ...f, estado: 'cerrado' } : f);
    });
    if (!primeraVez && nuevas.some((s) => String(s.id) === String(masNueva.id))) await liberarColaStake(masNueva);
  }
  // pregunta a las 5 horas
  const filas = await H.leerHoja(HOJA_DISP);
  for (const f of filas) {
    if (f.estado !== 'habilitado' || f.preguntado === 'si') continue;
    if (Date.now() < Date.parse(f.publishedAt) + HORAS_PREGUNTA * 3600e3) continue;
    const sec = secs.find((s) => String(s.id) === String(f.sectionId));
    await H.tg('sendMessage', {
      chat_id: H.TG_ADMIN(), parse_mode: 'HTML',
      text: `⏰ Pasaron ${HORAS_PREGUNTA} horas del <b>${H.esc(sec ? sec.title : 'stake de pago')}</b>.\n\n¿Sigue disponible? Si ya se jugó, los pagos que apruebes desde ahora quedan en cola hasta que publiques el siguiente stake.`,
      reply_markup: { inline_keyboard: [[{ text: '✅ Sigue disponible', callback_data: 'sd:' + f.sectionId + ':s' }, { text: '🔚 Ya se jugó', callback_data: 'sd:' + f.sectionId + ':c' }]] }
    });
    await H.cambiarHoja(HOJA_DISP, (fs) => fs.map((x) => String(x.sectionId) === String(f.sectionId) ? { ...x, preguntado: 'si' } : x));
  }
}

async function liberarColaStake(sec) {
  let n = 0;
  await H.cambiarHoja(HOJA_REGISTROS_STAKE, (filas) => filas.map((f) => {
    if (f.estado !== 'cola') return f;
    n++; return { ...f, estado: 'aprobado', sectionId: sec.id, resueltoAt: new Date().toISOString() };
  }));
  if (n) await H.tg('sendMessage', { chat_id: H.TG_ADMIN(), text: `🎟 Salió ${sec.title}: ${n} cliente(s) que estaban en cola ya pueden ver el link del canal.` }).catch(() => {});
}

// ---- Regalito: control de 5 y 8 horas ----
async function revisarRegalito() {
  const filas = await H.leerHoja(HOJA_DIA);
  for (const f of filas) {
    if (f.estado !== 'habilitado') continue;
    const pub = Date.parse(f.publishedAt);
    if (Date.now() >= pub + HORAS_HABILITADO * 3600e3) {
      await H.cambiarHoja(HOJA_DIA, (fs) => fs.map((x) => x.id === f.id ? { ...x, estado: 'cerrado' } : x));
      continue;
    }
    if (f.preguntado !== 'si' && Date.now() >= pub + HORAS_PREGUNTA * 3600e3) {
      await H.tg('sendMessage', {
        chat_id: H.TG_ADMIN(),
        text: `⏰ Pasaron ${HORAS_PREGUNTA} horas del regalito de hoy.\n\n¿Sigue disponible? Si ya se jugó, los que lo pidan desde ahora quedan en cola para el siguiente.`,
        reply_markup: { inline_keyboard: [[{ text: '✅ Sigue disponible', callback_data: 'gd:' + f.id + ':s' }, { text: '🔚 Ya se jugó', callback_data: 'gd:' + f.id + ':c' }]] }
      });
      await H.cambiarHoja(HOJA_DIA, (fs) => fs.map((x) => x.id === f.id ? { ...x, preguntado: 'si' } : x));
    }
  }
}

function montar(app, stakes, extra) {
  H = stakes;
  const requireApiKey = (extra && extra.requireApiKey) || ((req, res) => res.status(500).json({ error: 'Sin clave configurada.' }));

  // Los pagos de stake que se aprueben con el stake cerrado quedan en cola
  H.gancho.stakeCerrado = stakeCerrado;

  const marcar = async (cq, txt) => {
    await H.tg('answerCallbackQuery', { callback_query_id: cq.id, text: txt }).catch(() => {});
    if (cq.message) await H.tg('editMessageReplyMarkup', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [[{ text: txt, callback_data: 'x' }]] } }).catch(() => {});
  };

  // ga = aprobar   gq = a la cola   gx = rechazar
  async function resolver(id, quiere) {
    const vig = quiere === 'aprobado' ? await regalitoVigente() : null;
    const destino = quiere === 'aprobado' ? (vig ? 'aprobado' : 'cola') : (quiere === 'cola' ? 'cola' : 'rechazado');
    let reg = null, ya = false;
    await H.cambiarHoja(HOJA_REG, (filas) => filas.map((f) => {
      if (String(f.id) !== String(id)) return f;
      reg = f; if (f.estado !== 'pendiente') { ya = true; return f; }
      return destino === 'cola' ? { ...f, estado: 'cola' }
        : destino === 'rechazado' ? { ...f, estado: 'rechazado', resueltoAt: new Date().toISOString() }
        : { ...f, estado: 'aprobado', link: vig.link, regalitoId: vig.id, resueltoAt: new Date().toISOString() };
    }));
    if (!reg) return '⚠️ No encontré ese pedido';
    if (ya) return `⚠️ Ya estaba ${reg.estado}`;
    if (destino === 'aprobado') return '✅ Aprobado';
    if (destino === 'rechazado') return '❌ Rechazado';
    return quiere === 'aprobado' ? '🕒 No hay regalito habilitado: lo dejé en cola' : '🕒 En cola';
  }
  H.manejadores.ga = async (cq, [id]) => marcar(cq, await resolver(id, 'aprobado'));
  H.manejadores.gq = async (cq, [id]) => marcar(cq, await resolver(id, 'cola'));
  H.manejadores.gx = async (cq, [id]) => marcar(cq, await resolver(id, 'rechazado'));
  H.manejadores.gd = async (cq, [id, r]) => {
    if (r === 'c') await H.cambiarHoja(HOJA_DIA, (fs) => fs.map((x) => x.id === id ? { ...x, estado: 'cerrado' } : x));
    await marcar(cq, r === 'c' ? '🔚 Cerrado: los nuevos pedidos van a la cola' : '✅ Sigue disponible');
  };
  H.manejadores.sd = async (cq, [id, r]) => {
    if (r === 'c') await H.cambiarHoja(HOJA_DISP, (fs) => fs.map((x) => String(x.sectionId) === String(id) ? { ...x, estado: 'cerrado' } : x));
    await marcar(cq, r === 'c' ? '🔚 Cerrado: los pagos nuevos quedan en cola' : '✅ Sigue disponible');
  };

  app.get('/regalito', (req, res) => { res.set('Cache-Control', 'no-store').type('html').send(PAGINA); });

  app.post('/regalito/registro', async (req, res) => {
    if (!H.limite(req, res, 3000, 10 * 60 * 1000)) return;
    try {
      if (!H.TG_TOKEN() || !H.TG_ADMIN()) return res.status(500).json({ error: 'El registro no está configurado todavía.' });
      const nombre = H.limpio((req.body || {}).nombre, 80);
      if (nombre.length < 3) return res.status(400).json({ error: 'Escribe el nombre completo.' });
      const vig = await regalitoVigente();
      const reg = { id: H.nuevoId(), createdAt: new Date().toISOString(), day: H.hoyEC(), nombre, estado: vig ? 'pendiente' : 'cola', link: '', regalitoId: '', resueltoAt: '' };
      let repetido = null;
      await H.cambiarHoja(HOJA_REG, (filas) => {
        repetido = filas.find((f) => (f.estado === 'pendiente' || f.estado === 'cola') && f.nombre.toLowerCase() === nombre.toLowerCase());
        return repetido ? filas : [...filas, reg];
      });
      if (repetido) return res.json({ id: repetido.id, repetido: true });
      if (vig) await avisarRegistro(reg, false).catch((e) => console.error('No pude avisar al jefe (regalito):', e.message));
      res.json({ id: reg.id });
    } catch (e) {
      console.error('Registro de regalito:', e);
      res.status(500).json({ error: 'No se pudo enviar. Intenta de nuevo.' });
    }
  });

  app.get('/regalito/estado/:id', async (req, res) => {
    if (!H.limite(req, res, 20000, 10 * 60 * 1000)) return;
    try {
      const reg = (await H.leerHoja(HOJA_REG)).find((f) => String(f.id) === String(req.params.id));
      if (!reg) return res.json({ estado: 'desconocido' });
      res.json(reg.estado === 'aprobado' ? { estado: 'aprobado', link: reg.link || '' } : { estado: reg.estado });
    } catch (e) { res.json({ estado: 'pendiente' }); }
  });

  // El panel (a través de Vercel) publica el regalito del día
  app.post('/regalito/publicar', requireApiKey, async (req, res) => {
    try {
      const link = H.limpio((req.body || {}).link, 300);
      if (!/^https?:\/\/\S+$/i.test(link)) return res.status(400).json({ error: 'Falta el link del grupo (debe empezar con https://).' });
      res.json(await publicar(link));
    } catch (e) {
      console.error('Publicar regalito:', e);
      res.status(500).json({ error: 'No se pudo publicar: ' + e.message });
    }
  });

  const ciclo = () => { revisarRegalito().catch((e) => console.error('Regalito:', e.message)); revisarStakes().catch((e) => console.error('Disp. stakes:', e.message)); };
  setInterval(ciclo, 3 * 60 * 1000);
  setTimeout(ciclo, 60 * 1000);
}

module.exports = { montar, publicar, revisarStakes, revisarRegalito };
