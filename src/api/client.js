(function (global) {
  const PLAYERS_URL = "https://698cdcb221a248a27362c974.mockapi.io/players";
  const MATCHES_URL = "https://698cdcb221a248a27362c974.mockapi.io/matches";
  const SUPABASE_ANON_KEY = global.APP_CONFIG?.SUPABASE_ANON_KEY || "";

  function resolveSupabaseBaseUrl() {
    const fromConfig = global.APP_CONFIG?.SUPABASE_URL;
    if (fromConfig) return String(fromConfig).replace(/\/$/, "");

    const authLoginUrl = global.APP_CONFIG?.AUTH_LOGIN_URL || "";
    const match = String(authLoginUrl).match(/^https:\/\/[^/]+\.supabase\.co/i);
    return match ? match[0] : "";
  }

  const SUPABASE_BASE_URL = resolveSupabaseBaseUrl();
  const HAS_SUPABASE = Boolean(SUPABASE_BASE_URL && SUPABASE_ANON_KEY);

  async function request(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function buildSupabaseHeaders(extraHeaders = {}) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...extraHeaders,
    };
  }

  async function requestSupabase(path, options = {}) {
    if (!SUPABASE_BASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase config not available");
    }

    const url = `${SUPABASE_BASE_URL}${path}`;
    return request(url, options);
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mapPlayerFromSupabase(row = {}) {
    return {
      id: row.id,
      name: row.name || "",
      nickname: row.nickname || "",
      attack: toNumber(row.attack),
      defense: toNumber(row.defense),
      midfield: toNumber(row.midfield),
      created_at: row.created_at || null,
    };
  }

  function buildPlayerPayload(body = {}) {
    return {
      name: String(body?.name || "").trim(),
      nickname: String(body?.nickname || "").trim(),
      attack: toNumber(body?.attack),
      defense: toNumber(body?.defense),
      midfield: toNumber(body?.midfield),
    };
  }

  function formatMatchDate(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-UY", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }

  function mapMatchFromSupabase(m) {
    const allPlayers = m.match_players || [];
    const teamA = allPlayers
      .filter((mp) => mp.team === "A")
      .map((mp) => ({ id: mp.player_id, name: mp.name || "", nickname: mp.nickname || "" }));
    const teamB = allPlayers
      .filter((mp) => mp.team === "B")
      .map((mp) => ({ id: mp.player_id, name: mp.name || "", nickname: mp.nickname || "" }));
    return {
      id: m.id,
      status: m.status || "played",
      date: formatMatchDate(m.scheduled_at) || m.date_display || "",
      location: m.location || "",
      address: m.address || "",
      scheduledAt: m.scheduled_at || "",
      placeId: m.place_id || "",
      mapsUrl: m.maps_url || "",
      latitude: m.latitude ?? null,
      longitude: m.longitude ?? null,
      teamA,
      teamB,
      scoreA: m.team_a_goals ?? null,
      scoreB: m.team_b_goals ?? null,
      mvp: m.mvp_name || "",
      mvpVotes: m.mvp_votes || {},
      mvpVotingEndsAt: m.mvp_voting_ends_at || "",
      playedAt: m.played_at || "",
      createdAt: m.created_at || "",
      notes: m.notes || "",
    };
  }

  function mapMatchToSupabase(body = {}) {
    return {
      status: body.status || "played",
      date_display: body.date || null,
      location: body.location || null,
      address: body.address || null,
      scheduled_at: body.scheduledAt || null,
      place_id: body.placeId || null,
      maps_url: body.mapsUrl || null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      team_a_goals: body.scoreA ?? null,
      team_b_goals: body.scoreB ?? null,
      mvp_name: body.mvp || null,
      mvp_votes: body.mvpVotes || {},
      mvp_voting_ends_at: body.mvpVotingEndsAt || null,
      played_at: body.playedAt || (body.status === "played" ? (body.scheduledAt || null) : null),
      notes: body.notes || null,
    };
  }

  async function upsertMatchPlayers(matchId, teamA, teamB) {
    await requestSupabase(`/rest/v1/match_players?match_id=eq.${encodeURIComponent(String(matchId))}`, {
      method: "DELETE",
      headers: buildSupabaseHeaders({ Prefer: "return=minimal" }),
    });
    const playerRows = [
      ...(teamA || []).map((p) => ({ match_id: matchId, player_id: p.id, team: "A", name: p.name || "", nickname: p.nickname || "" })),
      ...(teamB || []).map((p) => ({ match_id: matchId, player_id: p.id, team: "B", name: p.name || "", nickname: p.nickname || "" })),
    ];
    if (playerRows.length > 0) {
      await requestSupabase("/rest/v1/match_players", {
        method: "POST",
        headers: buildSupabaseHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(playerRows),
      });
    }
  }

  function buildFeedbackPayload(body = {}) {
    return {
      kind: String(body?.kind || "sugerencia").trim().toLowerCase() === "bug" ? "bug" : "sugerencia",
      message: String(body?.message || "").trim(),
      alias: String(body?.alias || "").trim() || null,
      page: String(body?.page || "").trim() || null,
      user_agent: String(body?.user_agent || "").trim() || null,
    };
  }

  let activeGroupId = null;

  global.FobalApi = {
    setGroupId(id) {
      activeGroupId = id || null;
    },
    getGroupId() {
      return activeGroupId;
    },
    urls: {
      players: HAS_SUPABASE ? `${SUPABASE_BASE_URL}/rest/v1/players` : PLAYERS_URL,
      matches: HAS_SUPABASE ? `${SUPABASE_BASE_URL}/rest/v1/matches` : MATCHES_URL,
      supabase: SUPABASE_BASE_URL,
    },
    async getPlayers() {
      if (!HAS_SUPABASE) {
        return request(PLAYERS_URL);
      }

      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(`/rest/v1/players?select=id,name,nickname,attack,defense,midfield,created_at&order=name.asc${groupFilter}`, {
        method: "GET",
        headers: buildSupabaseHeaders(),
      });

      return (rows || []).map(mapPlayerFromSupabase);
    },
    async createPlayer(body) {
      if (!HAS_SUPABASE) {
        return request(PLAYERS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const payload = { ...buildPlayerPayload(body), ...(activeGroupId ? { group_id: activeGroupId } : {}) };
      const rows = await requestSupabase("/rest/v1/players", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify([payload]),
      });

      const created = Array.isArray(rows) ? rows[0] : rows;
      return mapPlayerFromSupabase(created || payload);
    },
    async updatePlayer(id, body) {
      if (!HAS_SUPABASE) {
        return request(`${PLAYERS_URL}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const payload = buildPlayerPayload(body);
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(`/rest/v1/players?id=eq.${encodeURIComponent(String(id))}${groupFilter}`, {
        method: "PATCH",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify(payload),
      });

      const updated = Array.isArray(rows) ? rows[0] : rows;
      return mapPlayerFromSupabase(updated || { id, ...payload });
    },
    async deletePlayer(id) {
      if (!HAS_SUPABASE) {
        return request(`${PLAYERS_URL}/${id}`, { method: "DELETE" });
      }

      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      return requestSupabase(`/rest/v1/players?id=eq.${encodeURIComponent(String(id))}${groupFilter}`, {
        method: "DELETE",
        headers: buildSupabaseHeaders({ Prefer: "return=minimal" }),
      });
    },
    async getMatches() {
      if (!HAS_SUPABASE) {
        return request(MATCHES_URL);
      }
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const [matches, matchPlayers] = await Promise.all([
        requestSupabase(`/rest/v1/matches?select=*&order=played_at.desc.nullslast,scheduled_at.desc.nullslast${groupFilter}`, {
          method: "GET",
          headers: buildSupabaseHeaders(),
        }),
        requestSupabase("/rest/v1/match_players?select=match_id,player_id,team,name,nickname", {
          method: "GET",
          headers: buildSupabaseHeaders(),
        }),
      ]);
      const playersByMatch = {};
      (matchPlayers || []).forEach((mp) => {
        if (!playersByMatch[mp.match_id]) playersByMatch[mp.match_id] = [];
        playersByMatch[mp.match_id].push(mp);
      });
      return (matches || []).map((m) =>
        mapMatchFromSupabase({ ...m, match_players: playersByMatch[m.id] || [] })
      );
    },
    async createMatch(body) {
      if (!HAS_SUPABASE) {
        return request(MATCHES_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const payload = { ...mapMatchToSupabase(body), ...(activeGroupId ? { group_id: activeGroupId } : {}) };
      const rows = await requestSupabase("/rest/v1/matches", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify([payload]),
      });
      const created = Array.isArray(rows) ? rows[0] : rows;
      if (created?.id) {
        await upsertMatchPlayers(created.id, body.teamA, body.teamB);
      }
      return mapMatchFromSupabase({ ...created, match_players: [] });
    },
    async updateMatch(id, body) {
      if (!HAS_SUPABASE) {
        return request(`${MATCHES_URL}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const payload = mapMatchToSupabase(body);
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      await requestSupabase(`/rest/v1/matches?id=eq.${encodeURIComponent(String(id))}${groupFilter}`, {
        method: "PATCH",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
        body: JSON.stringify(payload),
      });
      await upsertMatchPlayers(id, body.teamA, body.teamB);
      const [rows, matchPlayers] = await Promise.all([
        requestSupabase(`/rest/v1/matches?id=eq.${encodeURIComponent(String(id))}&select=*`, {
          method: "GET",
          headers: buildSupabaseHeaders(),
        }),
        requestSupabase(`/rest/v1/match_players?match_id=eq.${encodeURIComponent(String(id))}&select=match_id,player_id,team,name,nickname`, {
          method: "GET",
          headers: buildSupabaseHeaders(),
        }),
      ]);
      const updated = Array.isArray(rows) ? rows[0] : rows;
      return mapMatchFromSupabase({ ...(updated || { id, ...payload }), match_players: matchPlayers || [] });
    },
    async deleteMatch(id) {
      if (!HAS_SUPABASE) {
        return request(`${MATCHES_URL}/${id}`, { method: "DELETE" });
      }
      await requestSupabase(`/rest/v1/match_players?match_id=eq.${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: buildSupabaseHeaders({ Prefer: "return=minimal" }),
      });
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      return requestSupabase(`/rest/v1/matches?id=eq.${encodeURIComponent(String(id))}${groupFilter}`, {
        method: "DELETE",
        headers: buildSupabaseHeaders({ Prefer: "return=minimal" }),
      });
    },
    async getPlayerRatingsSummaryByPlayerId() {
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(`/rest/v1/player_ratings?select=player_id,attack,defense,midfield,stamina,garra,technique${groupFilter}`, {
        method: "GET",
        headers: buildSupabaseHeaders(),
      });

      const STATS = ["attack", "defense", "midfield", "stamina", "garra", "technique"];

      const summary = {};
      (rows || []).forEach((row) => {
        const playerId = String(row?.player_id || "").trim();
        if (!playerId) return;

        if (!summary[playerId]) {
          summary[playerId] = { votes: 0 };
          STATS.forEach((s) => { summary[playerId][`sum_${s}`] = 0; summary[playerId][`count_${s}`] = 0; });
        }

        summary[playerId].votes += 1;
        STATS.forEach((s) => {
          if (row[s] != null) {
            summary[playerId][`sum_${s}`] += toNumber(row[s]);
            summary[playerId][`count_${s}`] += 1;
          }
        });
      });

      Object.keys(summary).forEach((playerId) => {
        const item = summary[playerId];
        const avg = (s) => item[`count_${s}`] > 0 ? Number((item[`sum_${s}`] / item[`count_${s}`]).toFixed(2)) : 0;
        const totalSum = STATS.reduce((s, stat) => s + item[`sum_${stat}`], 0);
        const totalCount = STATS.reduce((s, stat) => s + item[`count_${stat}`], 0);
        summary[playerId] = {
          votes: item.votes,
          avgAttack: avg("attack"),
          avgDefense: avg("defense"),
          avgMidfield: avg("midfield"),
          avgStamina: avg("stamina"),
          avgGarra: avg("garra"),
          avgTechnique: avg("technique"),
          avgOverall: totalCount > 0 ? Number((totalSum / totalCount).toFixed(2)) : 0,
          countStamina: item.count_stamina,
          countGarra: item.count_garra,
          countTechnique: item.count_technique,
        };
      });

      return summary;
    },
    async getPlayerRatingByPlayerAndVoter({ playerId, voterKey } = {}) {
      const normalizedPlayerId = String(playerId || "").trim();
      const normalizedVoterKey = String(voterKey || "").trim();
      if (!normalizedPlayerId || !normalizedVoterKey) return null;

      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(
        `/rest/v1/player_ratings?select=attack,defense,midfield,stamina,garra,technique&player_id=eq.${encodeURIComponent(normalizedPlayerId)}&voter_key=eq.${encodeURIComponent(normalizedVoterKey)}${groupFilter}&limit=1`,
        {
          method: "GET",
          headers: buildSupabaseHeaders(),
        }
      );

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || typeof row !== "object") return null;

      return {
        attack: toNumber(row.attack),
        defense: toNumber(row.defense),
        midfield: toNumber(row.midfield),
        stamina: row.stamina != null ? toNumber(row.stamina) : null,
        garra: row.garra != null ? toNumber(row.garra) : null,
        technique: row.technique != null ? toNumber(row.technique) : null,
      };
    },
    async upsertPlayerRating(payload) {
      // Deprecated: Usar insertPlayerRatingLimited para control de límite de votos
      const fullPayload = { ...payload, ...(activeGroupId ? { group_id: activeGroupId } : {}) };
      return requestSupabase("/rest/v1/player_ratings?on_conflict=player_id,voter_key", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify([fullPayload]),
      });
    },

    async insertPlayerRatingLimited({ player_id, voter_key, attack, defense, midfield, stamina, garra, technique }) {
      return requestSupabase('/rest/v1/rpc/insert_player_rating_limited', {
        method: 'POST',
        headers: buildSupabaseHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          p_player_id: player_id,
          p_voter_key: voter_key,
          p_attack: attack,
          p_defense: defense,
          p_midfield: midfield,
          p_stamina: stamina,
          p_garra: garra,
          p_technique: technique,
          p_group_id: activeGroupId || null,
        })
      });
    },
    async getRecentVoteActivity(limit = 30) {
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(
        `/rest/v1/player_ratings?select=player_id,attack,defense,midfield,stamina,garra,technique,created_at&order=created_at.desc${groupFilter}&limit=${Number(limit)}`,
        { method: "GET", headers: buildSupabaseHeaders() }
      );
      return Array.isArray(rows) ? rows : [];
    },
    async checkVoteLimitReached({ playerId, voterKey } = {}) {
      if (!HAS_SUPABASE) return false;
      const normalizedPlayerId = String(playerId || "").trim();
      const normalizedVoterKey = String(voterKey || "").trim();
      if (!normalizedPlayerId || !normalizedVoterKey) return false;
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const groupFilter = activeGroupId ? `&group_id=eq.${encodeURIComponent(activeGroupId)}` : "";
      const rows = await requestSupabase(
        `/rest/v1/player_ratings?select=id&player_id=eq.${encodeURIComponent(normalizedPlayerId)}&voter_key=eq.${encodeURIComponent(normalizedVoterKey)}&created_at=gte.${encodeURIComponent(since)}${groupFilter}`,
        { method: "GET", headers: buildSupabaseHeaders() }
      );
      return Array.isArray(rows) && rows.length >= 10;
    },
    async getGroups() {
      const rows = await requestSupabase("/rest/v1/groups?select=id,name,slug,pin_hash&order=name.asc", {
        method: "GET",
        headers: buildSupabaseHeaders(),
      });
      return Array.isArray(rows) ? rows : [];
    },
    async createGroup({ name, slug, pin_hash }) {
      const row = await requestSupabase("/rest/v1/groups", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation",
        }),
        body: JSON.stringify({ name, slug, pin_hash }),
      });
      const created = Array.isArray(row) ? row[0] : row;
      if (!created || !created.id) throw new Error("No se pudo crear el grupo");
      return created;
    },
    async createFeedback(payload) {
      if (!HAS_SUPABASE) {
        throw new Error("Feedback requires Supabase config");
      }

      const normalizedPayload = {
        ...buildFeedbackPayload(payload),
        ...(activeGroupId ? { group_id: activeGroupId } : {}),
      };
      if (!normalizedPayload.message) {
        throw new Error("Feedback message required");
      }

      return requestSupabase("/rest/v1/feedback", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        }),
        body: JSON.stringify([normalizedPayload]),
      });
    },
  };
})(window);
