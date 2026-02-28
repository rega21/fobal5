(function (global) {
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shufflePlayers(list) {
    const items = [...(list || [])];
    for (let index = items.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
    }
    return items;
  }

  function renderPlayersList({
    players,
    playerSearchTerm,
    adminAuthenticated,
    onEdit,
    onDelete,
  }) {
    const playersTitle = document.getElementById("playersTitle");
    const playersList = document.getElementById("playersList");
    if (!playersList) return;

    const term = (playerSearchTerm || "").trim().toLowerCase();
    const filteredPlayers = term
      ? players.filter((player) => {
          const haystack = `${player.name} ${player.nickname || ""}`.toLowerCase();
          return haystack.includes(term);
        })
      : players;

    if (playersTitle) {
      playersTitle.textContent = "Players";
    }

    if (filteredPlayers.length === 0) {
      playersList.innerHTML = '<p class="muted">Sin resultados</p>';
      return;
    }

    const visualPlayers = shufflePlayers(filteredPlayers);

    playersList.innerHTML = visualPlayers
      .map((player) => {
        const nick = player.nickname?.trim()
          ? `<span class="player-nick">"${escapeHtml(player.nickname)}"</span>`
          : "";
        const votes = Number(player.communityVotes) || 0;
        const minVotes = Number(player.communityMinVotes) || 3;
        const statusClass = player.communityStatus === "validated"
          ? "player-community player-community--ok"
          : "player-community player-community--pending";
        const statusText = player.communityStatus === "validated"
          ? "✔ Validado"
          : `🗳️ Voto pueblo (${votes}/${minVotes})`;
        const effectiveAttack = Number(player.effectiveAttack ?? player.attack ?? 0);
        const effectiveDefense = Number(player.effectiveDefense ?? player.defense ?? 0);
        const effectiveMidfield = Number(player.effectiveMidfield ?? player.midfield ?? 0);
        const statsText = `A ${effectiveAttack} · D ${effectiveDefense} · M ${effectiveMidfield}`;
        const statsMarkup = adminAuthenticated
          ? `<span class="player-stats">${escapeHtml(statsText)}</span>`
          : "";

        const deleteControl = adminAuthenticated
          ? `<button class="btn-delete" data-id="${player.id}" title="Eliminar">🗑️</button>`
          : "";

          const adminControls = `<div class="admin-controls">
            <button class="btn-edit" data-id="${player.id}" title="Calificar">✏️</button>
              ${deleteControl}
            </div>`;

        return `
          <article class="card">
            <div class="player-info">
              <div class="player-name">
                ${escapeHtml(player.name)} ${nick}
              </div>
              <div class="player-meta">
                <span class="${statusClass}">${statusText}</span>
                ${statsMarkup}
              </div>
            </div>
            ${adminControls}
          </article>
        `;
      })
      .join("");

    playersList.querySelectorAll(".btn-edit").forEach((button) => {
      button.addEventListener("click", () => onEdit?.(button.dataset.id));
    });

    playersList.querySelectorAll(".btn-delete").forEach((button) => {
      button.addEventListener("click", () => {
        if (confirm("¿Eliminar jugador?")) {
          onDelete?.(button.dataset.id);
        }
      });
    });
  }

  global.PlayersView = {
    renderPlayersList,
  };
})(window);
