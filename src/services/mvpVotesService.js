(function (global) {
  function createMvpVotesService({ votingWindowMs, storageKey, getPlayers }) {

    // Private history helpers (duplicated aquí para que el servicio sea autónomo)
    function getHistoryEntryName(entry) {
      if (entry && typeof entry === "object") return String(entry.name || "").trim();
      return String(entry || "").trim();
    }

    function getHistoryEntryNickname(entry) {
      if (entry && typeof entry === "object") return String(entry.nickname || "").trim();
      return "";
    }

    function resolveHistoryPlayerDisplay(entry) {
      const players = getPlayers();
      const entryId = entry && typeof entry === "object" ? String(entry.id || "").trim() : "";
      const entryName = getHistoryEntryName(entry);
      const entryNameNormalized = entryName.toLowerCase();

      let matchedPlayer = null;
      if (entryId) {
        matchedPlayer = players.find((p) => String(p?.id || "").trim() === entryId) || null;
      }
      if (!matchedPlayer && entryNameNormalized) {
        matchedPlayer = players.find((p) => String(p?.name || "").trim().toLowerCase() === entryNameNormalized) || null;
      }

      if (!matchedPlayer) return { name: entryName, nickname: getHistoryEntryNickname(entry) };
      return { name: String(matchedPlayer.name || "").trim(), nickname: String(matchedPlayer.nickname || "").trim() };
    }

    function getHistoryPlayerDisplayLabel(entry) {
      const resolved = resolveHistoryPlayerDisplay(entry);
      const resolvedNickname = String(resolved?.nickname || "").trim();
      const resolvedName = String(resolved?.name || "").trim();
      if (resolvedNickname) return resolvedNickname;
      if (resolvedName) return resolvedName;
      return getHistoryEntryName(entry) || "Jugador";
    }

    // MVP core functions

    function normalizeMvpCandidateId(value) {
      return String(value ?? "").trim();
    }

    function getStoredMvpVotesByMatch() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
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
        localStorage.setItem(storageKey, JSON.stringify(votesByMatch));
      } catch (_error) {}
    }

    function buildMvpCandidateId(entry, label) {
      const entryId = entry && typeof entry === "object" ? String(entry.id || "").trim() : "";
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
      if (!rawVotes || typeof rawVotes !== "object" || Array.isArray(rawVotes)) return {};
      const normalized = {};
      Object.entries(rawVotes).forEach(([candidateId, votes]) => {
        const normalizedCandidateId = normalizeMvpCandidateId(candidateId);
        const normalizedVotes = Math.floor(Number(votes));
        if (!normalizedCandidateId || !Number.isFinite(normalizedVotes) || normalizedVotes <= 0) return;
        normalized[normalizedCandidateId] = normalizedVotes;
      });
      return normalized;
    }

    function resolveFallbackMvpCandidateId(match, candidates = []) {
      const mvpLabel = String(match?.mvp || "").trim().toLowerCase();
      if (!mvpLabel) return "";
      const byLabel = candidates.find((c) => String(c.label || "").trim().toLowerCase() === mvpLabel);
      if (byLabel) return byLabel.id;
      // Fallback: match contra el nombre base (cubre cambios de apodo)
      const byName = candidates.find((c) => String(c.name || "").trim().toLowerCase() === mvpLabel);
      if (byName) return byName.id;
      const byId = candidates.find((c) => String(c.id || "").trim() === String(match?.mvp || "").trim());
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
        return { ...candidate, votes, percentage };
      });

      const maxVotes = candidateStats.reduce((maxValue, c) => Math.max(maxValue, c.votes), 0);
      const winners = maxVotes > 0 ? candidateStats.filter((c) => c.votes === maxVotes) : [];

      return { candidates: candidateStats, normalizedVotes, totalVotes, maxVotes, winners };
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

      return { ...summary, leadWinner, tieWinners, resolvedMvpLabel };
    }

    function getMatchPlayedTimestampMs(match) {
      const candidates = [match?.playedAt, match?.updatedAt, match?.createdAt, match?.scheduledAt, match?.date];
      for (const rawValue of candidates) {
        const parsedMs = new Date(String(rawValue || "")).getTime();
        if (Number.isFinite(parsedMs) && parsedMs > 0) return parsedMs;
      }
      return 0;
    }

    function getMatchMvpVotingEndsAtMs(match) {
      const explicitEndsAtMs = new Date(String(match?.mvpVotingEndsAt || "")).getTime();
      if (Number.isFinite(explicitEndsAtMs) && explicitEndsAtMs > 0) return explicitEndsAtMs;
      const playedAtMs = getMatchPlayedTimestampMs(match);
      if (!playedAtMs) return 0;
      return playedAtMs + votingWindowMs;
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
      const selectedCandidate = summary.candidates.find((c) => c.id === normalizedCandidateId);
      if (!selectedCandidate) return null;

      const nextVotes = { ...summary.normalizedVotes };

      const normalizedMatchId = String(match?.id || "").trim();
      const previousCandidateId = normalizedMatchId ? getCurrentUserMvpVoteForMatch(normalizedMatchId) : "";

      // Voto único por partido/dispositivo
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
      const fallbackVotingEndsAtMs = playedAtMs + votingWindowMs;
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

    return {
      getMatchMvpVotesSummary,
      getMatchMvpCandidates,
      getCurrentUserMvpVoteForMatch,
      setCurrentUserMvpVoteForMatch,
      isMatchMvpVotingOpen,
      buildUpdatedMatchAfterMvpVote,
      getMatchPlayedTimestampMs,
      getMatchMvpVotingEndsAtMs,
    };
  }

  global.createMvpVotesService = createMvpVotesService;
})(window);
