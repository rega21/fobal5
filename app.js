const HISTORY_KEY = "fobal5_history";
const ADMIN_PIN = "";
let adminAuthenticated = false;
let currentEditingPlayerId = null;

let players = [];
let selectedPlayers = [];
let currentTeams = null;
let playerSearchTerm = "";

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
        const teamANames = currentTeams.a.map((player) => player.name).join("\n");
        const teamBNames = currentTeams.b.map((player) => player.name).join("\n");
        return `🔵 Team A:\n${teamANames}\n\n🔵 Team B:\n${teamBNames}`;
      },
      buildMatchPayload(currentTeams, scoreA, scoreB, mvpName) {
        return {
          date: new Date().toLocaleString(),
          teamA: currentTeams.a.map((player) => player.name),
          teamB: currentTeams.b.map((player) => player.name),
          scoreA,
          scoreB,
          mvp: mvpName || null,
        };
      },
      async saveMatch(match) {
        let storedMatch = { ...match };
        try {
          const created = await apiClient.createMatch(match);
          if (created && typeof created === "object") {
            storedMatch = created;
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

  playersList.innerHTML = filteredPlayers.map(p => {
    const nick = p.nickname?.trim()
      ? `<span class="player-nick">"${escapeHtml(p.nickname)}"</span>`
      : "";

    const adminControls = adminAuthenticated
      ? `<div class="admin-controls">
          <button class="btn-edit" data-id="${p.id}" title="Editar">✏️</button>
          <button class="btn-delete" data-id="${p.id}" title="Eliminar">🗑️</button>
        </div>`
      : "";

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
  const matchPlayersList = document.getElementById("matchPlayersList");
  matchPlayersList.innerHTML = players.map(p => {
    const isSelected = selectedPlayers.some(sp => sp.id === p.id);
    const disabled = selectedPlayers.length >= 10 && !isSelected ? "disabled" : "";
    
    return `
      <article class="card card-selectable ${isSelected ? "selected" : ""}" data-id="${p.id}">
        <div class="player-name">
          ${escapeHtml(p.name)}
          ${p.nickname?.trim() ? `<span class="player-nick">"${escapeHtml(p.nickname)}"</span>` : ""}
        </div>
        <label class="checkbox">
          <input type="checkbox" ${isSelected ? "checked" : ""} ${disabled} data-id="${p.id}">
          <span class="checkbox-visual"></span>
        </label>
      </article>
    `;
  }).join("");

  // Event listeners
  document.querySelectorAll("#matchPlayersList .card-selectable").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") {
        const checkbox = card.querySelector("input");
        checkbox.checked = !checkbox.checked;
        updateSelectedPlayers();
      }
    });

    card.querySelector("input").addEventListener("change", updateSelectedPlayers);
  });

  // Update match counter and button states
  updateSelectedPlayers();
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
  });

  const startBtn = document.getElementById("startMatchBtn");
  const genBtn = document.getElementById("generateBalancedBtn");
  const genManualBtn = document.getElementById("generateManualBtn");
  const matchCount = document.getElementById("matchCount");
  matchCount.textContent = `${selectedPlayers.length}/10`;
  if (startBtn) startBtn.disabled = !ready;
  if (genBtn) genBtn.disabled = !ready;
  if (genManualBtn) genManualBtn.disabled = !ready;
}

function divideTeams() {
  currentTeams = matchController.createRandomTeams(selectedPlayers);
  renderTeams();
  showMatchResults();
}

function generateBalancedTeams() {
  if (selectedPlayers.length !== 10) {
    alert('Selecciona 10 jugadores para generar equipos balanceados');
    return;
  }

  currentTeams = matchController.createBalancedTeams(selectedPlayers);
  renderTeams();
  showMatchResults();
}

