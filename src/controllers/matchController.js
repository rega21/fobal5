(function (global) {
  function createMatchController({ apiClient }) {
    function createRandomTeams(selectedPlayers) {
      const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
      return {
        a: shuffled.slice(0, 5),
        b: shuffled.slice(5, 10),
      };
    }

    function createBalancedTeams(selectedPlayers) {
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
    }

    function buildWhatsAppText(currentTeams) {
      if (!currentTeams) return "";
      const cleanShareToken = (value) => String(value ?? "")
        .normalize("NFC")
        .replace(/\u00A0/g, " ")
        .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/[\*_~`]/g, "")
        .trim();
      const teamANames = currentTeams.a.map((player) => `- ${cleanShareToken(player.name)}`).join("\n");
      const teamBNames = currentTeams.b.map((player) => `- ${cleanShareToken(player.name)}`).join("\n");
      return `Team A:\n${teamANames}\n\nTeam B:\n${teamBNames}`;
    }

    function buildMatchPayload(currentTeams, details = {}, scoreA, scoreB, mvpName) {
      return {
        date: details?.datetimeDisplay || new Date().toLocaleString(),
        location: details?.location || "",
        scheduledAt: details?.scheduledAt || "",
        placeId: details?.placeId || "",
        mapsUrl: details?.mapsUrl || "",
        latitude: details?.latitude ?? null,
        longitude: details?.longitude ?? null,
        teamA: currentTeams.a.map((player) => player.name),
        teamB: currentTeams.b.map((player) => player.name),
        scoreA,
        scoreB,
        mvp: mvpName || null,
      };
    }

    async function saveMatch(match) {
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
    }

    function assignPlayerTeam(currentTeams, selectedPlayers, playerId, team) {
      const baseTeams = currentTeams || { a: [], b: [] };

      const player = selectedPlayers.find(
        (item) => String(item.id) === String(playerId)
      );
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
    }

    return {
      createRandomTeams,
      createBalancedTeams,
      buildWhatsAppText,
      buildMatchPayload,
      saveMatch,
      assignPlayerTeam,
    };
  }

  global.createMatchController = createMatchController;
})(window);
