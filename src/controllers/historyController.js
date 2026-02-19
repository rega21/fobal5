(function (global) {
  function createHistoryController({ historyKey, apiClient, isAdmin }) {
    let history = getLocalHistory();

    function getLocalHistory() {
      try {
        return JSON.parse(localStorage.getItem(historyKey)) || [];
      } catch (e) {
        return [];
      }
    }

    function persistHistory() {
      localStorage.setItem(historyKey, JSON.stringify(history));
    }

    function getHistory() {
      return history;
    }

    function renderHistory() {
      if (!global.HistoryView?.renderHistoryList) return;
      global.HistoryView.renderHistoryList({
        history,
        adminAuthenticated: Boolean(isAdmin?.()),
        onDelete: deleteMatch,
      });
    }

    async function fetchMatches() {
      try {
        const data = await apiClient.getMatches();
        history = Array.isArray(data) ? data : [];
        persistHistory();
        renderHistory();
      } catch (e) {
        console.error("Error fetching matches:", e);
        history = getLocalHistory();
        renderHistory();
      }
    }

    async function deleteMatch(matchId, matchDate) {
      if (!isAdmin?.()) {
        alert("Solo el admin puede eliminar partidos");
        return;
      }

      if (!confirm("¿Eliminar este partido?")) return;

      const hasMatchId =
        matchId !== null && matchId !== undefined && String(matchId).trim() !== "";

      if (hasMatchId) {
        try {
          await apiClient.deleteMatch(matchId);
        } catch (e) {
          console.error("Error deleting match from API:", e);
          alert("No se pudo eliminar en la API. Se intentará borrar localmente.");
        }
      }

      history = history.filter((m) => {
        if (hasMatchId) {
          return String(m.id) !== String(matchId);
        }
        return m.date !== matchDate;
      });

      persistHistory();
      renderHistory();
    }

    function pushMatch(match) {
      history.push(match);
      persistHistory();
    }

    return {
      getHistory,
      fetchMatches,
      renderHistory,
      deleteMatch,
      pushMatch,
    };
  }

  global.createHistoryController = createHistoryController;
})(window);