function renderTeams() {
  const teamA = document.getElementById("teamA");
  const teamB = document.getElementById("teamB");

  teamA.innerHTML = currentTeams.a.map(p => `
    <div class="team-player">${escapeHtml(p.name)}</div>
  `).join("");

  teamB.innerHTML = currentTeams.b.map(p => `
    <div class="team-player">${escapeHtml(p.name)}</div>
  `).join("");
  
  // Populate MVP select
  populateMVPSelect();
}

function populateMVPSelect() {
  const mvpSelect = document.getElementById("mvpSelect");
  const allPlayers = [...currentTeams.a, ...currentTeams.b];
  mvpSelect.innerHTML = '<option value="">Select MVP</option>' + 
    allPlayers.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

function showMatchResults() {
  document.getElementById("matchSelection").classList.add("hidden");
  document.getElementById("manualTeamSelection").classList.add("hidden");
  document.getElementById("matchResults").classList.remove("hidden");
  renderTeams();
  // Repopulate MVP select
  const mvpSelect = document.getElementById("mvpSelect");
  mvpSelect.innerHTML = '<option value="">Select MVP</option>' + currentTeams.a.concat(currentTeams.b).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  // Reset scores
  document.getElementById("scoreTeamA").value = 0;
  document.getElementById("scoreTeamB").value = 0;
  document.getElementById("mvpSelect").value = "";
}

function backToSelection() {
  document.getElementById("matchResults").classList.add("hidden");
  document.getElementById("matchSelection").classList.remove("hidden");
  currentTeams = null;
}

function copyToWhatsApp() {
  if (!currentTeams) return;
  const text = matchController.buildWhatsAppText(currentTeams);
  
  // Copy to clipboard
  navigator.clipboard.writeText(text).then(() => {
    alert('✓ Copied to clipboard!');
  }).catch(() => {
    alert('Teams:\n\n' + text);
  });
}

async function recordMatch() {
  if (!currentTeams) return;

  const scoreA = parseInt(document.getElementById("scoreTeamA").value) || 0;
  const scoreB = parseInt(document.getElementById("scoreTeamB").value) || 0;
  const mvpId = document.getElementById("mvpSelect").value;
  const mvpName = mvpId ? document.querySelector(`#mvpSelect option[value="${mvpId}"]`).textContent : null;

  const match = matchController.buildMatchPayload(currentTeams, scoreA, scoreB, mvpName);
  const storedMatch = await matchController.saveMatch(match);

  historyController.pushMatch(storedMatch);

  // Reset
  selectedPlayers = [];
  currentTeams = null;
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
  if (!adminAuthenticated) {
    alert("Solo el admin puede editar jugadores");
    return;
  }
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
document.getElementById("copyToWhatsAppBtn")?.addEventListener("click", copyToWhatsApp);
// Balanced teams
const genBtnEl = document.getElementById("generateBalancedBtn");
if (genBtnEl) genBtnEl.addEventListener("click", generateBalancedTeams);

// Manual teams
const genManualBtnEl = document.getElementById("generateManualBtn");
if (genManualBtnEl) genManualBtnEl.addEventListener("click", () => {
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
  showMatchResults();
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
}

function renderManualTeamSelection() {
  if (selectedPlayers.length === 0) {
    console.log('selectedPlayers está vacío');
    return;
  }
  // Debug: log selectedPlayers
  console.log('selectedPlayers:', selectedPlayers);
  if (selectedPlayers.length > 0) {
    selectedPlayers.forEach((p, i) => {
      console.log(`selectedPlayers[${i}]:`, p);
    });
  }

  const playersList = document.getElementById('manualPlayersList');
  const teamCount = document.getElementById('teamCount');
  console.log('manualPlayersList:', playersList);
  console.log('teamCount:', teamCount);

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
  console.log('HTML generado para manualPlayersList:', html);
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

/* Init */
fetchPlayers();
fetchMatches();
showView("players");
// Ensure match mode default
setTimeout(()=> setMatchMode('balanced'), 50);
