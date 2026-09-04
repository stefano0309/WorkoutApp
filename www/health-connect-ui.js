(() => {
  'use strict';
  if (window.__HTS_HEALTH_UI_V3__) return;
  window.__HTS_HEALTH_UI_V3__ = true;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readSummary = () => {
    try { return JSON.parse(window.AndroidHealthBridge?.readHealthSummary?.() || 'null'); } catch (_) { return null; }
  };
  const readState = () => {
    try { return JSON.parse(localStorage.getItem('hybridTrainingSystem') || '{}'); } catch (_) { return {}; }
  };
  const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('it-IT'); } catch (_) { return '—'; } };
  const fmtDateTime = (v) => { try { return new Date(v).toLocaleString('it-IT'); } catch (_) { return '—'; } };
  const fmtHours = (minutes) => `${Math.floor(n(minutes) / 60)}h ${Math.round(n(minutes) % 60)}m`;
  const routeDistance = (route) => n(route?.distanceKm).toFixed(2);

  function ensureHealthPanel() {
    if (document.getElementById('hts-health-connect-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'hts-health-connect-panel';
    panel.innerHTML = `
      <div class="hts-hc-panel-card">
        <div class="hts-hc-panel-copy">
          <div class="hts-hc-title"><i class="bi bi-heart-pulse-fill me-2"></i>Google Health · Health Connect</div>
          <div id="hts-hc-status" class="hts-hc-status">Controllo disponibilità…</div>
        </div>
        <div class="hts-hc-actions">
          <button id="hts-hc-dashboard" type="button" class="btn btn-outline-light btn-sm"><i class="bi bi-grid-1x2-fill me-1"></i>Dashboard</button>
          <button id="hts-hc-permissions" type="button" class="btn btn-outline-info btn-sm"><i class="bi bi-shield-lock me-1"></i>Permessi</button>
          <button id="hts-hc-sync" type="button" class="btn btn-info btn-sm"><i class="bi bi-arrow-repeat me-1"></i>Sincronizza</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('hts-hc-dashboard')?.addEventListener('click', openDashboard);
    document.getElementById('hts-hc-permissions')?.addEventListener('click', () => window.HealthConnectService?.requestPermissions?.());
    document.getElementById('hts-hc-sync')?.addEventListener('click', () => syncAndRefresh(30));
  }

  function refreshPanel() {
    ensureHealthPanel();
    const statusEl = document.getElementById('hts-hc-status');
    if (!statusEl) return;
    try {
      const raw = window.AndroidHealthBridge?.getHealthCapabilities?.();
      const caps = raw ? JSON.parse(raw) : null;
      if (!caps) {
        statusEl.textContent = 'Integrazione Health Connect non disponibile.';
        return;
      }
      if (caps.available) statusEl.innerHTML = 'Health Connect disponibile · <strong>dati gestibili dall’app</strong>';
      else if (caps.status === 2) statusEl.textContent = 'Health Connect richiede installazione o aggiornamento.';
      else statusEl.textContent = 'Health Connect non disponibile su questo dispositivo.';
    } catch (_) { statusEl.textContent = 'Impossibile verificare Health Connect.'; }
  }

  function syncAndRefresh(days) {
    const ok = window.HealthConnectService?.sync?.(days);
    if (!ok) return false;
    const btn = document.getElementById('hts-hc-sync');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Sincronizzo…'; }
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Sincronizza'; }
      refreshPanel();
      if (document.getElementById('hts-health-modal')?.classList.contains('open')) renderDashboard(readSummary());
    }, 1200);
    return true;
  }

  function metricCard(icon, title, value, sub) {
    return `<div class="col-6 col-xl-3"><div class="hts-hc-metric"><div class="d-flex justify-content-between align-items-start"><div class="hts-hc-icon"><i class="bi ${icon}"></i></div><span class="hts-hc-label">${esc(title)}</span></div><div class="hts-hc-value">${esc(value)}</div><div class="hts-hc-sub">${esc(sub || '')}</div></div></div>`;
  }

  function listRows(items, mapper, empty) {
    return items.length ? items.map(mapper).join('') : `<div class="hts-hc-empty">${empty}</div>`;
  }

  function getRoutes(summary) {
    const state = readState();
    const routes = Array.isArray(state?.health?.routes) ? state.health.routes : [];
    const runs = Array.isArray(summary?.runningSessions) ? summary.runningSessions : [];
    const byId = new Map(routes.filter(r => r?.sessionId).map(r => [r.sessionId, r]));
    return runs.map(r => ({ ...r, route: r.route || byId.get(r.id) || null })).filter(r => r.route);
  }

  function renderSleepStages(sleep) {
    const stages = Array.isArray(sleep?.stages) ? sleep.stages : [];
    if (!stages.length) return '<div class="hts-hc-empty">Nessuna fase del sonno disponibile.</div>';
    const labels = { 1:'Sveglio', 2:'Sonno leggero', 3:'Sonno profondo', 4:'REM', 5:'Fuori letto', 6:'Altro' };
    return `<div class="hts-hc-stage-grid">${stages.map(x => `<div class="hts-hc-stage"><strong>${esc(labels[n(x.type)] || `Fase ${x.type}`)}</strong><span>${fmtHours(x.durationMinutes)}</span><small>${new Date(x.start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} → ${new Date(x.end).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</small></div>`).join('')}</div>`;
  }

  function renderDashboard(summary) {
    const root = document.getElementById('hts-health-dashboard');
    if (!root) return;
    const s = summary || {};
    const sleeps = Array.isArray(s.sleepSessions) ? s.sleepSessions : [];
    const exercises = Array.isArray(s.exerciseSessions) ? s.exerciseSessions : [];
    const runs = Array.isArray(s.runningSessions) ? s.runningSessions : [];
    const routes = getRoutes(s);
    const sleepMinutes = n(s.sleepMinutes);
    const avgSleep = sleeps.length ? Math.round(sleepMinutes / sleeps.length) : 0;
    const hr = Array.isArray(s.heartRateSamples) ? s.heartRateSamples : [];
    const hrValues = hr.map(x => n(x.bpm, NaN)).filter(Number.isFinite);
    const hrMin = hrValues.length ? Math.min(...hrValues) : 0;
    const hrMax = hrValues.length ? Math.max(...hrValues) : 0;
    const hrAvg = hrValues.length ? Math.round(hrValues.reduce((a,b) => a+b, 0) / hrValues.length) : 0;
    const totalRouteKm = routes.reduce((a, r) => a + n(r.route?.distanceKm), 0);
    const totalElevation = routes.reduce((a, r) => a + n(r.route?.elevationGainM), 0);

    root.innerHTML = `
      <div class="hts-hc-summary-head">
        <div><div class="text-uppercase small text-info fw-bold">Health Connect</div><h4 class="mb-1">Panoramica salute</h4><div class="hts-hc-muted">${s.importedAt ? `Ultima sincronizzazione: ${fmtDateTime(s.importedAt)}` : 'Nessun dato sincronizzato'}</div></div>
        <div class="d-flex gap-2 flex-wrap justify-content-end">
          <button type="button" class="btn btn-outline-info btn-sm" data-hc-days="7">7 giorni</button>
          <button type="button" class="btn btn-outline-info btn-sm" data-hc-days="30">30 giorni</button>
          <button type="button" class="btn btn-outline-info btn-sm" data-hc-days="90">90 giorni</button>
          <button type="button" class="btn btn-outline-info btn-sm" data-hc-days="365">1 anno</button>
          <button type="button" class="btn btn-info btn-sm" id="hts-hc-open-permissions"><i class="bi bi-shield-lock me-1"></i>Gestisci accesso</button>
        </div>
      </div>
      <div class="row g-3 mt-1">
        ${metricCard('bi-footprints', 'Passi', s.steps != null ? Math.round(n(s.steps)).toLocaleString('it-IT') : '—', 'periodo sincronizzato')}
        ${metricCard('bi-speedometer2', 'Peso', s.weightKg != null ? `${n(s.weightKg).toFixed(1)} kg` : '—', 'ultima misurazione')}
        ${metricCard('bi-moon-stars-fill', 'Sonno', sleepMinutes ? fmtHours(sleepMinutes) : '—', sleeps.length ? `${sleeps.length} sessioni · media ${fmtHours(avgSleep)}` : 'nessuna sessione')}
        ${metricCard('bi-heart-pulse-fill', 'Frequenza cardiaca', hrAvg ? `${hrAvg} bpm` : '—', hrValues.length ? `${hrMin}–${hrMax} bpm · ${hrValues.length} campioni` : 'dati HR non importati')}
      </div>
      <div class="row g-3 mt-1">
        <div class="col-xl-7"><div class="hts-hc-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Allenamenti</h5><div class="hts-hc-muted">Sessioni rilevate da Health Connect</div></div><span class="badge bg-dark border">${exercises.length}</span></div><div class="hts-hc-table">${listRows(exercises.slice(-10).reverse(), r => `<div class="hts-hc-row"><div><strong>${esc(r.title || r.exerciseTypeName || 'Allenamento')}</strong><div class="hts-hc-muted">${fmtDateTime(r.start)}</div></div><div class="text-end"><strong>${Math.round(n(r.durationMinutes))} min</strong><div class="hts-hc-muted">${r.routeStatus === 'available' ? 'GPS disponibile' : r.routeStatus === 'consent_required' ? 'GPS da condividere' : 'Nessun GPS'}</div></div></div>`, 'Nessun allenamento importato.')}</div></div></div>
        <div class="col-xl-5"><div class="hts-hc-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Sonno</h5><div class="hts-hc-muted">Ultime sessioni e fasi</div></div><span class="badge bg-dark border">${sleeps.length}</span></div><div class="hts-hc-table">${listRows(sleeps.slice(-8).reverse(), x => `<div class="hts-hc-row"><div><strong>${fmtDate(x.start)}</strong><div class="hts-hc-muted">${new Date(x.start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} → ${new Date(x.end).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div></div><div class="text-end"><strong>${fmtHours(x.durationMinutes)}</strong><div class="hts-hc-muted">${Array.isArray(x.stages) ? x.stages.length : 0} fasi</div></div></div>`, 'Nessun sonno importato.')}</div></div></div>
      </div>
      <div class="row g-3 mt-1">
        <div class="col-xl-6"><div class="hts-hc-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Corse</h5><div class="hts-hc-muted">Dati attività e stato GPS</div></div><span class="badge bg-dark border">${runs.length}</span></div>${listRows(runs.slice(-8).reverse(), r => `<div class="hts-hc-row"><div><strong>${esc(r.title || r.exerciseTypeName || 'Corsa')}</strong><div class="hts-hc-muted">${fmtDateTime(r.start)} · ${Math.round(n(r.durationMinutes))} min</div></div><div class="text-end">${r.route ? `<span class="badge bg-success">${routeDistance(r.route)} km</span>` : r.hasRoute ? `<button class="btn btn-sm btn-outline-info" data-route="${esc(r.id)}">Condividi GPS</button>` : '<span class="badge bg-secondary">Senza GPS</span>'}</div></div>`, 'Nessuna corsa importata.')}</div></div>
        <div class="col-xl-6"><div class="hts-hc-card h-100"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Percorsi GPS</h5><div class="hts-hc-muted">Route consentite e analizzate</div></div><span class="badge bg-dark border">${routes.length}</span></div><div class="row g-2 mb-3"><div class="col-6"><div class="hts-hc-mini"><strong>${totalRouteKm.toFixed(2)} km</strong><span>Distanza totale</span></div></div><div class="col-6"><div class="hts-hc-mini"><strong>${Math.round(totalElevation)} m</strong><span>Dislivello positivo</span></div></div></div>${listRows(routes.slice(-6).reverse(), r => `<div class="hts-hc-row"><div><strong>${fmtDateTime(r.start || r.importedAt)}</strong><div class="hts-hc-muted">${r.route?.pointCount || 0} punti GPS</div></div><div class="text-end"><strong>${routeDistance(r.route)} km</strong><div class="hts-hc-muted">+${Math.round(n(r.route?.elevationGainM))} m</div></div></div>`, 'Nessun percorso GPS condiviso.')}</div></div>
      </div>
      <div class="hts-hc-card mt-3"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Fasi del sonno</h5><div class="hts-hc-muted">Dettaglio dell'ultima sessione disponibile</div></div></div>${renderSleepStages(sleeps[sleeps.length - 1])}</div>
      <div class="hts-hc-card mt-3"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Informazioni sincronizzazione</h5><div class="hts-hc-muted">Origine e intervallo dei dati importati</div></div></div><div class="row g-3 small"><div class="col-md-3"><span class="hts-hc-muted d-block">Sorgente</span><strong>${esc(s.source || 'Health Connect')}</strong></div><div class="col-md-3"><span class="hts-hc-muted d-block">Periodo</span><strong>${n(s.lookbackDays)} giorni</strong></div><div class="col-md-3"><span class="hts-hc-muted d-block">Inizio</span><strong>${fmtDate(s.start)}</strong></div><div class="col-md-3"><span class="hts-hc-muted d-block">Fine</span><strong>${fmtDate(s.end)}</strong></div></div></div>`;

    root.querySelectorAll('[data-hc-days]').forEach(btn => btn.addEventListener('click', () => syncAndRefresh(Number(btn.dataset.hcDays))));
    root.querySelector('#hts-hc-open-permissions')?.addEventListener('click', () => window.HealthConnectService?.requestPermissions?.());
    root.querySelectorAll('[data-route]').forEach(btn => btn.addEventListener('click', () => {
      const ok = window.HealthConnectService?.requestRoute?.(btn.dataset.route);
      if (ok) { btn.disabled = true; btn.textContent = 'Apro Condivisione…'; }
    }));
  }

  function ensureModal() {
    if (document.getElementById('hts-health-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'hts-health-modal';
    modal.className = 'hts-hc-modal';
    modal.innerHTML = `<div class="hts-hc-backdrop" data-close-hc></div><div class="hts-hc-dialog"><div class="hts-hc-dialog-head"><div><div class="text-uppercase small text-info fw-bold">Google Health</div><h3 class="mb-0">Health Connect Dashboard</h3></div><button type="button" class="btn btn-outline-light btn-sm" data-close-hc><i class="bi bi-x-lg"></i></button></div><div id="hts-health-dashboard" class="hts-hc-dialog-body"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-hc]').forEach(el => el.addEventListener('click', closeDashboard));
  }

  function openDashboard() {
    ensureModal();
    document.getElementById('hts-health-modal')?.classList.add('open');
    renderDashboard(readSummary());
    document.body.classList.add('hts-hc-modal-open');
  }

  function closeDashboard() {
    document.getElementById('hts-health-modal')?.classList.remove('open');
    document.body.classList.remove('hts-hc-modal-open');
  }

  function injectStyle() {
    if (document.getElementById('hts-health-connect-style')) return;
    const style = document.createElement('style');
    style.id = 'hts-health-connect-style';
    style.textContent = `
      .hts-health-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #2c3753}.hts-health-row:last-child{border-bottom:0}
      #hts-health-connect-panel{position:fixed;left:16px;right:16px;bottom:84px;z-index:1029;pointer-events:none}
      .hts-hc-panel-card{pointer-events:auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid #2c3753;border-radius:16px;background:rgba(18,26,45,.97);box-shadow:0 12px 35px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
      .hts-hc-title{font-weight:800;color:#eef3ff}.hts-hc-status{font-size:.78rem;color:#9fb0d0;margin-top:2px}.hts-hc-actions{display:flex;gap:8px;flex-shrink:0}
      .hts-hc-modal{position:fixed;inset:0;z-index:2000;display:none}.hts-hc-modal.open{display:block}.hts-hc-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px)}
      .hts-hc-dialog{position:relative;width:min(1200px,calc(100% - 24px));height:min(92vh,1000px);margin:4vh auto;background:#0b1020;border:1px solid #2c3753;border-radius:22px;box-shadow:0 25px 80px rgba(0,0,0,.6);overflow:hidden;display:flex;flex-direction:column}
      .hts-hc-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #2c3753;background:#10182c;flex-shrink:0}.hts-hc-dialog-body{padding:20px;overflow:auto}
      .hts-hc-card{background:linear-gradient(180deg,rgba(22,31,51,.96),rgba(15,22,40,.96));border:1px solid #2c3753;border-radius:16px;padding:16px}.hts-hc-muted{color:#9fb0d0;font-size:.82rem}.hts-hc-empty{color:#9fb0d0;padding:16px 0;text-align:center}.hts-hc-row{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid rgba(44,55,83,.7)}.hts-hc-row:last-child{border-bottom:0}
      .hts-hc-metric{height:100%;background:linear-gradient(180deg,rgba(22,31,51,.96),rgba(15,22,40,.96));border:1px solid #2c3753;border-radius:16px;padding:14px}.hts-hc-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(98,212,255,.12);color:#62d4ff}.hts-hc-label{font-size:.72rem;color:#9fb0d0;text-transform:uppercase;letter-spacing:.04em}.hts-hc-value{font-size:1.55rem;font-weight:900;margin-top:12px}.hts-hc-sub{font-size:.75rem;color:#9fb0d0;margin-top:2px}.hts-hc-mini{background:rgba(255,255,255,.03);border:1px solid #2c3753;border-radius:12px;padding:10px}.hts-hc-mini strong{display:block;font-size:1.1rem}.hts-hc-mini span{display:block;color:#9fb0d0;font-size:.72rem}
      .hts-hc-stage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.hts-hc-stage{border:1px solid #2c3753;border-radius:12px;padding:10px;background:rgba(255,255,255,.03)}.hts-hc-stage strong,.hts-hc-stage span,.hts-hc-stage small{display:block}.hts-hc-stage span{font-weight:800;margin-top:4px}.hts-hc-stage small{color:#9fb0d0;margin-top:3px}
      body.hts-hc-modal-open{overflow:hidden}
      @media(max-width:768px){#hts-health-connect-panel{bottom:76px;left:8px;right:8px}.hts-hc-panel-card{align-items:flex-start;flex-direction:column}.hts-hc-actions{width:100%;flex-wrap:wrap}.hts-hc-actions button{flex:1;min-width:110px}.hts-hc-dialog{width:calc(100% - 10px);height:96vh;margin:2vh auto;border-radius:16px}.hts-hc-dialog-head{padding:14px}.hts-hc-dialog-body{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    refreshPanel();
    const summary = readSummary();
    if (summary && document.getElementById('hts-health-modal')?.classList.contains('open')) renderDashboard(summary);
  }

  window.HealthConnectDashboard = { open: openDashboard, close: closeDashboard, refresh };
  window.addEventListener('health-connect-sync', refresh);
  window.addEventListener('health-connect-permissions', refreshPanel);
  window.addEventListener('health-connect-error', refreshPanel);
  window.addEventListener('health-connect-route', refresh);
  window.addEventListener('health-connect-state-updated', refresh);
  injectStyle();
  setTimeout(() => { ensureHealthPanel(); refresh(); }, 500);
})();
