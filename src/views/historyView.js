(function (global) {
  function renderHistoryList({ history, adminAuthenticated, onDelete }) {
    const historyList = document.getElementById("historyList");
    if (!historyList) return;

    if (!Array.isArray(history) || history.length === 0) {
      historyList.innerHTML = '<p class="muted">Sin partidos registrados</p>';
      return;
    }

    const validMatches = history.filter(
      (m) => m.teamA && m.teamB && m.teamA.length > 0 && m.teamB.length > 0
    );

    const orderedMatches = [...validMatches].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    if (validMatches.length === 0) {
      historyList.innerHTML = '<p class="muted">Sin partidos registrados</p>';
      return;
    }

    historyList.innerHTML = orderedMatches
      .map((m) => {
        const matchId = encodeURIComponent(String(m.id ?? ""));
        const matchDate = encodeURIComponent(String(m.date ?? ""));
        const matchLocation = String(m.location || m.matchLocation || m.place || "").trim();
        const mapsLink = String(m.mapsUrl || "").trim() ||
          (matchLocation
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(matchLocation)}`
            : "");

        return `
    <article class="card match-entry" style="position:relative;">
      ${
        adminAuthenticated
          ? `<button class="match-delete-btn" data-match-id="${matchId}" data-match-date="${matchDate}" style="position:absolute; top:8px; right:8px; background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:600; font-size:14px;">✕</button>`
          : ""
      }
      <div class="match-date">${m.date}</div>
      ${matchLocation ? `<div style="margin:0 0 10px 0;"><a class="muted" href="${mapsLink}" target="_blank" rel="noopener noreferrer">📍 ${matchLocation}</a></div>` : ""}

      <div class="match-grid">
        <div>
          <div class="match-team" style="font-weight:700; color:#10b981; margin-bottom:12px; font-size:13px; padding:8px; background:#ecfdf5; border-radius:6px;">● TEAM A</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${m.teamA.map((player) => `<span class="match-player">${player}</span>`).join("")}
          </div>
        </div>

        <div class="match-center">
          <div class="match-score">
            <span>${m.scoreA !== undefined ? m.scoreA : "—"}</span>
            <span class="dash">−</span>
            <span>${m.scoreB !== undefined ? m.scoreB : "—"}</span>
          </div>
          ${m.mvp ? `<div class="match-mvp">⭐ ${m.mvp}</div>` : ""}
        </div>

        <div style="text-align:right;">
          <div class="match-team" style="font-weight:700; color:#3b82f6; margin-bottom:12px; font-size:13px; padding:8px; background:#eff6ff; border-radius:6px;">TEAM B ●</div>
          <div style="display:flex; flex-direction:column; gap:8px; ">
            ${m.teamB.map((player) => `<span class="match-player">${player}</span>`).join("")}
          </div>
        </div>
      </div>
    </article>
  `;
      })
      .join("");

    if (adminAuthenticated && typeof onDelete === "function") {
      historyList.querySelectorAll(".match-delete-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = decodeURIComponent(btn.dataset.matchId || "");
          const date = decodeURIComponent(btn.dataset.matchDate || "");
          onDelete(id, date);
        });
      });
    }
  }

  global.HistoryView = {
    renderHistoryList,
  };
})(window);
