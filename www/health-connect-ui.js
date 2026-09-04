(() => {
  'use strict';
  if (window.__HTS_HEALTH_UI_V2__) return;
  window.__HTS_HEALTH_UI_V2__ = true;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readSummary = () => {
    try { return JSON.parse(window.AndroidHealthBridge?.readHealthSummary?.() || 'null'); } catch (_) { return null; }
  };
  const routeDistance = (route) => Number(route?.distanceKm || 0).toFixed(2);

  function ensureHealthPanel() {
    if (document.getElementById('hts-health-connect-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'hts-health-connect-panel';
    panel.innerHTML = `
      <div class="hts-hc-panel-card">
        <div class="hts-hc-panel-copy">
          <div class="hts-hc-title"><i class="bi bi-heart-pulse-fill me-2"></i>Connessione Salute</div>
          <div id="hts-hc-status" class="hts-hc-status">Controllo disponibilità…</div>
        </div>
        <div class="hts-hc-actions">
          <button id="hts-hc-permissions" type="button" class="btn btn-outline-info btn-sm">Concedi accesso</button>
          <button id="hts-hc-sync" type="button" class="btn btn-info btn-sm">Sincronizza</button>
        </div>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('hts-hc-permissions')?.addEventListener('click', () => window.HealthConnectService?.requestPermissions?.());
    document.getElementById('hts-hc-sync')?.addEventListener('click', () => window.HealthConnectService?.sync?.(30));
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
      if (caps.available) {
        statusEl.innerHTML = 'Health Connect disponibile · <strong>accesso ai dati gestibile</strong>';
      } else if (caps.status === 2) {
        statusEl.textContent = 'Health Connect richiede installazione o aggiornamento.';
      } else {
        statusEl.textContent = 'Health Connect non disponibile su questo dispositivo.';
      }
    } catch (_) {
      statusEl.textContent = 'Impossibile verificare Health Connect.';
    }
  }

  function renderHealthDetails(summary) {
    const host = document.querySelector('#hts-r-content');
    if (!host) return;
    const sleeps = Array.isArray(summary?.sleepSessions) ? summary.sleepSessions : [];
    const exercises = Array.isArray(summary?.runningSessions) ? summary.runningSessions : [];
    const allExercises = Array.isArray(summary?.exerciseSessions) ? summary.exerciseSessions : [];

    const sleepRows = sleeps.slice(-7).reverse().map(s => `<div class="hts-health-row"><div><strong>${new Date(s.start).toLocaleDateString('it-IT')}</strong><div class="hts-r-muted">${new Date(s.start).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} → ${new Date(s.end).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</div></div><div class="text-end"><strong>${Math.round(Number(s.durationMinutes||0)/60)}h ${Number(s.durationMinutes||0)%60}m</strong><div class="hts-r-muted">${Array.isArray(s.stages)?s.stages.length:0} fasi</div></div></div>`).join('') || '<div class="hts-r-muted">Nessuna sessione di sonno importata nel periodo.</div>';

    const runRows = exercises.slice(-8).reverse().map(r => {
      const route = r.route;
      const routeAction = r.hasRoute && !route && r.id ? `<button class="btn btn-sm btn-outline-info" data-route="${esc(r.id)}">Condividi GPS</button>` : route ? `<span class="badge bg-success">GPS ${routeDistance(route)} km</span>` : `<span class="badge bg-secondary">Senza GPS</span>`;
      return `<div class="hts-health-row"><div><strong>${esc(r.title || r.exerciseTypeName || 'Corsa')}</strong><div class="hts-r-muted">${new Date(r.start).toLocaleString('it-IT')} · ${Math.round(Number(r.durationMinutes||0))} min</div></div><div class="text-end">${routeAction}<div class="hts-r-muted mt-1">${r.hasRoute ? (route ? `${route.pointCount} punti` : 'route disponibile') : 'nessuna route'}</div></div></div>`;
    }).join('') || '<div class="hts-r-muted">Nessuna corsa importata nel periodo.</div>';

    const exerciseRows = allExercises.slice(-8).reverse().map(r => `<div class="hts-health-row"><div><strong>${esc(r.title || r.exerciseTypeName || 'Allenamento')}</strong><div class="hts-r-muted">${new Date(r.start).toLocaleString('it-IT')}</div></div><div class="text-end"><strong>${Math.round(Number(r.durationMinutes||0))} min</strong><div class="hts-r-muted">RPE ${r.rpe ?? '—'}</div></div></div>`).join('') || '<div class="hts-r-muted">Nessun esercizio importato.</div>';

    const details = document.createElement('div');
    details.id = 'hts-health-details';
    details.innerHTML = `
      <div class="hts-r-card mt-3"><h5 class="mb-2">Sonno importato</h5>${sleepRows}</div>
      <div class="hts-r-card mt-3"><div class="d-flex justify-content-between align-items-center"><h5 class="mb-2">Corse importate</h5><span class="badge bg-dark border">${exercises.length}</span></div>${runRows}</div>
      <div class="hts-r-card mt-3"><div class="d-flex justify-content-between align-items-center"><h5 class="mb-2">Sessioni esercizio</h5><span class="badge bg-dark border">${allExercises.length}</span></div>${exerciseRows}</div>`;
    const old = document.getElementById('hts-health-details');
    if (old) old.replaceWith(details); else host.appendChild(details);

    details.querySelectorAll('[data-route]').forEach(btn => btn.addEventListener('click', () => {
      const ok = window.HealthConnectService?.requestRoute?.(btn.dataset.route);
      if (ok) { btn.disabled = true; btn.textContent = 'Apro Condivisione…'; }
    }));
  }

  function injectStyle() {
    if (document.getElementById('hts-health-connect-style')) return;
    const style = document.createElement('style');
    style.id = 'hts-health-connect-style';
    style.textContent = `
      .hts-health-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #2c3753}.hts-health-row:last-child{border-bottom:0}
      #hts-health-connect-panel{position:fixed;left:16px;right:16px;bottom:84px;z-index:1029;pointer-events:none}
      .hts-hc-panel-card{pointer-events:auto;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid #2c3753;border-radius:16px;background:rgba(18,26,45,.97);box-shadow:0 12px 35px rgba(0,0,0,.35);backdrop-filter:blur(12px)}
      .hts-hc-title{font-weight:800;color:#eef3ff}.hts-hc-status{font-size:.78rem;color:#9fb0d0;margin-top:2px}.hts-hc-actions{display:flex;gap:8px;flex-shrink:0}@media(max-width:576px){.hts-hc-panel-card{align-items:flex-start;flex-direction:column}.hts-hc-actions{width:100%}.hts-hc-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function refresh() {
    refreshPanel();
    const summary = readSummary();
    if (summary) renderHealthDetails(summary);
  }

  window.addEventListener('health-connect-sync', event => { refreshPanel(); renderHealthDetails(event.detail); });
  window.addEventListener('health-connect-permissions', refreshPanel);
  window.addEventListener('health-connect-error', refreshPanel);
  window.addEventListener('health-connect-route', refresh);
  window.addEventListener('health-connect-state-updated', refresh);
  injectStyle();
  setTimeout(refresh, 400);
})();
