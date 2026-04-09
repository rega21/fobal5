// Dark mode init
(function(){
  const saved = localStorage.getItem("fobal5_theme");
  if (saved !== "light") document.documentElement.setAttribute("data-theme", "dark");
})();

const HISTORY_KEY = "fobal5_history";
const DEFAULT_COMMUNITY_MIN_VOTES = 4;
const configuredCommunityMinVotes = Number(window.APP_CONFIG?.COMMUNITY_MIN_VOTES);
const COMMUNITY_MIN_VOTES =
  Number.isFinite(configuredCommunityMinVotes) && configuredCommunityMinVotes > 0
    ? Math.floor(configuredCommunityMinVotes)
    : DEFAULT_COMMUNITY_MIN_VOTES;
const RATING_TREND_DELTA_MIN = 0.05;
const VOTED_PLAYERS_STORAGE_KEY = "fobal5_voted_players";
const FEEDBACK_COOLDOWN_MS = 30000;
const MVP_VOTING_WINDOW_MS = 8 * 60 * 60 * 1000;
const MVP_VOTES_STORAGE_KEY = "fobal5_mvp_votes_by_match";
const ADMIN_PIN = "";
let adminAuthenticated = false;
let currentEditingPlayerId = null;
let feedbackSubmitting = false;
let currentAdminPin = "";
let adminReportsLoading = false;
let currentEditAction = "rating";
let currentEditPlayerName = "";
let currentEditHasVotedBefore = false;
let currentEditHasPrefilledVote = false;
let currentEditReachedVoteLimit = false;

let players = [];
let selectedPlayers = [];
let currentTeams = null;
let playerSearchTerm = "";
let playersListVisualOrderIds = [];
let playersListVisualOrderSearchTerm = "";
let preservePlayersOrderOnNextRender = false;
let playerRatingsSummaryById = {};
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
      onVoteMvp: (matchId, candidateId) => {
        void voteMvpForMatch(matchId, candidateId);
      },
      getCurrentMvpVoteForMatch: (matchId) => getCurrentUserMvpVoteForMatch(matchId),
      resolvePlayerDisplay: (entry) => resolveHistoryPlayerDisplay(entry),
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
        const players = (selectedPlayers || []).map((player) => {
          const attack = Number(player.attack) || 0;
          const midfield = Number(player.midfield) || 0;
          const defense = Number(player.defense) || 0;

          return {
            ...player,
            attack,
            midfield,
            defense,
            score: attack * 0.45 + midfield * 0.3 + defense * 0.25,
          };
        });

        const totalPlayers = players.length;
        const teamSize = Math.floor(totalPlayers / 2);

        if (totalPlayers === 0) return { a: [], b: [] };
        if (teamSize === 0) return { a: [...players], b: [] };

        const summarizeTeam = (team) =>
          team.reduce(
            (acc, player) => {
              acc.score += player.score;
              acc.attack += player.attack;
              acc.midfield += player.midfield;
              acc.defense += player.defense;
              return acc;
            },
            { score: 0, attack: 0, midfield: 0, defense: 0 }
          );

        let best = null;
        const pickedIndexes = [];

        const isBetterCandidate = (candidate, currentBest) => {
          if (!currentBest) return true;
          if (candidate.cost < currentBest.cost - 1e-9) return true;
          if (candidate.cost > currentBest.cost + 1e-9) return false;
          if (candidate.scoreDiff < currentBest.scoreDiff - 1e-9) return true;
          if (candidate.scoreDiff > currentBest.scoreDiff + 1e-9) return false;
          if (candidate.defenseDiff < currentBest.defenseDiff - 1e-9) return true;
          if (candidate.defenseDiff > currentBest.defenseDiff + 1e-9) return false;
          return candidate.key < currentBest.key;
        };

        const evaluatePickedIndexes = () => {
          const picked = new Set(pickedIndexes);
          const teamA = [];
          const teamB = [];

          players.forEach((player, index) => {
            if (picked.has(index)) teamA.push(player);
            else teamB.push(player);
          });

          if (teamA.length !== teamSize || teamB.length !== teamSize) return;

          const summaryA = summarizeTeam(teamA);
          const summaryB = summarizeTeam(teamB);

          const scoreDiff = Math.abs(summaryA.score - summaryB.score);
          const attackDiff = Math.abs(summaryA.attack - summaryB.attack);
          const midfieldDiff = Math.abs(summaryA.midfield - summaryB.midfield);
          const defenseDiff = Math.abs(summaryA.defense - summaryB.defense);

          const cost =
            scoreDiff * 2 +
            attackDiff * 1.25 +
            midfieldDiff +
            defenseDiff * 1.5;

          const candidate = {
            cost,
            key: pickedIndexes.join("-"),
            scoreDiff,
            defenseDiff,
            teamA,
            teamB,
          };

          if (isBetterCandidate(candidate, best)) {
            best = candidate;
          }
        };

        const pickTeamA = (startIndex, remaining) => {
          if (remaining === 0) {
            evaluatePickedIndexes();
            return;
          }

          for (let index = startIndex; index <= totalPlayers - remaining; index += 1) {
            pickedIndexes.push(index);
            pickTeamA(index + 1, remaining - 1);
            pickedIndexes.pop();
          }
        };

        pickTeamA(0, teamSize);

        if (!best) {
          const shuffled = [...players].sort(() => Math.random() - 0.5);
          return {
            a: shuffled.slice(0, teamSize),
            b: shuffled.slice(teamSize, teamSize * 2),
          };
        }

        return { a: best.teamA, b: best.teamB };
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
        return `Equipo A:\n${teamANames}\n\nEquipo B:\n${teamBNames}`;
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
          teamA: currentTeams.a.map((player) => ({
            id: player.id,
            name: player.name,
            nickname: player.nickname || "",
          })),
          teamB: currentTeams.b.map((player) => ({
            id: player.id,
            name: player.name,
            nickname: player.nickname || "",
          })),
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

const playerRatingsService = window.createPlayerRatingsService
  ? window.createPlayerRatingsService({ apiClient })
  : null;

const feedbackService = window.createFeedbackService
  ? window.createFeedbackService({
      apiClient,
      cooldownMs: FEEDBACK_COOLDOWN_MS,
    })
  : null;

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

