const HISTORY_KEY = "fobal5_history";
const ADMIN_PIN = "";
let adminAuthenticated = false;
let currentEditingPlayerId = null;

let players = [];
let selectedPlayers = [];
let currentTeams = null;
let playerSearchTerm = "";
let currentMatchDetails = null;
let pendingHistoryResultMatchId = "";
let selectedPlaceData = null;
let googleMapsPlacesPromise = null;
let previousGoogleAuthFailureHandler = null;
const SOCCER_PLACE_KEYWORDS = ["futbol", "fútbol", "cancha", "soccer", "football", "futsal", "papi"];
const SOCCER_PLACE_TYPES = ["stadium", "sports_complex", "gym"];
const MATCH_SONG_MP3_URL = "https://zguqyimgxppglgrblvim.supabase.co/storage/v1/object/public/futbolApp/notaigenerated-fifa-298032.mp3";

const GOOGLE_MAPS_API_KEY = window.APP_CONFIG?.GOOGLE_MAPS_API_KEY || "";

const authClient = window.AuthApi || null;

const apiClient = window.FobalApi || {
  async getPlayers() {
    const res = await fetch("https://698cdcb221a248a27362c974.mockapi.io/players");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async createPlayer(body) {
    const res = await fetch("https://698cdcb221a248a27362c974.mockapi.io/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async updatePlayer(id, body) {
    const res = await fetch(`https://698cdcb221a248a27362c974.mockapi.io/players/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async deletePlayer(id) {
    const res = await fetch(`https://698cdcb221a248a27362c974.mockapi.io/players/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
  async getMatches() {
    const res = await fetch("https://698cdcb221a248a27362c974.mockapi.io/matches");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async createMatch(body) {
    const res = await fetch("https://698cdcb221a248a27362c974.mockapi.io/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async updateMatch(id, body) {
    const res = await fetch(`https://698cdcb221a248a27362c974.mockapi.io/matches/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  async deleteMatch(id) {
    const res = await fetch(`https://698cdcb221a248a27362c974.mockapi.io/matches/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
};

const historyController = window.createHistoryController
  ? window.createHistoryController({
      historyKey: HISTORY_KEY,
      apiClient,
      isAdmin: () => adminAuthenticated,
      onResolveResult: (matchId) => openPendingResultModal(matchId),
    })
  : {
      getHistory: () => [],
      fetchMatches: async () => {},
      renderHistory: () => {},
      deleteMatch: async () => {},
      pushMatch: () => {},
    };

const matchController = window.createMatchController
  ? window.createMatchController({ apiClient })
  : {
      createRandomTeams(selectedPlayers) {
        const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
        return { a: shuffled.slice(0, 5), b: shuffled.slice(5, 10) };
      },
      createBalancedTeams(selectedPlayers) {
        const withScore = selectedPlayers.map((player) => ({
          ...player,
          score:
            (Number(player.attack) || 0) +
            (Number(player.defense) || 0) +
            (Number(player.midfield) || 0),
        }));
        withScore.sort((left, right) => right.score - left.score);
        const teamA = [];
        const teamB = [];
        let sumA = 0;
        let sumB = 0;
        for (const player of withScore) {
          if (teamA.length < 5 && (sumA <= sumB || teamB.length >= 5)) {
            teamA.push(player);
            sumA += player.score;
          } else {
            teamB.push(player);
            sumB += player.score;
          }
        }
        return { a: teamA, b: teamB };
      },
      buildWhatsAppText(currentTeams) {
        if (!currentTeams) return "";
        const cleanShareToken = (value) => String(value ?? "")
          .normalize("NFC")
          .replace(/\u00A0/g, " ")
          .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
          .replace(/[\*_~`]/g, "")
          .trim();
        const teamANames = currentTeams.a.map((player) => `- ${cleanShareToken(player.name)}`).join("\n");
        const teamBNames = currentTeams.b.map((player) => `- ${cleanShareToken(player.name)}`).join("\n");
        return `Team A:\n${teamANames}\n\nTeam B:\n${teamBNames}`;
      },
      buildMatchPayload(currentTeams, details = {}, scoreA, scoreB, mvpName, options = {}) {
        return {
          id: options?.id || details?.matchId || "",
          status: options?.status || "played",
          date: details?.datetimeDisplay || new Date().toLocaleString(),
          location: details?.location || "",
          address: details?.address || "",
          scheduledAt: details?.scheduledAt || "",
          placeId: details?.placeId || "",
          mapsUrl: details?.mapsUrl || "",
          latitude: details?.latitude ?? null,
          longitude: details?.longitude ?? null,
          teamA: currentTeams.a.map((player) => player.name),
          teamB: currentTeams.b.map((player) => player.name),
          scoreA: scoreA ?? null,
          scoreB: scoreB ?? null,
          mvp: mvpName || null,
        };
      },
      async saveMatch(match) {
        let storedMatch = { ...match };
        try {
          const hasMatchId =
            match?.id !== null && match?.id !== undefined && String(match.id).trim() !== "";

          const payload = { ...match };
          delete payload.id;

          if (hasMatchId && typeof apiClient.updateMatch === "function") {
            const updated = await apiClient.updateMatch(match.id, payload);
            if (updated && typeof updated === "object") {
              storedMatch = updated;
            }
          } else {
            const created = await apiClient.createMatch(payload);
            if (created && typeof created === "object") {
              storedMatch = created;
            }
          }
        } catch (error) {
          console.error("Error saving match to API:", error);
        }
        return storedMatch;
      },
      assignPlayerTeam(currentTeams, selectedPlayers, playerId, team) {
        const baseTeams = currentTeams || { a: [], b: [] };
        const player = selectedPlayers.find((item) => String(item.id) === String(playerId));
        if (!player) return baseTeams;

        const nextTeams = {
          a: baseTeams.a.filter((item) => String(item.id) !== String(playerId)),
          b: baseTeams.b.filter((item) => String(item.id) !== String(playerId)),
        };

        if (team === "a" && nextTeams.a.length < 5) {
          nextTeams.a.push(player);
        } else if (team === "b" && nextTeams.b.length < 5) {
          nextTeams.b.push(player);
        }

        return nextTeams;
      },
    };

const whatsappShareService = window.createWhatsAppShareService
  ? window.createWhatsAppShareService()
  : {
      sanitizeShareText: (value) => String(value ?? "")
        .normalize("NFC")
        .replace(/\u00A0/g, " ")
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
        .replace(/\uFFFD+/g, "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
        .replace(/[\*_~`]/g, "")
        .trim(),
      buildShareMessage({ location = "", datetime = "", teamsText = "", mapsUrl = "" } = {}) {
        const cleanLocation = this.sanitizeShareText(location);
        const cleanDatetime = this.sanitizeShareText(datetime);
        const cleanTeamsText = this.sanitizeShareText(teamsText);
        const cleanMapsUrl = this.sanitizeShareText(mapsUrl);
        const headerParts = [];
        if (cleanLocation) headerParts.push(`Location: ${cleanLocation}`);
        if (cleanDatetime) headerParts.push(`Date: ${cleanDatetime}`);
        const sections = [];
        if (headerParts.length > 0) sections.push(headerParts.join("\n"));
        if (cleanTeamsText) sections.push(cleanTeamsText);
        if (cleanMapsUrl) sections.push(`Map:\n${cleanMapsUrl}`);
        return this.sanitizeShareText(sections.join("\n\n")).replace(/\n{3,}/g, "\n\n");
      },
      async shareText(text) {
        const cleanText = this.sanitizeShareText(text);
        if (!cleanText) return { status: "empty", text: "" };
        const encodedText = encodeURIComponent(cleanText);
        const waWebUrl = `https://wa.me/?text=${encodedText}`;
        let popup = null;
        try {
          popup = window.open(waWebUrl, "_blank", "noopener,noreferrer");
        } catch {
          popup = null;
        }
        if (popup) return { status: "opened", text: cleanText };
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(cleanText);
            return { status: "copied", text: cleanText };
          } catch {
            return { status: "manual", text: cleanText };
          }
        }
        return { status: "manual", text: cleanText };
      },
    };

const adminPlayersController = window.createAdminPlayersController
  ? window.createAdminPlayersController({
      apiClient,
  authClient,
      adminPin: ADMIN_PIN,
      getPlayers: () => players,
      setPlayers: (nextPlayers) => {
        players = nextPlayers;
      },
      getIsAdmin: () => adminAuthenticated,
      setIsAdmin: (nextValue) => {
        adminAuthenticated = nextValue;
      },
      onPlayersChanged: () => {
        renderPlayers();
        renderAdminPlayers();
      },
      onAuthChanged: () => {
        updateAdminUI();
        renderPlayers();
      },
    })
  : null;

/* Utils */
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shufflePlayers(list = []) {
  const items = [...list];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

let toastTimeoutId = null;
function showToast(message = "", duration = 2000) {
  const text = String(message || "").trim();
  if (!text) return;

  let toastEl = document.getElementById("appToast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "appToast";
    toastEl.style.position = "fixed";
    toastEl.style.left = "50%";
    toastEl.style.bottom = "88px";
    toastEl.style.transform = "translateX(-50%)";
    toastEl.style.background = "rgba(17, 24, 39, 0.92)";
    toastEl.style.color = "#fff";
    toastEl.style.padding = "10px 14px";
    toastEl.style.borderRadius = "10px";
    toastEl.style.fontSize = "13px";
    toastEl.style.fontWeight = "600";
    toastEl.style.zIndex = "1600";
    toastEl.style.boxShadow = "0 10px 20px rgba(0,0,0,.25)";
    toastEl.style.opacity = "0";
    toastEl.style.transition = "opacity .18s ease";
    toastEl.style.pointerEvents = "none";
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = text;
  toastEl.style.opacity = "1";

  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toastEl.style.opacity = "0";
  }, Math.max(800, Number(duration) || 2000));
}

function renderAdminPlayers() {
  // Placeholder to refresh admin-related UI after changes
  // For now, refresh match players list so views stay in sync
  try { renderMatchPlayers(); } catch (e) { /* ignore */ }
}

/* API calls */
async function fetchPlayers() {
  if (adminPlayersController) {
    await adminPlayersController.fetchPlayers();
    return;
  }

  try {
    const data = await apiClient.getPlayers();
    players = data || [];
    renderPlayers();
  } catch (e) {
    console.error("Error fetching players:", e);
    players = [];
  }
}

async function fetchMatches() {
  await historyController.fetchMatches();
  updateMatchCreationLockUi();
}

async function addPlayer(name, nickname, attack = 0, defense = 0, midfield = 0) {
  if (adminPlayersController) {
    await adminPlayersController.addPlayer(name, nickname, attack, defense, midfield);
    return;
  }

  if (!adminAuthenticated) {
    alert("Solo el admin puede agregar jugadores");
    return;
  }
  try {
    const body = { name, nickname: nickname || "", attack, defense, midfield };
    const newPlayer = await apiClient.createPlayer(body);
    players.push(newPlayer);
    renderPlayers();
    renderAdminPlayers();
  } catch (e) {
    console.error("Error adding player:", e);
  }
}

async function deletePlayer(id) {
  if (adminPlayersController) {
    await adminPlayersController.deletePlayer(id);
    return;
  }

  if (!adminAuthenticated) {
    alert("Solo el admin puede eliminar jugadores");
    return;
  }
  try {
    await apiClient.deletePlayer(id);
    players = players.filter(p => p.id !== id);
    renderPlayers();
    renderAdminPlayers();
  } catch (e) {
    console.error("Error deleting player:", e);
  }
}

async function updatePlayer(id, name, nickname, attack, defense, midfield) {
  if (adminPlayersController) {
    await adminPlayersController.updatePlayer(id, name, nickname, attack, defense, midfield);
    return;
  }

  try {
    await apiClient.updatePlayer(id, {
      name,
      nickname: nickname || "",
      attack: attack || 0,
      defense: defense || 0,
      midfield: midfield || 0,
    });
    const player = players.find(p => p.id === id);
    if (player) {
      player.name = name;
      player.nickname = nickname || "";
      player.attack = attack || 0;
      player.defense = defense || 0;
      player.midfield = midfield || 0;
    }
    renderPlayers();
    renderAdminPlayers();
  } catch (e) {
    console.error("Error updating player:", e);
  }
}

/* Players view */
function renderPlayers() {
  if (window.PlayersView?.renderPlayersList) {
    window.PlayersView.renderPlayersList({
      players,
      playerSearchTerm,
      adminAuthenticated,
      onEdit: (id) => editPlayer(id),
      onDelete: (id) => deletePlayer(id),
    });
    return;
  }

  const playersTitle = document.getElementById("playersTitle");
  const playersList = document.getElementById("playersList");

  const term = playerSearchTerm.trim().toLowerCase();
  const filteredPlayers = term
    ? players.filter(p => {
        const haystack = `${p.name} ${p.nickname || ""}`.toLowerCase();
        return haystack.includes(term);
      })
    : players;

  playersTitle.textContent = term
    ? `Players (${filteredPlayers.length}/${players.length})`
    : `Players (${players.length})`;

  if (filteredPlayers.length === 0) {
    playersList.innerHTML = '<p class="muted">Sin resultados</p>';
    return;
  }

  const visualPlayers = shufflePlayers(filteredPlayers);

  playersList.innerHTML = visualPlayers.map(p => {
    const nick = p.nickname?.trim()
      ? `<span class="player-nick">"${escapeHtml(p.nickname)}"</span>`
      : "";

    const deleteControl = adminAuthenticated
      ? `<button class="btn-delete" data-id="${p.id}" title="Eliminar">🗑️</button>`
      : "";

    const adminControls = `<div class="admin-controls">
          <button class="btn-edit" data-id="${p.id}" title="Editar">✏️</button>
          ${deleteControl}
        </div>`;

    return `
      <article class="card">
        <div class="player-info">
          <div class="player-name">
            ${escapeHtml(p.name)} ${nick}
          </div>
        </div>
        ${adminControls}
      </article>
    `;
  }).join("");

  // Event listeners
  document.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => editPlayer(btn.dataset.id));
  });

  document.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      if (confirm("¿Eliminar jugador?")) {
        deletePlayer(btn.dataset.id);
      }
    });
  });
}

