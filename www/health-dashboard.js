(() => {
  'use strict';
  if (window.__HTS_HEALTH_DASHBOARD_V1__) return;
  window.__HTS_HEALTH_DASHBOARD_V1__ = true;

  const css = `
    #hts-health-page{position:fixed;inset:0;z-index:3000;overflow:auto;background:linear-gradient(140deg,#080d19,#0e1528 55%,#101a31);color:#eef3ff;padding:20px 16px 100px}
    #hts-health-page .hc-shell{max-width:1280px;margin:0 auto}
    #hts-health-page .hc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;position:sticky;top:0;z-index:2;background:rgba(10,15,30,.92);backdrop-filter:blur(12px);padding:10px 0}
    #hts-health-page .hc-title{font-size:1.55rem;font-weight:850;display:flex;align-items:center;gap:10px}
    #hts-health-page .hc-sub{color:#9fb0d0;font-size:.85rem}
    #hts-health-page .hc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    #hts-health-page .hc-card{background:linear-gradient(180deg,rgba(22,31,51,.96),rgba(15,22,40,.96));border:1px solid #2c3753;border-radius:18px;padding:16px;min-height:100%}
    #hts-health-page .hc-kpi{font-size:1.65rem;font-weight:850;line-height:1.1}
    #hts-health-page .hc-muted{color:#9fb0d0;font-size:.8rem}
    #hts-health-page .hc-chart{height:270px;position:relative}
    #hts-health-page canvas{max-width:100%}
    #hts-health-page .hc-section{margin-top:18px}
    #hts-health-page .hc-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#7f8daa;font-size:.9rem;padding:30px}
    #hts-health-page .hc-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
    #hts-health-page .hc-span-3{grid-column:span 3}.hc-span-4{grid-column:span 4}.hc-span-6{grid-column:span 6}.hc-span-8{grid-column:span 8}.hc-span-12{grid-column:span 12}
    #hts-health-page .hc-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #2c3753;border-radius:999px;padding:6px 10px;color:#9fb0d0;font-size:.75rem;background:rgba(255,255,255,.03)}
    #hts-health-page .hc-list{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow:auto}
    #hts-health-page .hc-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #2c3753}.hc-row:last-child{border-bottom:0}
    @media(max-width:900px){#hts-health-page .hc-span-3,#hts-health-page .hc-span-4,#hts-health-page .hc-span-6,#hts-health-page .hc-span-8{grid-column:span 12}}
    @media(max-width:576px){#hts-health-page{padding:12px 10px 100px}#hts-health-page .hc-head{align-items:flex-start}.hc-actions{width:100%}.hc-title{font-size:1.3rem}.hc-chart{height:230px}}
  `;
  const ensureStyle = () => {
    if (document.getElementById('hts-health-dashboard-style')) return;
    const s = document.createElement('style'); s.id='hts-health-dashboard-style'; s.textContent=css; document.head.appendChild(s);
  };
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const fmt = (v,d=0) => n(v).toLocaleString('it-IT',{maximumFractionDigits:d});
  const dateLabel = iso => { const d=new Date(iso); return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}); };
  const getState = () => { try{return JSON.parse(localStorage.getItem('hybridTrainingSystem')||'{}')}catch(_){return{}} };
  const getSummary = () => { try{const raw=window.AndroidHealthBridge?.readHealthSummary?.();return raw?JSON.parse(raw):null}catch(_){return null} };
  let charts = {};
  let days = 30;

  const destroyCharts=()=>{Object.values(charts).forEach(c=>{try{c.destroy()}catch(_){}});charts={};};
  const chart=(id,type,labels,data,label,opts={})=>{
    const el=document.getElementById(id); if(!el || !window.Chart || !data.length) return false;
    const ctx=el.getContext('2d');
    charts[id]=new Chart(ctx,{type,data:{labels,datasets:[{label,data,borderWidth:2,fill:type==='line',tension:.28,pointRadius:type==='line'?2:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:type==='doughnut'?{}:{x:{ticks:{color:'#9fb0d0'},grid:{color:'rgba(255,255,255,.05)'}},y:{ticks:{color:'#9fb0d0'},grid:{color:'rgba(255,255,255,.05)'}}},...opts}});
    return true;
  };
  const doughnut=(id,labels,data)=>{
    const el=document.getElementById(id); if(!el||!window.Chart||!data.length)return false;
    charts[id]=new Chart(el.getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#9fb0d0'}}}}});return true;
  };

  function skeleton(summary){
    const health=summary||{}; const runs=Array.isArray(health.runningSessions)?health.runningSessions:[]; const ex=Array.isArray(health.exerciseSessions)?health.exerciseSessions:[];
    const sleeps=Array.isArray(health.sleepSessions)?health.sleepSessions:[]; const hrs=Array.isArray(health.heartRateSamples)?health.heartRateSamples:[];
    const routes=Array.isArray(getState()?.health?.routes)?getState().health.routes:[];
    const metrics=Array.isArray(getState()?.metrics)?getState().metrics:[];
    const avgSleep=sleeps.length?sleeps.reduce((a,s)=>a+n(s.durationMinutes),0)/sleeps.length:0;
    const avgHr=n(health.heartRateAvg); const totalDist=runs.reduce((a,r)=>a+n(r.distanceKm||r?.route?.distanceKm),0)+routes.reduce((a,r)=>a+n(r.distanceKm),0);
    const totalExerciseMinutes=ex.reduce((a,r)=>a+n(r.durationMinutes),0);
    const weight=metrics.filter(x=>n(x.weight)>0).sort((a,b)=>String(a.date).localeCompare(String(b.date))).at(-1)?.weight || health.weightKg;
    const periodLabel=`Ultimi ${n(health.lookbackDays)||days} giorni`;
    document.getElementById('hc-kpis').innerHTML=`
      <div class="hc-card"><div class="hc-muted">Passi</div><div class="hc-kpi">${fmt(health.steps)}</div><div class="hc-muted mt-1">totale periodo</div></div>
      <div class="hc-card"><div class="hc-muted">Peso</div><div class="hc-kpi">${weight?fmt(weight,1)+' kg':'—'}</div><div class="hc-muted mt-1">ultimo dato</div></div>
      <div class="hc-card"><div class="hc-muted">Sonno medio</div><div class="hc-kpi">${avgSleep?fmt(avgSleep/60,1)+' h':'—'}</div><div class="hc-muted mt-1">su ${sleeps.length} sessioni</div></div>
      <div class="hc-card"><div class="hc-muted">FC media</div><div class="hc-kpi">${avgHr?fmt(avgHr)+' bpm':'—'}</div><div class="hc-muted mt-1">${hrs.length} campioni</div></div>
      <div class="hc-card"><div class="hc-muted">Allenamento</div><div class="hc-kpi">${fmt(ex.length)}</div><div class="hc-muted mt-1">sessioni · ${fmt(totalExerciseMinutes)} min</div></div>
      <div class="hc-card"><div class="hc-muted">Corsa</div><div class="hc-kpi">${fmt(runs.length)}</div><div class="hc-muted mt-1">${fmt(totalDist,1)} km</div></div>`;
    const seriesWeight=metrics.filter(x=>n(x.weight)>0).slice(-Math.max(7,days));
    const weightLabels=seriesWeight.map(x=>dateLabel(x.date));
    const weightData=seriesWeight.map(x=>n(x.weight));
    chart('hc-weight','line',weightLabels,weightData,'kg');
    chart('hc-hr','line',hrs.slice(-120).map(x=>dateLabel(x.time)),hrs.slice(-120).map(x=>n(x.bpm)),'bpm');
    chart('hc-sleep','bar',sleeps.slice(-14).map(x=>dateLabel(x.start)),sleeps.slice(-14).map(x=>n(x.durationMinutes)/60),'ore');
    chart('hc-runs','bar',runs.slice(-12).map(x=>dateLabel(x.start)),runs.slice(-12).map(x=>n(x.distanceKm||x?.route?.distanceKm)),'km');
    const dayBuckets={};
    hrs.forEach(x=>{const k=String(x.time||'').slice(0,10);if(k){dayBuckets[k]??=[];dayBuckets[k].push(n(x.bpm));}});
    const hrDays=Object.entries(dayBuckets).slice(-14);
    chart('hc-hr-daily','line',hrDays.map(([k])=>dateLabel(k)),hrDays.map(([,v])=>v.reduce((a,b)=>a+b,0)/v.length),'bpm');
    const types={}; ex.forEach(x=>{const k=x.exerciseTypeName||'altro';types[k]=(types[k]||0)+1;});
    doughnut('hc-types',Object.keys(types),Object.values(types));
    const routeData=routes.filter(Boolean).slice(-12);
    chart('hc-elevation','bar',routeData.map(x=>dateLabel(x.receivedAt||x.start)),routeData.map(x=>n(x.elevationGainM)),'m');
    const stage={}; sleeps.forEach(s=>(Array.isArray(s.stages)?s.stages:[]).forEach(st=>{const k=String(st.type);stage[k]=(stage[k]||0)+n(st.durationMinutes);}));
    doughnut('hc-sleep-stages',Object.keys(stage),Object.values(stage));
    renderLists(health, periodLabel);
  }

  function renderLists(s, periodLabel){
    const runs=Array.isArray(s.runningSessions)?s.runningSessions.slice().reverse():[]; const sleeps=Array.isArray(s.sleepSessions)?s.sleepSessions.slice().reverse():[]; const ex=Array.isArray(s.exerciseSessions)?s.exerciseSessions.slice().reverse():[];
    document.getElementById('hc-run-list').innerHTML=runs.slice(0,10).map(r=>`<div class="hc-row"><div><strong>${String(r.title||r.exerciseTypeName||'Corsa')}</strong><div class="hc-muted">${new Date(r.start).toLocaleString('it-IT')}</div></div><div class="text-end"><strong>${fmt(r.durationMinutes)} min</strong><div class="hc-muted">${fmt(r.distanceKm||r?.route?.distanceKm,2)} km</div></div></div>`).join('')||'<div class="hc-empty">Nessuna corsa importata.</div>';
    document.getElementById('hc-sleep-list').innerHTML=sleeps.slice(0,10).map(x=>`<div class="hc-row"><div><strong>${new Date(x.start).toLocaleDateString('it-IT')}</strong><div class="hc-muted">${new Date(x.start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} → ${new Date(x.end).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div></div><div class="text-end"><strong>${fmt(n(x.durationMinutes)/60,1)} h</strong><div class="hc-muted">${Array.isArray(x.stages)?x.stages.length:0} fasi</div></div></div>`).join('')||'<div class="hc-empty">Nessun sonno importato.</div>';
    document.getElementById('hc-ex-list').innerHTML=ex.slice(0,10).map(x=>`<div class="hc-row"><div><strong>${String(x.title||x.exerciseTypeName||'Allenamento')}</strong><div class="hc-muted">${new Date(x.start).toLocaleString('it-IT')}</div></div><div class="text-end"><strong>${fmt(x.durationMinutes)} min</strong><div class="hc-muted">${x.routeStatus||'nessuna route'}</div></div></div>`).join('')||'<div class="hc-empty">Nessuna sessione importata.</div>';
    document.getElementById('hc-meta').textContent=`${periodLabel} · importato ${s.importedAt?new Date(s.importedAt).toLocaleString('it-IT'):'non ancora'}`;
  }

  function render(){
    ensureStyle(); destroyCharts();
    let page=document.getElementById('hts-health-page');
    if(!page){page=document.createElement('section');page.id='hts-health-page';document.body.appendChild(page);}
    page.innerHTML=`<div class="hc-shell">
      <header class="hc-head"><div><div class="hc-title"><i class="bi bi-heart-pulse-fill text-danger"></i> Salute</div><div id="hc-meta" class="hc-sub">Health Connect</div></div><div class="hc-actions"><select id="hc-days" class="form-select form-select-sm" style="width:auto;background:#121a2d;color:#eef3ff;border-color:#2c3753"><option value="7">7 giorni</option><option value="30" selected>30 giorni</option><option value="90">90 giorni</option><option value="365">365 giorni</option></select><button id="hc-sync" class="btn btn-info btn-sm"><i class="bi bi-arrow-repeat me-1"></i> Sincronizza</button><button id="hc-perm" class="btn btn-outline-info btn-sm"><i class="bi bi-shield-check me-1"></i> Permessi</button><button id="hc-close" class="btn btn-outline-light btn-sm"><i class="bi bi-x-lg"></i></button></div></header>
      <div id="hc-kpis" class="hc-grid"></div>
      <section class="hc-section"><div class="hc-grid">
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>Peso</strong><span class="hc-pill">kg</span></div><div class="hc-chart"><canvas id="hc-weight"></canvas></div></div>
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>Frequenza cardiaca</strong><span class="hc-pill">BPM</span></div><div class="hc-chart"><canvas id="hc-hr"></canvas></div></div>
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>Sonno</strong><span class="hc-pill">ore/notte</span></div><div class="hc-chart"><canvas id="hc-sleep"></canvas></div></div>
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>Corse</strong><span class="hc-pill">km</span></div><div class="hc-chart"><canvas id="hc-runs"></canvas></div></div>
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>FC media giornaliera</strong><span class="hc-pill">14 giorni</span></div><div class="hc-chart"><canvas id="hc-hr-daily"></canvas></div></div>
        <div class="hc-card hc-span-3"><strong>Tipi di allenamento</strong><div class="hc-chart mt-2"><canvas id="hc-types"></canvas></div></div>
        <div class="hc-card hc-span-3"><strong>Fasi del sonno</strong><div class="hc-chart mt-2"><canvas id="hc-sleep-stages"></canvas></div></div>
        <div class="hc-card hc-span-6"><div class="d-flex justify-content-between align-items-center mb-2"><strong>Dislivello GPS</strong><span class="hc-pill">m+</span></div><div class="hc-chart"><canvas id="hc-elevation"></canvas></div></div>
      </div></section>
      <section class="hc-section"><div class="hc-grid"><div class="hc-card hc-span-4"><h5>Corse recenti</h5><div id="hc-run-list" class="hc-list mt-2"></div></div><div class="hc-card hc-span-4"><h5>Sonno recente</h5><div id="hc-sleep-list" class="hc-list mt-2"></div></div><div class="hc-card hc-span-4"><h5>Sessioni recenti</h5><div id="hc-ex-list" class="hc-list mt-2"></div></div></div></section>
    </div>`;
    document.getElementById('hc-days').value=String(days);
    document.getElementById('hc-days').addEventListener('change',e=>{days=n(e.target.value)||30;sync(days);});
    document.getElementById('hc-sync').addEventListener('click',()=>sync(days));
    document.getElementById('hc-perm').addEventListener('click',()=>window.HealthConnectService?.requestPermissions?.());
    document.getElementById('hc-close').addEventListener('click',()=>close());
    const s=getSummary(); skeleton(s);
  }
  function close(){destroyCharts();document.getElementById('hts-health-page')?.remove();}
  function sync(range){
    const ok=window.HealthConnectService?.sync?.(range); if(!ok){render(); return;}
    const btn=document.getElementById('hc-sync'); if(btn){btn.disabled=true;btn.innerHTML='<i class="bi bi-arrow-repeat me-1"></i> Sincronizzo…';}
    setTimeout(()=>{const s=getSummary();if(document.getElementById('hts-health-page')){destroyCharts();skeleton(s);const b=document.getElementById('hc-sync');if(b){b.disabled=false;b.innerHTML='<i class="bi bi-arrow-repeat me-1"></i> Sincronizza';}}},1500);
  }

  function injectMenu(){
    if(document.querySelector('[data-hts-health-menu]')) return true;
    const tiles=Array.from(document.querySelectorAll('.menu-tile')); if(!tiles.length)return false;
    const tile=document.createElement('button');tile.type='button';tile.className='menu-tile';tile.setAttribute('data-hts-health-menu','1');tile.innerHTML='<i class="bi bi-heart-pulse-fill"></i><span>Salute</span>';tile.addEventListener('click',()=>{try{window.closeModal?.()}catch(_){};open();});
    const first=tiles[0]; const parent=first.parentElement; if(parent) parent.appendChild(tile); else document.body.appendChild(tile); return true;
  }
  function patchRoute(){
    if(typeof window.route!=='function'||window.__HTS_HEALTH_ROUTE_PATCHED__)return;
    const original=window.route;
    window.route=function(page,...args){if(page==='salute'){open();return;}close();const result=original.call(this,page,...args);injectMenu();return result};
    window.__HTS_HEALTH_ROUTE_PATCHED__=true;
  }
  function open(){render();}
  window.HealthDashboard={open,close,refresh:()=>{if(document.getElementById('hts-health-page')){destroyCharts();skeleton(getSummary());}}};
  window.addEventListener('health-connect-sync',()=>window.HealthDashboard.refresh());
  window.addEventListener('health-connect-heart-rate',()=>window.HealthDashboard.refresh());
  window.addEventListener('health-connect-route',()=>window.HealthDashboard.refresh());
  const boot=()=>{injectMenu();patchRoute();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
