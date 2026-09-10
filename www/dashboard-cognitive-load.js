(() => {
  "use strict";

  function escapeText(value) {
    if (typeof window.esc === "function") return window.esc(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dashboardCognitiveLoad() {
    const state = window.state;
    const schedule = window.SCHEDULE;
    const weekMap = window.WEEK;
    const streaks = typeof window.computeStreaks === "function"
      ? window.computeStreaks()
      : { current: 0, best: 0 };

    if (!state?.profile || !Array.isArray(schedule) || !weekMap) {
      return typeof window.dashboard === "function"
        ? window.dashboard()
        : "";
    }

    const week = weekMap[state.meso.week];
    const todayIndex = typeof window.todayIndex === "function" ? window.todayIndex() : 0;
    const tomorrowIndex = (todayIndex + 1) % schedule.length;
    const today = schedule[todayIndex];
    const tomorrow = schedule[tomorrowIndex];
    const completion = typeof window.dayCompletion === "function"
      ? window.dayCompletion.bind(window)
      : () => false;
    const todayDone = completion(todayIndex);
    const tomorrowDone = completion(tomorrowIndex);
    const sessionCount = Object.keys(state.sessions || {}).filter((key) =>
      key.startsWith(`w${state.meso.week}-`),
    ).length;
    const weeklyPercent = Math.min(100, Math.round((sessionCount / 5) * 100));
    const latestMetric = Array.isArray(state.metrics) && state.metrics.length
      ? [...state.metrics].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1)
      : null;
    const initials = (state.profile.id || "U").slice(0, 2).toUpperCase();

    const actionLabel = todayDone ? "Rivedi sessione" : "Inizia sessione";
    const action = today.patterns?.length
      ? `openDay(${todayIndex})`
      : "route('corsa')";

    return `
      <section class="dashboard-priority" aria-labelledby="dashboard-priority-title">
        <div class="dashboard-priority__header">
          <div class="d-flex align-items-center gap-3">
            <div class="avatar-circle" aria-hidden="true">${escapeText(initials)}</div>
            <div>
              <div class="text-secondary small">Oggi</div>
              <h1 id="dashboard-priority-title" class="dashboard-priority__title">${escapeText(today.title)}</h1>
              <p class="dashboard-priority__subtitle">${escapeText(today.day)} · ${escapeText(today.cardio)}</p>
            </div>
          </div>
          <span class="badge ${week.badge}">W${state.meso.week} · ${escapeText(week.name)}</span>
        </div>

        <div class="dashboard-priority__body">
          <div>
            <div class="dashboard-eyebrow">Prossima azione</div>
            <p class="dashboard-priority__focus">${todayDone ? "Hai completato il lavoro previsto oggi." : "Concentrati solo sulla sessione prevista oggi."}</p>
            <button class="btn btn-primary dashboard-primary-action" type="button" onclick="${action}">
              ${actionLabel} <i class="bi bi-arrow-right ms-1" aria-hidden="true"></i>
            </button>
          </div>
          <div class="dashboard-priority__tomorrow" aria-label="Domani">
            <div class="dashboard-eyebrow">Domani</div>
            <div class="fw-bold">${escapeText(tomorrow.title)}</div>
            <div class="small text-secondary">${tomorrowDone ? "Completato" : escapeText(tomorrow.cardio)}</div>
          </div>
        </div>
      </section>

      <section class="dashboard-metrics" aria-label="Metriche principali">
        <article class="dashboard-metric">
          <div class="dashboard-eyebrow">Settimana</div>
          <strong>${weeklyPercent}%</strong>
          <span>${sessionCount} / 5 sessioni</span>
        </article>
        <article class="dashboard-metric" role="button" tabindex="0" onclick="route('statistiche')" onkeydown="if(event.key==='Enter'||event.key===' ')route('statistiche')">
          <div class="dashboard-eyebrow">Costanza</div>
          <strong>${streaks.current} gg</strong>
          <span>Record ${streaks.best} gg</span>
        </article>
        <article class="dashboard-metric">
          <div class="dashboard-eyebrow">Ultima misura</div>
          <strong>${latestMetric?.weight != null ? `${latestMetric.weight} kg` : "—"}</strong>
          <span>${latestMetric?.bodyFat != null ? `BF ${latestMetric.bodyFat}%` : "Nessuna BF registrata"}</span>
        </article>
      </section>

      <section class="dashboard-rule" aria-label="Regola prioritaria">
        <div>
          <div class="dashboard-eyebrow">Regola del sistema</div>
          <strong>Forza prima della corsa</strong>
          <p>Completa prima il modulo forza previsto; il cardio facile resta secondario.</p>
        </div>
        ${
          typeof window.route === "function"
            ? '<button class="btn btn-sm btn-outline-light" type="button" onclick="route(\'mesociclo\')">Vedi piano</button>'
            : ""
        }
      </section>

      <details class="dashboard-details">
        <summary>
          <span>Piano settimanale</span>
          <span class="text-secondary">Dettagli e tutte le sessioni</span>
        </summary>
        <div class="table-responsive mt-3">
          <table class="table table-dark table-hover align-middle mb-0">
            <caption class="visually-hidden">Sessioni della settimana ${state.meso.week}</caption>
            <thead class="text-secondary">
              <tr><th>Giorno</th><th>Sessione</th><th>Focus</th><th>Cardio</th><th></th></tr>
            </thead>
            <tbody>
              ${schedule.map((item, index) => `
                <tr>
                  <td><span class="badge bg-secondary">${escapeText(item.day)}</span></td>
                  <td><strong>${escapeText(item.title)}</strong></td>
                  <td class="text-secondary">${escapeText(item.focus)}</td>
                  <td><span class="badge bg-dark border text-light">${escapeText(item.cardio)}</span></td>
                  <td class="text-end"><button class="btn btn-sm btn-outline-light" type="button" onclick="openDay(${index})">Apri <i class="bi bi-arrow-right" aria-hidden="true"></i></button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </details>
    `;
  }

  function install() {
    if (typeof window.render !== "function" || typeof window.dashboard !== "function") {
      window.setTimeout(install, 0);
      return;
    }
    if (window.__HTS_DASHBOARD_COGNITIVE_LOAD_V1__) return;
    window.__HTS_DASHBOARD_COGNITIVE_LOAD_V1__ = true;
    window.dashboard = dashboardCognitiveLoad;
    window.render();
  }

  install();
})();