/* Match view */
function renderMatchPlayers() {
  if (window.MatchView?.renderMatchPlayersList) {
    window.MatchView.renderMatchPlayersList({
      players,
      selectedPlayers,
      onSelectionChanged: (selectedIds) => {
        const selectedIdSet = new Set((selectedIds || []).map((id) => String(id)));
        selectedPlayers = players.filter((player) => selectedIdSet.has(String(player.id)));
        updateMatchCreationLockUi();
      },
    });
    updateMatchCreationLockUi();
    return;
  }

  updateSelectedPlayers();
  updateMatchCreationLockUi();
}

function updateSelectedPlayers() {
  selectedPlayers = players.filter(p =>
    document.querySelector(`#matchPlayersList input[data-id="${p.id}"]`)?.checked
  );

  const ready = selectedPlayers.length === 10;
  document.querySelectorAll("#matchPlayersList .card-selectable").forEach(card => {
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
  matchCount.textContent = `${selectedPlayers.length}/10`;
  matchCount.classList.toggle("ready", ready);
  if (startBtn) startBtn.disabled = !ready;
  if (genBtn) genBtn.disabled = !ready;
  if (genManualBtn) genManualBtn.disabled = !ready;
}

function divideTeams() {
  if (hasPendingScheduledMatch()) {
    return;
  }

  currentTeams = matchController.createRandomTeams(selectedPlayers);
  renderTeams();
  showMatchSetup();
}

function generateBalancedTeams() {
  if (hasPendingScheduledMatch()) {
    return;
  }

  if (selectedPlayers.length !== 10) {
    alert('Selecciona 10 jugadores para generar equipos balanceados');
    return;
  }

  currentTeams = matchController.createBalancedTeams(selectedPlayers);
  renderTeams();
  showMatchSetup();
}

function renderTeams() {
  window.MatchView?.renderTeams?.({ teams: currentTeams });
}

function populateMVPSelect() {
  window.MatchView?.populateMvpOptions?.({ teams: currentTeams });
}

function hasPendingScheduledMatch(excludeMatchId = "") {
  const history = historyController.getHistory?.() || [];
  const excluded = String(excludeMatchId || "").trim();

  return history.some((match) => {
    const status = String(match?.status || "").trim().toLowerCase();
    if (status !== "scheduled") return false;
    if (!excluded) return true;
    return String(match?.id || "").trim() !== excluded;
  });
}

function updateMatchCreationLockUi() {
  const hasPending = hasPendingScheduledMatch();
  const genBtn = document.getElementById("generateBalancedBtn");
  const genManualBtn = document.getElementById("generateManualBtn");
  const startBtn = document.getElementById("startMatchBtn");
  const pendingNotice = document.getElementById("pendingMatchNotice");

  if (genBtn) genBtn.disabled = hasPending || selectedPlayers.length !== 10;
  if (genManualBtn) genManualBtn.disabled = hasPending || selectedPlayers.length !== 10;
  if (startBtn) startBtn.disabled = hasPending || selectedPlayers.length !== 10;
  if (pendingNotice) pendingNotice.classList.toggle("hidden", !hasPending);
}

function findHistoryMatchById(matchId) {
  const history = historyController.getHistory?.() || [];
  return history.find((item) => String(item.id) === String(matchId)) || null;
}

function closePendingResultModal() {
  const modal = document.getElementById("historyResultModal");
  if (modal) modal.classList.add("hidden");
  pendingHistoryResultMatchId = "";
}

function openPendingResultModal(matchId) {
  const pendingMatch = findHistoryMatchById(matchId);

  if (!pendingMatch) {
    alert("No se encontró el partido pendiente");
    return;
  }

  const status = String(pendingMatch.status || "").toLowerCase();
  if (status && status !== "scheduled") {
    alert("Este partido ya no está pendiente");
    return;
  }

  pendingHistoryResultMatchId = String(pendingMatch.id || "");

  const scoreAInput = document.getElementById("historyScoreTeamA");
  const scoreBInput = document.getElementById("historyScoreTeamB");
  const mvpSelect = document.getElementById("historyMvpSelect");
  const meta = document.getElementById("historyResultMeta");
  const modal = document.getElementById("historyResultModal");

  if (!scoreAInput || !scoreBInput || !mvpSelect || !modal) {
    alert("No se pudo abrir el modal de resultado");
    return;
  }

  scoreAInput.value = String(pendingMatch.scoreA ?? 0);
  scoreBInput.value = String(pendingMatch.scoreB ?? 0);

  const mvpCandidates = [...(pendingMatch.teamA || []), ...(pendingMatch.teamB || [])]
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const uniqueCandidates = [...new Set(mvpCandidates)];

  mvpSelect.innerHTML = '<option value="">Select MVP</option>'
    + uniqueCandidates.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  mvpSelect.value = pendingMatch.mvp ? String(pendingMatch.mvp) : "";

  if (meta) {
    const locationText = String(pendingMatch.location || "").trim();
    meta.textContent = locationText
      ? `${pendingMatch.date || ""} · ${locationText}`
      : String(pendingMatch.date || "");
  }

  modal.classList.remove("hidden");
}

async function savePendingResultFromModal() {
  if (!pendingHistoryResultMatchId) return;

  const pendingMatch = findHistoryMatchById(pendingHistoryResultMatchId);
  if (!pendingMatch) {
    alert("No se encontró el partido pendiente");
    return;
  }

  const scoreA = parseInt(document.getElementById("historyScoreTeamA")?.value || "0", 10) || 0;
  const scoreB = parseInt(document.getElementById("historyScoreTeamB")?.value || "0", 10) || 0;
  const mvpName = document.getElementById("historyMvpSelect")?.value || null;
  if (!mvpName) {
    alert("Selecciona un MVP para guardar el resultado");
    return;
  }

  const updatedMatch = {
    ...pendingMatch,
    id: pendingMatch.id,
    status: "played",
    scoreA,
    scoreB,
    mvp: mvpName || null,
  };

  const storedMatch = await matchController.saveMatch(updatedMatch);
  historyController.pushMatch(storedMatch);
  await fetchMatches();
  closePendingResultModal();
  showToast("✔ Resultado guardado", 2000);
}

function showMatchSetup() {
  window.MatchView?.showSetupState?.();
  renderTeams();

  window.MatchView?.setMatchSetupValues?.({
    location: currentMatchDetails?.location || "",
    scheduledAt: currentMatchDetails?.scheduledAt || "",
    fallbackScheduledAt: getDefaultDateTimeLocal(),
    address: currentMatchDetails?.address || "",
    mapsUrl: currentMatchDetails?.mapsUrl || "",
  });

  selectedPlaceData = currentMatchDetails?.placeId
    ? {
        location: currentMatchDetails.location || "",
        address: currentMatchDetails.address || "",
        placeId: currentMatchDetails.placeId || "",
        mapsUrl: currentMatchDetails.mapsUrl || "",
        latitude: currentMatchDetails.latitude ?? null,
        longitude: currentMatchDetails.longitude ?? null,
      }
    : null;

  void initLocationAutocomplete();
}

function showMatchResults() {
  window.MatchView?.showResultsState?.();
  window.MatchView?.renderConfirmedTeams?.({ teams: currentTeams });
  populateMVPSelect();
  window.MatchView?.resetMatchResultInputs?.();
}

function backToSelection() {
  window.MatchView?.showSelectionState?.();
  currentTeams = null;
  currentMatchDetails = null;
  selectedPlaceData = null;
}

function backToMatchSetup() {
  window.MatchView?.backToSetupState?.();
}

function getDefaultDateTimeLocal() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setMatchLocationHint(message = "") {
  window.MatchView?.setLocationHint?.(message);
}

function buildMapsSearchUrl(location = "", address = "") {
  return window.MatchView?.buildMapsSearchUrl?.(location, address) || "";
}

function buildMapsShortShareUrl(location = "", address = "") {
  return window.MatchView?.buildMapsShortShareUrl?.(location, address) || "";
}

function setDetectedAddressDetails(address = "", mapsUrl = "") {
  window.MatchView?.setDetectedAddressDetails?.(address, mapsUrl);
}

function openDetectedLocationInMaps() {
  window.MatchView?.openDetectedLocationInMaps?.();
}

function toggleMatchSong() {
  window.MatchView?.toggleMatchSong?.(MATCH_SONG_MP3_URL);
}

function stopMatchSong() {
  window.MatchView?.stopMatchSong?.();
}

function seemsSoccerPlace(place) {
  if (!place) return false;

  const name = String(place.name || "").toLowerCase();
  const address = String(place.formatted_address || "").toLowerCase();
  const types = Array.isArray(place.types) ? place.types.map((item) => String(item).toLowerCase()) : [];

  const keywordMatch = SOCCER_PLACE_KEYWORDS.some((keyword) => name.includes(keyword) || address.includes(keyword));
  const typeMatch = SOCCER_PLACE_TYPES.some((type) => types.includes(type));

  return keywordMatch || typeMatch;
}

function loadGoogleMapsPlacesScript() {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps);
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error("GOOGLE_MAPS_API_KEY not configured"));
  }

  if (googleMapsPlacesPromise) {
    return googleMapsPlacesPromise;
  }

  googleMapsPlacesPromise = new Promise((resolve, reject) => {
    const callbackName = "__fobalGoogleMapsPlacesReady";

    const finishIfReady = () => {
      if (window.google?.maps?.places) {
        resolve(window.google.maps);
        return true;
      }
      return false;
    };

    if (finishIfReady()) return;

    window[callbackName] = () => {
      if (!finishIfReady()) {
        reject(new Error("Google Maps loaded but Places library is unavailable"));
      }
      try {
        delete window[callbackName];
      } catch (_error) {
        window[callbackName] = undefined;
      }
    };

    const existing = document.querySelector('script[data-google-maps-places="1"]');
    if (existing) {
      existing.addEventListener("error", () => reject(new Error("Error loading Google Maps script")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=places&v=weekly&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsPlaces = "1";
    script.onerror = () => reject(new Error("Error loading Google Maps script"));
    document.head.appendChild(script);
  });

  return googleMapsPlacesPromise;
}

async function initLocationAutocomplete() {
  const locationInput = document.getElementById("matchLocation");
  if (!locationInput) return;

  if (!previousGoogleAuthFailureHandler) {
    previousGoogleAuthFailureHandler = window.gm_authFailure || null;
  }
  window.gm_authFailure = function gmAuthFailureProxy() {
    if (typeof previousGoogleAuthFailureHandler === "function") {
      previousGoogleAuthFailureHandler();
    }
    setMatchLocationHint("Google Maps rechazó la API Key (revisa restricciones de dominio, APIs habilitadas y facturación). Puedes escribir el lugar manualmente.");
  };

  if (!GOOGLE_MAPS_API_KEY) {
    setMatchLocationHint("Autocomplete de Google Maps desactivado. Configura GOOGLE_MAPS_API_KEY en config.js (puedes escribir el lugar manualmente).");
    return;
  }

  if (locationInput.dataset.autocompleteReady === "1") {
    const fallbackAddress = selectedPlaceData?.address || currentMatchDetails?.address || "";
    const fallbackMapsUrl = selectedPlaceData?.mapsUrl || currentMatchDetails?.mapsUrl || "";
    setDetectedAddressDetails(fallbackAddress, fallbackMapsUrl);
    setMatchLocationHint("Autocomplete de Google Maps activo.");
    return;
  }

  try {
    await loadGoogleMapsPlacesScript();
    if (!window.google?.maps?.places?.Autocomplete) {
      setMatchLocationHint("No se pudo activar Google Maps Autocomplete. Verifica que estén habilitadas Maps JavaScript API + Places API y que la key permita este dominio.");
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(locationInput, {
      types: ["establishment"],
      componentRestrictions: { country: "uy" },
    });

    if (typeof autocomplete.setFields === "function") {
      autocomplete.setFields(["place_id", "formatted_address", "name", "geometry", "types"]);
    }

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place) return;

      const resolvedName = place.name || locationInput.value.trim();
      const resolvedAddress = place.formatted_address || "";

      locationInput.value = resolvedName || resolvedAddress || locationInput.value.trim();

      const lat = place.geometry?.location?.lat ? place.geometry.location.lat() : null;
      const lng = place.geometry?.location?.lng ? place.geometry.location.lng() : null;
      const placeId = place.place_id || "";

      selectedPlaceData = {
        location: locationInput.value.trim(),
        address: resolvedAddress,
        placeId,
        mapsUrl: placeId
          ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
          : "",
        latitude: lat,
        longitude: lng,
      };
      setDetectedAddressDetails(resolvedAddress, selectedPlaceData.mapsUrl || "");

      if (seemsSoccerPlace(place)) {
        setMatchLocationHint("Autocomplete de Google Maps activo.");
      } else {
        setMatchLocationHint("Lugar seleccionado. No parece una cancha de fútbol; verifica el nombre/dirección si era para partido.");
      }
    });

    locationInput.addEventListener("input", () => {
      if (!selectedPlaceData) return;
      if ((locationInput.value || "").trim() !== (selectedPlaceData.location || "").trim()) {
        selectedPlaceData = null;
        setDetectedAddressDetails("", "");
      }
    });

    locationInput.dataset.autocompleteReady = "1";
    setMatchLocationHint("Autocomplete de Google Maps activo.");
  } catch (error) {
    console.warn("Google Places autocomplete no disponible:", error?.message || error);
    setMatchLocationHint("Google Maps no disponible en este momento. Revisa la consola del navegador para el detalle del error y permisos de la API key.");
  }
}

