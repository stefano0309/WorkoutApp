(() => {
  'use strict';
  if (window.__HTS_ROADMAP_V1__) return;
  window.__HTS_ROADMAP_V1__ = true;

  const STATE_KEY = 'hybridTrainingSystem';
  const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; } };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Date().toISOString().slice(0,10);

  const style = document.createElement('style');
  style.textContent = `
    #hts-roadmap-fab{position:fixed;left:18px;bottom:88px;z-index:1090;width:52px;height:52px;border:1px solid #2c3753;border-radius:50%;background:#121a2d;color:#62d4ff;box-shadow:0 8px 25px rgba(0,0,0,.35);font-size:1.15rem}
    #hts-roadmap-modal{position:fixed;inset:0;z-index:1250;background:rgba(4,8,18,.84);backdrop-filter:blur(10px);display:none;align-items:flex-end;justify-content:center;padding:12px}
    #hts-roadmap-modal.open{display:flex}
    #hts-roadmap-sheet{width:min(860px,100%);max-height:94vh;overflow:auto;background:#121a2d;border:1px solid #2c3753;border-radius:24px;padding:20px;color:#eef3ff}
    .hts-r-tabs{display:flex;gap:7px;overflow:auto;margin:0 0 16px}.hts-r-tabs button{border:1px solid #2c3753;background:#19233a;color:#9fb0d0;border-radius:18px;padding:8px 13px;white-space:nowrap}.hts-r-tabs button.active{background:#ff5a36;border-color:#ff5a36;color:#fff}
    .hts-r-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hts-r-card{border:1px solid #2c3753;border-radius:16px;background:#0e1628;padding:14px}.hts-r-big{font-size:1.65rem;font-weight:900}.hts-r-muted{color:#9fb0d0;font-size:.82rem}.hts-r-btn{border:0;border-radius:12px;padding:9px 12px;background:#ff5a36;color:#fff;font-weight:700}.hts-r-btn.alt{background:#2a3652}.hts-photo-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hts-photo-box{border:1px solid #2c3753;border-radius:16px;padding:10px;background:#0e1628}.hts-photo-box img{width:100%;height:380px;object-fit:cover;border-radius:12px;background:#19233a}.hts-range{width:100%}
    @media(max-width:680px){.hts-r-grid{grid-template-columns:1fr 1fr}.hts-photo-grid{grid-template-columns:1fr}.hts-photo-box img{height:300px}}
    @media(max-width:430px){.hts-r-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'hts-roadmap-modal';
  modal.innerHTML = `<div id="hts-roadmap-sheet">
    <div class="d-flex justify-content-between align-items-center mb-3"><div><h4 class="mb-1">Hybrid Training · Nuove funzioni</h4><div class="hts-r-muted">Health Connect · Session Editor · Badge · Confronto Foto</div></div><button id="hts-r-close" class="btn btn-sm btn-outline-light">×</button></div>
    <div class="hts-r-tabs"><button data-tab="health" class="active">Salute</button><button data-tab="session">Sessione</button><button data-tab="badges">Badge</button><button data-tab="photos">Foto</button></div>
    <div id="hts-r-content"></div>
  </div>`;
  document.body.appendChild(modal);

  const fab = document.createElement('button');
  fab.id='hts-roadmap-fab'; fab.title='Nuove funzioni'; fab.innerHTML='<i class="bi bi-stars"></i>'; document.body.appendChild(fab);
  const content = document.getElementById('hts-r-content');
  const close = () => modal.classList.remove('open');
  document.getElementById('hts-r-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if(e.target===modal) close(); });

  function renderHealth(){
    const summaryRaw = window.AndroidHealthBridge?.readHealthSummary?.();
    let summary = null; try{summary=summaryRaw?JSON.parse(summaryRaw):null;}catch{}
    content.innerHTML = `<div class="hts-r-grid">
      <div class="hts-r-card"><div class="hts-r-muted">Peso</div><div class="hts-r-big">${summary?.weightKg != null ? summary.weightKg+' kg' : '—'}</div></div>
      <div class="hts-r-card"><div class="hts-r-muted">Passi oggi</div><div class="hts-r-big">${summary?.steps != null ? summary.steps.toLocaleString('it-IT') : '—'}</div></div>
      <div class="hts-r-card"><div class="hts-r-muted">Sonno</div><div class="hts-r-big">${summary?.sleepMinutes != null ? Math.round(summary.sleepMinutes/60)+'h' : '—'}</div></div>
    </div>
    <div class="hts-r-card mt-3"><h5 class="mb-2">Health Connect</h5><p class="hts-r-muted">Importazione prevista per peso, passi, sonno e corse. La traccia GPS richiede il consenso specifico della route.</p><div class="d-flex gap-2 flex-wrap"><button id="hts-health-perm" class="hts-r-btn">Concedi permessi</button><button id="hts-health-sync" class="hts-r-btn alt">Sincronizza</button></div><div id="hts-health-msg" class="hts-r-muted mt-2"></div></div>`;
    document.getElementById('hts-health-perm')?.addEventListener('click',()=>{try{window.AndroidHealthBridge?.requestHealthPermissions?.();}catch{} });
    document.getElementById('hts-health-sync')?.addEventListener('click',()=>{try{window.AndroidHealthBridge?.syncHealthConnect?.();document.getElementById('hts-health-msg').textContent='Sincronizzazione avviata; riapri questa scheda per aggiornare i valori.';}catch{} });
  }

  function renderSession(){
    const s=readState(); const draft= s.sessionDraft || {name:'Nuova sessione', exercises:[]};
    content.innerHTML = `<div class="hts-r-card"><h5>Editor Sessione</h5><p class="hts-r-muted">Crea una sessione modulare: esercizi, serie, ripetizioni, carico, RPE e recupero. La bozza è locale.</p><div class="mb-3"><label class="hts-r-muted">Nome sessione</label><input id="hts-r-session-name" class="form-control bg-dark text-light border-secondary" value="${esc(draft.name)}"></div><div id="hts-r-exercises"></div><div class="d-flex gap-2 mt-3"><button id="hts-r-add" class="hts-r-btn">+ Esercizio</button><button id="hts-r-save" class="hts-r-btn alt">Salva bozza</button></div></div>`;
    const list=document.getElementById('hts-r-exercises');
    const exercises=Array.isArray(draft.exercises)?draft.exercises:[];
    const paint=()=>{list.innerHTML=exercises.map((e,i)=>`<div class="hts-r-card mb-2"><div class="d-flex justify-content-between align-items-center mb-2"><strong>${esc(e.name||'Esercizio '+(i+1))}</strong><button class="btn btn-sm btn-outline-danger" data-del="${i}">×</button></div>${(e.sets||[]).map((set,j)=>`<div class="row g-2 mb-2"><div class="col-3"><input data-i="${i}" data-j="${j}" data-k="reps" type="number" class="form-control bg-dark text-light border-secondary" value="${set.reps??8}" placeholder="rep"></div><div class="col-3"><input data-i="${i}" data-j="${j}" data-k="loadKg" type="number" step="0.5" class="form-control bg-dark text-light border-secondary" value="${set.loadKg??0}" placeholder="kg"></div><div class="col-3"><input data-i="${i}" data-j="${j}" data-k="rpe" type="number" step="0.5" min="0" max="10" class="form-control bg-dark text-light border-secondary" value="${set.rpe??8}" placeholder="RPE"></div><div class="col-3"><input data-i="${i}" data-j="${j}" data-k="restSeconds" type="number" class="form-control bg-dark text-light border-secondary" value="${set.restSeconds??90}" placeholder="sec"></div></div>`).join('')}<button class="btn btn-sm btn-outline-info" data-set="${i}">+ Serie</button></div>`).join('')||'<div class="hts-r-muted">Nessun esercizio. Aggiungine uno.</div>';};
    paint();
    list.addEventListener('click',e=>{const d=e.target.closest('[data-del]');if(d){exercises.splice(Number(d.dataset.del),1);paint();}const a=e.target.closest('[data-set]');if(a){exercises[Number(a.dataset.set)].sets.push({reps:8,loadKg:0,rpe:8,restSeconds:90,completed:false});paint();}});
    document.getElementById('hts-r-add').onclick=()=>{exercises.push({id:String(Date.now()),name:'Nuovo esercizio',sets:[{reps:8,loadKg:0,rpe:8,restSeconds:90,completed:false}]});paint();};
    document.getElementById('hts-r-save').onclick=()=>{for(const input of list.querySelectorAll('[data-i][data-j][data-k]')){const set=exercises[Number(input.dataset.i)]?.sets?.[Number(input.dataset.j)];if(set)set[input.dataset.k]=Number(input.value)||0;}const next=readState();next.sessionDraft={id:next.sessionDraft?.id||'draft-'+Date.now(),name:document.getElementById('hts-r-session-name').value||'Nuova sessione',startedAt:next.sessionDraft?.startedAt||new Date().toISOString(),updatedAt:new Date().toISOString(),exercises};localStorage.setItem(STATE_KEY,JSON.stringify(next));alert('Bozza sessione salvata localmente.');};
  }

  function renderBadges(){
    const s=readState(); const logs=Array.isArray(s.log)?s.log:[]; const runKm=logs.filter(x=>x.type==='run').reduce((sum,x)=>sum+Number(x.distanceKm||x.meta?.distanceKm||0),0);
    const stepDays=Array.isArray(s.health?.stepsDays)?s.health.stepsDays:[]; let consecutive=0; for(let i=stepDays.length-1;i>=0;i--){if(Number(stepDays[i])>=10000)consecutive++;else break;}
    const strengthWeeks=new Set(logs.filter(x=>x.type==='strength').map(x=>{const d=new Date(x.date||x.at||Date.now());return `${d.getFullYear()}-${Math.ceil(((d-new Date(d.getFullYear(),0,1))/86400000+1)/7)}`}));
    const defs=[['first-5k','Prima 5K di Corsa','bi-trophy',runKm>=5,`Distanza cumulativa: ${runKm.toFixed(1)} km`],['steps-7-days','10.000 passi × 7 giorni','bi-footsteps',consecutive>=7,`Giorni consecutivi: ${consecutive}`],['consistency-master','Master della Costanza','bi-fire',strengthWeeks.size>=4,`Settimane con attività: ${strengthWeeks.size}`]];
    content.innerHTML=`<div class="hts-r-grid">${defs.map(b=>`<div class="hts-r-card"><div class="fs-2 ${b[3]?'text-warning':'text-secondary'}"><i class="bi ${b[2]}"></i></div><strong>${b[1]}</strong><div class="hts-r-muted mt-1">${b[4]}</div><div class="mt-2"><span class="badge ${b[3]?'bg-success':'bg-secondary'}">${b[3]?'Sbloccato':'In corso'}</span></div></div>`).join('')}</div>`;
  }

  function renderPhotos(){
    const s=readState(); const photos=Array.isArray(s.photos)?[...s.photos].sort((a,b)=>b.date.localeCompare(a.date)):[]; const a=photos[1]; const b=photos[0];
    content.innerHTML=`<div class="hts-r-card"><h5>Confronto Foto</h5><p class="hts-r-muted">Confronta due scatti affiancati. Le foto restano locali e non vengono caricate nel cloud.</p>${a&&b?`<div class="hts-photo-grid"><div class="hts-photo-box"><div class="hts-r-muted mb-2">${esc(a.date)} · ${a.w??'—'} kg</div><img src="${a.thumb}" alt="Prima"></div><div class="hts-photo-box"><div class="hts-r-muted mb-2">${esc(b.date)} · ${b.w??'—'} kg</div><img id="hts-photo-after" src="${b.thumb}" alt="Dopo"></div></div><label class="hts-r-muted mt-3">Slider confronto visivo</label><input id="hts-photo-range" class="hts-range" type="range" min="0" max="100" value="50">`:'<div class="hts-r-muted">Servono almeno due foto nella sezione Peso & Foto per attivare il confronto.</div>'}</div>`;
    const range=document.getElementById('hts-photo-range'); if(range){const box=document.querySelector('.hts-photo-grid');range.oninput=()=>{box.style.gridTemplateColumns=`${range.value}fr ${100-range.value}fr`;};}
  }

  function render(tab){if(tab==='health')renderHealth();else if(tab==='session')renderSession();else if(tab==='badges')renderBadges();else renderPhotos();}
  document.querySelectorAll('#hts-roadmap-sheet [data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#hts-roadmap-sheet [data-tab]').forEach(x=>x.classList.toggle('active',x===b));render(b.dataset.tab);}));
  fab.addEventListener('click',()=>{modal.classList.add('open');render('health');});
})();
