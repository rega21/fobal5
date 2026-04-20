(function (global) {
  let matchSongAudio = null;
  let isSongPlaying = false;
  let isSongBusy = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderMatchPlayersList({
    players,
    selectedPlayers,
    onSelectionChanged,
  }) {
    const matchPlayersList = document.getElementById("matchPlayersList");
    if (!matchPlayersList) return;

    const controls = document.querySelector("#matchSelection .match-controls");
    if (controls) controls.classList.remove("hidden");

    const selectedIds = new Set((selectedPlayers || []).map((player) => String(player.id)));

    matchPlayersList.innerHTML = (players || [])
      .map((player) => {
        const playerId = String(player.id);
        const isSelected = selectedIds.has(playerId);
        const disabled = selectedIds.size >= 10 && !isSelected ? "disabled" : "";
        const hasNickname = Boolean(player.nickname?.trim());

        return `
          <article class="card card-selectable ${isSelected ? "selected" : ""}" data-id="${playerId}">
            <div class="player-name">
              ${escapeHtml(player.name)}${hasNickname ? `<span class="player-nick">${escapeHtml(player.nickname.trim())}</span>` : ""}
            </div>
            <label class="checkbox">
              <input type="checkbox" ${isSelected ? "checked" : ""} ${disabled} data-id="${playerId}">
              <span class="checkbox-visual"></span>
            </label>
          </article>
        `;
      })
      .join("");

    const syncSelectionState = () => {
      const checkedIds = Array.from(
        matchPlayersList.querySelectorAll('input[type="checkbox"][data-id]:checked')
      ).map((input) => String(input.dataset.id));

      const ready = checkedIds.length === 10;
      matchPlayersList.querySelectorAll(".card-selectable").forEach((card) => {
        const checkbox = card.querySelector("input");
        if (!checkbox) return;

        card.classList.toggle("selected", checkbox.checked);
        checkbox.disabled = ready && !checkbox.checked;
        card.classList.toggle("is-disabled", checkbox.disabled && !checkbox.checked);
      });

      const startBtn = document.getElementById("startMatchBtn");
      const genBtn = document.getElementById("generateBalancedBtn");
      const genManualBtn = document.getElementById("generateManualBtn");
      const matchCount = document.getElementById("matchCount");

      if (matchCount) {
        matchCount.textContent = `${checkedIds.length}/10`;
        matchCount.classList.toggle("ready", ready);
      }
      if (startBtn) startBtn.disabled = !ready;
      if (genBtn) genBtn.disabled = !ready;
      if (genManualBtn) genManualBtn.disabled = !ready;

      onSelectionChanged?.(checkedIds);
    };

    matchPlayersList.querySelectorAll(".card-selectable").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest(".checkbox")) return;

        const checkbox = card.querySelector("input");
        if (checkbox?.disabled) return;
        checkbox.click();
      });

      const checkbox = card.querySelector("input");
      checkbox?.addEventListener("change", syncSelectionState);
    });

    syncSelectionState();
  }

  function setLocationHint(message = "") {
    const hintEl = document.getElementById("matchLocationHint");
    if (!hintEl) return;

    if (!message) {
      hintEl.textContent = "";
      hintEl.classList.add("hidden");
      return;
    }

    hintEl.textContent = message;
    hintEl.classList.remove("hidden");
  }

  function setDetectedAddressDetails(address = "", mapsUrl = "") {
    const locationInput = document.getElementById("matchLocation");
    const mapsBtn = document.getElementById("openMapsBtn");
    const trimmedAddress = String(address || "").trim();
    const trimmedMapsUrl = String(mapsUrl || "").trim();
    const locationValue = String(locationInput?.value || "").trim();

    if (locationInput) {
      locationInput.dataset.detectedAddress = trimmedAddress;
    }

    if (mapsBtn) {
      mapsBtn.dataset.mapsUrl = trimmedMapsUrl;
      mapsBtn.disabled = !trimmedMapsUrl && !locationValue;
    }
  }

  function buildMapsSearchUrl(location = "", address = "") {
    const query = [String(location || "").trim(), String(address || "").trim()].filter(Boolean).join(", ");
    if (!query) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function buildMapsShortShareUrl(location = "", address = "") {
    const query = [String(location || "").trim(), String(address || "").trim()].filter(Boolean).join(" ");
    if (!query) return "";
    return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
  }

  function parseYouTubeVideoId(url = "") {
    return String(url || "").trim();
  }

  function setSongToggleButtonState({ icon = "", title = "", disabled = false, pressed = false } = {}) {
    const button = document.getElementById("matchSongToggleBtn");
    if (!button) return;

    if (icon) button.textContent = icon;
    if (title) {
      button.title = title;
      button.setAttribute("aria-label", title);
    }
    button.disabled = !!disabled;
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
    button.classList.toggle("is-playing", !!pressed);
  }

  function syncSongButtonFromState() {
    setSongToggleButtonState({
      icon: isSongPlaying ? "⏸️" : "🔊",
      title: isSongPlaying ? "Pausar canción" : "Reproducir canción",
      disabled: isSongBusy,
      pressed: isSongPlaying,
    });
  }

  function ensureMatchSongAudio(mp3Url) {
    if (!matchSongAudio) {
      matchSongAudio = new Audio(mp3Url);
      matchSongAudio.crossOrigin = "anonymous";
      matchSongAudio.loop = true;
      matchSongAudio.addEventListener("play", () => {
        isSongPlaying = true;
        syncSongButtonFromState();
      });
      matchSongAudio.addEventListener("pause", () => {
        isSongPlaying = false;
        syncSongButtonFromState();
      });
      matchSongAudio.addEventListener("ended", () => {
        isSongPlaying = false;
        syncSongButtonFromState();
      });
      matchSongAudio.addEventListener("error", (event) => {
        console.error("Error cargando audio:", event);
        isSongPlaying = false;
        isSongBusy = false;
        syncSongButtonFromState();
        alert("No se pudo cargar la canción. Verifica la URL o permisos CORS.");
      });
    }
    return matchSongAudio;
  }

  async function toggleMatchSong(mp3Url = "") {
    const url = parseYouTubeVideoId(mp3Url);
    if (!url) {
      alert("URL de canción inválida");
      return;
    }

    if (isSongBusy) return;
    isSongBusy = true;
    syncSongButtonFromState();

    try {
      const audio = ensureMatchSongAudio(url);

      if (audio.paused) {
        await audio.play();
        isSongPlaying = true;
      } else {
        audio.pause();
        isSongPlaying = false;
      }
    } catch (error) {
      console.error("No se pudo reproducir/pausar la canción:", error);
      alert("No se pudo reproducir la canción");
      isSongPlaying = false;
    } finally {
      isSongBusy = false;
      syncSongButtonFromState();
    }
  }

  function stopMatchSong() {
    if (matchSongAudio) {
      matchSongAudio.pause();
      matchSongAudio.currentTime = 0;
    }
    isSongPlaying = false;
    isSongBusy = false;
    syncSongButtonFromState();
  }

  function getMatchSetupValues() {
    const location = document.getElementById("matchLocation")?.value.trim() || "";
    const address = document.getElementById("matchLocation")?.dataset.detectedAddress?.trim() || "";
    const scheduledAt = document.getElementById("matchDatetime")?.value || "";
    const mapsUrl = document.getElementById("openMapsBtn")?.dataset.mapsUrl?.trim() || "";
    return { location, address, scheduledAt, mapsUrl };
  }

  function setMatchSetupValues({ location = "", scheduledAt = "", fallbackScheduledAt = "", address = "", mapsUrl = "" } = {}) {
    const locationInput = document.getElementById("matchLocation");
    const datetimeInput = document.getElementById("matchDatetime");

    if (locationInput) locationInput.value = location || "";
    if (datetimeInput) datetimeInput.value = scheduledAt || fallbackScheduledAt || "";
    setDetectedAddressDetails(address, mapsUrl);
  }

  function getOpenMapsUrl() {
    return document.getElementById("openMapsBtn")?.dataset.mapsUrl?.trim() || "";
  }

  function openDetectedLocationInMaps() {
    const { location, address, mapsUrl } = getMatchSetupValues();
    const resolvedMapsUrl = mapsUrl || buildMapsSearchUrl(location, address);

    if (!resolvedMapsUrl) {
      alert("Primero selecciona un lugar para abrirlo en Google Maps");
      return;
    }

    window.open(resolvedMapsUrl, "_blank", "noopener,noreferrer");
  }

  let swapSelection = null;
  let swapOnSwapCallback = null;
  let swapListenersAttached = false;

  function initSwapListeners() {
    if (swapListenersAttached) return;
    swapListenersAttached = true;

    ["teamA", "teamB"].forEach((id) => {
      const container = document.getElementById(id);
      if (!container) return;
      container.addEventListener("click", (e) => {
        if (!swapOnSwapCallback) return;
        const el = e.target.closest(".team-player");
        if (!el) return;

        const team = el.dataset.team;
        const index = parseInt(el.dataset.index);

        if (!swapSelection) {
          swapSelection = { team, index, el };
          el.classList.add("swap-selected");
          return;
        }

        if (swapSelection.el === el) {
          el.classList.remove("swap-selected");
          swapSelection = null;
          return;
        }

        if (swapSelection.team === team) {
          swapSelection.el.classList.remove("swap-selected");
          swapSelection = { team, index, el };
          el.classList.add("swap-selected");
          return;
        }

        const idxA = team === "a" ? index : swapSelection.index;
        const idxB = team === "b" ? index : swapSelection.index;

        // Capturar posiciones antes del swap (FLIP)
        const rectA = swapSelection.team === "a" ? swapSelection.el.getBoundingClientRect() : el.getBoundingClientRect();
        const rectB = swapSelection.team === "b" ? swapSelection.el.getBoundingClientRect() : el.getBoundingClientRect();

        swapSelection.el.classList.remove("swap-selected");
        swapSelection = null;
        swapOnSwapCallback(idxA, idxB);

        // Animar después del re-render
        requestAnimationFrame(() => {
          const newElA = document.querySelector(`#teamA [data-index="${idxA}"]`);
          const newElB = document.querySelector(`#teamB [data-index="${idxB}"]`);
          if (!newElA || !newElB) return;

          const dxA = rectB.left - rectA.left;
          const dyA = rectB.top - rectA.top;
          const dxB = rectA.left - rectB.left;
          const dyB = rectA.top - rectB.top;

          newElA.style.transition = "none";
          newElB.style.transition = "none";
          newElA.style.transform = `translate(${dxA}px, ${dyA}px)`;
          newElB.style.transform = `translate(${dxB}px, ${dyB}px)`;

          requestAnimationFrame(() => {
            newElA.style.transition = "transform 0.35s ease";
            newElB.style.transition = "transform 0.35s ease";
            newElA.style.transform = "";
            newElB.style.transform = "";

            setTimeout(() => {
              newElA.classList.add("swap-done");
              newElB.classList.add("swap-done");
              setTimeout(() => {
                newElA.classList.remove("swap-done");
                newElB.classList.remove("swap-done");
              }, 5000);
            }, 350);
          });
        });
      });
    });
  }

  function renderTeams({ teams, onSwap }) {
    const teamA = document.getElementById("teamA");
    const teamB = document.getElementById("teamB");
    if (!teamA || !teamB || !teams) return;

    swapSelection = null;
    swapOnSwapCallback = onSwap || null;

    const renderPlayer = (player, team, index) =>
      `<div class="team-player" data-team="${team}" data-index="${index}" style="cursor:${onSwap ? 'pointer' : 'default'}">${escapeHtml(player.nickname?.trim() || player.name)}</div>`;

    teamA.innerHTML = (teams.a || []).map((p, i) => renderPlayer(p, "a", i)).join("");
    teamB.innerHTML = (teams.b || []).map((p, i) => renderPlayer(p, "b", i)).join("");

    if (onSwap) initSwapListeners();
  }

  const FAVORITE_REASONS = [
    "se los ve con más hambre",
    "tienen la defensa más sólida",
    "meten más presión arriba",
    "corren más que nadie",
    "tienen energía infinita",
    "juegan más en equipo",
    "se ven más enchufados",
    "tienen mejor pie",
    "están más finos últimamente",
    "se mueven mejor sin la pelota",
    "tienen más experiencia en el grupo",
    "están en un gran momento de forma",
    "su físico está a full",
    "tienen mejor salida desde atrás",
    "se communican mejor en la cancha",
  ];

  function pickReasons(n) {
    const shuffled = [...FAVORITE_REASONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  function buildFavoriteMsg(teams) {
    const avgA = (teams.a || []).reduce((s, p) => s + (p.rating || 0), 0) / ((teams.a || []).length || 1);
    const avgB = (teams.b || []).reduce((s, p) => s + (p.rating || 0), 0) / ((teams.b || []).length || 1);
    const diff = Math.abs(avgA - avgB);

    if (diff < 0.15) {
      return "Las estadísticas no se animan a elegir favorito — esto se define en la cancha.";
    }

    const favorite = avgA > avgB ? "Equipo A" : "Equipo B";
    const reasons = pickReasons(2);
    return `Según las estadísticas, el favorito del encuentro es ${favorite} — ${reasons[0]} y ${reasons[1]}.`;
  }

  function renderConfirmedTeams({ teams }) {
    const teamA = document.getElementById("resultTeamA");
    const teamB = document.getElementById("resultTeamB");
    if (!teamA || !teamB || !teams) return;

    teamA.innerHTML = (teams.a || [])
      .map((player) => `<div class="team-player">${escapeHtml(player.nickname?.trim() || player.name)}</div>`)
      .join("");

    teamB.innerHTML = (teams.b || [])
      .map((player) => `<div class="team-player">${escapeHtml(player.nickname?.trim() || player.name)}</div>`)
      .join("");

    const msg = document.getElementById("matchFavoriteMsg");
    if (msg) msg.textContent = buildFavoriteMsg(teams);
  }

  function populateMvpOptions({ teams }) {
    const mvpSelect = document.getElementById("mvpSelect");
    if (!mvpSelect || !teams) return;

    const allPlayers = [...(teams.a || []), ...(teams.b || [])];
    mvpSelect.innerHTML = '<option value="">Select MVP</option>'
      + allPlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.nickname?.trim() || player.name)}</option>`).join("");
  }

  function showSetupState() {
    document.getElementById("matchSelection")?.classList.add("hidden");
    document.getElementById("manualTeamSelection")?.classList.add("hidden");
    document.getElementById("matchSetup")?.classList.remove("hidden");
    document.getElementById("matchResults")?.classList.add("hidden");
    syncSongButtonFromState();
  }

  function showResultsState() {
    document.getElementById("matchSelection")?.classList.add("hidden");
    document.getElementById("manualTeamSelection")?.classList.add("hidden");
    document.getElementById("matchSetup")?.classList.add("hidden");
    document.getElementById("matchResults")?.classList.remove("hidden");
  }

  function showSelectionState() {
    document.getElementById("matchResults")?.classList.add("hidden");
    document.getElementById("matchSetup")?.classList.add("hidden");
    document.getElementById("matchSelection")?.classList.remove("hidden");
  }

  function backToSetupState() {
    document.getElementById("matchResults")?.classList.add("hidden");
    document.getElementById("matchSetup")?.classList.remove("hidden");
  }

  function resetMatchResultInputs() {
    const scoreTeamA = document.getElementById("scoreTeamA");
    const scoreTeamB = document.getElementById("scoreTeamB");
    const mvpSelect = document.getElementById("mvpSelect");

    if (scoreTeamA) scoreTeamA.value = 0;
    if (scoreTeamB) scoreTeamB.value = 0;
    if (mvpSelect) mvpSelect.value = "";
  }

  global.MatchView = {
    renderMatchPlayersList,
    renderTeams,
    renderConfirmedTeams,
    populateMvpOptions,
    buildMapsSearchUrl,
    buildMapsShortShareUrl,
    showSetupState,
    showResultsState,
    showSelectionState,
    backToSetupState,
    resetMatchResultInputs,
    setLocationHint,
    setDetectedAddressDetails,
    getMatchSetupValues,
    setMatchSetupValues,
    getOpenMapsUrl,
    openDetectedLocationInMaps,
    toggleMatchSong,
    stopMatchSong,
  };
})(window);