async function confirmMatchInfo() {
  if (!currentTeams) return;

  const setupValues = window.MatchView?.getMatchSetupValues
    ? window.MatchView.getMatchSetupValues()
    : { location: "", address: "", scheduledAt: "" };
  const location = setupValues.location || "";
  const address = setupValues.address || "";
  const scheduledAt = setupValues.scheduledAt || "";

  if (!location) {
    alert("Completa el lugar");
    return;
  }
  if (!scheduledAt) {
    alert("Completa la fecha y hora");
    return;
  }

  const scheduledDate = new Date(scheduledAt);
  const datetimeDisplay = Number.isNaN(scheduledDate.getTime())
    ? scheduledAt
    : scheduledDate.toLocaleString();

  const matchedPlace =
    selectedPlaceData &&
    (selectedPlaceData.location || "").trim().toLowerCase() === location.toLowerCase() &&
    (selectedPlaceData.address || "").trim().toLowerCase() === address.toLowerCase()
      ? selectedPlaceData
      : null;

  const previousMatchId = currentMatchDetails?.matchId || "";

  currentMatchDetails = {
    location,
    address,
    scheduledAt,
    datetimeDisplay,
    matchId: previousMatchId,
    placeId: matchedPlace?.placeId || "",
    mapsUrl: matchedPlace?.mapsUrl || buildMapsSearchUrl(location, address),
    latitude: matchedPlace?.latitude ?? null,
    longitude: matchedPlace?.longitude ?? null,
  };

  const scheduledMatch = matchController.buildMatchPayload(
    currentTeams,
    currentMatchDetails,
    null,
    null,
    null,
    {
      id: previousMatchId,
      status: "scheduled",
    }
  );

  const storedScheduledMatch = await matchController.saveMatch(scheduledMatch);
  if (storedScheduledMatch?.id) {
    currentMatchDetails.matchId = storedScheduledMatch.id;
    historyController.pushMatch(storedScheduledMatch);
  }

  showMatchResults();
}

