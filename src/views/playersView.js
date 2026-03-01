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

  let previousVisualOrderIds = [];
  let previousSearchTerm = "";

  function normalizePlayerId(playerOrId) {
    if (playerOrId && typeof playerOrId === "object") {
      return String(playerOrId.id ?? "").trim();
    }
    return String(playerOrId ?? "").trim();
  }

  function areCurrentIdsSubsetOfPrevious(previousIds, currentIds) {
    if (!Array.isArray(previousIds) || !Array.isArray(currentIds)) return false;
    if (currentIds.length === 0 || previousIds.length === 0) return false;
    const previousSet = new Set(previousIds);
    return currentIds.every((id) => previousSet.has(id));
  }

  function resolveVisualPlayers(filteredPlayers, term, preserveOrder) {
    const normalizedTerm = String(term || "");
    const currentIds = filteredPlayers.map((player) => normalizePlayerId(player));
    const canReuseOrder =
      preserveOrder &&
      normalizedTerm === previousSearchTerm &&
      areCurrentIdsSubsetOfPrevious(previousVisualOrderIds, currentIds);

    if (canReuseOrder) {
      const playersById = new Map(filteredPlayers.map((player) => [normalizePlayerId(player), player]));
      return previousVisualOrderIds
        .map((id) => playersById.get(id))
        .filter(Boolean);
    }

    const shuffledPlayers = shufflePlayers(filteredPlayers);
    previousVisualOrderIds = shuffledPlayers.map((player) => normalizePlayerId(player));
    previousSearchTerm = normalizedTerm;
    return shuffledPlayers;
  }

  function renderPlayersList({
    players,
    playerSearchTerm,
    adminAuthenticated,
    onEdit,
    onDelete,
    preserveOrder = false,
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
    if (filteredPlayers.length === 0) {
      playersList.innerHTML = '<p class="muted">Sin resultados</p>';
      return;
    }

    const visualPlayers = resolveVisualPlayers(filteredPlayers, term, preserveOrder);

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
          : (adminAuthenticated ? `🗳️ Voto pueblo (${votes}/${minVotes})` : "🗳️ Voto pueblo");
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

        // Verificar si el usuario ya votó a este jugador
        let votedPlayers = [];
        try {
          votedPlayers = JSON.parse(localStorage.getItem("fobal5_voted_players") || "[]");
        } catch (_error) {
          votedPlayers = [];
        }
        const playerIdNormalized = String(player.id).trim().toLowerCase();
        const yaVotaste = !adminAuthenticated && votedPlayers
          .map((id) => String(id).trim().toLowerCase())
          .includes(playerIdNormalized);
        const editButtonClass = yaVotaste ? "btn-edit btn-edit--voted" : "btn-edit";
        const editButtonTitle = yaVotaste ? "Actualizar voto" : "Calificar";
        const editButtonIcon = yaVotaste ? "📝" : "✏️";

        const adminControls = `<div class="admin-controls">
          <button class="${editButtonClass}" data-id="${player.id}" title="${editButtonTitle}">${editButtonIcon}</button>
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
