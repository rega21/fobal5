(function (global) {
  const FEEDBACK_LAST_SENT_AT_KEY = "fobal5_feedback_last_sent_at";

  function clampText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function readLastSentAt(storageKey) {
    try {
      const raw = Number(localStorage.getItem(storageKey));
      return Number.isFinite(raw) ? raw : 0;
    } catch (_error) {
      return 0;
    }
  }

  function writeLastSentAt(storageKey, value) {
    try {
      localStorage.setItem(storageKey, String(value));
    } catch (_error) {
      // ignore storage failures
    }
  }

  function createFeedbackService({
    apiClient,
    cooldownMs = 30000,
    storageKey = FEEDBACK_LAST_SENT_AT_KEY,
  } = {}) {
    function getRemainingCooldownMs() {
      const lastSentAt = readLastSentAt(storageKey);
      const elapsed = Date.now() - lastSentAt;
      return Math.max(0, Number(cooldownMs) - elapsed);
    }

    async function submitFeedback({
      kind = "sugerencia",
      message = "",
      alias = "",
      page = "",
      userAgent = "",
      honeypot = "",
    } = {}) {
      if (!apiClient?.createFeedback) {
        throw new Error("createFeedback no disponible en apiClient");
      }

      if (String(honeypot || "").trim()) {
        throw new Error("Solicitud inválida");
      }

      const remaining = getRemainingCooldownMs();
      if (remaining > 0) {
        const error = new Error("Cooldown activo");
        error.code = "cooldown";
        error.remainingMs = remaining;
        throw error;
      }

      const normalizedKind = String(kind || "").trim().toLowerCase() === "bug"
        ? "bug"
        : "sugerencia";
      const normalizedMessage = clampText(message, 1000);
      const normalizedAlias = clampText(alias, 120);

      if (normalizedMessage.length < 8) {
        const error = new Error("Mensaje demasiado corto");
        error.code = "message_too_short";
        throw error;
      }

      await apiClient.createFeedback({
        kind: normalizedKind,
        message: normalizedMessage,
        alias: normalizedAlias,
        page: clampText(page || global.location?.pathname || "", 200),
        user_agent: clampText(userAgent || global.navigator?.userAgent || "", 300),
      });

      writeLastSentAt(storageKey, Date.now());
      return { ok: true };
    }

    return {
      getRemainingCooldownMs,
      submitFeedback,
    };
  }

  global.createFeedbackService = createFeedbackService;
})(window);
