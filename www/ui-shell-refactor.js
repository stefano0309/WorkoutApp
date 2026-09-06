(() => {
  'use strict';
  if (window.__HTS_UI_SHELL_REFACTOR_V1__) return;
  window.__HTS_UI_SHELL_REFACTOR_V1__ = true;

  const SALUTE_ID = 'hts-salute-nav';

  const style = `
    :root {
      --hts-surface: rgba(18,26,45,.94);
      --hts-surface-2: rgba(255,255,255,.045);
      --hts-border: rgba(159,176,208,.18);
      --hts-text: #eef3ff;
      --hts-muted: #9fb0d0;
      --hts-accent: #ff5a36;
      --hts-accent-2: #62d4ff;
      --hts-success: #35d07f;
      --hts-radius: 18px;
    }
    body { color: var(--hts-text); }
    .sidebar { padding: 16px !important; }
    .sidebar .nav { gap: 6px !important; }
    .sidebar .nav-link {
      border-radius: 12px;
      padding: 10px 12px;
      color: var(--hts-muted);
      font-weight: 650;
      transition: background .18s ease, color .18s ease, transform .18s ease, border-color .18s ease;
      border: 1px solid transparent;
    }
    .sidebar .nav-link:hover { background: var(--hts-surface-2); color: var(--hts-text); transform: translateX(2px); }
    .sidebar .nav-link.active { background: rgba(255,90,54,.14); color: #fff; border-color: rgba(255,90,54,.25); }
    .sidebar #hts-salute-nav {
      margin-top: 6px;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      border: 1px solid rgba(98,212,255,.18);
      background: linear-gradient(135deg,rgba(98,212,255,.10),rgba(255,90,54,.08));
      color: var(--hts-text);
      border-radius: 13px;
      padding: 10px 12px;
      font-weight: 750;
      cursor: pointer;
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }
    .sidebar #hts-salute-nav:hover { transform: translateX(2px); border-color: rgba(98,212,255,.42); }
    #hts-salute-nav .hts-salute-icon { width: 30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(255,90,54,.16);color:#ff7a52; }
    .card.card-custom { border-radius: var(--hts-radius); border-color: var(--hts-border); box-shadow: 0 10px 30px rgba(0,0,0,.12); }
    .form-control, .form-select { border-radius: 11px !important; border-color: var(--hts-border) !important; }
    .btn { border-radius: 11px; font-weight: 650; }
    .btn-primary, .btn-info { box-shadow: 0 7px 18px rgba(0,0,0,.12); }
    .table { --bs-table-border-color: var(--hts-border); }
    .alert { border-radius: 14px !important; }
    .page-head, h3, h4, h5 { letter-spacing: -.01em; }
    .bottom-nav-pill { padding: 5px; gap: 3px; backdrop-filter: blur(14px); border-color: var(--hts-border); }
    .bottom-nav-item { transition: transform .16s ease, background .16s ease, color .16s ease; }
    .bottom-nav-item:active { transform: scale(.94); }
    #hts-health-connect-panel { bottom: 92px !important; }
    @media (max-width: 991.98px) {
      #app { padding-top: 14px !important; }
      .fab-log-btn { box-shadow: 0 12px 28px rgba(0,0,0,.35); }
    }
    @media (max-width: 575.98px) {
      .sidebar { display:none !important; }
      .menu-grid { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
      .menu-tile { min-height: 80px; padding: 12px 8px; }
      .menu-tile i { font-size: 1.25rem; }
      .card.card-custom { border-radius: 15px; }
    }
  `;

  function injectStyle() {
    if (document.getElementById('hts-ui-shell-style')) return;
    const s = document.createElement('style');
    s.id = 'hts-ui-shell-style';
    s.textContent = style;
    document.head.appendChild(s);
  }

  function openSalute() {
    try { window.closeModal?.(); } catch (_) {}
    if (window.HealthDashboard?.open) window.HealthDashboard.open();
    else if (typeof window.route === 'function') window.route('salute');
  }

  function makeButton(classes, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classes;
    b.dataset.htsSalute = '1';
    b.setAttribute('aria-label', 'Apri Salute');
    b.innerHTML = label;
    b.addEventListener('click', openSalute);
    return b;
  }

  function ensureSidebar() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector(`[data-hts-salute="1"]`)) return;
    const b = makeButton('nav-link', '<span class="hts-salute-icon"><i class="bi bi-heart-pulse-fill"></i></span><span>Salute</span>');
    b.id = SALUTE_ID;
    nav.appendChild(b);
  }

  function ensureBottomNav() {
    const nav = document.getElementById('bottomNav');
    if (!nav || nav.querySelector(`[data-hts-salute="1"]`)) return;
    const b = makeButton('bottom-nav-item', '<i class="bi bi-heart-pulse-fill"></i><span class="d-none">Salute</span>');
    nav.appendChild(b);
  }

  function ensureFullMenu() {
    const grids = document.querySelectorAll('.menu-grid');
    grids.forEach((grid) => {
      if (grid.querySelector(`[data-hts-salute="1"]`)) return;
      const b = makeButton('menu-tile', '<i class="bi bi-heart-pulse-fill"></i><span>Salute</span>');
      grid.appendChild(b);
    });
  }

  function syncShell() {
    ensureSidebar();
    ensureBottomNav();
    ensureFullMenu();
    refreshActive();
  }

  function patchRoute() {
    if (window.__HTS_SALUTE_ROUTE_PATCHED__ || typeof window.route !== 'function') return;
    const original = window.route;
    window.route = function(page, ...args) {
      const result = page === 'salute'
        ? openSalute()
        : original.call(this, page, ...args);
      syncShell();
      return result;
    };
    window.__HTS_SALUTE_ROUTE_PATCHED__ = true;
  }

  function refreshActive() {
    const isOpen = Boolean(document.getElementById('hts-health-page'));
    document.querySelectorAll('[data-hts-salute="1"]').forEach((el) => {
      el.classList.toggle('active', isOpen);
      el.setAttribute('aria-current', isOpen ? 'page' : 'false');
    });
  }

  function boot() {
    injectStyle();
    syncShell();
    patchRoute();
    window.addEventListener('health-connect-sync', refreshActive);
    window.addEventListener('health-connect-heart-rate', refreshActive);
    window.addEventListener('health-connect-route', refreshActive);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
