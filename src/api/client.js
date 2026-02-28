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

  global.FobalApi = {
    urls: {
      players: HAS_SUPABASE ? `${SUPABASE_BASE_URL}/rest/v1/players` : PLAYERS_URL,
      matches: MATCHES_URL,
      supabase: SUPABASE_BASE_URL,
    },
    async getPlayers() {
      if (!HAS_SUPABASE) {
        return request(PLAYERS_URL);
      }

      const rows = await requestSupabase("/rest/v1/players?select=id,name,nickname,attack,defense,midfield,created_at&order=name.asc", {
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

      const payload = buildPlayerPayload(body);
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
      const rows = await requestSupabase(`/rest/v1/players?id=eq.${encodeURIComponent(String(id))}`, {
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

      return requestSupabase(`/rest/v1/players?id=eq.${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: buildSupabaseHeaders({ Prefer: "return=minimal" }),
      });
    },
    getMatches() {
      return request(MATCHES_URL);
    },
    createMatch(body) {
      return request(MATCHES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    updateMatch(id, body) {
      return request(`${MATCHES_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    deleteMatch(id) {
      return request(`${MATCHES_URL}/${id}`, { method: "DELETE" });
    },
    async getPlayerRatingsSummaryByPlayerId() {
      const rows = await requestSupabase("/rest/v1/player_ratings?select=player_id,attack,defense,midfield", {
        method: "GET",
        headers: buildSupabaseHeaders(),
      });

      const summary = {};
      (rows || []).forEach((row) => {
        const playerId = String(row?.player_id || "").trim();
        if (!playerId) return;

        if (!summary[playerId]) {
          summary[playerId] = {
            votes: 0,
            sumAttack: 0,
            sumDefense: 0,
            sumMidfield: 0,
          };
        }

        summary[playerId].votes += 1;
        summary[playerId].sumAttack += toNumber(row.attack);
        summary[playerId].sumDefense += toNumber(row.defense);
        summary[playerId].sumMidfield += toNumber(row.midfield);
      });

      Object.keys(summary).forEach((playerId) => {
        const item = summary[playerId];
        const votes = item.votes || 0;
        summary[playerId] = {
          votes,
          avgAttack: votes > 0 ? Number((item.sumAttack / votes).toFixed(2)) : 0,
          avgDefense: votes > 0 ? Number((item.sumDefense / votes).toFixed(2)) : 0,
          avgMidfield: votes > 0 ? Number((item.sumMidfield / votes).toFixed(2)) : 0,
        };
      });

      return summary;
    },
    async upsertPlayerRating(payload) {
      return requestSupabase("/rest/v1/player_ratings?on_conflict=player_id,voter_key", {
        method: "POST",
        headers: buildSupabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify([payload]),
      });
    },
  };
})(window);