async function copyToWhatsApp() {
  const text = buildCurrentMatchShareText("compat");
  if (!text) return;

  const result = await whatsappShareService.shareText(text);
  if (result.status === "opened") return;
  if (result.status === "copied") {
    alert("No se pudo abrir WhatsApp. Mensaje copiado al portapapeles.");
    return;
  }
  if (result.status === "manual") {
    alert("No se pudo abrir WhatsApp ni copiar automáticamente. Mensaje:\n\n" + result.text);
  }
}

function buildCurrentMatchShareText(mode = "compat") {
  if (!currentTeams) return "";
  const teamsText = matchController.buildWhatsAppText(currentTeams);

  const setupValues = window.MatchView?.getMatchSetupValues
    ? window.MatchView.getMatchSetupValues()
    : { location: "", address: "", scheduledAt: "" };
  const formLocation = setupValues.location || "";
  const formScheduledAt = setupValues.scheduledAt || "";
  const parsedDate = formScheduledAt ? new Date(formScheduledAt) : null;
  const formDatetimeDisplay = parsedDate && !Number.isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleString()
    : formScheduledAt;

  const shareLocation = whatsappShareService.sanitizeShareText(currentMatchDetails?.location || formLocation);
  const shareDatetime = whatsappShareService.sanitizeShareText(currentMatchDetails?.datetimeDisplay || formDatetimeDisplay);
  const shareMapsUrl = buildMapsShortShareUrl(shareLocation, "")
    || currentMatchDetails?.mapsUrl
    || buildMapsSearchUrl(shareLocation, "");

  const text = whatsappShareService.buildShareMessage({
    location: shareLocation,
    datetime: shareDatetime,
    teamsText,
    mapsUrl: shareMapsUrl,
    mode,
  });

  return text;
}