function normalizeVotedPlayerId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getVotedPlayerIds() {
  let parsed = [];
  try {
    parsed = JSON.parse(localStorage.getItem(VOTED_PLAYERS_STORAGE_KEY) || "[]");
  } catch (_error) {
    parsed = [];
  }

  if (!Array.isArray(parsed)) return [];

  const normalized = parsed
    .map((id) => normalizeVotedPlayerId(id))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function hasUserVotedForPlayer(playerId) {
  const normalizedId = normalizeVotedPlayerId(playerId);
  if (!normalizedId) return false;
  return getVotedPlayerIds().includes(normalizedId);
}

function markPlayerAsVoted(playerId) {
  const normalizedId = normalizeVotedPlayerId(playerId);
  if (!normalizedId) return;

  const votedIds = getVotedPlayerIds();
  if (!votedIds.includes(normalizedId)) {
    votedIds.push(normalizedId);
  }

  try {
    localStorage.setItem(VOTED_PLAYERS_STORAGE_KEY, JSON.stringify(votedIds));
  } catch (_error) {
    // ignore storage write failures
  }
}

function unmarkPlayerAsVoted(playerId) {
  const normalizedId = normalizeVotedPlayerId(playerId);
  if (!normalizedId) return;

  const votedIds = getVotedPlayerIds().filter((id) => id !== normalizedId);
  try {
    localStorage.setItem(VOTED_PLAYERS_STORAGE_KEY, JSON.stringify(votedIds));
  } catch (_error) {
    // ignore storage write failures
  }
}

async function reconcileLocalVotesWithServer() {
  if (adminAuthenticated || !playerRatingsService?.getCurrentUserRatingForPlayer) {
    return false;
  }

  const votedIds = getVotedPlayerIds();
  if (votedIds.length === 0) return false;

  const existingPlayerIds = new Set(
    (players || [])
      .map((player) => normalizeVotedPlayerId(player?.id))
      .filter(Boolean)
  );

  const nextVotedIds = [];

  const checks = votedIds.map(async (playerId) => {
    if (!existingPlayerIds.has(playerId)) {
      return { playerId, keep: false };
    }

    try {
      const rating = await playerRatingsService.getCurrentUserRatingForPlayer(playerId);
      return { playerId, keep: Boolean(rating) };
    } catch (_error) {
      return { playerId, keep: true };
    }
  });

  const results = await Promise.all(checks);
  results.forEach((result) => {
    if (result.keep) nextVotedIds.push(result.playerId);
  });

  const changed =
    nextVotedIds.length !== votedIds.length ||
    nextVotedIds.some((id) => !votedIds.includes(id));

  if (!changed) return false;

  try {
    localStorage.setItem(VOTED_PLAYERS_STORAGE_KEY, JSON.stringify(nextVotedIds));
  } catch (_error) {
    // ignore storage write failures
  }

  return true;
}

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

function getVisualPlayersForRender(filteredPlayers, term, preserveOrder = false) {
  const normalizedTerm = String(term || "");
  const currentIds = filteredPlayers.map((player) => normalizePlayerId(player));
  const canReuseOrder =
    preserveOrder &&
    normalizedTerm === playersListVisualOrderSearchTerm &&
    areCurrentIdsSubsetOfPrevious(playersListVisualOrderIds, currentIds);

  if (canReuseOrder) {
    const playersById = new Map(filteredPlayers.map((player) => [normalizePlayerId(player), player]));
    return playersListVisualOrderIds
      .map((id) => playersById.get(id))
      .filter(Boolean);
  }

  const shuffledPlayers = shufflePlayers(filteredPlayers);
  playersListVisualOrderIds = shuffledPlayers.map((player) => normalizePlayerId(player));
  playersListVisualOrderSearchTerm = normalizedTerm;
  return shuffledPlayers;
}

function parseValidatedScore(inputId, teamLabel = "") {
  const input = document.getElementById(inputId);
  const rawValue = String(input?.value ?? "").trim();

  if (rawValue === "") {
    alert(`Ingresa un marcador válido para ${teamLabel}`);
    input?.focus();
    return null;
  }

  if (!/^\d+$/.test(rawValue)) {
    alert(`El marcador de ${teamLabel} debe ser un número entero (0 o mayor)`);
    input?.focus();
    return null;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    alert(`El marcador de ${teamLabel} debe ser un número entero (0 o mayor)`);
    input?.focus();
    return null;
  }

  return parsed;
}

let toastTimeoutId = null;
let editVoteHintTimeoutId = null;
function showToast(message = "", duration = 2000, variant = "default") {
  const text = String(message || "").trim();
  if (!text) return;

  const palette = {
    default: {
      background: "rgba(17, 24, 39, 0.92)",
      color: "#fff",
      border: "1px solid rgba(255,255,255,.12)",
      icon: "ℹ️",
    },
    success: {
      background: "#065f46",
      color: "#ecfdf5",
      border: "1px solid rgba(16,185,129,.45)",
      icon: "✅",
    },
    error: {
      background: "#7f1d1d",
      color: "#fef2f2",
      border: "1px solid rgba(239,68,68,.45)",
      icon: "⚠️",
    },
  };

  const appearance = palette[variant] || palette.default;

  let toastEl = document.getElementById("appToast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "appToast";
    toastEl.style.position = "fixed";
    toastEl.style.left = "50%";
    toastEl.style.bottom = "88px";
    toastEl.style.transform = "translateX(-50%)";
    toastEl.style.background = appearance.background;
    toastEl.style.color = appearance.color;
    toastEl.style.border = appearance.border;
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

  toastEl.style.background = appearance.background;
  toastEl.style.color = appearance.color;
  toastEl.style.border = appearance.border;
  toastEl.textContent = `${appearance.icon} ${text}`;
  toastEl.style.opacity = "1";

  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(() => {
    toastEl.style.opacity = "0";
  }, Math.max(900, Number(duration) || 2200));
}

function animateEditButtonFadeOut(playerId) {
  return new Promise((resolve) => {
    const normalizedId = normalizePlayerId(playerId);
    const editButton = document.querySelector(`#playersList .btn-edit[data-id="${normalizedId}"]`);

    if (!editButton) {
      resolve();
      return;
    }

    editButton.classList.add("is-fading-out");
    setTimeout(resolve, 170);
  });
}

function normalizePlayerId(value) {
  return String(value ?? "").trim();
}

function toScoreNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateAverageRating(attack, defense, midfield) {
  return (
    toScoreNumber(attack) +
    toScoreNumber(defense) +
    toScoreNumber(midfield)
  ) / 3;
}

function getCommunityTrendDirection(baseAverage, communityAverage) {
  const delta = toScoreNumber(communityAverage) - toScoreNumber(baseAverage);
  if (delta > RATING_TREND_DELTA_MIN) return "up";
  if (delta < -RATING_TREND_DELTA_MIN) return "down";
  return "flat";
}

function getCommunityTrendMeta(direction) {
  if (direction === "up") {
    return { symbol: "▲", className: "rating-trend rating-trend--up", label: "en alza" };
  }
  if (direction === "down") {
    return { symbol: "▼", className: "rating-trend rating-trend--down", label: "en baja" };
  }
  return { symbol: "", className: "rating-trend", label: "estable" };
}

function buildRatingBar(value) {
  const rounded = Math.round(toScoreNumber(value));
  const blocks = Math.max(0, Math.min(10, rounded));
  return blocks > 0 ? "█".repeat(blocks) : "▁";
}

const STAT_COLORS = {
  attack:    "#FF4C4C",
  midfield:  "#2ECC71",
  defense:   "#00E5FF",
  stamina:   "#F1C40F",
  garra:     "#F97316",
  technique: "#9B59B6",
};
const STAT_COLORS_ARRAY = [
  STAT_COLORS.attack,
  STAT_COLORS.midfield,
  STAT_COLORS.defense,
  STAT_COLORS.stamina,
  STAT_COLORS.garra,
  STAT_COLORS.technique,
];

const PLAYER_ROLES = [
  {
    id: "delantero",
    label: "Delantero",
    color: "#e85d4a",
    weights: { attack: 2.0, midfield: 1.2, defense: 0.5, stamina: 1.0, garra: 1.2, technique: 1.5 },
  },
  {
    id: "defensor",
    label: "Defensor",
    color: "#00E5FF",
    weights: { attack: 0.5, midfield: 1.0, defense: 2.0, stamina: 1.5, garra: 1.2, technique: 0.8 },
  },
  {
    id: "mediocampista",
    label: "Mediocampista",
    color: "#8e6bbf",
    weights: { attack: 1.0, midfield: 2.0, defense: 1.0, stamina: 1.2, garra: 1.0, technique: 1.5 },
  },
  {
    id: "extremo",
    label: "Extremo",
    color: "#e67e22",
    weights: { attack: 1.5, midfield: 1.0, defense: 0.5, stamina: 1.5, garra: 1.0, technique: 1.8 },
  },
  {
    id: "todoterreno",
    label: "Todoterreno",
    color: "#3498db",
    weights: { attack: 1.0, midfield: 1.0, defense: 1.0, stamina: 1.5, garra: 1.8, technique: 1.0 },
  },
];

function detectPlayerRole(stats) {
  let bestRole = PLAYER_ROLES[0];
  let bestScore = -Infinity;
  for (const role of PLAYER_ROLES) {
    const score =
      stats.attack * role.weights.attack +
      stats.midfield * role.weights.midfield +
      stats.defense * role.weights.defense +
      stats.stamina * role.weights.stamina +
      stats.garra * role.weights.garra +
      stats.technique * role.weights.technique;
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }
  return bestRole;
}

let playerRadarChartInstance = null;
let editRadarChartInstance = null;

function getDominantStatColor(stats) {
  const entries = [
    ["attack", stats.attack ?? 0],
    ["midfield", stats.midfield ?? 0],
    ["defense", stats.defense ?? 0],
    ["stamina", stats.stamina ?? 0],
    ["garra", stats.garra ?? 0],
    ["technique", stats.technique ?? 0],
  ];
  const dominant = entries.reduce((a, b) => b[1] > a[1] ? b : a);
  return STAT_COLORS[dominant[0]];
}

function renderPlayerRadarChart(stats) {
  const canvas = document.getElementById("playerRadarChart");
  if (!canvas || typeof Chart === "undefined") return;

  const color = getDominantStatColor(stats);
  const data = [stats.attack, stats.midfield, stats.defense, stats.stamina ?? 0, stats.garra ?? 0, stats.technique ?? 0];

  if (playerRadarChartInstance) {
    // Morfear al nuevo jugador con animación (funciona en iOS)
    playerRadarChartInstance.data.datasets[0].data = data;
    playerRadarChartInstance.data.datasets[0].borderColor = color;
    playerRadarChartInstance.data.datasets[0].backgroundColor = color + "33";
    playerRadarChartInstance.data.datasets[0].pointBackgroundColor = color;
    playerRadarChartInstance.update();
    return;
  }

  playerRadarChartInstance = new Chart(canvas, {
    type: "radar",
    data: {
      labels: ["Ataque", "Centro", "Defensa", "Resistencia", "Garra", "Técnica"],
      datasets: [{
        data,
        backgroundColor: color + "33",
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      animation: { duration: 800, easing: "easeOutQuart" },
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { display: false },
          pointLabels: { color: "#ccc", font: { size: 12 } },
          grid: { color: "#444" },
          angleLines: { color: "#444" },
        },
      },
    },
  });
}

let ratingNavPlayers = [];
let ratingNavIndex = -1;
let editNavPlayers = [];
let editNavIndex = -1;

function openRatingDetailsByPlayerId(playerId) {
  const normalizedId = normalizePlayerId(playerId);
  if (!normalizedId) return;

  const allValidated = getPlayersForDisplay(players).filter(
    (p) => p.communityStatus === "validated"
  );
  const idx = allValidated.findIndex(
    (p) => normalizePlayerId(p?.id) === normalizedId
  );

  const playerForView = idx !== -1 ? allValidated[idx] : null;
  if (!playerForView) return;

  if (ratingNavPlayers.length === 0) {
    ratingNavPlayers = [...allValidated].sort(() => Math.random() - 0.5);
  }
  ratingNavIndex = ratingNavPlayers.findIndex((p) => normalizePlayerId(p?.id) === normalizedId);

  const modal = document.getElementById("ratingDetailsModal");
  if (!modal) return;

  const status = document.getElementById("ratingDetailsStatus");
  const ratingAverage = toScoreNumber(playerForView.communityAverage).toFixed(1);
  const ratingIcon = playerForView.communityStatus === "validated" ? ICON_STAR_FILLED : ICON_STAR_OUTLINE;
  const ratingStatusValue = playerForView.communityStatus === "validated" ? ratingAverage : "Pendiente";
  const trendMeta = getCommunityTrendMeta(playerForView.communityTrendDirection || "flat");
  const trendMarkup = trendMeta.symbol
    ? ` <span class="${trendMeta.className}" aria-hidden="true">${trendMeta.symbol}</span>`
    : "";

  const preferredDisplayName = String(playerForView.nickname || "").trim()
    || String(playerForView.name || "").trim()
    || "Jugador";

  const stats = {
    attack: playerForView.effectiveAttack,
    midfield: playerForView.effectiveMidfield,
    defense: playerForView.effectiveDefense,
    stamina: playerForView.effectiveStamina,
    garra: playerForView.effectiveGarra,
    technique: playerForView.effectiveTechnique,
  };
  if (status) status.innerHTML = `${ratingIcon} <span class="rating-value">${ratingStatusValue}</span>${trendMarkup}`;

  const navName = document.getElementById("ratingNavName");
  if (navName) navName.textContent = preferredDisplayName;

  const dotsContainer = document.getElementById("ratingNavDots");
  if (dotsContainer) {
    const total = ratingNavPlayers.length;
    if (total <= 1) {
      dotsContainer.innerHTML = "";
    } else {
      const count = total <= 6 ? total : 5;
      const activeDot = total <= 6 ? ratingNavIndex : Math.round(ratingNavIndex * (count - 1) / (total - 1));
      dotsContainer.innerHTML = Array.from({ length: count }, (_, i) =>
        `<span class="dot${i === activeDot ? " active" : ""}"></span>`
      ).join("");
    }
  }


  // STAT BARS (desactivadas — radar es protagonista; reactivar si se quiere volver)
  // const setStatBar = (fillId, numId, value) => {
  //   const fill = document.getElementById(fillId);
  //   const num = document.getElementById(numId);
  //   const pct = value != null ? (Number(value) / 10 * 100).toFixed(0) : 0;
  //   if (fill) fill.style.width = pct + "%";
  //   if (num) num.textContent = value != null ? Number(value).toFixed(1) : "–";
  // };
  // setStatBar("statBarAttack", "statNumAttack", stats.attack);
  // setStatBar("statBarMidfield", "statNumMidfield", stats.midfield);
  // setStatBar("statBarDefense", "statNumDefense", stats.defense);
  // setStatBar("statBarStamina", "statNumStamina", stats.stamina);
  // setStatBar("statBarGarra", "statNumGarra", stats.garra);
  // setStatBar("statBarTechnique", "statNumTechnique", stats.technique);

  modal.classList.remove("hidden");
  requestAnimationFrame(() => requestAnimationFrame(() => renderPlayerRadarChart(stats)));
}

function closeRatingDetailsModal() {
  document.getElementById("ratingDetailsModal")?.classList.add("hidden");
  ratingNavPlayers = [];
  ratingNavIndex = -1;
}

let currentIdentityPlayerId = null;

function openIdentityModal(playerId) {
  const player = players.find((p) => String(p.id) === String(playerId));
  if (!player) return;
  currentIdentityPlayerId = playerId;
  const modal = document.getElementById("identityModal");
  const title = document.getElementById("identityModalTitle");
  const nameInput = document.getElementById("identityName");
  const nicknameInput = document.getElementById("identityNickname");
  if (title) title.textContent = `Editar ${player.name}`;
  if (nameInput) nameInput.value = player.name || "";
  if (nicknameInput) nicknameInput.value = player.nickname || "";
  modal?.classList.remove("hidden");
}

function closeIdentityModal() {
  document.getElementById("identityModal")?.classList.add("hidden");
  currentIdentityPlayerId = null;
}

async function saveIdentity() {
  if (!currentIdentityPlayerId) return;
  const player = players.find((p) => String(p.id) === String(currentIdentityPlayerId));
  if (!player) return;
  const name = document.getElementById("identityName").value.trim();
  const nickname = document.getElementById("identityNickname").value.trim();
  if (!name) { alert("El nombre no puede estar vacío"); return; }
  if ((name + nickname).length > 14) { alert("Nombre y apodo juntos no pueden superar 14 caracteres"); return; }
  try {
    await apiClient.updatePlayer(currentIdentityPlayerId, {
      name,
      nickname,
      attack: toScoreNumber(player.attack),
      defense: toScoreNumber(player.defense),
      midfield: toScoreNumber(player.midfield),
    });
    player.name = name;
    player.nickname = nickname;
    closeIdentityModal();
    renderPlayers({ preserveOrder: true });
    showToast("Identidad actualizada", 2200, "success");
  } catch (error) {
    showToast("No se pudo guardar", 2600, "error");
  }
}

function getHistoryEntryName(entry) {
  if (entry && typeof entry === "object") {
    return String(entry.name || "").trim();
  }
  return String(entry || "").trim();
}

function getHistoryEntryNickname(entry) {
  if (entry && typeof entry === "object") {
    return String(entry.nickname || "").trim();
  }
  return "";
}

function resolveHistoryPlayerDisplay(entry) {
  const entryId = entry && typeof entry === "object"
    ? String(entry.id || "").trim()
    : "";
  const entryName = getHistoryEntryName(entry);
  const entryNameNormalized = entryName.toLowerCase();

  let matchedPlayer = null;
  if (entryId) {
    matchedPlayer = players.find((player) => String(player?.id || "").trim() === entryId) || null;
  }

  if (!matchedPlayer && entryNameNormalized) {
    matchedPlayer = players.find((player) => {
      const playerName = String(player?.name || "").trim().toLowerCase();
      return playerName === entryNameNormalized;
    }) || null;
  }

  if (!matchedPlayer) {
    return {
      name: entryName,
      nickname: getHistoryEntryNickname(entry),
    };
  }

  return {
    name: String(matchedPlayer.name || "").trim(),
    nickname: String(matchedPlayer.nickname || "").trim(),
  };
}

function getHistoryPlayerDisplayLabel(entry) {
  const resolved = resolveHistoryPlayerDisplay(entry);
  const resolvedNickname = String(resolved?.nickname || "").trim();
  const resolvedName = String(resolved?.name || "").trim();
  if (resolvedNickname) return resolvedNickname;
  if (resolvedName) return resolvedName;
  return getHistoryEntryName(entry) || "Jugador";
}

function normalizeMvpCandidateId(value) {
  return String(value ?? "").trim();
}

function getStoredMvpVotesByMatch() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MVP_VOTES_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function getCurrentUserMvpVoteForMatch(matchId) {
  const normalizedMatchId = String(matchId || "").trim();
  if (!normalizedMatchId) return "";

  const votesByMatch = getStoredMvpVotesByMatch();
  return normalizeMvpCandidateId(votesByMatch[normalizedMatchId]);
}

function setCurrentUserMvpVoteForMatch(matchId, candidateId) {
  const normalizedMatchId = String(matchId || "").trim();
  if (!normalizedMatchId) return;

  const normalizedCandidateId = normalizeMvpCandidateId(candidateId);
  const votesByMatch = getStoredMvpVotesByMatch();

  if (normalizedCandidateId) {
    votesByMatch[normalizedMatchId] = normalizedCandidateId;
  } else {
    delete votesByMatch[normalizedMatchId];
  }

  try {
    localStorage.setItem(MVP_VOTES_STORAGE_KEY, JSON.stringify(votesByMatch));
  } catch (_error) {
    // ignore storage write failures
  }
}

function buildMvpCandidateId(entry, label) {
  const entryId = entry && typeof entry === "object"
    ? String(entry.id || "").trim()
    : "";
  if (entryId) return entryId;

  const normalizedLabel = String(label || "").trim().toLowerCase();
  return normalizedLabel ? `name:${normalizedLabel}` : "";
}

function getMatchMvpCandidates(match) {
  const entries = [...(match?.teamA || []), ...(match?.teamB || [])];
  const candidatesById = new Map();

  entries.forEach((entry) => {
    const label = getHistoryPlayerDisplayLabel(entry);
    const id = buildMvpCandidateId(entry, label);
    if (!id || !label || candidatesById.has(id)) return;
    const baseName = String(resolveHistoryPlayerDisplay(entry)?.name || getHistoryEntryName(entry) || "").trim();
    candidatesById.set(id, { id, label, name: baseName });
  });

  if (candidatesById.size === 0) {
    const fallbackMvp = String(match?.mvp || "").trim();
    const fallbackId = buildMvpCandidateId(null, fallbackMvp);
    if (fallbackId && fallbackMvp) {
      candidatesById.set(fallbackId, { id: fallbackId, label: fallbackMvp });
    }
  }

  return Array.from(candidatesById.values());
}

function normalizeMvpVotesMap(rawVotes) {
  if (!rawVotes || typeof rawVotes !== "object" || Array.isArray(rawVotes)) {
    return {};
  }

  const normalized = {};
  Object.entries(rawVotes).forEach(([candidateId, votes]) => {
    const normalizedCandidateId = normalizeMvpCandidateId(candidateId);
    const normalizedVotes = Math.floor(Number(votes));
    if (!normalizedCandidateId || !Number.isFinite(normalizedVotes) || normalizedVotes <= 0) {
      return;
    }
    normalized[normalizedCandidateId] = normalizedVotes;
  });

  return normalized;
}

function resolveFallbackMvpCandidateId(match, candidates = []) {
  const mvpLabel = String(match?.mvp || "").trim().toLowerCase();
  if (!mvpLabel) return "";

  const byLabel = candidates.find((candidate) => String(candidate.label || "").trim().toLowerCase() === mvpLabel);
  if (byLabel) return byLabel.id;

  // Fallback: match against base name (handles nickname changes — e.g. mvp:"Seba" after nickname→"Sebita")
  const byName = candidates.find((candidate) => String(candidate.name || "").trim().toLowerCase() === mvpLabel);
  if (byName) return byName.id;

  const byId = candidates.find((candidate) => String(candidate.id || "").trim() === String(match?.mvp || "").trim());
  return byId ? byId.id : "";
}

function getNormalizedMatchMvpVotes(match, candidates = []) {
  const normalizedVotes = normalizeMvpVotesMap(match?.mvpVotes);
  const totalVotes = Object.values(normalizedVotes).reduce((total, votes) => total + votes, 0);
  if (totalVotes > 0) return normalizedVotes;

  const fallbackCandidateId = resolveFallbackMvpCandidateId(match, candidates);
  if (!fallbackCandidateId) return {};

  return { [fallbackCandidateId]: 1 };
}

function buildMvpVotesSummaryFromCandidates(candidates, votesByCandidateId = {}) {
  const normalizedVotes = normalizeMvpVotesMap(votesByCandidateId);
  const totalVotes = Object.values(normalizedVotes).reduce((total, votes) => total + votes, 0);

  const candidateStats = candidates.map((candidate) => {
    const votes = normalizedVotes[candidate.id] || 0;
    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
    return {
      ...candidate,
      votes,
      percentage,
    };
  });

  const maxVotes = candidateStats.reduce((maxValue, candidate) => Math.max(maxValue, candidate.votes), 0);
  const winners = maxVotes > 0
    ? candidateStats.filter((candidate) => candidate.votes === maxVotes)
    : [];

  return {
    candidates: candidateStats,
    normalizedVotes,
    totalVotes,
    maxVotes,
    winners,
  };
}

function getMatchMvpVotesSummary(match) {
  const candidates = getMatchMvpCandidates(match);
  const votesByCandidateId = getNormalizedMatchMvpVotes(match, candidates);
  const summary = buildMvpVotesSummaryFromCandidates(candidates, votesByCandidateId);

  const leadWinner = summary.winners.length === 1 ? summary.winners[0] : null;
  const tieWinners = summary.winners.length > 1 ? summary.winners : [];

  let resolvedMvpLabel = "";
  if (leadWinner) {
    resolvedMvpLabel = leadWinner.label;
  } else if (tieWinners.length > 1) {
    resolvedMvpLabel = `Empate: ${tieWinners.map((item) => item.label).join(" / ")}`;
  } else {
    resolvedMvpLabel = String(match?.mvp || "").trim();
  }

  return {
    ...summary,
    leadWinner,
    tieWinners,
    resolvedMvpLabel,
  };
}

function getMatchPlayedTimestampMs(match) {
  const candidates = [
    match?.playedAt,
    match?.updatedAt,
    match?.createdAt,
    match?.scheduledAt,
    match?.date,
  ];

  for (const rawValue of candidates) {
    const parsedMs = new Date(String(rawValue || "")).getTime();
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return parsedMs;
    }
  }

  return 0;
}

function getMatchMvpVotingEndsAtMs(match) {
  const explicitEndsAtMs = new Date(String(match?.mvpVotingEndsAt || "")).getTime();
  if (Number.isFinite(explicitEndsAtMs) && explicitEndsAtMs > 0) {
    return explicitEndsAtMs;
  }

  const playedAtMs = getMatchPlayedTimestampMs(match);
  if (!playedAtMs) return 0;
  return playedAtMs + MVP_VOTING_WINDOW_MS;
}

function isMatchMvpVotingOpen(match) {
  const status = String(match?.status || "played").trim().toLowerCase();
  if (status !== "played") return false;

  const votingEndsAtMs = getMatchMvpVotingEndsAtMs(match);
  if (!votingEndsAtMs) return true;
  return Date.now() <= votingEndsAtMs;
}

function buildUpdatedMatchAfterMvpVote(match, selectedCandidateId) {
  const normalizedCandidateId = normalizeMvpCandidateId(selectedCandidateId);
  if (!normalizedCandidateId) return null;

  const summary = getMatchMvpVotesSummary(match);
  const selectedCandidate = summary.candidates.find((candidate) => candidate.id === normalizedCandidateId);
  if (!selectedCandidate) return null;

  const nextVotes = { ...summary.normalizedVotes };

  const normalizedMatchId = String(match?.id || "").trim();
  const previousCandidateId = normalizedMatchId
    ? getCurrentUserMvpVoteForMatch(normalizedMatchId)
    : "";

  // Voto único por partido/dispositivo: si ya existe, no se permite modificar.
  if (previousCandidateId) return null;

  nextVotes[normalizedCandidateId] = (nextVotes[normalizedCandidateId] || 0) + 1;

  const updatedSummary = buildMvpVotesSummaryFromCandidates(summary.candidates, nextVotes);
  const leadWinner = updatedSummary.winners.length === 1 ? updatedSummary.winners[0] : null;
  const tieWinners = updatedSummary.winners.length > 1 ? updatedSummary.winners : [];
  const resolvedMvpLabel = leadWinner
    ? leadWinner.label
    : tieWinners.length > 1
      ? `Empate: ${tieWinners.map((item) => item.label).join(" / ")}`
      : selectedCandidate.label;

  const playedAtMs = getMatchPlayedTimestampMs(match) || Date.now();
  const fallbackVotingEndsAtMs = playedAtMs + MVP_VOTING_WINDOW_MS;
  const votingEndsAtMs = getMatchMvpVotingEndsAtMs(match) || fallbackVotingEndsAtMs;

  return {
    selectedCandidateId: normalizedCandidateId,
    updatedMatch: {
      ...match,
      status: "played",
      playedAt: String(match?.playedAt || "").trim() || new Date(playedAtMs).toISOString(),
      mvpVotingEndsAt: new Date(votingEndsAtMs).toISOString(),
      mvpVotes: updatedSummary.normalizedVotes,
      mvp: resolvedMvpLabel,
    },
  };
}

function getPlayerCommunitySummary(playerId) {
  const key = normalizePlayerId(playerId);
  return playerRatingsSummaryById[key] || null;
}

function enrichPlayerWithCommunityState(player) {
  const summary = getPlayerCommunitySummary(player?.id);
  const votes = Number(summary?.votes) || 0;
  const isValidated = votes >= COMMUNITY_MIN_VOTES;

  const baseAttack = toScoreNumber(player?.attack);
  const baseDefense = toScoreNumber(player?.defense);
  const baseMidfield = toScoreNumber(player?.midfield);
  const baseAverage = calculateAverageRating(baseAttack, baseDefense, baseMidfield);

  const communityAttack = toScoreNumber(summary?.avgAttack);
  const communityDefense = toScoreNumber(summary?.avgDefense);
  const communityMidfield = toScoreNumber(summary?.avgMidfield);
  const NEW_STAT_MIN_VOTES = DEFAULT_COMMUNITY_MIN_VOTES;
  const communityStamina = (summary?.countStamina || 0) >= NEW_STAT_MIN_VOTES ? toScoreNumber(summary?.avgStamina) : null;
  const communityGarra = (summary?.countGarra || 0) >= NEW_STAT_MIN_VOTES ? toScoreNumber(summary?.avgGarra) : null;
  const communityTechnique = (summary?.countTechnique || 0) >= NEW_STAT_MIN_VOTES ? toScoreNumber(summary?.avgTechnique) : null;
  const communityAverage = toScoreNumber(summary?.avgOverall) || calculateAverageRating(communityAttack, communityDefense, communityMidfield);
  const trendDirection = votes > 0
    ? getCommunityTrendDirection(baseAverage, communityAverage)
    : "flat";
  const trendMeta = getCommunityTrendMeta(trendDirection);

  const effectiveAttack = isValidated ? communityAttack : baseAttack;
  const effectiveDefense = isValidated ? communityDefense : baseDefense;
  const effectiveMidfield = isValidated ? communityMidfield : baseMidfield;
  const effectiveStamina = isValidated ? communityStamina : null;
  const effectiveGarra = isValidated ? communityGarra : null;
  const effectiveTechnique = isValidated ? communityTechnique : null;

  return {
    ...player,
    communityVotes: votes,
    communityMinVotes: COMMUNITY_MIN_VOTES,
    communityStatus: isValidated ? "validated" : "pending",
    communityAverage,
    communityAverageDelta: communityAverage - baseAverage,
    communityTrendDirection: trendDirection,
    communityTrendSymbol: trendMeta.symbol,
    communityTrendLabel: trendMeta.label,
    effectiveAttack,
    effectiveDefense,
    effectiveMidfield,
    effectiveStamina,
    effectiveGarra,
    effectiveTechnique,
  };
}

function getPlayersForDisplay(list = []) {
  return (list || []).map((player) => enrichPlayerWithCommunityState(player));
}

function getPlayersForMatch(list = []) {
  return getPlayersForDisplay(list).map((player) => ({
    ...player,
    attack: player.effectiveAttack,
    defense: player.effectiveDefense,
    midfield: player.effectiveMidfield,
  }));
}

async function refreshPlayerRatingsSummary() {
  if (typeof apiClient.getPlayerRatingsSummaryByPlayerId !== "function") {
    playerRatingsSummaryById = {};
    return;
  }

  try {
    const summary = await apiClient.getPlayerRatingsSummaryByPlayerId();
    playerRatingsSummaryById = summary && typeof summary === "object" ? summary : {};
  } catch (error) {
    console.warn("No se pudo cargar resumen community ratings:", error);
    playerRatingsSummaryById = {};
  }
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
    await refreshPlayerRatingsSummary();
    renderPlayers();
    return;
  }

  try {
    const data = await apiClient.getPlayers();
    players = data || [];
  } catch (e) {
    console.error("Error fetching players:", e);
    players = [];
  }

  await refreshPlayerRatingsSummary();
  await reconcileLocalVotesWithServer();
  renderPlayers();
}

