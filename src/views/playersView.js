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

  function getTrendMeta(direction) {
    if (direction === "up") {
      return { symbol: "▲", className: "rating-trend rating-trend--up", label: "en alza" };
    }
    if (direction === "down") {
      return { symbol: "▼", className: "rating-trend rating-trend--down", label: "en baja" };
    }
    return { symbol: "", className: "rating-trend", label: "estable" };
  }

  function renderPlayersList({
    players,
    playerSearchTerm,
    adminAuthenticated,
    onEdit,
    onDelete,
    onRatingClick,
    onNameClick,
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
        const ratingAverage = Number(player.communityAverage ?? 0).toFixed(1);
        const ratingIcon = player.communityStatus === "validated" ? "⭐" : "⏳";
        const ratingValue = player.communityStatus === "validated"
          ? ratingAverage
          : "XX";
        const canOpenRating = player.communityStatus === "validated";
        const ratingDisabledAttr = canOpenRating ? "" : " disabled aria-disabled=\"true\"";
        const trendDirection = canOpenRating ? String(player.communityTrendDirection || "flat") : "flat";
        const trendMeta = getTrendMeta(trendDirection);
        const trendMarkup = trendMeta.symbol
          ? ` <span class="${trendMeta.className}" aria-hidden="true">${trendMeta.symbol}</span>`
          : "";
        const ratingTitle = canOpenRating
          ? `Ver rating (${trendMeta.label})`
          : "Disponible con más votos";
        const ratingClass = player.communityStatus === "validated"
          ? "player-community player-community--ok player-community--rating"
          : "player-community player-community--pending player-community--rating";
        const statusMarkup = `<button type="button" class="${ratingClass}" data-rating-id="${player.id}" title="${ratingTitle}"${ratingDisabledAttr}>${ratingIcon} <span class="rating-value">${ratingValue}</span>${trendMarkup}</button>`;
        const statsText = `A ${effectiveAttack} · D ${effectiveDefense} · M ${effectiveMidfield}`;
        const statsMarkup = adminAuthenticated
          ? `<span class="player-stats">${escapeHtml(statsText)}</span>`
          : "";

        const deleteControl = adminAuthenticated
          ? `<button class="btn-delete" data-id="${player.id}" title="Eliminar">🗑️</button>`
          : "";
        const editButtonClass = yaVotaste ? "btn-edit btn-edit--voted" : "btn-edit";
        const editButtonTitle = yaVotaste ? "Editar voto" : "Votar";
        const editButtonLabel = yaVotaste ? "✏️ EDITAR" : "🗳️ VOTAR";

        const adminControls = `<div class="admin-controls">
          <button class="${editButtonClass}" data-id="${player.id}" title="${editButtonTitle}">${editButtonLabel}</button>
          ${deleteControl}
        </div>`;

        return `
          <article class="card">
            <div class="player-info">
              <div class="player-name player-name--editable" data-id="${player.id}" title="Editar nombre">
                ${escapeHtml(player.name)} ${nick}
              </div>
              <div class="player-meta">
                ${statusMarkup}
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
    playersList.querySelectorAll(".player-community--rating").forEach((button) => {
      button.addEventListener("click", () => onRatingClick?.(button.dataset.ratingId));
    });
    playersList.querySelectorAll(".player-name--editable").forEach((el) => {
      el.addEventListener("click", () => onNameClick?.(el.dataset.id));
    });
  }

  global.PlayersView = {
    renderPlayersList,
  };
})(window);
