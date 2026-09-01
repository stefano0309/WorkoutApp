(() => {
  'use strict';
  if (window.__HTS_UX_V3__) return;
  window.__HTS_UX_V3__ = true;

  const STATE_KEY = 'hybridTrainingSystem';
  const LOG_KEY = 'hybridTrainingWorkoutLog';
  const SETTINGS_KEY = 'hybridTrainingNotificationSettings';
  const WORKOUTS = [
    { day: 1, title: 'Upper Strength', exercises: ['Push-up standard', 'Pull-up strict complete'] },
    { day: 2, title: 'Lower Strength + Corsa Facile', exercises: ['Squat libero standard', 'Single leg RDL'] },
    { day: 3, title: 'Interval Run', exercises: [] },
    { day: 4, title: 'Upper Strength + Corsa Facile', exercises: ['Push-up standard', 'Pull-up strict complete', 'Pike push-up'] },
    { day: 5, title: 'Lower Strength + Corsa Progressiva', exercises: ['Squat libero standard', 'Single leg RDL'] },
    { day: 6, title: 'Recupero Attivo (Run)', exercises: [] },
    { day: 0, title: 'Long Run', exercises: [] }
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const readState = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch { return {}; } };
  const readLogs = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } };
  const todayWorkout = () => WORKOUTS[new Date().getDay()];
  const lastForExercise = (exercise) => readLogs().filter(x => x.exercise === exercise).slice(-1)[0] || null;

  function syncNative(log) {
    try {
      const state = readState();
      if (window.AndroidWidgetBridge) {
        if (Object.keys(state).length) window.AndroidWidgetBridge.sync(JSON.stringify(state));
        if (log) window.AndroidWidgetBridge.syncWorkoutLog(JSON.stringify(log));
      }
    } catch (_) {}
  }

  const style = document.createElement('style');
  style.textContent = `
    #hts-quick-log-fab{position:fixed;right:18px;bottom:88px;z-index:1100;width:58px;height:58px;border:0;border-radius:50%;background:linear-gradient(160deg,#ff7a52,#ff5a36);color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.4);font-size:1.35rem;font-weight:800}
    #hts-log-modal{position:fixed;inset:0;z-index:1200;background:rgba(4,8,18,.82);backdrop-filter:blur(8px);display:none;align-items:flex-end;justify-content:center;padding:12px}
    #hts-log-modal.open{display:flex}
    #hts-log-sheet{width:min(700px,100%);max-height:94vh;overflow:auto;background:#121a2d;border:1px solid #2c3753;border-radius:24px;padding:20px;color:#eef3ff}
    .hts-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hts-field label{display:block;font-size:.78rem;color:#9fb0d0;margin-bottom:5px}.hts-field input{width:100%;background:#19233a;border:1px solid #2c3753;color:#fff;border-radius:12px;padding:12px;font-size:1rem}
    .hts-stepper{display:flex;gap:6px}.hts-stepper button{width:48px;border:0;border-radius:12px;background:#2a3652;color:#fff;font-size:1.25rem}.hts-stepper input{text-align:center;min-width:0}
    .hts-rpe{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.hts-rpe button{border:1px solid #2c3753;background:#19233a;color:#fff;border-radius:10px;padding:10px;font-weight:700}.hts-rpe button.active{background:#ff5a36;border-color:#ff5a36}
    .hts-actions{display:flex;gap:8px;margin-top:14px}.hts-actions button{flex:1;padding:13px;border-radius:14px;border:0;font-weight:700}.hts-save{background:#ff5a36;color:#fff}.hts-cancel{background:#2a3652;color:#fff}
    .hts-exercise-tabs{display:flex;gap:7px;overflow-x:auto;padding-bottom:5px}.hts-exercise-tabs button{flex:0 0 auto;border:1px solid #2c3753;background:#19233a;color:#dfe7ff;border-radius:18px;padding:8px 12px}.hts-exercise-tabs button.active{background:#ff5a36;border-color:#ff5a36;color:#fff}
    #hts-log-history{margin-top:16px}.hts-log-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #2c3753}.hts-muted{color:#9fb0d0;font-size:.82rem}
    .hts-rest{margin-top:14px;padding:14px;border:1px solid #2c3753;border-radius:16px;background:#0e1628}.hts-rest-time{font-size:2.3rem;font-weight:900;letter-spacing:1px}.hts-rest button{border:0;border-radius:10px;background:#2a3652;color:#fff;padding:8px 12px}
    .hts-target{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.hts-target span{border:1px solid #2c3753;border-radius:14px;padding:5px 9px;color:#b9c7e5;font-size:.78rem}
    @media(max-width:480px){.hts-grid{grid-template-columns:1fr}.hts-rpe button{padding:9px 4px}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'hts-log-modal';
  modal.innerHTML = `<div id="hts-log-sheet">
    <div class="d-flex justify-content-between align-items-center mb-3"><div><h4 class="mb-1">Allenamento</h4><div id="hts-workout-subtitle" class="hts-muted">Registra una serie</div></div><button id="hts-close" class="btn btn-sm btn-outline-light">×</button></div>
    <div id="hts-exercise-tabs" class="hts-exercise-tabs mb-3"></div>
    <div id="hts-target" class="hts-target"></div>
    <div class="hts-field mb-3"><label>Esercizio</label><input id="hts-exercise" placeholder="es. Pull-up, Squat, Panca..."></div>
    <div class="hts-grid">
      <div class="hts-field"><label>Peso (kg)</label><div class="hts-stepper"><button data-step="weight" data-delta="-0.5">−</button><input id="hts-weight" type="number" min="0" step="0.5" value="0"><button data-step="weight" data-delta="0.5">+</button></div></div>
      <div class="hts-field"><label>Ripetizioni</label><div class="hts-stepper"><button data-step="reps" data-delta="-1">−</button><input id="hts-reps" type="number" min="0" value="8"><button data-step="reps" data-delta="1">+</button></div></div>
    </div>
    <div class="hts-field mt-3"><label>RPE effettivo</label><div class="hts-rpe">${[5,6,7,8,9,10].map(v=>`<button type="button" data-rpe="${v}">${v}</button>`).join('')}</div><div class="hts-muted mt-1">8 = duro ma controllato · 10 = massimo</div></div>
    <div class="hts-grid mt-3"><div class="hts-field"><label>Serie</label><input id="hts-set" type="number" min="1" value="1"></div><div class="hts-field"><label>Note</label><input id="hts-note" placeholder="facoltative"></div></div>
    <div class="hts-actions"><button class="hts-cancel" id="hts-cancel">Chiudi</button><button class="hts-save" id="hts-save">✓ Completa serie</button></div>
    <div id="hts-rest"></div><div id="hts-log-history"></div>
  </div>`;
  document.body.appendChild(modal);

  const fab = document.createElement('button');
  fab.id = 'hts-quick-log-fab'; fab.title = 'Registra serie'; fab.innerHTML = '<i class="bi bi-plus-lg"></i>';
  document.body.appendChild(fab);

  let selectedRpe = 8;
  let selectedExercise = '';
  let restTimer = null;
  let restRemaining = 0;
  const $ = id => document.getElementById(id);

  function renderTabs() {
    const w = todayWorkout();
    const logs = readLogs();
    const names = w.exercises.length ? w.exercises : ['Cardio / corsa'];
    $('hts-exercise-tabs').innerHTML = names.map((name, i) => `<button type="button" class="${name===selectedExercise?'active':''}" data-exercise="${esc(name)}">${esc(name)}</button>`).join('');
    $('hts-exercise-tabs').querySelectorAll('[data-exercise]').forEach(b => b.addEventListener('click', () => selectExercise(b.dataset.exercise)));
    $('hts-workout-subtitle').textContent = w.title;
  }

  function renderHistory() {
    const logs = readLogs().slice(-8).reverse();
    $('hts-log-history').innerHTML = logs.length ? `<div class="hts-muted mb-1 mt-3">Ultime serie</div>` + logs.map(x => `<div class="hts-log-row"><span><strong>${esc(x.exercise)}</strong><br><span class="hts-muted">${x.weight} kg × ${x.reps} · RPE ${x.rpe} · serie ${x.set}</span></span><span class="hts-muted">${new Date(x.timestamp).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span></div>`).join('') : '';
  }

  function selectExercise(name) {
    selectedExercise = name;
    $('hts-exercise').value = name;
    const previous = lastForExercise(name);
    const targetRpe = Number(readState()?.meso?.week || 1) === 4 ? '5–6' : (Number(readState()?.meso?.week || 1) >= 3 ? '8–9' : '6–8');
    $('hts-weight').value = previous ? previous.weight : 0;
    $('hts-reps').value = previous ? previous.reps : 8;
    $('hts-set').value = previous ? Number(previous.set || 0) + 1 : 1;
    selectedRpe = previous ? Number(previous.rpe || 8) : 8;
    modal.querySelectorAll('[data-rpe]').forEach(b=>b.classList.toggle('active', Number(b.dataset.rpe)===selectedRpe));
    $('hts-target').innerHTML = `<span>Target RPE ${targetRpe}</span><span>Ultimo: ${previous ? `${previous.weight} kg × ${previous.reps}` : 'nessun dato'}</span>`;
    renderTabs();
  }

  function open() {
    const w = todayWorkout();
    selectedExercise = w.exercises[0] || '';
    renderTabs();
    if (selectedExercise) selectExercise(selectedExercise);
    else { $('hts-exercise').value=''; $('hts-target').innerHTML='<span>Oggi: sessione cardio</span>'; }
    renderHistory();
    modal.classList.add('open');
    setTimeout(() => $('hts-exercise').focus(), 80);
  }
  const close = () => { modal.classList.remove('open'); stopRest(); };

  function saveSet() {
    const exercise = $('hts-exercise').value.trim() || 'Esercizio';
    const reps = Math.max(0, Number($('hts-reps').value || 0));
    const weight = Math.max(0, Number($('hts-weight').value || 0));
    const set = Math.max(1, Number($('hts-set').value || 1));
    const state = readState();
    const entry = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), timestamp:new Date().toISOString(), date:new Date().toISOString().slice(0,10), exercise, weight, reps, rpe:selectedRpe, set, note:$('hts-note').value.trim(), workout:todayWorkout().title };
    const logs = readLogs(); logs.push(entry); localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    // Mantieni anche lo storico principale della WebApp, senza cancellare i dati esistenti.
    state.log = Array.isArray(state.log) ? state.log : [];
    state.log.push({ type:'strength', ...entry });
    state.lastSavedAt = new Date().toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    syncNative(entry);
    renderHistory();
    $('hts-set').value = set + 1;
    $('hts-note').value = '';
    startRest(90);
  }

  function startRest(seconds) {
    clearInterval(restTimer); restRemaining = seconds;
    const render = () => {
      const m = String(Math.floor(restRemaining/60)).padStart(2,'0'); const s = String(restRemaining%60).padStart(2,'0');
      $('hts-rest').innerHTML = `<div class="hts-rest"><div class="hts-muted">RECUPERO</div><div class="hts-rest-time">${m}:${s}</div><div class="d-flex gap-2"><button data-rest="-30">−30s</button><button data-rest="30">+30s</button><button data-rest="skip">Salta</button></div></div>`;
      $('hts-rest').querySelectorAll('[data-rest]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.rest;if(v==='skip'){restRemaining=0;finishRest();}else{restRemaining=Math.max(0,restRemaining+Number(v));render();}}));
    };
    render();
    restTimer = setInterval(() => { restRemaining--; if(restRemaining<=0) finishRest(); else render(); },1000);
  }
  function finishRest() { clearInterval(restTimer); restTimer=null; restRemaining=0; $('hts-rest').innerHTML='<div class="hts-rest"><strong>Recupero completato</strong><div class="hts-muted">Pronto per la prossima serie.</div></div>'; try { if(window.AndroidWidgetBridge) window.AndroidWidgetBridge.notifyRestFinished(); } catch(_){} }
  function stopRest(){ clearInterval(restTimer); restTimer=null; }

  modal.addEventListener('click', e => { if(e.target===modal) close(); });
  $('hts-close').addEventListener('click', close); $('hts-cancel').addEventListener('click', close); fab.addEventListener('click', open);
  modal.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click',()=>{const input=$(btn.dataset.step==='weight'?'hts-weight':'hts-reps');const step=Number(btn.dataset.delta);input.value=Math.max(0,Number(input.value||0)+step);}));
  modal.querySelectorAll('[data-rpe]').forEach(btn=>btn.addEventListener('click',()=>{selectedRpe=Number(btn.dataset.rpe);modal.querySelectorAll('[data-rpe]').forEach(b=>b.classList.toggle('active',Number(b.dataset.rpe)===selectedRpe));}));
  $('hts-save').addEventListener('click', saveSet);

  window.HTSWorkout = { open, close, logSet:saveSet, startRest };
  window.HTSNotifications = {
    enable:(hour=18,minute=30)=>{const s={enabled:true,hour,minute,title:'Allenamento',body:'È ora del tuo allenamento.'};localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));if(window.AndroidWidgetBridge){window.AndroidWidgetBridge.requestNotificationPermission();window.AndroidWidgetBridge.scheduleDailyNotification(Number(hour),Number(minute),s.title,s.body);}},
    disable:()=>{localStorage.removeItem(SETTINGS_KEY);if(window.AndroidWidgetBridge)window.AndroidWidgetBridge.cancelDailyNotification();}
  };
  setTimeout(()=>{ try { const logs=readLogs(); syncNative(logs[logs.length-1]||null); } catch(_){} },1200);
})();