async function fetchMatches() {
  await historyController.fetchMatches();
  updateMatchCreationLockUi();
}

async function addPlayer(name, nickname, attack = 0, defense = 0, midfield = 0, stamina = 0, garra = 0, technique = 0) {
  if (adminPlayersController) {
    await adminPlayersController.addPlayer(name, nickname, attack, defense, midfield, stamina, garra, technique);
    return;
  }

  try {
    const body = { name, nickname: nickname || "", attack, defense, midfield, stamina, garra, technique };
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
    preservePlayersOrderOnNextRender = true;
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
    renderPlayers({ preserveOrder: true });
    renderAdminPlayers();
  } catch (e) {
    console.error("Error deleting player:", e);
  }
}

async function updatePlayer(id, name, nickname, attack, defense, midfield, options = {}) {
  const { preserveOrder = false } = options;

  if (adminPlayersController) {
    if (preserveOrder) {
      preservePlayersOrderOnNextRender = true;
    }
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
    renderPlayers({ preserveOrder });
    renderAdminPlayers();
  } catch (e) {
    console.error("Error updating player:", e);
  }
}

/* Players view */
function renderPlayers(options = {}) {
  const { preserveOrder = false } = options;
  const shouldPreserveOrder = preserveOrder || preservePlayersOrderOnNextRender;
  preservePlayersOrderOnNextRender = false;
  const playersForView = getPlayersForDisplay(players);

  if (window.PlayersView?.renderPlayersList) {
    window.PlayersView.renderPlayersList({
      players: playersForView,
      playerSearchTerm,
      adminAuthenticated,
      onEdit: (id) => editPlayer(id),
      onDelete: (id) => deletePlayer(id),
      onRatingClick: (id) => openRatingDetailsByPlayerId(id),
      onNameClick: (id) => openIdentityModal(id),
      preserveOrder: shouldPreserveOrder,
    });
    return;
  }

  const playersTitle = document.getElementById("playersTitle");
  const playersList = document.getElementById("playersList");

  const term = playerSearchTerm.trim().toLowerCase();
  const filteredPlayers = term
    ? playersForView.filter(p => {
        const haystack = `${p.name} ${p.nickname || ""}`.toLowerCase();
        return haystack.includes(term);
      })
    : playersForView;

  if (playersTitle) {
    playersTitle.textContent = "Players";
  }

  if (filteredPlayers.length === 0) {
    playersList.innerHTML = '<p class="muted">Sin resultados</p>';
    return;
  }

  const visualPlayers = getVisualPlayersForRender(filteredPlayers, term, shouldPreserveOrder);

  playersList.innerHTML = visualPlayers.map(p => {
    const yaVotaste = !adminAuthenticated && hasUserVotedForPlayer(p.id);
    const nick = p.nickname?.trim()
      ? `<span class="player-nick">"${escapeHtml(p.nickname)}"</span>`
      : "";
    const ratingAverage = (
      (
        toScoreNumber(p.effectiveAttack) +
        toScoreNumber(p.effectiveDefense) +
        toScoreNumber(p.effectiveMidfield)
      ) / 3
    ).toFixed(1);
    const ratingIcon = p.communityStatus === "validated" ? ICON_STAR_FILLED : ICON_STAR_OUTLINE;
    const ratingValue = p.communityStatus === "validated"
      ? ratingAverage
      : "Pendiente";
    const canOpenRating = p.communityStatus === "validated";
    const ratingDisabledAttr = canOpenRating ? "" : " disabled aria-disabled=\"true\"";
    const trendDirection = canOpenRating ? String(p.communityTrendDirection || "flat") : "flat";
    const trendMeta = getCommunityTrendMeta(trendDirection);
    const trendMarkup = trendMeta.symbol
      ? ` <span class="${trendMeta.className}" aria-hidden="true">${trendMeta.symbol}</span>`
      : "";
    const ratingTitle = canOpenRating
      ? `Ver rating (${trendMeta.label})`
      : "Disponible con más votos";
    const ratingClass = p.communityStatus === "validated"
      ? "player-community player-community--ok player-community--rating"
      : "player-community player-community--pending player-community--rating";
    const statusMarkup = `<button type="button" class="${ratingClass}" data-rating-id="${p.id}" title="${ratingTitle}"${ratingDisabledAttr}>${ratingIcon} <span class="rating-value">${ratingValue}</span>${trendMarkup}</button>`;
    const scoreText = `A ${toScoreNumber(p.effectiveAttack)} · D ${toScoreNumber(p.effectiveDefense)} · M ${toScoreNumber(p.effectiveMidfield)}`;
    const scoreMarkup = adminAuthenticated
      ? `<span class="player-stats">${scoreText}</span>`
      : "";

    const deleteControl = adminAuthenticated
      ? `<button class="btn-delete" data-id="${p.id}" title="Eliminar">🗑️</button>`
      : "";

    const editButtonClass = yaVotaste ? "btn-edit btn-edit--voted" : "btn-edit";
    const editButtonTitle = yaVotaste ? "Editar voto" : "Votar";
    const editButtonLabel = yaVotaste ? "✏️ EDITAR" : "🗳️ VOTAR";
    const editControl = `<button class="${editButtonClass}" data-id="${p.id}" title="${editButtonTitle}">${editButtonLabel}</button>`;

    const adminControls = `<div class="admin-controls">
          ${editControl}
          ${deleteControl}
        </div>`;

    return `
      <article class="card">
        <div class="player-info">
          <div class="player-name">
            ${escapeHtml(p.name)} ${nick}
          </div>
          <div class="player-meta">
            ${statusMarkup}
            ${scoreMarkup}
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
  document.querySelectorAll(".player-community--rating").forEach((button) => {
    button.addEventListener("click", () => openRatingDetailsByPlayerId(button.dataset.ratingId));
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
        selectedPlayers = getPlayersForMatch(players).filter((player) => selectedIdSet.has(String(player.id)));
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
  selectedPlayers = getPlayersForMatch(players).filter(p =>
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
  const modal = document.getElementById("historyResultModal");

  if (!scoreAInput || !scoreBInput || !mvpSelect || !modal) {
    alert("No se pudo abrir el modal de resultado");
    return;
  }

  scoreAInput.value = String(pendingMatch.scoreA ?? 0);
  scoreBInput.value = String(pendingMatch.scoreB ?? 0);

  const mvpSummary = getMatchMvpVotesSummary(pendingMatch);
  mvpSelect.innerHTML = '<option value="">Seleccionar MVP</option>'
    + mvpSummary.candidates
      .map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.label)}</option>`)
      .join("");

  const selectedCandidateId = mvpSummary.leadWinner?.id
    || resolveFallbackMvpCandidateId(pendingMatch, mvpSummary.candidates)
    || "";
  mvpSelect.value = selectedCandidateId;

  modal.classList.remove("hidden");
}

async function savePendingResultFromModal() {
  if (!pendingHistoryResultMatchId) return;

  const pendingMatch = findHistoryMatchById(pendingHistoryResultMatchId);
  if (!pendingMatch) {
    alert("No se encontró el partido pendiente");
    return;
  }

  const scoreA = parseValidatedScore("historyScoreTeamA", "Equipo A");
  if (scoreA === null) return;

  const scoreB = parseValidatedScore("historyScoreTeamB", "Equipo B");
  if (scoreB === null) return;

  const selectedCandidateId = normalizeMvpCandidateId(document.getElementById("historyMvpSelect")?.value || "");
  if (!selectedCandidateId) {
    alert("Selecciona un MVP para guardar el resultado");
    return;
  }

  const mvpSummary = getMatchMvpVotesSummary(pendingMatch);
  const selectedCandidate = mvpSummary.candidates.find((candidate) => candidate.id === selectedCandidateId);
  const selectedLabel = selectedCandidate?.label
    || String(document.querySelector("#historyMvpSelect option:checked")?.textContent || "").trim();
  const playedAt = new Date().toISOString();
  const mvpVotingEndsAt = new Date(Date.now() + MVP_VOTING_WINDOW_MS).toISOString();

  const updatedMatch = {
    ...pendingMatch,
    id: pendingMatch.id,
    status: "played",
    scoreA,
    scoreB,
    playedAt,
    mvpVotingEndsAt,
    mvpVotes: selectedCandidateId ? { [selectedCandidateId]: 1 } : {},
    mvp: selectedLabel || null,
  };

  const storedMatch = await matchController.saveMatch(updatedMatch);
  if (storedMatch?.id && selectedCandidateId) {
    setCurrentUserMvpVoteForMatch(storedMatch.id, selectedCandidateId);
  }
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
    const failedInput = document.getElementById("matchLocation");
    if (failedInput) {
      failedInput.disabled = false;
      failedInput.placeholder = "Escribí el lugar manualmente";
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
      const placeQuery = locationInput.value.trim() || resolvedAddress || "";
      const resolvedMapsUrl = placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery || "Cancha")}&query_place_id=${encodeURIComponent(placeId)}`
        : buildMapsSearchUrl(placeQuery, resolvedAddress);

      selectedPlaceData = {
        location: locationInput.value.trim(),
        address: resolvedAddress,
        placeId,
        mapsUrl: resolvedMapsUrl,
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
      setCopyShareFeedback("Mensaje copiado");
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

  const scoreA = parseValidatedScore("scoreTeamA", "Equipo A");
  if (scoreA === null) return;

  const scoreB = parseValidatedScore("scoreTeamB", "Equipo B");
  if (scoreB === null) return;

  const mvpId = document.getElementById("mvpSelect").value;
  if (!mvpId) {
    alert("Selecciona un MVP para guardar el resultado");
    return;
  }
  const mvpName = mvpId
    ? String(document.querySelector(`#mvpSelect option[value="${mvpId}"]`)?.textContent || "").trim()
    : null;
  const playedAt = new Date().toISOString();
  const mvpVotingEndsAt = new Date(Date.now() + MVP_VOTING_WINDOW_MS).toISOString();
  const normalizedMvpId = normalizeMvpCandidateId(mvpId);

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
  match.playedAt = playedAt;
  match.mvpVotingEndsAt = mvpVotingEndsAt;
  match.mvpVotes = normalizedMvpId ? { [normalizedMvpId]: 1 } : {};

  const storedMatch = await matchController.saveMatch(match);
  if (storedMatch?.id && normalizedMvpId) {
    setCurrentUserMvpVoteForMatch(storedMatch.id, normalizedMvpId);
  }

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

async function voteMvpForMatch(matchId, candidateId) {
  const normalizedMatchId = String(matchId || "").trim();
  if (!normalizedMatchId) return;

  const existingVote = getCurrentUserMvpVoteForMatch(normalizedMatchId);
  if (existingVote) {
    showToast("Ya votaste el MVP de este partido", 2200, "error");
    return;
  }

  const match = findHistoryMatchById(normalizedMatchId);
  if (!match) {
    showToast("No se encontró el partido para votar", 2200, "error");
    return;
  }

  if (!isMatchMvpVotingOpen(match)) {
    showToast("La votación MVP ya cerró (8h)", 2200, "error");
    return;
  }

  const voteResult = buildUpdatedMatchAfterMvpVote(match, candidateId);
  if (!voteResult) {
    showToast("No se pudo registrar el voto", 2200, "error");
    return;
  }

  try {
    const storedMatch = await matchController.saveMatch(voteResult.updatedMatch);
    const persistedMatch = storedMatch && typeof storedMatch === "object"
      ? storedMatch
      : voteResult.updatedMatch;

    historyController.pushMatch(persistedMatch);
    setCurrentUserMvpVoteForMatch(normalizedMatchId, voteResult.selectedCandidateId);
    await fetchMatches();
    showToast("Voto MVP guardado", 2000, "success");
  } catch (error) {
    console.error("Error saving MVP vote:", error);
    showToast("No se pudo guardar el voto MVP", 2400, "error");
  }
}

/* Admin modal */
async function editPlayer(id) {
  const player = players.find(p => p.id == id);
  if (!player) return;

  const playerForEdit = enrichPlayerWithCommunityState(player);
  let hasVotedBefore = !adminAuthenticated && hasUserVotedForPlayer(id);
  let userPreviousRating = null;

  if (hasVotedBefore && playerRatingsService?.getCurrentUserRatingForPlayer) {
    try {
      userPreviousRating = await playerRatingsService.getCurrentUserRatingForPlayer(id);
      if (!userPreviousRating) {
        hasVotedBefore = false;
        unmarkPlayerAsVoted(id);
        renderPlayers({ preserveOrder: true });
      }
    } catch (error) {
      console.warn("No se pudo cargar el voto previo del usuario:", error);
      userPreviousRating = null;
    }
  }

  if (editNavPlayers.length === 0) {
    editNavPlayers = getPlayersForDisplay(players).filter(p => p.communityStatus === "validated");
  }
  editNavIndex = editNavPlayers.findIndex(p => String(p.id) === String(id));

  currentEditingPlayerId = id;
  document.getElementById("editPlayerName").value = playerForEdit.name;
  document.getElementById("editPlayerNickname").value = playerForEdit.nickname || "";
  const fallbackAttack = 0;
  const fallbackDefense = 0;
  const fallbackMidfield = 0;
  const initialAttack = adminAuthenticated
    ? (playerForEdit.effectiveAttack || 0)
    : Number(userPreviousRating?.attack ?? fallbackAttack);
  const initialDefense = adminAuthenticated
    ? (playerForEdit.effectiveDefense || 0)
    : Number(userPreviousRating?.defense ?? fallbackDefense);
  const initialMidfield = adminAuthenticated
    ? (playerForEdit.effectiveMidfield || 0)
    : Number(userPreviousRating?.midfield ?? fallbackMidfield);
  const initialStamina = adminAuthenticated
    ? (playerForEdit.effectiveStamina || 0)
    : Number(userPreviousRating?.stamina ?? 0);
  const initialGarra = adminAuthenticated
    ? (playerForEdit.effectiveGarra || 0)
    : Number(userPreviousRating?.garra ?? 0);
  const initialTechnique = adminAuthenticated
    ? (playerForEdit.effectiveTechnique || 0)
    : Number(userPreviousRating?.technique ?? 0);
  document.getElementById("editPlayerAttack").value = initialAttack;
  document.getElementById("editPlayerDefense").value = initialDefense;
  document.getElementById("editPlayerMidfield").value = initialMidfield;
  document.getElementById("editPlayerStamina").value = initialStamina;
  document.getElementById("editPlayerGarra").value = initialGarra;
  document.getElementById("editPlayerTechnique").value = initialTechnique;
  
  updateSliderValues();
  openEditModal(hasVotedBefore, Boolean(userPreviousRating), playerForEdit.name, id);
}

async function openEditModal(
  hasVotedBefore = false,
  hasPrefilledPreviousVote = false,
  playerName = "",
  playerId = null
) {
  const title = document.getElementById("editPlayerModalTitle");
  const saveBtn = document.getElementById("updatePlayerBtn");
  const actionSelector = document.getElementById("editActionSelector");
  const identityFields = document.getElementById("editIdentityFields");
  const ratingFields = document.getElementById("editRatingFields");
  const identityModeBtn = document.getElementById("editIdentityModeBtn");
  const ratingModeBtn = document.getElementById("editRatingModeBtn");
  const nameInput = document.getElementById("editPlayerName");
  const nicknameInput = document.getElementById("editPlayerNickname");
  const voteHint = document.getElementById("editPlayerVoteHint");
  const normalizedPlayerName = String(playerName || "").trim();
  const displayName = normalizedPlayerName || "jugador";
  const personalizedCalificarText = `Calificar ${displayName}`;
  const personalizedUpdateText = normalizedPlayerName
    ? `Actualizar ${normalizedPlayerName}`
    : "Actualizar jugador";

  currentEditPlayerName = normalizedPlayerName;
  currentEditHasVotedBefore = hasVotedBefore;
  currentEditHasPrefilledVote = hasPrefilledPreviousVote;


  // Verificar límite de votos para la pestaña Puntos
  currentEditReachedVoteLimit = false;
  if (playerId && playerRatingsService?.getOrCreateVoterKey && apiClient?.checkVoteLimitReached) {
    try {
      const voterKey = playerRatingsService.getOrCreateVoterKey();
      currentEditReachedVoteLimit = await apiClient.checkVoteLimitReached({ playerId, voterKey });
    } catch (_e) {
      currentEditReachedVoteLimit = false;
    }
  }

  function applyEditActionMode(nextAction = "rating") {
    const action = nextAction === "identity" ? "identity" : "rating";
    currentEditAction = action;

    if (actionSelector) actionSelector.classList.toggle("hidden", adminAuthenticated);

    if (identityModeBtn) identityModeBtn.classList.toggle("active", action === "identity");
    if (ratingModeBtn) ratingModeBtn.classList.toggle("active", action === "rating");

    if (adminAuthenticated) {
      if (identityFields) identityFields.classList.remove("hidden");
      if (ratingFields) ratingFields.classList.remove("hidden");
      if (title) title.textContent = "Editar jugador";
      if (saveBtn) saveBtn.textContent = "Guardar cambios";
      if (nameInput) nameInput.disabled = false;
      if (nicknameInput) nicknameInput.disabled = false;
      if (voteHint) voteHint.classList.add("hidden");
      return;
    }

    if (identityFields) identityFields.classList.toggle("hidden", action !== "identity");
    if (ratingFields) ratingFields.classList.toggle("hidden", action !== "rating");

    if (action === "identity") {
      if (title) title.textContent = `Editar ${displayName}`;
      if (saveBtn) {
        saveBtn.textContent = "Guardar identidad";
        saveBtn.disabled = false;
      }
      if (nameInput) nameInput.disabled = false;
      if (nicknameInput) nicknameInput.disabled = false;
      if (voteHint) voteHint.classList.add("hidden");
      const limitMsg = document.getElementById("voteLimitMsg");
      if (limitMsg) limitMsg.style.display = "none";
    } else {
      if (title) {
        title.textContent = hasVotedBefore ? personalizedUpdateText : personalizedCalificarText;
      }
      if (saveBtn) {
        saveBtn.textContent = hasVotedBefore ? personalizedUpdateText : personalizedCalificarText;
        saveBtn.disabled = currentEditReachedVoteLimit;
      }
      // Mensaje informativo si alcanzó el límite
      let limitMsg = document.getElementById("voteLimitMsg");
      if (!limitMsg && saveBtn) {
        limitMsg = document.createElement("div");
        limitMsg.id = "voteLimitMsg";
        limitMsg.className = "muted";
        saveBtn.parentNode.insertBefore(limitMsg, saveBtn.nextSibling);
      }
      if (limitMsg) {
        limitMsg.textContent = currentEditReachedVoteLimit ? "Alcanzaste el límite de 3 votos en 24hs para este jugador." : "";
        limitMsg.style.display = currentEditReachedVoteLimit ? "block" : "none";
      }
      if (nameInput) nameInput.disabled = true;
      if (nicknameInput) nicknameInput.disabled = true;
      if (voteHint) {
        const shouldShowHint = hasVotedBefore && hasPrefilledPreviousVote;
        voteHint.classList.toggle("hidden", !shouldShowHint);

        if (editVoteHintTimeoutId) {
          clearTimeout(editVoteHintTimeoutId);
          editVoteHintTimeoutId = null;
        }

        if (shouldShowHint) {
          editVoteHintTimeoutId = setTimeout(() => {
            voteHint.classList.add("hidden");
            editVoteHintTimeoutId = null;
          }, 2600);
        }
      }
    }
  }

  if (editVoteHintTimeoutId) {
    clearTimeout(editVoteHintTimeoutId);
    editVoteHintTimeoutId = null;
  }

  applyEditActionMode(adminAuthenticated ? "identity" : "rating");

  document.getElementById("editPlayerModal").classList.remove("hidden");
}

function closeEditModal() {
  if (editRadarChartInstance) {
    editRadarChartInstance.destroy();
    editRadarChartInstance = null;
  }
  const editRadarContainer = document.getElementById("editRadarContainer");
  if (editRadarContainer) editRadarContainer.style.display = "none";
  document.getElementById("editPlayerModal").classList.add("hidden");
  const voteHint = document.getElementById("editPlayerVoteHint");
  if (voteHint) voteHint.classList.add("hidden");
  if (editVoteHintTimeoutId) {
    clearTimeout(editVoteHintTimeoutId);
    editVoteHintTimeoutId = null;
  }
  currentEditingPlayerId = null;
  currentEditAction = "rating";
  currentEditPlayerName = "";
  currentEditHasVotedBefore = false;
  currentEditHasPrefilledVote = false;
  editNavPlayers = [];
  editNavIndex = -1;
}

async function saveEditPlayer() {
  const editPlayerId = String(currentEditingPlayerId || "").trim();
  if (!editPlayerId) return;

  const name = document.getElementById("editPlayerName").value.trim();
  const nickname = document.getElementById("editPlayerNickname").value.trim();
  const attack = parseInt(document.getElementById("editPlayerAttack").value) || 0;
  const defense = parseInt(document.getElementById("editPlayerDefense").value) || 0;
  const midfield = parseInt(document.getElementById("editPlayerMidfield").value) || 0;
  const stamina = parseInt(document.getElementById("editPlayerStamina").value) || 0;
  const garra = parseInt(document.getElementById("editPlayerGarra").value) || 0;
  const technique = parseInt(document.getElementById("editPlayerTechnique").value) || 0;
  const isIdentityAction = !adminAuthenticated && currentEditAction === "identity";

  if (!isIdentityAction) {
    const allEqual = (val) => attack === val && defense === val && midfield === val && stamina === val && garra === val && technique === val;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    if (allEqual(0)) {
      if (!confirm(pick([
        "¿Seguro que no viste nada positivo?",
        "No puede ser tan malo, ¡es un perro!",
      ]))) return;
    } else if (allEqual(1)) {
      if (!confirm(pick([
        "El famoso pata de palo.",
        "¿Puede y debe mejorar, confirmás?",
      ]))) return;
    } else if (allEqual(10)) {
      if (!confirm(pick([
        "¿Es el mejor del mundo? SIUUU 🐐",
        "¿Es el mesías?",
      ]))) return;
    }
  }

  if (!adminAuthenticated) {
    const hasVotedBefore = hasUserVotedForPlayer(editPlayerId);
    const player = players.find((item) => String(item.id) === editPlayerId);

    if (!name) {
      alert("El nombre no puede estar vacío");
      return;
    }

    try {
      const originalName = String(player?.name || "").trim();
      const originalNickname = String(player?.nickname || "").trim();
      const nextNickname = nickname || "";
      const shouldUpdateIdentity = name !== originalName || nextNickname !== originalNickname;

      if (isIdentityAction && shouldUpdateIdentity) {
        await apiClient.updatePlayer(editPlayerId, {
          name,
          nickname: nextNickname,
          attack: toScoreNumber(player?.attack),
          defense: toScoreNumber(player?.defense),
          midfield: toScoreNumber(player?.midfield),
        });

        if (player) {
          player.name = name;
          player.nickname = nextNickname;
        }

        renderPlayers({ preserveOrder: true });
        closeEditModal();
        showToast("Identidad actualizada", 2200, "success");
        return;
      }

      if (isIdentityAction) {
        closeEditModal();
        showToast("Sin cambios de identidad", 1800);
        return;
      }

      if (!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(editPlayerId)) {
        alert("Este jugador todavía usa ID de MockAPI. Para calificar en comunidad, primero migra players a Supabase (UUID).");
        return;
      }

      if (!playerRatingsService) {
        alert("No se pudo inicializar el servicio de calificaciones");
        return;
      }

      await playerRatingsService.savePlayerRating({
        playerId: editPlayerId,
        attack,
        defense,
        midfield,
        stamina,
        garra,
        technique,
      });
      markPlayerAsVoted(editPlayerId);
      _maybeShowInstall();
      await refreshPlayerRatingsSummary();
      await animateEditButtonFadeOut(editPlayerId);
      renderPlayers({ preserveOrder: true });
      closeEditModal();
      showToast(hasVotedBefore ? "Voto actualizado" : "Calificación guardada", 2200, "success");
    } catch (error) {
      console.error("Error guardando calificación:", error);
      showToast("No se pudo guardar la calificación", 2600, "error");
    }
    return;
  }

  if (!name) {
    alert("El nombre no puede estar vacío");
    return;
  }

  await updatePlayer(editPlayerId, name, nickname, attack, defense, midfield, { preserveOrder: true });
  closeEditModal();
}

function colorSliderTrack(id, color) {
  const el = document.getElementById(id);
  if (!el) return;
  const pct = (Number(el.value) / Number(el.max)) * 100;
  el.style.background = `linear-gradient(to right, ${color} ${pct}%, #444 ${pct}%)`;
}

function updateSliderValues() {
  const attack = Number(document.getElementById("editPlayerAttack").value);
  const defense = Number(document.getElementById("editPlayerDefense").value);
  const midfield = Number(document.getElementById("editPlayerMidfield").value);
  const stamina = Number(document.getElementById("editPlayerStamina").value);
  const garra = Number(document.getElementById("editPlayerGarra").value);
  const technique = Number(document.getElementById("editPlayerTechnique").value);
  document.getElementById("attackValue").textContent = attack;
  document.getElementById("defenseValue").textContent = defense;
  document.getElementById("midfieldValue").textContent = midfield;
  document.getElementById("staminaValue").textContent = stamina;
  document.getElementById("garraValue").textContent = garra;
  document.getElementById("techniqueValue").textContent = technique;
  colorSliderTrack("editPlayerAttack",    "#FF4C4C");
  colorSliderTrack("editPlayerDefense",   "#00E5FF");
  colorSliderTrack("editPlayerMidfield",  "#2ECC71");
  colorSliderTrack("editPlayerStamina",   "#F1C40F");
  colorSliderTrack("editPlayerGarra",     "#F97316");
  colorSliderTrack("editPlayerTechnique", "#9B59B6");
  updateEditRadarChart({ attack, midfield, defense, stamina, garra, technique });
}

function updateEditRadarChart(stats) {
  const container = document.getElementById("editRadarContainer");
  const canvas = document.getElementById("editPlayerRadarChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (container) container.style.display = "block";

  const hasAnyValue = Object.values(stats).some((v) => v > 0);
  const color = hasAnyValue ? getDominantStatColor(stats) : "transparent";
  const pointColor = hasAnyValue ? color : "transparent";

  if (editRadarChartInstance) {
    editRadarChartInstance.data.datasets[0].data = [stats.attack, stats.midfield, stats.defense, stats.stamina, stats.garra, stats.technique];
    editRadarChartInstance.data.datasets[0].borderColor = color;
    editRadarChartInstance.data.datasets[0].backgroundColor = hasAnyValue ? color + "33" : "transparent";
    editRadarChartInstance.data.datasets[0].pointBackgroundColor = pointColor;
    editRadarChartInstance.update("none");
    return;
  }

  editRadarChartInstance = new Chart(canvas, {
    type: "radar",
    data: {
      labels: ["Ataque", "Centro", "Defensa", "Resistencia", "Garra", "Técnica"],
      datasets: [{
        data: [stats.attack, stats.midfield, stats.defense, stats.stamina, stats.garra, stats.technique],
        backgroundColor: hasAnyValue ? color + "33" : "transparent",
        borderColor: color,
        borderWidth: 2,
        pointBackgroundColor: pointColor,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0,
          max: 10,
          ticks: { display: false },
          pointLabels: { color: "#ccc", font: { size: 11 } },
          grid: { color: "#444" },
          angleLines: { color: "#444" },
        },
      },
    },
  });
}

function openAdmin() {
  if (!adminAuthenticated) {
    openLoginModal();
  } else {
    handleLogout();
  }

  closeTopbarMenu();
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

function openFeedbackModal() {
  const modal = document.getElementById("feedbackModal");
  if (!modal) return;

  const kind = document.getElementById("feedbackKind");
  const message = document.getElementById("feedbackMessage");
  const alias = document.getElementById("feedbackAlias");
  const honey = document.getElementById("feedbackHoney");

  if (kind) kind.value = "sugerencia";
  if (message) message.value = "";
  if (alias) alias.value = "";
  if (honey) honey.value = "";

  modal.classList.remove("hidden");
  setTimeout(() => message?.focus(), 30);
}

function closeReportsModal() {
  document.getElementById("reportsModal")?.classList.add("hidden");
}

function closeVoteHistoryModal() {
  document.getElementById("voteHistoryModal")?.classList.add("hidden");
}

async function openVoteHistoryModal() {
  if (!adminAuthenticated) return;

  const modal = document.getElementById("voteHistoryModal");
  const loading = document.getElementById("voteHistoryLoading");
  const container = document.getElementById("voteActivityList");
  if (!modal || !container) return;

  modal.classList.remove("hidden");
  if (loading) loading.classList.remove("hidden");
  container.innerHTML = "";
  closeTopbarMenu();

  try {
    const rows = await apiClient.getRecentVoteActivity(40);
    renderVoteActivity(rows);
  } catch (_e) {
    container.innerHTML = '<p class="muted">No se pudo cargar el historial</p>';
  } finally {
    if (loading) loading.classList.add("hidden");
  }
}

function formatReportDatetime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Sin fecha";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function formatTimeAgo(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}hs`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function renderVoteActivity(rows = []) {
  const container = document.getElementById("voteActivityList");
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = '<p class="muted">Sin votos registrados</p>';
    return;
  }

  const now = Date.now();
  container.innerHTML = rows.map((row) => {
    const player = players.find((p) => String(p.id) === String(row.player_id));
    const name = player ? (player.nickname || player.name) : "Jugador desconocido";
    const diffMs = now - new Date(row.created_at).getTime();
    const timeAgo = formatTimeAgo(diffMs);
    return `
      <div class="vote-activity-item">
        <span class="vote-activity-name">${escapeHtml(name)}</span>
        <span class="vote-activity-scores">Atk ${Number(row.attack)} / Med ${Number(row.midfield)} / Def ${Number(row.defense)}</span>
        <span class="vote-activity-time muted">${escapeHtml(timeAgo)}</span>
      </div>
    `;
  }).join("");
}

function renderAdminReports(items = []) {
  const container = document.getElementById("reportsList");
  if (!container) return;

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<p class="muted">Sin reportes por ahora</p>';
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const kind = String(item?.kind || "sugerencia");
      const badge = kind === "bug" ? "🐞 Error" : "💡 Sugerencia";
      const alias = String(item?.alias || "").trim() || "Anónimo";
      const message = String(item?.message || "").trim() || "(sin mensaje)";
      const page = String(item?.page || "").trim() || "-";
      const createdAt = formatReportDatetime(item?.created_at);

      return `
        <article class="report-item">
          <div class="report-meta">
            <span class="report-kind">${escapeHtml(badge)}</span>
            <span class="report-date">${escapeHtml(createdAt)}</span>
          </div>
          <p class="report-message">${escapeHtml(message)}</p>
          <div class="report-foot">
            <span>👤 ${escapeHtml(alias)}</span>
            <span>📍 ${escapeHtml(page)}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

async function openAdminReportsModal() {
  if (!adminAuthenticated) {
    openFeedbackModal();
    closeTopbarMenu();
    return;
  }

  if (!authClient?.listAdminFeedback) {
    showToast("Sugerencias no disponible en este entorno", 2600, "error");
    closeTopbarMenu();
    return;
  }

  if (!currentAdminPin) {
    showToast("Volvé a iniciar sesión como admin", 2400, "error");
    closeTopbarMenu();
    return;
  }

  const modal = document.getElementById("reportsModal");
  const list = document.getElementById("reportsList");
  const loading = document.getElementById("reportsLoading");
  if (!modal || !list || !loading) return;
  if (adminReportsLoading) return;

  adminReportsLoading = true;
  modal.classList.remove("hidden");
  loading.classList.remove("hidden");
  list.innerHTML = "";
  closeTopbarMenu();

  const result = await authClient.listAdminFeedback({ pin: currentAdminPin, limit: 50 });

  loading.classList.add("hidden");
  adminReportsLoading = false;

  if (!result?.ok) {
    renderAdminReports([]);
    showToast(result?.message || "No se pudieron cargar reportes", 2800, "error");
    return;
  }

  renderAdminReports(result.items || []);
}

function closeFeedbackModal() {
  document.getElementById("feedbackModal")?.classList.add("hidden");
}

function openInfoApp() {
  closeTopbarMenu();
  document.getElementById("infoAppModal")?.classList.remove("hidden");
}

function toggleTopbarMenu() {
  const menu = document.getElementById("topbarMenu");
  const toggleBtn = document.getElementById("menuToggleBtn");
  if (!menu || !toggleBtn) return;

  const isOpen = menu.classList.contains("is-open");
  menu.classList.toggle("is-open", !isOpen);
  toggleBtn.setAttribute("aria-expanded", String(!isOpen));
}

function closeTopbarMenu() {
  const menu = document.getElementById("topbarMenu");
  const toggleBtn = document.getElementById("menuToggleBtn");
  if (!menu || !toggleBtn) return;

  menu.classList.remove("is-open");
  toggleBtn.setAttribute("aria-expanded", "false");
}

async function submitFeedbackFromModal() {
  if (feedbackSubmitting) return;

  if (!feedbackService?.submitFeedback) {
    showToast("Feedback no disponible en este entorno", 2600, "error");
    return;
  }

  const kindEl = document.getElementById("feedbackKind");
  const messageEl = document.getElementById("feedbackMessage");
  const aliasEl = document.getElementById("feedbackAlias");
  const honeyEl = document.getElementById("feedbackHoney");
  const sendBtn = document.getElementById("sendFeedbackBtn");

  const message = String(messageEl?.value || "").trim();
  if (message.length < 8) {
    showToast("Escribí al menos 8 caracteres", 2200, "error");
    return;
  }

  feedbackSubmitting = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    await feedbackService.submitFeedback({
      kind: kindEl?.value || "sugerencia",
      message,
      alias: aliasEl?.value || "",
      page: window.location?.pathname || "",
      userAgent: navigator?.userAgent || "",
      honeypot: honeyEl?.value || "",
    });

    closeFeedbackModal();
    showToast("¡Gracias! Recibimos tu sugerencia 🙌", 2600, "success");
  } catch (error) {
    if (error?.code === "cooldown") {
      const seconds = Math.max(1, Math.ceil((Number(error.remainingMs) || 0) / 1000));
      showToast(`Esperá ${seconds}s para volver a enviar`, 2600, "error");
    } else if (error?.code === "message_too_short") {
      showToast("Escribí un poco más de detalle", 2200, "error");
    } else {
      console.error("Error enviando feedback:", error);
      showToast("No se pudo enviar ahora", 2600, "error");
    }
  } finally {
    feedbackSubmitting = false;
    if (sendBtn) sendBtn.disabled = false;
  }
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
        currentAdminPin = pin;
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
    currentAdminPin = pin;
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
    currentAdminPin = "";
    return;
  }

  adminAuthenticated = false;
  currentAdminPin = "";
  updateAdminUI();
  renderPlayers();
}

function updateAdminUI() {
  const btnText = document.getElementById("adminBtnText");
  const addForm = document.getElementById("addPlayerForm");
  const adminBtn = document.getElementById("adminBtn");
  const voteHistoryBtn = document.getElementById("voteHistoryBtn");
  const body = document.body;

  if (addForm) {
    addForm.classList.remove("hidden");
  }

  if (adminAuthenticated) {
    btnText.textContent = "Admin ✓";
    adminBtn.classList.add("admin-authenticated");
    body.classList.add("admin-active");
    voteHistoryBtn?.classList.remove("hidden");
  } else {
    btnText.textContent = "Admin";
    adminBtn.classList.remove("admin-authenticated");
    body.classList.remove("admin-active");
    voteHistoryBtn?.classList.add("hidden");
  }

  renderHistory();
}

/* Events */
const tabs = document.querySelectorAll(".tab");
const views = {
  players: document.getElementById("view-players"),
  match: document.getElementById("view-match"),
  history: document.getElementById("view-history"),
  trajectory: document.getElementById("view-trajectory"),
};

function showView(key) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[key].classList.remove("hidden");
  tabs.forEach(t => t.classList.toggle("active", t.dataset.target === key));
  document.body.classList.toggle("view-trajectory", key === "trajectory");

  if (key === "players") {
    renderPlayers();
  } else if (key === "match") {
    renderMatchPlayers();
  } else if (key === "history") {
    renderHistory();
  } else if (key === "trajectory") {
    void window.TrajectoryView.renderTrajectory();
  }
}

tabs.forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.target));
});

document.getElementById("adminBtn")?.addEventListener("click", openAdmin);
document.getElementById("voteHistoryBtn")?.addEventListener("click", () => {
  void openVoteHistoryModal();
});
document.getElementById("feedbackBtn")?.addEventListener("click", () => {
  void openAdminReportsModal();
});

// PWA install prompt
let _installPrompt = null;
const _installDismissed = localStorage.getItem("fobal5_install_dismissed") === "true";
const _isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

function _showInstallFab() {
  if (_installDismissed || _isInstalled || !_installPrompt) return;
  document.getElementById("installFab")?.classList.remove("hidden");
}

function _maybeShowInstall() {
  const visited = localStorage.getItem("fobal5_visited");
  if (!visited) { localStorage.setItem("fobal5_visited", "true"); return; }
  _showInstallFab();
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _installPrompt = e;
});
function _updateInstallBtn() {
  const btn = document.getElementById("installAppBtn");
  if (!btn) return;
  if (_isInstalled) {
    btn.innerHTML = "Ya instalada ✓";
    btn.disabled = true;
    btn.style.opacity = "0.5";
  } else if (!_installPrompt) {
    // iOS: mostrar instrucción manual
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) {
      btn.innerHTML = `<i data-lucide="share"></i> Compartir → Agregar a inicio`;
      btn.disabled = true;
      if (window.lucide) lucide.createIcons();
    } else {
      btn.disabled = true;
      btn.style.opacity = "0.5";
    }
  }
}

window.addEventListener("appinstalled", () => {
  _installPrompt = null;
  document.getElementById("installFab")?.classList.add("hidden");
  const btn = document.getElementById("installAppBtn");
  if (btn) { btn.innerHTML = "Ya instalada ✓"; btn.disabled = true; }
});
document.getElementById("installFab")?.addEventListener("click", async () => {
  if (!_installPrompt) return;
  await _installPrompt.prompt();
  _installPrompt = null;
  document.getElementById("installFab")?.classList.add("hidden");
});
document.getElementById("installAppBtn")?.addEventListener("click", async () => {
  if (!_installPrompt) return;
  await _installPrompt.prompt();
  _installPrompt = null;
  document.getElementById("installFab")?.classList.add("hidden");
});

_updateInstallBtn();

// Mostrar FAB en segunda visita + después de una acción clave
_maybeShowInstall();
const ICON_MOON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`;
const ICON_SUN = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
const ICON_STAR_FILLED = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>`;
const ICON_STAR_OUTLINE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/></svg>`;

function updateBrandLogo() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const logo = document.getElementById("brandLogo");
  const src = isDark ? "icons/futbolFocapt2.jpg" : "icons/futbolFoca.png";
  if (logo) logo.src = src;
}

function applyDarkModeToggle() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const fab = document.getElementById("darkModeFab");
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("fobal5_theme", "light");
    if (fab) fab.innerHTML = ICON_MOON;
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("fobal5_theme", "dark");
    if (fab) fab.innerHTML = ICON_SUN;
  }
  updateBrandLogo();
}
document.getElementById("darkModeFab")?.addEventListener("click", applyDarkModeToggle);
// document.getElementById("matchSongToggleBtn")?.addEventListener("click", toggleMatchSong);
if (document.documentElement.getAttribute("data-theme") === "dark") {
  const fab = document.getElementById("darkModeFab");
  if (fab) fab.innerHTML = ICON_SUN;
}
updateBrandLogo();
document.getElementById("trajectoryBtn")?.addEventListener("click", () => {
  closeTopbarMenu();
  showView("trajectory");
});
document.getElementById("globalRatingBtn")?.addEventListener("click", () => {
  const firstPlayer = getPlayersForDisplay(players).find((p) => p.communityStatus === "validated");
  if (firstPlayer) openRatingDetailsByPlayerId(firstPlayer.id);
});
document.getElementById("infoAppBtn")?.addEventListener("click", openInfoApp);
document.getElementById("closeInfoAppBtn")?.addEventListener("click", () => {
  document.getElementById("infoAppModal")?.classList.add("hidden");
});
document.getElementById("menuToggleBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleTopbarMenu();
});
document.getElementById("topbarMenu")?.addEventListener("click", (e) => e.stopPropagation());
document.getElementById("closeLoginBtn")?.addEventListener("click", closeLoginModal);
document.getElementById("loginBtn")?.addEventListener("click", handleLogin);
document.getElementById("closeFeedbackBtn")?.addEventListener("click", closeFeedbackModal);
document.getElementById("closeReportsBtn")?.addEventListener("click", closeReportsModal);
document.getElementById("closeVoteHistoryBtn")?.addEventListener("click", closeVoteHistoryModal);
document.getElementById("voteHistoryModal")?.addEventListener("click", (e) => {
  if (e.target.id === "voteHistoryModal") closeVoteHistoryModal();
});
document.getElementById("sendFeedbackBtn")?.addEventListener("click", () => {
  void submitFeedbackFromModal();
});

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
    if (searchWrap) searchWrap.classList.add("hidden");
  });
}

