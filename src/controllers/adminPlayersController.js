(function (global) {
  function createAdminPlayersController({
    apiClient,
    authClient,
    adminPin,
    getPlayers,
    setPlayers,
    getIsAdmin,
    setIsAdmin,
    onPlayersChanged,
    onAuthChanged,
  }) {
    async function fetchPlayers() {
      try {
        const data = await apiClient.getPlayers();
        setPlayers(data || []);
        onPlayersChanged?.();
      } catch (error) {
        console.error("Error fetching players:", error);
        setPlayers([]);
      }
    }

    async function addPlayer(name, nickname, attack = 0, defense = 0, midfield = 0) {
      if (!getIsAdmin()) {
        alert("Solo el admin puede agregar jugadores");
        return;
      }

      try {
        const body = { name, nickname: nickname || "", attack, defense, midfield };
        const newPlayer = await apiClient.createPlayer(body);
        const nextPlayers = [...getPlayers(), newPlayer];
        setPlayers(nextPlayers);
        onPlayersChanged?.();
      } catch (error) {
        console.error("Error adding player:", error);
      }
    }

    async function deletePlayer(id) {
      if (!getIsAdmin()) {
        alert("Solo el admin puede eliminar jugadores");
        return;
      }

      try {
        await apiClient.deletePlayer(id);
        const nextPlayers = getPlayers().filter((player) => player.id !== id);
        setPlayers(nextPlayers);
        onPlayersChanged?.();
      } catch (error) {
        console.error("Error deleting player:", error);
      }
    }

    async function updatePlayer(id, name, nickname, attack, defense, midfield) {
      try {
        await apiClient.updatePlayer(id, {
          name,
          nickname: nickname || "",
          attack: attack || 0,
          defense: defense || 0,
          midfield: midfield || 0,
        });

        const nextPlayers = getPlayers().map((player) => {
          if (player.id !== id) return player;
          return {
            ...player,
            name,
            nickname: nickname || "",
            attack: attack || 0,
            defense: defense || 0,
            midfield: midfield || 0,
          };
        });

        setPlayers(nextPlayers);
        onPlayersChanged?.();
      } catch (error) {
        console.error("Error updating player:", error);
      }
    }

    async function login(pin) {
      if (authClient?.loginAdmin) {
        const result = await authClient.loginAdmin(pin);
        if (!result?.ok) {
          return { ok: false, message: result?.message || "PIN incorrecto" };
        }

        setIsAdmin(true);
        onAuthChanged?.(true);
        return { ok: true };
      }

      if (adminPin && pin === adminPin) {
        setIsAdmin(true);
        onAuthChanged?.(true);
        return { ok: true };
      }

      return { ok: false, message: "PIN incorrecto" };
    }

    function logout() {
      setIsAdmin(false);
      onAuthChanged?.(false);
    }

    return {
      fetchPlayers,
      addPlayer,
      deletePlayer,
      updatePlayer,
      login,
      logout,
    };
  }

  global.createAdminPlayersController = createAdminPlayersController;
})(window);
