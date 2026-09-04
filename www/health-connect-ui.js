(() => {
  'use strict';
  if (window.__HTS_HEALTH_UI_V4__) return;
  window.__HTS_HEALTH_UI_V4__ = true;

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

  function renderPermissionStatus(caps) {
    const statusEl = document.getElementById('hts-hc-status');
    if (!statusEl || !caps) return;
    if (!caps.available) {
      if (caps.status === 2) statusEl.textContent = 'Health Connect richiede installazione o aggiornamento.';
      else statusEl.textContent = 'Health Connect non disponibile su questo dispositivo.';
      return;
    }
    const labels = [
      ['Passi', caps.readSteps],
      ['Peso', caps.readWeight],
      ['Sonno', caps.readSleep],
      ['Allenamenti', caps.readExercise],
      ['Frequenza cardiaca', caps.readHeartRate],
    ];
    const granted = labels.filter(([, ok]) => ok).map(([label]) => label);
    const missing = labels.filter(([, ok]) => !ok).map(([label]) => label);
    if (!missing.length) {
      statusEl.innerHTML = 'Health Connect disponibile · <strong>tutti i permessi di lettura attivi</strong>';
    } else if (granted.length) {
      statusEl.innerHTML = `Health Connect disponibile · <strong>${esc(granted.length)}/${esc(labels.length)} permessi attivi</strong><br><small>Mancano: ${esc(missing.join(', '))}</small>`;
    } else {
      statusEl.innerHTML = 'Health Connect disponibile · <strong>nessun permesso di lettura attivo</strong>';
    }
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
      if (caps.permissionsState === 'unknown' && caps.available) {
        statusEl.textContent = 'Verifico i permessi Health Connect…';
        window.AndroidHealthBridge?.refreshHealthCapabilities?.();
        return;
      }
      renderPermissionStatus(caps);
    } catch (_) {
      statusEl.textContent = 'Impossibile verificare Health Connect.';
    }
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
      <div class="row g-3 mb-3">
        ${metricCard('bi-person-walking','Passi', n(s.steps).toLocaleString('it-IT'), `${s.lookbackDays || '—'} giorni`)}
        ${metricCard('bi-speedometer2','Peso', s.weightKg != null ? `${n(s.weightKg).toFixed(1)} kg` : '—', s.weightKg != null ? `Aggiornato ${fmtDate(s.importedAt)}` : '')}
        ${metricCard('bi-moon-stars','Sonno', fmtHours(sleepMinutes), `${s.sleepCount || 0} sessioni · media ${fmtHours(avgSleep)}`)}
        ${metricCard('bi-heart-pulse','Frequenza', hrAvg ? `${hrAvg} bpm` : '—', hrValues.length ? `${hrMin}–${hrMax} bpm · ${s.heartRateSampleCount || hrValues.length} campioni` : 'Nessun campione`)}
      </div>
      <div class="row g-3">
        <div class="col-12 col-xl-6"><div class="hts-hc-section"><div class="hts-hc-section-title"><i class="bi bi-moon-stars me-2"></i>Sonno</div>${listRows(sleeps.slice(-6).reverse(), x => `<div class="hts-hc-list-row"><div><strong>${fmtDate(x.start)}</strong><small>${fmtDateTime(x.start)} → ${fmtDateTime(x.end)}</small></div><span>${fmtHours(x.durationMinutes)}</span></div>${renderSleepStages(x)}`, 'Nessuna sessione del sonno disponibile.')}</div></div>
        <div class="col-12 col-xl-6"><div class="hts-hc-section"><div class="hts-hc-section-title"><i class="bi bi-activity me-2"></i>Allenamenti</div>${listRows(exercises.slice(-8).reverse(), x => `<div class="hts-hc-list-row"><div><strong>${esc(x.title || x.exerciseTypeName || 'Allenamento')}</strong><small>${fmtDateTime(x.start)} → ${fmtDateTime(x.end)}</small></div><span>${fmtHours(x.durationMinutes)}</span></div>`, 'Nessun allenamento disponibile.')}</div></div>
        <div class="col-12"><div class="hts-hc-section"><div class="hts-hc-section-title"><i class="bi bi-geo-alt me-2"></i>Percorsi GPS</div><div class="hts-hc-muted mb-2">${routes.length} percorsi · ${totalRouteKm.toFixed(2)} km · ${Math.round(totalElevation)} m di dislivello positivo</div>${listRows(routes.slice(-6).reverse(), x => `<div class="hts-hc-list-row"><div><strong>${esc(x.title || x.exerciseTypeName || 'Corsa')}</strong><small>${fmtDateTime(x.start)}</small></div><span>${routeDistance(x.route)} km</span></div>`, 'Nessun percorso GPS importato.')}</div></div>
      </div>`;

    root.querySelectorAll('[data-hc-days]').forEach(button => button.addEventListener('click', () => syncAndRefresh(Number(button.dataset.hcDays))));
    document.getElementById('hts-hc-open-permissions')?.addEventListener('click', () => window.HealthConnectService?.requestPermissions?.());
  }

  function ensureDashboard() {
    if (document.getElementById('hts-health-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'hts-health-modal';
    modal.className = 'hts-hc-modal';
    modal.innerHTML = `<div class="hts-hc-modal-inner"><div id="hts-health-dashboard"></div><button type="button" class="btn btn-outline-light btn-sm hts-hc-close">Chiudi</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector('.hts-hc-close')?.addEventListener('click', () => modal.classList.remove('open'));
  }

  function openDashboard() {
    ensureDashboard();
    document.getElementById('hts-health-modal')?.classList.add('open');
    renderDashboard(readSummary());
  }

  window.addEventListener('health-connect-capabilities', (event) => {
    ensureHealthPanel();
    renderPermissionStatus(event.detail || {});
  });
  window.addEventListener('health-connect-permission-state', (event) => {
    ensureHealthPanel();
    renderPermissionStatus(event.detail || {});
  });
  window.addEventListener('health-connect-permissions', () => {
    window.AndroidHealthBridge?.refreshHealthCapabilities?.();
    refreshPanel();
  });
  window.addEventListener('health-connect-error', (event) => {
    if (event.detail?.code === 'permission_denied') refreshPanel();
  });

  window.HealthConnectUI = { refreshPanel, openDashboard, syncAndRefresh };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshPanel, { once: true });
  else refreshPanel();
})();