function openNewPlayerModal(){
  document.getElementById('newPlayerModal').classList.remove('hidden');
  // set default values
  document.getElementById('newPlayerName').value = '';
  document.getElementById('newPlayerNickname').value = '';
  document.getElementById('newPlayerAttack').value = 0;
  document.getElementById('newPlayerDefense').value = 0;
  document.getElementById('newPlayerMidfield').value = 0;
  document.getElementById('newPlayerStamina').value = 0;
  document.getElementById('newPlayerGarra').value = 0;
  document.getElementById('newPlayerTechnique').value = 0;
  updateNewSliderValues();
}

function closeNewPlayerModal(){
  document.getElementById('newPlayerModal').classList.add('hidden');
}

function updateNewSliderValues(){
  document.getElementById('newAttackValue').textContent = document.getElementById('newPlayerAttack').value;
  document.getElementById('newDefenseValue').textContent = document.getElementById('newPlayerDefense').value;
  document.getElementById('newMidfieldValue').textContent = document.getElementById('newPlayerMidfield').value;
  document.getElementById('newStaminaValue').textContent = document.getElementById('newPlayerStamina').value;
  document.getElementById('newGarraValue').textContent = document.getElementById('newPlayerGarra').value;
  document.getElementById('newTechniqueValue').textContent = document.getElementById('newPlayerTechnique').value;
  colorSliderTrack('newPlayerAttack',    '#FF4C4C');
  colorSliderTrack('newPlayerDefense',   '#00E5FF');
  colorSliderTrack('newPlayerMidfield',  '#2ECC71');
  colorSliderTrack('newPlayerStamina',   '#F1C40F');
  colorSliderTrack('newPlayerGarra',     '#F97316');
  colorSliderTrack('newPlayerTechnique', '#9B59B6');
}

