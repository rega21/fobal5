(function (global) {
  function createMatchController({ apiClient }) {
    function createRandomTeams(selectedPlayers) {
      const shuffled = [...selectedPlayers].sort(() => Math.random() - 0.5);
      return {
        a: shuffled.slice(0, 5),
        b: shuffled.slice(5, 10),
      };
    }

    function createBalancedTeams(selectedPlayers, coOccurrenceMap = null) {
      const players = (selectedPlayers || []).map((player) => {
        const attack = Number(player.attack) || 0;
        const midfield = Number(player.midfield) || 0;
        const defense = Number(player.defense) || 0;
        const stamina = Number(player.stamina) || 0;
        const garra = Number(player.garra) || 0;
        const technique = Number(player.technique) || 0;

        return {
          ...player,
          attack,
          midfield,
          defense,
          stamina,
          garra,
          technique,
          score: attack * 0.30 + garra * 0.20 + technique * 0.18 + defense * 0.17 + midfield * 0.10 + stamina * 0.05,
        };
      });

      const totalPlayers = players.length;
      const teamSize = Math.floor(totalPlayers / 2);

      if (totalPlayers === 0) return { a: [], b: [] };
      if (teamSize === 0) return { a: [...players], b: [] };

      const summarizeTeam = (team) =>
        team.reduce(
          (acc, player) => {
            acc.score += player.score;
            return acc;
          },
          { score: 0 }
        );

      const coMap = coOccurrenceMap || {};
      const pairKey = (a, b) => [String(a.id), String(b.id)].sort().join("_");
      const coOccurrencePenalty = (team) => {
        let penalty = 0;
        for (let x = 0; x < team.length; x++) {
          for (let y = x + 1; y < team.length; y++) {
            penalty += coMap[pairKey(team[x], team[y])] || 0;
          }
        }
        return penalty;
      };

      let best = null;
      const candidates = [];
      const pickedIndexes = [];

      const evaluatePickedIndexes = () => {
        const picked = new Set(pickedIndexes);
        const teamA = [];
        const teamB = [];

        players.forEach((player, index) => {
          if (picked.has(index)) teamA.push(player);
          else teamB.push(player);
        });

        if (teamA.length !== teamSize || teamB.length !== teamSize) return;

        const summaryA = summarizeTeam(teamA);
        const summaryB = summarizeTeam(teamB);

        const scoreDiff = Math.abs(summaryA.score - summaryB.score);

        const cost =
          scoreDiff * 2 +
          (coOccurrencePenalty(teamA) + coOccurrencePenalty(teamB)) * 0.1;

        const candidate = { cost, scoreDiff, teamA, teamB };
        candidates.push(candidate);
        if (!best || cost < best.cost) best = candidate;
      };

      const pickTeamA = (startIndex, remaining) => {
        if (remaining === 0) {
          evaluatePickedIndexes();
          return;
        }

        for (let index = startIndex; index <= totalPlayers - remaining; index += 1) {
          pickedIndexes.push(index);
          pickTeamA(index + 1, remaining - 1);
          pickedIndexes.pop();
        }
      };

      pickTeamA(0, teamSize);

      if (!best) {
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        return {
          a: shuffled.slice(0, teamSize),
          b: shuffled.slice(teamSize, teamSize * 2),
        };
      }

      candidates.sort((a, b) => a.cost - b.cost);
      const pool = candidates.slice(0, Math.min(15, candidates.length));
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      return { a: chosen.teamA, b: chosen.teamB };
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
        const displayName = (player) => cleanShareToken(player.nickname?.trim() || player.name);
        const teamANames = currentTeams.a.map((player) => `- ${displayName(player)}`).join("\n");
        const teamBNames = currentTeams.b.map((player) => `- ${displayName(player)}`).join("\n");
      return `Team A:\n${teamANames}\n\nTeam B:\n${teamBNames}`;
    }

    function buildMatchPayload(currentTeams, details = {}, scoreA, scoreB, mvpName, options = {}) {
      return {
        id: options?.id || details?.matchId || "",
        status: options?.status || "played",
        date: details?.datetimeDisplay || new Date().toLocaleString(),
        location: details?.location || "",
        address: details?.address || "",
        scheduledAt: details?.scheduledAt || "",
        placeId: details?.placeId || "",
        mapsUrl: details?.mapsUrl || "",
        latitude: details?.latitude ?? null,
        longitude: details?.longitude ?? null,
        teamA: currentTeams.a.map((player) => ({
          id: player.id,
          name: player.name,
          nickname: player.nickname || "",
        })),
        teamB: currentTeams.b.map((player) => ({
          id: player.id,
          name: player.name,
          nickname: player.nickname || "",
        })),
        scoreA: scoreA ?? null,
        scoreB: scoreB ?? null,
        mvp: mvpName || null,
      };
    }

    async function saveMatch(match) {
      let storedMatch = { ...match };
      try {
        const hasMatchId =
          match?.id !== null && match?.id !== undefined && String(match.id).trim() !== "";

        const payload = { ...match };
        delete payload.id;

        if (hasMatchId && typeof apiClient.updateMatch === "function") {
          const updated = await apiClient.updateMatch(match.id, payload);
          if (updated && typeof updated === "object") {
            storedMatch = updated;
          }
        } else {
          const created = await apiClient.createMatch(payload);
          if (created && typeof created === "object") {
            storedMatch = created;
          }
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