let copyShareFeedbackTimeoutId = null;

function setCopyShareFeedback(message) {
  const feedbackEl = document.getElementById("copyShareFeedback");
  if (!feedbackEl) return;

  feedbackEl.textContent = message || "";
  feedbackEl.classList.toggle("hidden", !message);

  if (copyShareFeedbackTimeoutId) {
    clearTimeout(copyShareFeedbackTimeoutId);
  }

  if (message) {
    copyShareFeedbackTimeoutId = setTimeout(() => {
      feedbackEl.textContent = "";
      feedbackEl.classList.add("hidden");
    }, 2600);
  }
}

async function copyShareMessage() {
  const text = buildCurrentMatchShareText("rich");
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyShareFeedback("Mensaje copiado al portapapeles");
      return;
    } catch {
      setCopyShareFeedback("No se pudo copiar automáticamente");
      return;
    }
  }

  setCopyShareFeedback("Tu navegador no soporta copiado automático");
}

async function recordMatch() {
  if (!currentTeams) return;
  if (!currentMatchDetails) {
    alert("Primero confirma partido, lugar y fecha/hora");
    return;
  }

  const scoreA = parseInt(document.getElementById("scoreTeamA").value) || 0;
  const scoreB = parseInt(document.getElementById("scoreTeamB").value) || 0;
  const mvpId = document.getElementById("mvpSelect").value;
  if (!mvpId) {
    alert("Selecciona un MVP para guardar el resultado");
    return;
  }
  const mvpName = mvpId ? document.querySelector(`#mvpSelect option[value="${mvpId}"]`).textContent : null;

  const match = matchController.buildMatchPayload(
    currentTeams,
    currentMatchDetails,
    scoreA,
    scoreB,
    mvpName,
    {
      id: currentMatchDetails?.matchId || "",
      status: "played",
    }
  );
  const storedMatch = await matchController.saveMatch(match);

  historyController.pushMatch(storedMatch);

  // Reset
  selectedPlayers = [];
  currentTeams = null;
  currentMatchDetails = null;
  document.querySelectorAll("#matchPlayersList input").forEach(cb => cb.checked = false);
  backToSelection();
  renderMatchPlayers();
  await fetchMatches();

  alert("¡Partido registrado!");
}