document.getElementById('closeNewBtn')?.addEventListener('click', closeNewPlayerModal);
document.getElementById('newPlayerModal')?.addEventListener('click', (e)=>{ if(e.target.id==='newPlayerModal') closeNewPlayerModal(); });
document.getElementById('newPlayerAttack')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerDefense')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerMidfield')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerStamina')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerGarra')?.addEventListener('input', updateNewSliderValues);
document.getElementById('newPlayerTechnique')?.addEventListener('input', updateNewSliderValues);

document.getElementById('createPlayerBtn')?.addEventListener('click', () => {
  const name = document.getElementById('newPlayerName').value.trim();
  const nickname = document.getElementById('newPlayerNickname').value.trim();
  const attack = parseInt(document.getElementById('newPlayerAttack').value) || 0;
  const defense = parseInt(document.getElementById('newPlayerDefense').value) || 0;
  const midfield = parseInt(document.getElementById('newPlayerMidfield').value) || 0;
  const stamina = parseInt(document.getElementById('newPlayerStamina').value) || 0;
  const garra = parseInt(document.getElementById('newPlayerGarra').value) || 0;
  const technique = parseInt(document.getElementById('newPlayerTechnique').value) || 0;
  if (!name) {
    alert('El nombre no puede estar vacío');
    return;
  }
  if ((name + nickname).length > 14) {
    alert('Nombre y apodo juntos no pueden superar 14 caracteres');
    return;
  }
  addPlayer(name, nickname, attack, defense, midfield, stamina, garra, technique);
  _maybeShowInstall();
  closeNewPlayerModal();
});

