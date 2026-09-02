(() => {
  'use strict';
  if (window.__HTS_UI_CONSISTENCY__) return;
  window.__HTS_UI_CONSISTENCY__ = true;

  const style = document.createElement('style');
  style.id = 'hts-ui-consistency';
  style.textContent = `
    #hts-roadmap-modal{background:rgba(8,13,25,.82)!important;backdrop-filter:blur(14px)!important;padding:16px!important}
    #hts-roadmap-sheet{width:min(980px,100%)!important;max-height:92vh!important;background:linear-gradient(180deg,rgba(22,31,51,.98),rgba(15,22,40,.98))!important;border:1px solid var(--border-color,#2c3753)!important;border-radius:26px!important;box-shadow:0 20px 70px rgba(0,0,0,.45)!important;padding:22px!important}
    .hts-r-tabs button{background:rgba(255,255,255,.03)!important;border-color:var(--border-color,#2c3753)!important;color:#9fb0d0!important;border-radius:20px!important;font-weight:600!important}
    .hts-r-tabs button.active{background:var(--accent-orange,#ff5a36)!important;border-color:var(--accent-orange,#ff5a36)!important;color:#fff!important}
    .hts-r-card{background:linear-gradient(180deg,rgba(22,31,51,.96),rgba(15,22,40,.96))!important;border-color:var(--border-color,#2c3753)!important;border-radius:16px!important;box-shadow:none!important}
    .hts-r-btn{background:var(--accent-orange,#ff5a36)!important;border-radius:20px!important;font-weight:700!important}
    .hts-r-btn.alt{background:rgba(255,255,255,.06)!important;border:1px solid var(--border-color,#2c3753)!important}
    .hts-health-row{border-color:var(--border-color,#2c3753)!important}
    #hts-roadmap-fab{background:linear-gradient(160deg,var(--accent-orange-2,#ff7a52),var(--accent-orange,#ff5a36))!important;color:#fff!important;border:0!important;box-shadow:0 10px 28px rgba(255,90,54,.35)!important}
  `;
  document.head.appendChild(style);
})();
