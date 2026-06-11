(function (global) {
  function createVoterTrackingService({ storageKey, getAdminAuthenticated, getCurrentUser, getPlayers, getRatingsService, getApiClient }) {
    function normalizeId(value) {
      return String(value ?? "").trim().toLowerCase();
    }

    function getVotedPlayerIds() {
      let parsed = [];
      try {
        parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
      } catch (_error) {
        parsed = [];
      }
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed.map((id) => normalizeId(id)).filter(Boolean);
      return Array.from(new Set(normalized));
    }

    function hasUserVotedForPlayer(playerId) {
      const normalizedId = normalizeId(playerId);
      if (!normalizedId) return false;
      return getVotedPlayerIds().includes(normalizedId);
    }

    function markPlayerAsVoted(playerId) {
      const normalizedId = normalizeId(playerId);
      if (!normalizedId) return;
      const votedIds = getVotedPlayerIds();
      if (!votedIds.includes(normalizedId)) votedIds.push(normalizedId);
      try {
        localStorage.setItem(storageKey, JSON.stringify(votedIds));
      } catch (_error) {}
    }

    function unmarkPlayerAsVoted(playerId) {
      const normalizedId = normalizeId(playerId);
      if (!normalizedId) return;
      const votedIds = getVotedPlayerIds().filter((id) => id !== normalizedId);
      try {
        localStorage.setItem(storageKey, JSON.stringify(votedIds));
      } catch (_error) {}
    }

    async function hydrateVotedPlayersFromServer() {
      const adminAuthenticated = getAdminAuthenticated();
      const currentUser = getCurrentUser();
      const ratingsService = getRatingsService();
      const apiClient = getApiClient();
      if (adminAuthenticated || !currentUser || !ratingsService?.getOrCreateVoterKey) return false;
      const voterKey = ratingsService.getOrCreateVoterKey();
      try {
        const playerIds = await apiClient.getRatedPlayerIds(voterKey);
        try { localStorage.setItem(storageKey, JSON.stringify([])); } catch (_) {}
        playerIds.forEach(id => markPlayerAsVoted(id));
        return true;
      } catch (_) {
        return false;
      }
    }

    async function reconcileLocalVotesWithServer() {
      const adminAuthenticated = getAdminAuthenticated();
      const ratingsService = getRatingsService();
      if (adminAuthenticated || !ratingsService?.getCurrentUserRatingForPlayer) return false;

      const votedIds = getVotedPlayerIds();
      if (votedIds.length === 0) return false;

      const existingPlayerIds = new Set(
        (getPlayers() || []).map((player) => normalizeId(player?.id)).filter(Boolean)
      );

      const checks = votedIds.map(async (playerId) => {
        if (!existingPlayerIds.has(playerId)) return { playerId, keep: false };
        try {
          const rating = await ratingsService.getCurrentUserRatingForPlayer(playerId);
          return { playerId, keep: Boolean(rating) };
        } catch (_error) {
          return { playerId, keep: true };
        }
      });

      const results = await Promise.all(checks);
      const nextVotedIds = results.filter(r => r.keep).map(r => r.playerId);

      const changed = nextVotedIds.length !== votedIds.length || nextVotedIds.some((id) => !votedIds.includes(id));
      if (!changed) return false;

      try {
        localStorage.setItem(storageKey, JSON.stringify(nextVotedIds));
      } catch (_error) {}

      return true;
    }

    return {
      hasUserVotedForPlayer,
      markPlayerAsVoted,
      unmarkPlayerAsVoted,
      getVotedPlayerIds,
      hydrateVotedPlayersFromServer,
      reconcileLocalVotesWithServer,
    };
  }

  global.createVoterTrackingService = createVoterTrackingService;
})(window);