document.getElementById("startMatchBtn")?.addEventListener("click", divideTeams);
document.getElementById("recordMatchBtn")?.addEventListener("click", recordMatch);
document.getElementById("backToSelectionBtn")?.addEventListener("click", backToSelection);
document.getElementById("backToSetupBtn")?.addEventListener("click", backToMatchSetup);
document.getElementById("confirmMatchInfoBtn")?.addEventListener("click", confirmMatchInfo);
document.getElementById("openMapsBtn")?.addEventListener("click", openDetectedLocationInMaps);
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

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const rowBg = isDark ? "#1f2937" : "#f9fafb";
  const rowBorder = isDark ? "#374151" : "#e5e7eb";
  const rowColor = isDark ? "#f9fafb" : "#111827";
  const btnInactive = isDark ? "#374151" : "#d1d5db";

  const html = selectedPlayers.map((p, idx) => {
    // Always compare IDs as strings
    const inTeamA = currentTeams?.a?.some(t => String(t.id) === String(p.id));
    const inTeamB = currentTeams?.b?.some(t => String(t.id) === String(p.id));
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:${rowBg}; border-radius:6px; border:1px solid ${rowBorder}; color:${rowColor};">
        <span style="font-weight:500;">${p.name}${p.nickname ? ' <span style="color:#9ca3af;">"' + p.nickname + '"</span>' : ''}</span>
        <div style="display:flex; gap:6px;">
          <button class="team-btn-a" data-idx="${idx}" style="padding:4px 12px; border-radius:4px; border:none; cursor:pointer; background:${inTeamA ? '#10b981' : btnInactive}; color:white; font-weight:600; font-size:12px;">● A</button>
          <button class="team-btn-b" data-idx="${idx}" style="padding:4px 12px; border-radius:4px; border:none; cursor:pointer; background:${inTeamB ? '#3b82f6' : btnInactive}; color:white; font-weight:600; font-size:12px;">● B</button>
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
document.getElementById("editPlayerStamina")?.addEventListener("input", updateSliderValues);
document.getElementById("editPlayerGarra")?.addEventListener("input", updateSliderValues);
document.getElementById("editPlayerTechnique")?.addEventListener("input", updateSliderValues);
document.getElementById("editIdentityModeBtn")?.addEventListener("click", () => {
  if (adminAuthenticated) return;
  const title = document.getElementById("editPlayerModalTitle");
  const saveBtn = document.getElementById("updatePlayerBtn");
  const identityFields = document.getElementById("editIdentityFields");
  const ratingFields = document.getElementById("editRatingFields");
  const identityModeBtn = document.getElementById("editIdentityModeBtn");
  const ratingModeBtn = document.getElementById("editRatingModeBtn");
  const voteHint = document.getElementById("editPlayerVoteHint");
  const nameInput = document.getElementById("editPlayerName");
  const nicknameInput = document.getElementById("editPlayerNickname");
  const displayName = currentEditPlayerName || "jugador";

  currentEditAction = "identity";
  identityFields?.classList.remove("hidden");
  ratingFields?.classList.add("hidden");
  identityModeBtn?.classList.add("active");
  ratingModeBtn?.classList.remove("active");
  if (title) title.textContent = `Editar ${displayName}`;
  if (saveBtn) {
    saveBtn.textContent = "Guardar identidad";
    saveBtn.disabled = false;
  }
  if (nameInput) nameInput.disabled = false;
  if (nicknameInput) nicknameInput.disabled = false;
  if (voteHint) voteHint.classList.add("hidden");
  const limitMsgId = document.getElementById("voteLimitMsg");
  if (limitMsgId) limitMsgId.style.display = "none";
});
document.getElementById("editRatingModeBtn")?.addEventListener("click", () => {
  if (adminAuthenticated) return;
  const title = document.getElementById("editPlayerModalTitle");
  const saveBtn = document.getElementById("updatePlayerBtn");
  const identityFields = document.getElementById("editIdentityFields");
  const ratingFields = document.getElementById("editRatingFields");
  const identityModeBtn = document.getElementById("editIdentityModeBtn");
  const ratingModeBtn = document.getElementById("editRatingModeBtn");
  const voteHint = document.getElementById("editPlayerVoteHint");
  const nameInput = document.getElementById("editPlayerName");
  const nicknameInput = document.getElementById("editPlayerNickname");
  const displayName = currentEditPlayerName || "jugador";
  const calificarText = `Calificar ${displayName}`;
  const updateText = currentEditPlayerName ? `Actualizar ${currentEditPlayerName}` : "Actualizar jugador";

  currentEditAction = "rating";
  identityFields?.classList.add("hidden");
  ratingFields?.classList.remove("hidden");
  identityModeBtn?.classList.remove("active");
  ratingModeBtn?.classList.add("active");
  if (title) title.textContent = currentEditHasVotedBefore ? updateText : calificarText;
  if (saveBtn) {
    saveBtn.textContent = currentEditHasVotedBefore ? updateText : calificarText;
    saveBtn.disabled = currentEditReachedVoteLimit;
  }
  if (nameInput) nameInput.disabled = true;
  if (nicknameInput) nicknameInput.disabled = true;
  // Mostrar/ocultar mensaje de límite
  let limitMsg = document.getElementById("voteLimitMsg");
  if (!limitMsg && saveBtn) {
    limitMsg = document.createElement("div");
    limitMsg.id = "voteLimitMsg";
    limitMsg.className = "muted";
    saveBtn.parentNode.insertBefore(limitMsg, saveBtn.nextSibling);
  }
  if (limitMsg) {
    limitMsg.textContent = currentEditReachedVoteLimit ? "Alcanzaste el límite de 3 votos en 24hs para este jugador." : "";
    limitMsg.style.display = currentEditReachedVoteLimit ? "block" : "none";
  }
  if (voteHint) {
    const shouldShowHint = currentEditHasVotedBefore && currentEditHasPrefilledVote;
    voteHint.classList.toggle("hidden", !shouldShowHint);
  }
});

document.getElementById("editPlayerModal").addEventListener("click", (e) => {
  if (e.target.id === "editPlayerModal") {
    closeEditModal();
  }
});


document.getElementById("editNavPrev")?.addEventListener("click", () => {
  if (editNavPlayers.length < 2) return;
  editNavIndex = (editNavIndex - 1 + editNavPlayers.length) % editNavPlayers.length;
  editPlayer(editNavPlayers[editNavIndex].id);
});
document.getElementById("editNavNext")?.addEventListener("click", () => {
  if (editNavPlayers.length < 2) return;
  editNavIndex = (editNavIndex + 1) % editNavPlayers.length;
  editPlayer(editNavPlayers[editNavIndex].id);
});
const _editModalContent = document.querySelector("#editPlayerModal .modal-content");
const _editSwipeZone = document.getElementById("editRadarContainer");
if (_editModalContent && _editSwipeZone) {
  let _editSwipeStartX = null;
  let _editSwipeStartY = null;
  _editSwipeZone.addEventListener("touchstart", (e) => {
    _editSwipeStartX = e.touches[0].clientX;
    _editSwipeStartY = e.touches[0].clientY;
  }, { passive: true });
  _editModalContent.addEventListener("touchmove", (e) => {
    if (_editSwipeStartX === null) return;
    const dx = Math.abs(e.touches[0].clientX - _editSwipeStartX);
    const dy = Math.abs(e.touches[0].clientY - _editSwipeStartY);
    if (dx > dy) e.preventDefault();
  }, { passive: false });
  _editModalContent.addEventListener("touchend", (e) => {
    if (_editSwipeStartX === null || editNavPlayers.length < 2) return;
    const dx = e.changedTouches[0].clientX - _editSwipeStartX;
    _editSwipeStartX = null;
    _editSwipeStartY = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) {
      editNavIndex = (editNavIndex + 1) % editNavPlayers.length;
    } else {
      editNavIndex = (editNavIndex - 1 + editNavPlayers.length) % editNavPlayers.length;
    }
    editPlayer(editNavPlayers[editNavIndex].id);
  }, { passive: true });
}
document.getElementById("closeRatingDetailsBtn")?.addEventListener("click", closeRatingDetailsModal);
document.getElementById("ratingNavPrev")?.addEventListener("click", () => {
  if (ratingNavPlayers.length < 2) return;
  ratingNavIndex = (ratingNavIndex - 1 + ratingNavPlayers.length) % ratingNavPlayers.length;
  openRatingDetailsByPlayerId(ratingNavPlayers[ratingNavIndex].id);
});
document.getElementById("ratingNavNext")?.addEventListener("click", () => {
  if (ratingNavPlayers.length < 2) return;
  ratingNavIndex = (ratingNavIndex + 1) % ratingNavPlayers.length;
  openRatingDetailsByPlayerId(ratingNavPlayers[ratingNavIndex].id);
});
const _ratingModalContent = document.querySelector("#ratingDetailsModal .modal-content");
if (_ratingModalContent) {
  let _swipeStartX = null;
  let _swipeStartY = null;
  _ratingModalContent.addEventListener("touchstart", (e) => {
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  _ratingModalContent.addEventListener("touchmove", (e) => {
    if (_swipeStartX === null) return;
    const dx = Math.abs(e.touches[0].clientX - _swipeStartX);
    const dy = Math.abs(e.touches[0].clientY - _swipeStartY);
    if (dx > dy) e.preventDefault();
  }, { passive: false });
  _ratingModalContent.addEventListener("touchend", (e) => {
    if (_swipeStartX === null || ratingNavPlayers.length < 2) return;
    const dx = e.changedTouches[0].clientX - _swipeStartX;
    _swipeStartX = null;
    _swipeStartY = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) {
      ratingNavIndex = (ratingNavIndex + 1) % ratingNavPlayers.length;
    } else {
      ratingNavIndex = (ratingNavIndex - 1 + ratingNavPlayers.length) % ratingNavPlayers.length;
    }
    openRatingDetailsByPlayerId(ratingNavPlayers[ratingNavIndex].id);
  }, { passive: true });
}
document.getElementById("closeIdentityModalBtn")?.addEventListener("click", closeIdentityModal);
document.getElementById("saveIdentityBtn")?.addEventListener("click", saveIdentity);
document.getElementById("ratingDetailsModal")?.addEventListener("click", (e) => {
  if (e.target.id === "ratingDetailsModal") {
    closeRatingDetailsModal();
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

document.getElementById("feedbackModal")?.addEventListener("click", (e) => {
  if (e.target.id === "feedbackModal") {
    closeFeedbackModal();
  }
});

document.getElementById("reportsModal")?.addEventListener("click", (e) => {
  if (e.target.id === "reportsModal") {
    closeReportsModal();
  }
});

document.getElementById("feedbackMessage")?.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    void submitFeedbackFromModal();
  }
});

document.addEventListener("click", (e) => {
  const menu = document.getElementById("topbarMenu");
  const actions = document.getElementById("topbarActions");
  if (!menu || !menu.classList.contains("is-open")) return;
  if (actions?.contains(e.target)) return;
  closeTopbarMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeTopbarMenu();
  }
});

/* Init */
const GROUP_STORAGE_KEY = "fobal5_group";

async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin.toUpperCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function saveGroupToStorage(group) {
  localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify({ id: group.id, slug: group.slug, name: group.name }));
}

