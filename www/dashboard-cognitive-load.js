(() => {
  "use strict";

  function buildCognitiveView() {
    const originalDashboard = window.__HTS_ORIGINAL_DASHBOARD__;
    if (typeof originalDashboard !== "function") return "";

    const template = document.createElement("template");
    template.innerHTML = originalDashboard();
    const root = template.content;

    // Remove the duplicated today/tomorrow timeline. The primary hero already
    // communicates the same decision in a more actionable form.
    const activityHeading = [...root.querySelectorAll("h5, h4, h3")].find(
      (node) => node.textContent?.trim() === "Attività di Oggi",
    );
    activityHeading?.closest(".card")?.remove();

    // Keep the full microcycle available, but collapsed by default so the
    // dashboard opens on today's decision instead of seven rows of detail.
    const microcycleHeading = [...root.querySelectorAll("h5, h4, h3")].find(
      (node) => node.textContent?.trim().startsWith("Microciclo Settimana"),
    );
    const microcycleCard = microcycleHeading?.closest(".card");
    if (microcycleCard) {
      const details = document.createElement("details");
      details.className = "dashboard-details";

      const summary = document.createElement("summary");
      summary.innerHTML = `
        <span>Piano settimanale</span>
        <span class="text-secondary">Apri dettagli</span>
      `;

      const content = document.createElement("div");
      content.className = "dashboard-details__content";
      content.append(...microcycleCard.childNodes);

      details.append(summary, content);
      microcycleCard.replaceWith(details);
    }

    // Make the existing main action visually dominant without changing its
    // behavior or routing contract.
    root.querySelectorAll(".start-pill-btn").forEach((button) => {
      button.classList.add("dashboard-primary-action");
      button.setAttribute("type", "button");
    });

    const app = root.querySelector("main");
    if (app) app.setAttribute("aria-label", "Dashboard operativo");

    return root.textContent ? template.innerHTML : originalDashboard();
  }

  function install() {
    if (window.__HTS_DASHBOARD_COGNITIVE_LOAD_V1__) return;
    if (typeof window.dashboard !== "function" || typeof window.render !== "function") {
      window.setTimeout(install, 0);
      return;
    }

    window.__HTS_ORIGINAL_DASHBOARD__ = window.dashboard;
    window.__HTS_DASHBOARD_COGNITIVE_LOAD_V1__ = true;
    window.dashboard = buildCognitiveView;
    window.render();
  }

  install();
})();
