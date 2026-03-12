(function (global) {
  const MVP_VOTING_WINDOW_MS = 8 * 60 * 60 * 1000;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getEntryName(entry) {
    if (entry && typeof entry === "object") {
      return String(entry.name || "").trim();
    }
    return String(entry || "").trim();
  }

  function getEntryNickname(entry) {
    if (entry && typeof entry === "object") {
      return String(entry.nickname || "").trim();
    }
    return "";
  }

  function getHistoryPlayerLabel(entry, resolvePlayerDisplay) {
    const entryName = getEntryName(entry);
    const entryNickname = getEntryNickname(entry);
    if (entryNickname) return entryNickname;

    if (typeof resolvePlayerDisplay === "function") {
      const resolved = resolvePlayerDisplay(entry);
      const resolvedNickname = String(resolved?.nickname || "").trim();
      const resolvedName = String(resolved?.name || "").trim();
      if (resolvedNickname) return resolvedNickname;
      if (resolvedName) return resolvedName;
    }

    return entryName || "Jugador";
  }

  function formatRemainingLabel(match) {
    const rawScheduledAt = String(match?.scheduledAt || "").trim();
    const rawDate = String(match?.date || "").trim();
    const candidate = rawScheduledAt || rawDate;
    if (!candidate) return "";

    const targetDate = new Date(candidate);
    const targetMs = targetDate.getTime();
    if (Number.isNaN(targetMs)) return "";

    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) return "Restante: 0m";

    const totalMinutes = Math.ceil(diffMs / 60000);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) {
      return `Restante: ${days}d ${hours}h`;
    }

    if (hours > 0) {
      return `Restante: ${hours}h ${minutes}m`;
    }

    return `Restante: ${Math.max(1, minutes)}m`;
  }

  function buildMvpCandidateId(entry, label) {
    const entryId = entry && typeof entry === "object"
      ? String(entry.id || "").trim()
      : "";
    if (entryId) return entryId;

    const normalizedLabel = String(label || "").trim().toLowerCase();
    return normalizedLabel ? `name:${normalizedLabel}` : "";
  }

  function getMatchMvpCandidates(match, resolvePlayerDisplay) {
    const entries = [...(match?.teamA || []), ...(match?.teamB || [])];
    const candidatesById = new Map();

    entries.forEach((entry) => {
      const label = getHistoryPlayerLabel(entry, resolvePlayerDisplay);
      const id = buildMvpCandidateId(entry, label);
      if (!id || !label || candidatesById.has(id)) return;
      candidatesById.set(id, { id, label });
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
      const normalizedCandidateId = String(candidateId || "").trim();
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

  function getMatchMvpSummary(match, resolvePlayerDisplay) {
    const candidates = getMatchMvpCandidates(match, resolvePlayerDisplay);
    const normalizedVotes = getNormalizedMatchMvpVotes(match, candidates);
    const totalVotes = Object.values(normalizedVotes).reduce((total, votes) => total + votes, 0);

    const candidatesWithPercent = candidates.map((candidate) => {
      const votes = normalizedVotes[candidate.id] || 0;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      return {
        ...candidate,
        votes,
        percentage,
      };
    });

    const maxVotes = candidatesWithPercent.reduce((maxValue, candidate) => Math.max(maxValue, candidate.votes), 0);
    const winners = maxVotes > 0
      ? candidatesWithPercent.filter((candidate) => candidate.votes === maxVotes)
      : [];

    return {
      candidates: candidatesWithPercent,
      normalizedVotes,
      totalVotes,
      winners,
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

  function buildMvpBadgeLabel(match, mvpSummary, isAdmin, votingOpen) {
    const icon = votingOpen ? "⏳" : "⭐";
    if (mvpSummary.winners.length === 1) {
      const winner = mvpSummary.winners[0];
      const pct = isAdmin ? ` (${winner.percentage}%)` : "";
      return `${icon} MVP: ${winner.label}${pct}`;
    }

    if (mvpSummary.winners.length > 1) {
      const winnersLabel = mvpSummary.winners
        .map((winner) => isAdmin ? `${winner.label} (${winner.percentage}%)` : winner.label)
        .join(" / ");
      return `${icon} Empate MVP: ${winnersLabel}`;
    }

    const fallbackMvp = String(match?.mvp || "").trim();
    return fallbackMvp ? `${icon} MVP: ${fallbackMvp}` : "";
  }

  function renderHistoryList({
    history,
    adminAuthenticated,
    onDelete,
    onResolveResult,
    onVoteMvp,
    getCurrentMvpVoteForMatch,
    resolvePlayerDisplay,
  }) {
    const historyList = document.getElementById("historyList");
    if (!historyList) return;

    if (!Array.isArray(history) || history.length === 0) {
      historyList.innerHTML = '<p class="muted">Sin partidos registrados</p>';
      return;
    }

    const validMatches = history.filter(
      (m) => m.teamA && m.teamB && m.teamA.length > 0 && m.teamB.length > 0
    );

    const getMatchTimestamp = (match) => {
      const candidates = [match?.scheduledAt, match?.createdAt, match?.updatedAt, match?.date];
      for (const rawValue of candidates) {
        if (!rawValue) continue;
        const timestamp = new Date(rawValue).getTime();
        if (!Number.isNaN(timestamp)) return timestamp;
      }
      return 0;
    };

    const orderedMatches = [...validMatches].sort((a, b) => getMatchTimestamp(b) - getMatchTimestamp(a));

    if (validMatches.length === 0) {
      historyList.innerHTML = '<p class="muted">Sin partidos registrados</p>';
      return;
    }

    const buildMobileFriendlyMapsLink = (rawMapsUrl = "", matchLocation = "") => {
      const safeLocation = String(matchLocation || "").trim();
      const fallbackLink = safeLocation
        ? `https://maps.google.com/?q=${encodeURIComponent(safeLocation)}`
        : "";

      const safeRawUrl = String(rawMapsUrl || "").trim();
      if (!safeRawUrl) return fallbackLink;

      try {
        const parsedUrl = new URL(safeRawUrl);
        const queryParam = parsedUrl.searchParams.get("query");
        if (queryParam) {
          return `https://maps.google.com/?q=${encodeURIComponent(queryParam)}`;
        }
      } catch (_error) {
      }

      return fallbackLink || safeRawUrl;
    };

    historyList.innerHTML = orderedMatches
      .map((m) => {
        const matchId = encodeURIComponent(String(m.id ?? ""));
        const matchDate = encodeURIComponent(String(m.date ?? ""));
        const matchLocation = String(m.location || m.matchLocation || m.place || "").trim();
        const matchStatus = String(m.status || "played").trim().toLowerCase();
        const mapsLink = buildMobileFriendlyMapsLink(m.mapsUrl, matchLocation);
        const remainingLabel = matchStatus === "scheduled" ? formatRemainingLabel(m) : "";
        const mvpSummary = getMatchMvpSummary(m, resolvePlayerDisplay);
        const hasMatchId = String(m.id ?? "").trim() !== "";
        const votingOpen = isMatchMvpVotingOpen(m);
        const currentVote = hasMatchId && typeof getCurrentMvpVoteForMatch === "function"
          ? String(getCurrentMvpVoteForMatch(String(m.id)) || "").trim()
          : "";
        const mvpBadgeLabel = buildMvpBadgeLabel(m, mvpSummary, adminAuthenticated, votingOpen);
        const canVote =
          matchStatus === "played"
          && hasMatchId
          && mvpSummary.candidates.length > 0
          && votingOpen
          && !currentVote
          && typeof onVoteMvp === "function";

        const renderMatchPlayer = (entry) => {
          const label = getHistoryPlayerLabel(entry, resolvePlayerDisplay);
          return `<span class="match-player">${escapeHtml(label)}</span>`;
        };

        return `
    <article class="card match-entry${adminAuthenticated ? " has-delete" : ""}" style="position:relative;">
      ${
        adminAuthenticated
          ? `<button class="match-delete-btn" data-match-id="${matchId}" data-match-date="${matchDate}" style="position:absolute; top:8px; right:8px; background:#ef4444; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer; font-weight:600; font-size:14px;">✕</button>`
          : ""
      }
      <div class="match-entry-top">
        <div class="match-date">${escapeHtml(String(m.date || ""))}</div>
        ${remainingLabel ? `<div class="match-remaining">${escapeHtml(remainingLabel)}</div>` : ""}
      </div>
      ${matchStatus === "scheduled"
        ? `<div class="muted" style="margin:4px 0 10px 0; font-weight:600;">⏳ Pendiente</div>`
        : ""}
      ${matchLocation ? `<div style="margin:0 0 10px 0;"><a class="muted" href="${mapsLink}" target="_blank" rel="noopener noreferrer">📍 ${matchLocation}</a></div>` : ""}

      <div class="match-grid">
        <div>
          <div class="match-team" style="font-weight:700; color:#10b981; margin-bottom:12px; font-size:13px; padding:8px; background:#ecfdf5; border-radius:6px;">● EQUIPO A</div>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${(m.teamA || []).map((player) => renderMatchPlayer(player)).join("")}
          </div>
        </div>

        <div class="match-center">
          <div class="match-score">
            <span>${m.scoreA ?? "—"}</span>
            <span class="dash">−</span>
            <span>${m.scoreB ?? "—"}</span>
          </div>
          ${matchStatus === "scheduled"
            ? `<button class="btn btn-primary match-resolve-btn" data-match-id="${matchId}" style="margin-top:10px; padding:6px 10px; font-size:12px;">Cargar resultado</button>`
            : ""}
          ${canVote
            ? `<div class="match-mvp-vote-wrap">
                <select class="match-mvp-select" data-match-id="${matchId}">
                  <option value="">⭐ MVP</option>
                  ${mvpSummary.candidates
                    .map((candidate) => {
                      const label = adminAuthenticated ? `${candidate.label} (${candidate.percentage}%)` : candidate.label;
                      return `<option value="${escapeHtml(candidate.id)}">${escapeHtml(label)}</option>`;
                    })
                    .join("")}
                </select>
              </div>`
            : (mvpBadgeLabel ? `<div class="match-mvp">${escapeHtml(mvpBadgeLabel)}</div>` : "")}
        </div>

        <div style="text-align:right;">
          <div class="match-team" style="font-weight:700; color:#3b82f6; margin-bottom:12px; font-size:13px; padding:8px; background:#eff6ff; border-radius:6px;">EQUIPO B ●</div>
          <div style="display:flex; flex-direction:column; gap:8px; ">
            ${(m.teamB || []).map((player) => renderMatchPlayer(player)).join("")}
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

    if (typeof onResolveResult === "function") {
      historyList.querySelectorAll(".match-resolve-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = decodeURIComponent(btn.dataset.matchId || "");
          onResolveResult(id);
        });
      });
    }

    if (typeof onVoteMvp === "function") {
      historyList.querySelectorAll(".match-mvp-select").forEach((select) => {
        select.addEventListener("change", () => {
          const matchId = decodeURIComponent(select.dataset.matchId || "");
          const candidateId = String(select.value || "").trim();
          if (!matchId || !candidateId) return;
          onVoteMvp(matchId, candidateId);
        });
      });
    }
  }

  global.HistoryView = {
    renderHistoryList,
  };
})(window);
