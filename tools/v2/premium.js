/* ===== Pay Win Premium (/v2): dashboard nuevo, tablas en tarjetas para celular y app instalable ===== */
(function(){
  const E = (s)=>String(s == null ? '' : s).replace(/[&<>"']/g, (c)=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const DIA = 86400000;

  // --- Tablas: cada celda lleva el nombre de su columna para verse como tarjeta en el celular ---
  function etiquetar(root){
    (root || document).querySelectorAll('#main table').forEach((t)=>{
      const ths = Array.from(t.querySelectorAll('thead th')).map((h)=>h.textContent.trim());
      if(!ths.length) return;
      t.querySelectorAll('tbody tr').forEach((tr)=>{
        Array.from(tr.children).forEach((td, i)=>{ if(td.tagName === 'TD' && !td.hasAttribute('data-l')) td.setAttribute('data-l', ths[i] || ''); });
      });
    });
  }
  const main = document.getElementById('main');
  if(main){ new MutationObserver(()=>etiquetar(main)).observe(main, { childList:true, subtree:true }); }

  // --- Dashboard ---
  const semana = ()=>{ const r = getWeekRange(); return { ini:r.start.getTime(), fin:r.end.getTime() }; };
  const enRango = (d, a, b)=>{ const t = new Date(d).getTime(); return t >= a && t <= b; };
  function diasUltimos7(lista){
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const out = [0,0,0,0,0,0,0];
    (lista || []).forEach((x)=>{ const d = new Date(x.date); if(isNaN(d)) return; d.setHours(0,0,0,0); const k = Math.round((hoy - d) / DIA); if(k >= 0 && k < 7) out[6 - k]++; });
    return out;
  }
  function spark(vals, id){
    const max = Math.max(1, ...vals), w = 120, h = 36, pad = 3;
    const pts = vals.map((v, i)=>[ (i / (vals.length - 1)) * w, h - pad - (v / max) * (h - pad * 2) ]);
    const linea = pts.map((p, i)=>(i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg class="pm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="g${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#D9B26B" stop-opacity=".35"/><stop offset="1" stop-color="#D9B26B" stop-opacity="0"/></linearGradient></defs>
      <path d="${linea} L ${w} ${h} L 0 ${h} Z" fill="url(#g${id})"/><path d="${linea}" fill="none" stroke="#E7C98A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const delta = (act, prev)=>{
    if(!act && !prev) return '<span class="pm-delta flat">sin cambios</span>';
    if(prev === 0) return '<span class="pm-delta up">nuevo</span>';
    const p = Math.round(((act - prev) / prev) * 100);
    return `<span class="pm-delta ${p > 0 ? 'up' : p < 0 ? 'down' : 'flat'}">${p > 0 ? '+' : ''}${p}%</span>`;
  };
  function saludo(){
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }
  const ir = (v)=>{ const el = document.querySelector(`.nav-item[data-view="${v}"]`); if(el) el.click(); };
  window.pmIr = ir;

  window.renderDashboard = function(){
    const { ini, fin } = semana(), ini0 = ini - 7 * DIA;
    const cuenta = (arr)=>({ act:arr.filter((x)=>enRango(x.date, ini, fin)).length, prev:arr.filter((x)=>enRango(x.date, ini0, ini - 1)).length });

    // VIPs
    let activos = 0, inactivos = 0; const porVencer = [];
    const hoyISO = new Date().toISOString().slice(0, 10);
    (state.vips || []).forEach((v)=>{
      if(effectiveStatus(v, 'vips') === 'active'){
        activos++;
        const exp = computeExpiration(v, 'vips');
        if(exp){ const d = Math.ceil((new Date(exp) - new Date(hoyISO)) / DIA); if(d >= 0 && d <= 7) porVencer.push({ v, d }); }
      } else inactivos++;
    });
    porVencer.sort((a, b)=>a.d - b.d);

    const gratis = cuenta(state.freeBets), stakes = cuenta(state.stakes), regalos = cuenta(state.gifts);
    const grupos = [
      { n:'Gratis', a:state.freeBets }, { n:'VIP', a:state.vipBets }, { n:'Live', a:state.liveBets }, { n:'Stakes', a:state.stakes }
    ].map((g)=>{
      const sem = g.a.filter((x)=>enRango(x.date, ini, fin)), gan = sem.filter((x)=>x.result === 'won').length, per = sem.filter((x)=>x.result === 'lost').length;
      return { n:g.n, gan, per, tot:sem.length, pct: (gan + per) ? Math.round(gan * 100 / (gan + per)) : null };
    });
    const G = grupos.reduce((s, g)=>s + g.gan, 0), P = grupos.reduce((s, g)=>s + g.per, 0), pct = (G + P) ? Math.round(G * 100 / (G + P)) : null;
    const circ = 2 * Math.PI * 52, dash = pct == null ? 0 : (pct / 100) * circ;

  // El "pick" a veces trae el mensaje completo de WhatsApp: se resume a una línea corta (boleto + cuota) para que el resultado siempre se vea.
  const limpiar = (t)=>String(t || '').replace(/[*_~`]/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
  const resumen = (pick, odds)=>{
    const t = limpiar(pick);
    const bol = /BOLETO:?\s*([A-Z0-9]{4,8})/i.exec(t);
    const cu = /CUOTA TOTAL:?\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(t);
    const o = Number(odds) > 0 ? Number(odds) : (cu ? Number(cu[1].replace(',', '.')) : 0);
    let titulo = t;
    if(/NUEVA APUESTA/i.test(t) || t.length > 60){
      const tipo = /REGALITO/i.test(t) ? 'Regalito' : /VIP/i.test(t) ? 'Apuesta VIP' : /LIVE/i.test(t) ? 'Apuesta live' : /GRATIS/i.test(t) ? 'Apuesta gratis' : 'Apuesta';
      titulo = tipo + (bol ? ' · boleto ' + bol[1].toUpperCase() : '');
    }
    return { titulo: titulo.length > 46 ? titulo.slice(0, 45) + '…' : titulo, odds: o };
  };
    const recientes = [].concat(
      (state.vipBets || []).map((b)=>({ ...b, _t:'VIP' })), (state.freeBets || []).map((b)=>({ ...b, _t:'Gratis' })), (state.liveBets || []).map((b)=>({ ...b, _t:'Live' }))
    ).sort((a, b)=>new Date(b.date) - new Date(a.date)).slice(0, 6);
    const regRec = [...(state.gifts || [])].sort((a, b)=>new Date(b.date) - new Date(a.date)).slice(0, 4);

    const kpi = (etq, val, sub, cls, id, vals)=>`<div class="card pm-kpi"><div class="l">${etq}</div><div class="v score-value ${cls || ''}">${val}</div><div class="s">${sub}</div>${vals ? spark(vals, id) : ''}</div>`;

    document.getElementById('main').innerHTML = `
      <div class="pm-head">
        <div>
          <div class="pm-hello">${saludo()}, <em>Yandry</em></div>
          <div class="pm-date">${new Date().toLocaleDateString('es-EC', { weekday:'long', day:'numeric', month:'long' })} · resumen de la semana</div>
        </div>
        <div class="pm-actions">
          <span class="pm-chip" onclick="pmIr('win')">✦ Win</span>
          <span class="pm-chip" onclick="pmIr('freeBets')">Apuesta gratis</span>
          <span class="pm-chip" onclick="pmIr('vipBets')">Apuesta VIP</span>
          <span class="pm-chip" onclick="pmIr('vips')">Miembros</span>
          <span class="pm-chip" onclick="pmIr('gifts')">Regalitos</span>
        </div>
      </div>

      <div class="pm-kpis">
        ${kpi('VIPs activos', activos, inactivos > 0 ? `<span class="pm-pill bad">${inactivos} vencido${inactivos > 1 ? 's' : ''}</span>` : '<span class="pm-delta up">todos al día</span>' + (porVencer.length ? `<span class="pm-pill warn">${porVencer.length} por vencer</span>` : ''), 'gold', 0, diasUltimos7((state.vips || []).map((v)=>({ date:v.joinDate }))))}
        ${kpi('Apuestas gratis', gratis.act, delta(gratis.act, gratis.prev) + '<span>vs semana pasada</span>', '', 1, diasUltimos7(state.freeBets))}
        ${kpi('Stakes', stakes.act, delta(stakes.act, stakes.prev) + '<span>vs semana pasada</span>', '', 2, diasUltimos7(state.stakes))}
        ${kpi('Regalitos', regalos.act, delta(regalos.act, regalos.prev) + '<span>vs semana pasada</span>', 'gold', 3, diasUltimos7(state.gifts))}
      </div>

      <div class="pm-row">
        <div class="card">
          <div class="card-title">Rendimiento de la semana</div>
          <div class="pm-perf">
            <div class="pm-ring">
              <svg viewBox="0 0 120 120"><defs><linearGradient id="pmr" x1="0" x2="1"><stop offset="0" stop-color="#B98A3E"/><stop offset="1" stop-color="#43D9A0"/></linearGradient></defs>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="url(#pmr)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" ${pct == null ? 'opacity="0"' : ''}/></svg>
              <div class="c"><b class="pm-num">${pct == null ? '—' : pct + '%'}</b><span>${G} ganadas · ${P} perdidas</span></div>
            </div>
            <div class="pm-bars">
              ${grupos.map((g)=>`<div class="pm-bar"><div class="t"><span>${g.n}</span><b class="pm-num">${g.pct == null ? 'sin resultados' : g.pct + '% · ' + g.gan + '/' + (g.gan + g.per)}</b></div><div class="k"><i style="width:${g.pct == null ? 0 : g.pct}%"></i></div></div>`).join('')}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">VIP por vencer <span class="pm-pill ${porVencer.length ? 'warn' : ''}" style="margin-left:6px;">próximos 7 días</span></div>
          ${porVencer.length ? `<div class="pm-list">${porVencer.slice(0, 6).map(({ v, d })=>`<div class="pm-li"><div class="pm-av">${E((v.name || '?').trim().charAt(0).toUpperCase())}</div><div><div class="n">${E(v.name || 'Sin nombre')}</div><div class="m">${E(v.contact || '')}</div></div><div class="r"><span class="pm-pill ${d <= 2 ? 'bad' : 'warn'}">${d === 0 ? 'vence hoy' : 'en ' + d + ' d'}</span></div></div>`).join('')}</div>` : '<div class="pm-empty">Nadie vence en los próximos 7 días.</div>'}
        </div>
      </div>

      <div class="pm-row">
        <div class="card">
          <div class="card-title">Últimas apuestas</div>
          ${recientes.length ? `<div class="pm-list">${recientes.map((b)=>{ const rs = resumen(b.pick, b.odds); return `<div class="pm-li"><div class="pm-av" style="font-size:11px;">${E(b._t)}</div><div class="pm-mid"><div class="n">${E(rs.titulo || '-')}</div><div class="m">${b.event && limpiar(b.event).length < 60 ? E(limpiar(b.event)) + ' · ' : ''}${rs.odds ? 'cuota <span class="pm-num">' + rs.odds.toFixed(2) + '</span> · ' : ''}${E(fmtDate(b.date))}</div></div><div class="r"><span class="badge ${E(b.result)}">${E(resultLabel(b.result))}</span></div></div>`; }).join('')}</div>` : '<div class="pm-empty">Aún no hay apuestas registradas.</div>'}
        </div>
        <div class="card">
          <div class="card-title">Últimos regalitos</div>
          ${regRec.length ? `<div class="pm-list">${regRec.map((g)=>{ const rs = resumen(g.pick, g.odds); return `<div class="pm-li"><div class="pm-av">🎁</div><div class="pm-mid"><div class="n">${E(rs.titulo)}</div><div class="m">${E(g.recipient || 'Grupo general')} · ${rs.odds ? 'cuota <span class="pm-num">' + rs.odds.toFixed(2) + '</span> · ' : ''}${E(fmtDate(g.date))}</div></div>${g.result ? `<div class="r"><span class="badge ${E(g.result)}">${E(resultLabel(g.result))}</span></div>` : ''}</div>`; }).join('')}</div>` : '<div class="pm-empty">Aún no has registrado regalitos.</div>'}
        </div>
      </div>
      <div style="text-align:center; margin:26px 0 90px;"><button type="button" class="btn secondary" id="pmBorrarHist" style="font-size:12px; opacity:.7;">🗑 Borrar historial de apuestas</button></div>`;
    const bb = document.getElementById('pmBorrarHist'); if(bb) bb.onclick = ()=>borrarHistorialApuestas();
    etiquetar(document.getElementById('main'));
  };

  // --- App instalable: guarda el panel en el aparato para abrirlo al instante y sin conexión (solo lo visual) ---
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ navigator.serviceWorker.register('/sw.js', { scope:'/' }).catch(()=>{}); });
  }
})();