function loadGroupFromStorage() {
  try {
    const raw = localStorage.getItem(GROUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showPinOverlay(group, onSuccess) {
  const overlay = document.getElementById("groupPinOverlay");
  const title = document.getElementById("groupPinTitle");
  const input = document.getElementById("groupPinInput");
  const confirmBtn = document.getElementById("groupPinConfirmBtn");
  const errorMsg = document.getElementById("groupPinError");
  if (!overlay) return;

  title.textContent = group.name;
  input.value = "";
  errorMsg.classList.add("hidden");
  overlay.classList.remove("hidden");
  setTimeout(() => input.focus(), 100);

  async function attemptPin() {
    const hash = await hashPin(input.value);
    if (hash === group.pin_hash) {
      overlay.classList.add("hidden");
      saveGroupToStorage(group);
      onSuccess();
    } else {
      errorMsg.classList.remove("hidden");
      input.value = "";
      input.focus();
    }
  }

  confirmBtn.onclick = attemptPin;
  input.onkeydown = (e) => { if (e.key === "Enter") attemptPin(); };
}

(async function init() {
  const slug = new URLSearchParams(window.location.search).get("group");

  if (typeof apiClient.getGroups !== "function") {
    fetchPlayers();
    fetchMatches();
    return;
  }

  let groups = [];
  try {
    groups = await apiClient.getGroups();
  } catch (e) {
    console.warn("No se pudo cargar grupos:", e);
  }

  function enterGroup(group) {
    apiClient.setGroupId(group.id);
    const url = new URL(window.location.href);
    url.searchParams.set("group", group.slug);
    window.history.replaceState({}, "", url.toString());
    fetchPlayers();
    fetchMatches();
  }

  function resolveGroup(group) {
    const saved = loadGroupFromStorage();
    if (saved && saved.id === group.id) {
      // Ya autenticado previamente
      enterGroup(group);
    } else {
      showPinOverlay(group, () => enterGroup(group));
    }
  }

  if (slug) {
    const match = groups.find((g) => g.slug === slug);
    if (match) {
      resolveGroup(match);
      return;
    }
  }

  // Intentar recuperar grupo guardado
  const saved = loadGroupFromStorage();
  if (saved) {
    const match = groups.find((g) => g.id === saved.id);
    if (match) {
      enterGroup(match);
      return;
    }
  }

  if (groups.length === 1) {
    resolveGroup(groups[0]);
    return;
  }

  // Mostrar selector
  const overlay = document.getElementById("groupSelectorOverlay");
  const list = document.getElementById("groupSelectorList");
  if (overlay && list) {
    list.innerHTML = "";
    groups.forEach((g) => {
      const btn = document.createElement("button");
      btn.textContent = g.name;
      btn.style.cssText = "padding:16px;font-size:1.1rem;font-weight:700;border-radius:12px;border:none;cursor:pointer;background:var(--card-bg,#1e293b);color:var(--text-primary,#fff);";
      btn.addEventListener("click", () => {
        overlay.classList.add("hidden");
        resolveGroup(g);
      });
      list.appendChild(btn);
    });
    overlay.classList.remove("hidden");
  }
})();
showView("players");
// Ensure match mode default
setTimeout(()=> setMatchMode('balanced'), 50);
