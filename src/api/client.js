(function (global) {
  const PLAYERS_URL = "https://698cdcb221a248a27362c974.mockapi.io/players";
  const MATCHES_URL = "https://698cdcb221a248a27362c974.mockapi.io/matches";

  async function request(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  global.FobalApi = {
    urls: {
      players: PLAYERS_URL,
      matches: MATCHES_URL,
    },
    getPlayers() {
      return request(PLAYERS_URL);
    },
    createPlayer(body) {
      return request(PLAYERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    updatePlayer(id, body) {
      return request(`${PLAYERS_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    deletePlayer(id) {
      return request(`${PLAYERS_URL}/${id}`, { method: "DELETE" });
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
  };
})(window);
