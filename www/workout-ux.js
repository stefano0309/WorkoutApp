(() => {
  'use strict';
  if (window.__HTS_UX_V2__) return;
  window.__HTS_UX_V2__ = true;

  const LOG_KEY = 'hybridTrainingWorkoutLog';
  const SETTINGS_KEY = 'hybridTrainingNotificationSettings';

  const readLogs = () => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
  };
  const saveLogs = (logs) => {
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    syncNative();
  };
  const syncNative = () => {
    try {
      const logs = readLogs();
      const last = logs[logs.length - 1] || {};
      if (window.AndroidWidgetBridge) {
        window.AndroidWidgetBridge.syncWorkoutLog(JSON.stringify(last));
      }
    } catch (_) {}
  };

  const style = document.createElement('style');
  style.textContent = `
    #hts-quick-log-fab{position:fixed;right:18px;bottom:88px;z-index:1100;width:58px;height:58px;border:0;border-radius:50%;background:#ff5a36;color:#fff;box-shadow:0 8px 25px rgba(0,0,0,.4);font-size:1.35rem;font-weight:800}
    #hts-log-modal{position:fixed;inset:0;z-index:1200;background:rgba(4,8,18,.78);backdrop-filter:blur(8px);display:none;align-items:flex-end;justify-content:center;padding:12px}
    #hts-log-modal.open{display:flex}
    #hts-log-sheet{width:min(680px,100%);max-height:90vh;overflow:auto;background:#121a2d;border:1px solid #2c3753;border-radius:24px;padding:20px;color:#eef3ff}
    .hts-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hts-field label{display:block;font-size:.78rem;color:#9fb0d0;margin-bottom:5px}.hts-field input{width:100%;background:#19233a;border:1px solid #2c3753;color:#fff;border-radius:12px;padding:12px;font-size:1rem}
    .hts-stepper{display:flex;gap:6px}.hts-stepper button{width:44px;border:0;border-radius:12px;background:#2a3652;color:#fff;font-size:1.2rem}.hts-stepper input{text-align:center;min-width:0}
    .hts-rpe{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.hts-rpe button{border:1px solid #2c3753;background:#19233a;color:#fff;border-radius:10px;padding:10px}.hts-rpe button.active{background:#ff5a36;border-color:#ff5a36}
    .hts-actions{display:flex;gap:8px;margin-top:14px}.hts-actions button{flex:1;padding:13px;border-radius:14px;border:0;font-weight:700}.hts-save{background:#ff5a36;color:#fff}.hts-cancel{background:#2a3652;color:#fff}
    #hts-log-history{margin-top:16px}.hts-log-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #2c3753}.hts-muted{color:#9fb0d0;font-size:.82rem}
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'hts-log-modal';
  modal.innerHTML = `<div id="hts-log-sheet">
    <div class="d-flex justify-content-between align-items-center mb-3"><div><h4 class="mb-1">Registra serie</h4><div class="hts-muted">Inserimento rapido: peso, ripetizioni e RPE</div></div><button id="hts-close" class="btn btn-sm btn-outline-light">×</button></div>
    <div class="hts-field mb-3"><label>Esercizio</label><input id="hts-exercise" placeholder="es. Pull-up, Squat, Panca..."></div>
    <div class="hts-grid">
      <div class="hts-field"><label>Peso (kg)</label><div class="hts-stepper"><button data-step="weight" data-delta="-0.5">−</button><input id="hts-weight" type="number" step="0.5" value="0"><button data-step="weight" data-delta="0.5">+</button></div></div>
      <div class="hts-field"><label>Ripetizioni</label><div class="hts-stepper"><button data-step="reps" data-delta="-1">−</button><input id="hts-reps" type="number" min="0" value="8"><button data-step="reps" data-delta="1">+</button></div></div>
    </div>
    <div class="hts-field mt-3"><label>RPE</label><div class="hts-rpe">${[5,6,7,8,9,10].map(v=>`<button type="button" data-rpe="${v}">${v}</button>`).join('')}</div></div>
    <div class="hts-grid mt-3"><div class="hts-field"><label>Serie</label><input id="hts-set" type="number" min="1" value="1"></div><div class="hts-field"><label>Note</label><input id="hts-note" placeholder="facoltative"></div></div>
    <div class="hts-actions"><button class="hts-cancel" id="hts-cancel">Annulla</button><button class="hts-save" id="hts-save">Salva serie</button></div>
    <div id="hts-log-history"></div>
  </div>`;
  document.body.appendChild(modal);

  const fab = document.createElement('button');
  fab.id = 'hts-quick-log-fab'; fab.title = 'Registra allenamento'; fab.innerHTML = '+';
  document.body.appendChild(fab);

  let selectedRpe = 8;
  const $ = id => document.getElementById(id);
  const renderHistory = () => {
    const logs = readLogs().slice(-5).reverse();
    $('hts-log-history').innerHTML = logs.length ? `<div class="hts-muted mb-1">Ultime serie</div>` + logs.map(x => `<div class="hts-log-row"><span><strong>${escapeHtml(x.exercise)}</strong><br><span class="hts-muted">${x.weight} kg × ${x.reps} · RPE ${x.rpe}</span></span><span class="hts-muted">${new Date(x.timestamp).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span></div>`).join('') : '';
  };
  const open = () => { renderHistory(); modal.classList.add('open'); $('hts-exercise').focus(); };
  const close = () => modal.classList.remove('open');
  const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  fab.addEventListener('click', open); $('hts-close').addEventListener('click', close); $('hts-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => { const input = $(btn.dataset.step === 'weight' ? 'hts-weight' : 'hts-reps'); input.value = Math.max(0, Number(input.value || 0) + Number(btn.dataset.delta)); }));
  modal.querySelectorAll('[data-rpe]').forEach(btn => btn.addEventListener('click', () => { selectedRpe = Number(btn.dataset.rpe); modal.querySelectorAll('[data-rpe]').forEach(b=>b.classList.toggle('active', Number(b.dataset.rpe)===selectedRpe)); }));
  $('hts-save').addEventListener('click', () => {
    const exercise = $('hts-exercise').value.trim() || 'Esercizio';
    const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), timestamp: new Date().toISOString(), exercise, weight:Number($('hts-weight').value||0), reps:Number($('hts-reps').value||0), rpe:selectedRpe, set:Number($('hts-set').value||1), note:$('hts-note').value.trim() };
    const logs = readLogs(); logs.push(entry); saveLogs(logs); renderHistory();
    $('hts-exercise').value=''; $('hts-note').value=''; $('hts-set').value=Number(entry.set)+1;
  });

  // Local notification preferences and a simple daily reminder.
  const notify = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (s.enabled && window.AndroidWidgetBridge) window.AndroidWidgetBridge.scheduleDailyNotification(Number(s.hour ?? 18), Number(s.minute ?? 30), s.title || 'Allenamento', s.body || 'È ora del tuo allenamento.');
    } catch (_) {}
  };
  window.HTSNotifications = { enable:(hour=18,minute=30)=>{const s={enabled:true,hour,minute,title:'Allenamento',body:'È ora del tuo allenamento.'};localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));if(window.AndroidWidgetBridge) window.AndroidWidgetBridge.requestNotificationPermission();notify();}, disable:()=>{localStorage.removeItem(SETTINGS_KEY);if(window.AndroidWidgetBridge) window.AndroidWidgetBridge.cancelDailyNotification();} };
  setTimeout(()=>{syncNative();notify();},1000);
})();