/* History view */
async function deleteMatch(matchId, matchDate) {
  await historyController.deleteMatch(matchId, matchDate);
}

function renderHistory() {
  historyController.renderHistory();
}

/* Admin modal */
function editPlayer(id) {
  const player = players.find(p => p.id == id);
  if (!player) return;

  currentEditingPlayerId = id;
  document.getElementById("editPlayerName").value = player.name;
  document.getElementById("editPlayerNickname").value = player.nickname || "";
  document.getElementById("editPlayerAttack").value = player.attack || 0;
  document.getElementById("editPlayerDefense").value = player.defense || 0;
  document.getElementById("editPlayerMidfield").value = player.midfield || 0;
  
  updateSliderValues();
  openEditModal();
}

function openEditModal() {
  document.getElementById("editPlayerModal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editPlayerModal").classList.add("hidden");
  currentEditingPlayerId = null;
}

async function saveEditPlayer() {
  const name = document.getElementById("editPlayerName").value.trim();
  const nickname = document.getElementById("editPlayerNickname").value.trim();
  const attack = parseInt(document.getElementById("editPlayerAttack").value) || 0;
  const defense = parseInt(document.getElementById("editPlayerDefense").value) || 0;
  const midfield = parseInt(document.getElementById("editPlayerMidfield").value) || 0;

  if (!name) {
    alert("El nombre no puede estar vacío");
    return;
  }

  await updatePlayer(currentEditingPlayerId, name, nickname, attack, defense, midfield);
  closeEditModal();
}

function updateSliderValues() {
  const attack = document.getElementById("editPlayerAttack").value;
  const defense = document.getElementById("editPlayerDefense").value;
  const midfield = document.getElementById("editPlayerMidfield").value;
  document.getElementById("attackValue").textContent = attack;
  document.getElementById("defenseValue").textContent = defense;
  document.getElementById("midfieldValue").textContent = midfield;
}

function openAdmin() {
  if (!adminAuthenticated) {
    openLoginModal();
  } else {
    handleLogout();
  }
}

function openLoginModal() {
  document.getElementById("adminLoginModal").classList.remove("hidden");
  document.getElementById("adminPin").value = "";
  document.getElementById("loginError").classList.add("hidden");
  document.getElementById("adminPin").focus();
}

function closeLoginModal() {
  document.getElementById("adminLoginModal").classList.add("hidden");
}

