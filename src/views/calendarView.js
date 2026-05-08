(function (global) {
  const MONTH_NAMES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const DAY_NAMES = ["L", "M", "M", "J", "V", "S", "D"];

  let state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    matchesByDay: {},
    cardOptions: null,
    selectedKey: null,
  };

  function getMatchDate(match) {
    const candidates = [match?.scheduledAt, match?.createdAt, match?.updatedAt, match?.date];
    for (const raw of candidates) {
      if (!raw) continue;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }

  function buildMatchesByDay(history) {
    const map = {};
    for (const match of history) {
      if (!match.teamA?.length || !match.teamB?.length) continue;
      const d = getMatchDate(match);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(match);
    }
    return map;
  }

  function renderCalendar({ history, adminAuthenticated, onDelete, onResolveResult, onVoteMvp, getCurrentMvpVoteForMatch, resolvePlayerDisplay }) {
    state.matchesByDay = buildMatchesByDay(history);
    state.cardOptions = { adminAuthenticated, onDelete, onResolveResult, onVoteMvp, getCurrentMvpVoteForMatch, resolvePlayerDisplay };

    // Navigate to most recent match month if no selected month yet or reset to today
    if (!state.selectedKey) {
      const allKeys = Object.keys(state.matchesByDay).sort().reverse();
      if (allKeys.length > 0) {
        const [y, m] = allKeys[0].split("-").map(Number);
        state.year = y;
        state.month = m - 1;
      }
    }

    renderMonth();
  }

  function renderMonth() {
    const container = document.getElementById("calendarContainer");
    if (!container) return;

    const { year, month, matchesByDay, selectedKey } = state;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-first: getDay() returns 0=Sun, shift so Mon=0
    let startDow = (firstDay.getDay() + 6) % 7;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    let gridHtml = DAY_NAMES.map((d) => `<div class="cal-day-name">${d}</div>`).join("");

    for (let i = 0; i < startDow; i++) {
      gridHtml += `<div class="cal-day cal-day--empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const matches = matchesByDay[key];
      const hasMatch = Boolean(matches?.length);
      const isScheduled = hasMatch && matches.some((m) => String(m.status || "played").trim() === "scheduled");
      const isToday = key === todayKey;
      const isSelected = key === selectedKey;

      let cls = "cal-day";
      if (hasMatch) cls += isScheduled ? " cal-day--scheduled" : " cal-day--match";
      if (isToday) cls += " cal-day--today";
      if (isSelected) cls += " cal-day--selected";

      gridHtml += `<div class="${cls}" data-key="${key}">${day}${hasMatch ? '<span class="cal-dot"></span>' : ""}</div>`;
    }

    container.innerHTML = `
      <div class="cal-nav">
        <button class="cal-nav-btn" id="calPrevBtn">&#8249;</button>
        <span class="cal-month-label">${MONTH_NAMES[month]} ${year}</span>
        <button class="cal-nav-btn" id="calNextBtn">&#8250;</button>
      </div>
      <div class="cal-grid">${gridHtml}</div>
      <div id="calDetail" class="cal-detail"></div>
    `;

    document.getElementById("calPrevBtn").addEventListener("click", () => {
      state.month--;
      if (state.month < 0) { state.month = 11; state.year--; }
      renderMonth();
    });

    document.getElementById("calNextBtn").addEventListener("click", () => {
      state.month++;
      if (state.month > 11) { state.month = 0; state.year++; }
      renderMonth();
    });

    container.querySelectorAll(".cal-day--match, .cal-day--scheduled").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.dataset.key;
        if (state.selectedKey === key) {
          state.selectedKey = null;
          renderMonth();
          return;
        }
        state.selectedKey = key;
        renderMonth();
        showMatchesForDay(key);
        // Scroll detail into view
        setTimeout(() => document.getElementById("calDetail")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      });
    });

    if (selectedKey && matchesByDay[selectedKey]) {
      showMatchesForDay(selectedKey);
    }
  }

  function showMatchesForDay(key) {
    const detail = document.getElementById("calDetail");
    if (!detail) return;
    const matches = state.matchesByDay[key];
    if (!matches?.length) return;

    if (!global.HistoryView?.renderMatchCards) return;
    global.HistoryView.renderMatchCards(matches, detail, state.cardOptions);
  }

  function resetState() {
    state.selectedKey = null;
    const today = new Date();
    state.year = today.getFullYear();
    state.month = today.getMonth();
  }

  global.CalendarView = { renderCalendar, resetState };
})(window);
