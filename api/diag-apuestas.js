// TEMPORAL (diagnóstico de apuestas faltantes). Solo lectura. Se borra después.
const URL_ = 'https://script.google.com/macros/s/AKfycbx63BsywQP0fTOhbzMCcoJ5jDjp1lgsaGjLMkGI47SVAfemVMuMnggWd_k-ubqzmBEMlA/exec';
async function hoja(n){ try{ const r = await fetch(`${URL_}?sheet=${n}&t=${Date.now()}`); const j = await r.json(); return j.data || []; }catch(e){ return { error: String(e.message||e) }; } }
const ms = (id)=>{ const n = parseInt(String(id||'').slice(0,-5), 36); return Number.isFinite(n) ? n : 0; };
const dia = (m)=> m ? new Date(m - 5*3600e3).toISOString().slice(0,16).replace('T',' ') : '?';
module.exports = async (req, res) => {
  if(req.query.k !== 'd1ag1116') return res.status(404).end();
  const out = {};
  for(const [k, n] of [['gratis','ApuestasGratis'],['vip','ApuestasVIP'],['live','ApuestasLive'],['respaldo','ApuestasRespaldo']]){
    const d = await hoja(n);
    out[k] = Array.isArray(d) ? { filas: d.length, desdeNov: d.filter(f=>ms(f.id) >= Date.parse('2026-11-09T05:00:00Z')).map(f=>({ id:f.id, fechaCreado:dia(ms(f.id)), date:f.date, result:f.result, pick:String(f.pick||'').slice(0,50), conFoto:!!f.imageUrl })) } : d;
  }
  const o = await hoja('WinOutbox');
  out.outbox = Array.isArray(o) ? o.filter(f=>f.kind==='nueva_apuesta' && String(f.createdAt||'') >= '2026-11-09').map(f=>({ creado:String(f.createdAt).slice(0,16), destino:f.destino, estado:f.status, texto:String(f.caption||'').replace(/\s+/g,' ').slice(0,70) })) : o;
  res.status(200).json(out);
};
