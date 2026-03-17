(function (global) {
  const VOTER_KEY_STORAGE_KEY = "fobal5_voter_key";

  function generateFallbackKey() {
    return `vk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getOrCreateVoterKey() {
    let stored = "";
    try {
      stored = String(localStorage.getItem(VOTER_KEY_STORAGE_KEY) || "").trim();
    } catch (_error) {
      stored = "";
    }

    if (stored) return stored;

    const nextKey = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : generateFallbackKey();

    try {
      localStorage.setItem(VOTER_KEY_STORAGE_KEY, nextKey);
    } catch (_error) {
      // ignore storage write failures
    }

    return nextKey;
  }

  function clampScore(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(10, Math.round(parsed)));
  }

  function createPlayerRatingsService({ apiClient }) {
    async function getCurrentUserRatingForPlayer(playerId) {
      if (!apiClient?.getPlayerRatingByPlayerAndVoter) {
        return null;
      }

      const normalizedPlayerId = String(playerId || "").trim();
      if (!normalizedPlayerId) return null;

      const voterKey = getOrCreateVoterKey();
      return apiClient.getPlayerRatingByPlayerAndVoter({
        playerId: normalizedPlayerId,
        voterKey,
      });
    }

    async function savePlayerRating({ playerId, attack, defense, midfield, stamina, garra, technique }) {
      if (!apiClient?.insertPlayerRatingLimited) {
        throw new Error("insertPlayerRatingLimited no disponible en apiClient");
      }

      const voterKey = getOrCreateVoterKey();
      const payload = {
        player_id: String(playerId || "").trim(),
        voter_key: voterKey,
        attack: clampScore(attack),
        defense: clampScore(defense),
        midfield: clampScore(midfield),
        stamina: clampScore(stamina),
        garra: clampScore(garra),
        technique: clampScore(technique),
      };

      if (!payload.player_id) {
        throw new Error("player_id requerido");
      }

      // Llama a la función RPC que aplica el límite de votos
      return apiClient.insertPlayerRatingLimited(payload);
    }

    return {
      getOrCreateVoterKey,
      getCurrentUserRatingForPlayer,
      savePlayerRating,
    };
  }

  global.createPlayerRatingsService = createPlayerRatingsService;
})(window);
