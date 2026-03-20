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
    // Cache en memoria: playerId → rating del usuario
    // Se llena la primera vez que se fetchea y se actualiza al guardar.
    // Dura mientras la sesión esté abierta (se pierde al recargar la página).
    const ratingsCache = new Map();

    async function getCurrentUserRatingForPlayer(playerId) {
      if (!apiClient?.getPlayerRatingByPlayerAndVoter) {
        return null;
      }

      const normalizedPlayerId = String(playerId || "").trim();
      if (!normalizedPlayerId) return null;

      // Cache hit → devuelve inmediato, sin red
      if (ratingsCache.has(normalizedPlayerId)) {
        return ratingsCache.get(normalizedPlayerId);
      }

      // Cache miss → va a la red y guarda el resultado
      const voterKey = getOrCreateVoterKey();
      const result = await apiClient.getPlayerRatingByPlayerAndVoter({
        playerId: normalizedPlayerId,
        voterKey,
      });
      ratingsCache.set(normalizedPlayerId, result ?? null);
      return result;
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

      const result = await apiClient.insertPlayerRatingLimited(payload);
      // Actualizar cache con el voto recién guardado
      ratingsCache.set(payload.player_id, payload);
      return result;
    }

    return {
      getOrCreateVoterKey,
      getCurrentUserRatingForPlayer,
      savePlayerRating,
    };
  }

  global.createPlayerRatingsService = createPlayerRatingsService;
})(window);
