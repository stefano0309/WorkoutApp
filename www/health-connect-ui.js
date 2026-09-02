(() => {
  'use strict';
  if (window.__HTS_HEALTH_UI_V1__) return;
  window.__HTS_HEALTH_UI_V1__ = true;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readSummary = () => {
    try { return JSON.parse(window.AndroidHealthBridge?.readHealthSummary?.() || 'null'); } catch (_) { return null; }
  };
  const routeDistance = (route) => Number(route?.distanceKm || 0).toFixed(2);

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
    const style = document.createElement('style');
    style.textContent = '.hts-health-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #2c3753}.hts-health-row:last-child{border-bottom:0}';
    document.head.appendChild(style);
  }

  function refresh() {
    const summary = readSummary();
    if (summary) renderHealthDetails(summary);
  }

  window.addEventListener('health-connect-sync', event => renderHealthDetails(event.detail));
  window.addEventListener('health-connect-route', refresh);
  window.addEventListener('health-connect-state-updated', refresh);
  injectStyle();
  setTimeout(refresh, 800);
})();