async function handleLogin() {
  const pin = document.getElementById("adminPin").value;
  const errorMsg = document.getElementById("loginError");
  const spinner = document.getElementById("loginSpinner");
  const loginBtn = document.getElementById("loginBtn");

  if (adminPlayersController) {
    // Show spinner and hide error message
    spinner.classList.remove("hidden");
    errorMsg.classList.add("hidden");
    loginBtn.disabled = true;

    try {
      const result = await adminPlayersController.login(pin);
      spinner.classList.add("hidden");
      
      if (result.ok) {
        closeLoginModal();
      } else {
        errorMsg.textContent = result.message || "PIN incorrecto";
        errorMsg.classList.remove("hidden");
        document.getElementById("adminPin").value = "";
        document.getElementById("adminPin").focus();
      }
    } finally {
      loginBtn.disabled = false;
    }
    return;
  }

  if (pin === ADMIN_PIN) {
    adminAuthenticated = true;
    closeLoginModal();
    updateAdminUI();
    renderPlayers();
  } else {
    errorMsg.textContent = "PIN incorrecto";
    errorMsg.classList.remove("hidden");
    document.getElementById("adminPin").value = "";
    document.getElementById("adminPin").focus();
  }
}

function handleLogout() {
  if (adminPlayersController) {
    adminPlayersController.logout();
    return;
  }

  adminAuthenticated = false;
  updateAdminUI();
  renderPlayers();
}

function updateAdminUI() {
  const btnText = document.getElementById("adminBtnText");
  const addForm = document.getElementById("addPlayerForm");
  const adminBtn = document.getElementById("adminBtn");
  const body = document.body;

  if (adminAuthenticated) {
    btnText.textContent = "Admin ✓";
    addForm.classList.remove("hidden");
    adminBtn.classList.add("authenticated");
    body.classList.add("admin-active");
  } else {
    btnText.textContent = "Admin";
    addForm.classList.add("hidden");
    adminBtn.classList.remove("authenticated");
    body.classList.remove("admin-active");
  }

  renderHistory();
}

/* Events */
const tabs = document.querySelectorAll(".tab");
const views = {
  players: document.getElementById("view-players"),
  match: document.getElementById("view-match"),
  history: document.getElementById("view-history"),
};

function showView(key) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[key].classList.remove("hidden");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.target === key));

  if (key === "players") {
    renderPlayers();
  } else if (key === "match") {
    renderMatchPlayers();
  } else if (key === "history") {
    renderHistory();
  }
}

tabs.forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.target));
});

document.getElementById("adminBtn")?.addEventListener("click", openAdmin);
document.getElementById("closeLoginBtn")?.addEventListener("click", closeLoginModal);
document.getElementById("loginBtn")?.addEventListener("click", handleLogin);

document.getElementById("adminPin")?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") void handleLogin();
});

// Open new player modal from admin area
const openNewBtn = document.getElementById("openNewPlayerBtn");
if (openNewBtn) openNewBtn.addEventListener("click", openNewPlayerModal);

const toggleSearchBtn = document.getElementById("togglePlayerSearchBtn");
const searchWrap = document.getElementById("playerSearchWrap");
const searchInput = document.getElementById("playerSearchInput");
const clearSearchBtn = document.getElementById("clearPlayerSearchBtn");

if (toggleSearchBtn && searchWrap) {
  toggleSearchBtn.addEventListener("click", () => {
    const shouldShow = searchWrap.classList.contains("hidden");
    searchWrap.classList.toggle("hidden", !shouldShow);
    if (shouldShow && searchInput) searchInput.focus();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    playerSearchTerm = searchInput.value;
    renderPlayers();
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    playerSearchTerm = "";
    renderPlayers();
    if (searchInput) searchInput.focus();
  });
}

function openNewPlayerModal(){
  document.getElementById('newPlayerModal').classList.remove('hidden');
  // set default values
  document.getElementById('newPlayerName').value = '';
  document.getElementById('newPlayerNickname').value = '';
  document.getElementById('newPlayerAttack').value = 5;
  document.getElementById('newPlayerDefense').value = 5;
  document.getElementById('newPlayerMidfield').value = 5;
  updateNewSliderValues();
}

function closeNewPlayerModal(){
  document.getElementById('newPlayerModal').classList.add('hidden');
}

function updateNewSliderValues(){
  document.getElementById('newAttackValue').textContent = document.getElementById('newPlayerAttack').value;
  document.getElementById('newDefenseValue').textContent = document.getElementById('newPlayerDefense').value;
  document.getElementById('newMidfieldValue').textContent = document.getElementById('newPlayerMidfield').value;
}

document.getElementById('closeNewBtn')?.addEventListener('click', closeNewPlayerModal);
document.getElementById('newPlayerModal')?.addEventListener('click', (e)=>{ if(e.target.id==='newPlayerModal') closeNewPlayerModal(); });
document.getElementById('newPlayerAttack')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerDefense')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerMidfield')?.addEventListener('input', updateNewSliderValues);

document.getElementById('createPlayerBtn')?.addEventListener('click', () => {
  const name = document.getElementById('newPlayerName').value.trim();
  const nickname = document.getElementById('newPlayerNickname').value.trim();
  const attack = parseInt(document.getElementById('newPlayerAttack').value) || 0;
  const defense = parseInt(document.getElementById('newPlayerDefense').value) || 0;
  const midfield = parseInt(document.getElementById('newPlayerMidfield').value) || 0;
  if (!name) {
    alert('El nombre no puede estar vacío');
    return;
  }
  addPlayer(name, nickname, attack, defense, midfield);
  closeNewPlayerModal();
});

document.getElementById("startMatchBtn")?.addEventListener("click", divideTeams);
document.getElementById("recordMatchBtn")?.addEventListener("click", recordMatch);
document.getElementById("backToSelectionBtn")?.addEventListener("click", backToSelection);
document.getElementById("backToSetupBtn")?.addEventListener("click", backToMatchSetup);
document.getElementById("confirmMatchInfoBtn")?.addEventListener("click", confirmMatchInfo);
document.getElementById("openMapsBtn")?.addEventListener("click", openDetectedLocationInMaps);
document.getElementById("matchSongToggleBtn")?.addEventListener("click", toggleMatchSong);
document.getElementById("copyToWhatsAppBtn")?.addEventListener("click", copyToWhatsApp);
document.getElementById("copyShareMessageBtn")?.addEventListener("click", copyShareMessage);
// Balanced teams
const genBtnEl = document.getElementById("generateBalancedBtn");
if (genBtnEl) genBtnEl.addEventListener("click", generateBalancedTeams);

// Manual teams
const genManualBtnEl = document.getElementById("generateManualBtn");
if (genManualBtnEl) genManualBtnEl.addEventListener("click", () => {
  if (hasPendingScheduledMatch()) {
    return;
  }

  // Mostrar la tabla de asignación y ocultar la lista de selección
  const matchSelection = document.getElementById('matchSelection');
  const manualSelector = document.getElementById('manualTeamSelection');
  if (selectedPlayers.length !== 10) {
    alert("Debes seleccionar exactamente 10 jugadores");
    return;
  }
  currentTeams = { a: [], b: [] };
  renderManualTeamSelection();
  matchSelection.classList.add('hidden');
  manualSelector.classList.remove('hidden');
  genManualBtnEl.style.display = 'none';
});

const confirmTeamsBtn = document.getElementById("confirmTeamsBtn");
if (confirmTeamsBtn) confirmTeamsBtn.addEventListener("click", () => {
  if (!currentTeams || currentTeams.a.length !== 5 || currentTeams.b.length !== 5) {
    alert("Debes seleccionar 5 jugadores en cada equipo");
    return;
  }
  showMatchSetup();
});

const backToSelectionFromManualBtn = document.getElementById("backToSelectionFromManualBtn");
if (backToSelectionFromManualBtn) backToSelectionFromManualBtn.addEventListener("click", () => {
  const matchSelection = document.getElementById('matchSelection');
  const manualSelector = document.getElementById('manualTeamSelection');
  const genManualBtn = document.getElementById('generateManualBtn');
  
  matchSelection.classList.remove('hidden');
  manualSelector.classList.add('hidden');
  genManualBtn.style.display = '';
  currentTeams = null;
});

// Segmented control for match mode
document.querySelectorAll('.segmented .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.segmented .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    setMatchMode(mode);
  });
});

function setMatchMode(mode){
  const balancedBtn = document.getElementById('generateBalancedBtn');
  const manualBtn = document.getElementById('generateManualBtn');
  const manualSelector = document.getElementById('manualTeamSelection');
  
  if(mode === 'balanced'){
    balancedBtn.classList.remove('hidden');
    manualBtn.classList.add('hidden');
    manualSelector.classList.add('hidden');
  } else {
    balancedBtn.classList.add('hidden');
    manualBtn.classList.remove('hidden');
    manualSelector.classList.add('hidden');
    currentTeams = { a: [], b: [] };
  }

  updateMatchCreationLockUi();
}

function renderManualTeamSelection() {
  if (selectedPlayers.length === 0) {
    return;
  }

  const playersList = document.getElementById('manualPlayersList');
  const teamCount = document.getElementById('teamCount');

  if (!playersList || !teamCount) {
    // Fallback: show error if elements not found
    const manualSelector = document.getElementById('manualTeamSelection');
    if (manualSelector) {
      manualSelector.innerHTML = '<div style="color:red;padding:16px;">Error: No se encontró el contenedor de jugadores manuales o el contador de equipos.</div>';
    }
    console.error('No se encontró manualPlayersList o teamCount');
    return;
  }

  const teamACount = currentTeams?.a?.length || 0;
  const teamBCount = currentTeams?.b?.length || 0;
  teamCount.textContent = `A: ${teamACount}/5 - B: ${teamBCount}/5`;

  const html = selectedPlayers.map((p, idx) => {
    // Always compare IDs as strings
    const inTeamA = currentTeams?.a?.some(t => String(t.id) === String(p.id));
    const inTeamB = currentTeams?.b?.some(t => String(t.id) === String(p.id));
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb;">
        <span style="font-weight:500;">${p.name}${p.nickname ? ' <span style=\"color:#9ca3af;\">"' + p.nickname + '"</span>' : ''}</span>
        <div style="display:flex; gap:6px;">
          <button class="team-btn-a" data-idx="${idx}" style="padding:4px 12px; border-radius:4px; border:none; cursor:pointer; background:${inTeamA ? '#10b981' : '#d1d5db'}; color:white; font-weight:600; font-size:12px;">● A</button>
          <button class="team-btn-b" data-idx="${idx}" style="padding:4px 12px; border-radius:4px; border:none; cursor:pointer; background:${inTeamB ? '#3b82f6' : '#d1d5db'}; color:white; font-weight:600; font-size:12px;">● B</button>
        </div>
      </div>
    `;
  }).join('');
  playersList.innerHTML = html;

  // Agregar event listeners
  document.querySelectorAll('.team-btn-a').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      setPlayerTeam(String(selectedPlayers[idx].id), 'a');
    });
  });
  document.querySelectorAll('.team-btn-b').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'));
      setPlayerTeam(String(selectedPlayers[idx].id), 'b');
    });
  });
}

function setPlayerTeam(playerId, team) {
  currentTeams = matchController.assignPlayerTeam(currentTeams, selectedPlayers, playerId, team);

  renderManualTeamSelection();
}

document.getElementById("adminLoginModal").addEventListener("click", (e) => {
  if (e.target.id === "adminLoginModal") {
    closeLoginModal();
  }
});

document.getElementById("closeEditBtn")?.addEventListener("click", closeEditModal);
document.getElementById("updatePlayerBtn")?.addEventListener("click", saveEditPlayer);

document.getElementById("editPlayerAttack")?.addEventListener("input", updateSliderValues);
document.getElementById("editPlayerDefense")?.addEventListener("input", updateSliderValues);
document.getElementById("editPlayerMidfield")?.addEventListener("input", updateSliderValues);

document.getElementById("editPlayerModal").addEventListener("click", (e) => {
  if (e.target.id === "editPlayerModal") {
    closeEditModal();
  }
});

document.getElementById("closeHistoryResultBtn")?.addEventListener("click", closePendingResultModal);
document.getElementById("saveHistoryResultBtn")?.addEventListener("click", () => {
  void savePendingResultFromModal();
});
document.getElementById("historyResultModal")?.addEventListener("click", (e) => {
  if (e.target.id === "historyResultModal") {
    closePendingResultModal();
  }
});

/* Init */
fetchPlayers();
fetchMatches();
showView("players");
// Ensure match mode default
setTimeout(()=> setMatchMode('balanced'), 50);
