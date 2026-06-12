(function () {

  function calcStats(playerKey, matches) {
    const played = matches.filter(
      (m) => m.status === "played" && m.scoreA != null && m.scoreB != null
    );

    let matchesPlayed = 0, won = 0, lost = 0, drawn = 0;

    played.forEach((m) => {
      const allPlayers = [...(m.teamA || []), ...(m.teamB || [])];
      const inMatch = allPlayers.find((p) => (p.id || (p.nickname || p.name)) === playerKey);
      if (!inMatch) return;

      matchesPlayed++;
      const draw = m.scoreA === m.scoreB;
      if (draw) { drawn++; return; }

      const inTeamA = (m.teamA || []).some((p) => (p.id || (p.nickname || p.name)) === playerKey);
      const teamAWon = m.scoreA > m.scoreB;
      if ((inTeamA && teamAWon) || (!inTeamA && !teamAWon)) won++;
      else lost++;
    });

    const winRate = matchesPlayed > 0 ? Math.round((won / matchesPlayed) * 100) : 0;
    return { matchesPlayed, won, lost, drawn, winRate };
  }

  async function openPlayerStats(playerKey, displayName, isLeader = false) {
    const modal = document.getElementById("playerStatsModal");
    if (!modal) return;

    document.getElementById("playerStatsName").textContent = isLeader ? "★ " + displayName : displayName;
    document.getElementById("pstatsPlayed").textContent = "—";
    document.getElementById("pstatsWon").textContent = "—";
    document.getElementById("pstatsLost").textContent = "—";
    document.getElementById("pstatsDraw").textContent = "—";
    document.getElementById("pstatsWinRatePct").textContent = "—%";
    const arcReset = document.getElementById("pstatsGaugeArc");
    if (arcReset) arcReset.style.strokeDashoffset = "251.3";
    const msgReset = document.getElementById("pstatsWinRateMsg");
    if (msgReset) { msgReset.textContent = ""; msgReset.style.opacity = "0"; }

    modal.classList.remove("hidden");
    if (window.lucide) window.lucide.createIcons();

    let matches = [];
    try {
      matches = await window.FobalApi.getMatches();
    } catch (e) {
      console.error("trajectoryModal: error fetching matches", e);
    }

    const s = calcStats(playerKey, matches);

    document.getElementById("pstatsPlayed").textContent = s.matchesPlayed;
    document.getElementById("pstatsWon").textContent = s.won;
    document.getElementById("pstatsLost").textContent = s.lost;
    document.getElementById("pstatsDraw").textContent = s.drawn;
    const arc = document.getElementById("pstatsGaugeArc");
    const pct = document.getElementById("pstatsWinRatePct");
    const msg = document.getElementById("pstatsWinRateMsg");
    if (arc) arc.style.strokeDashoffset = String(251.3 * (1 - s.winRate / 100));
    if (msg) { msg.textContent = ""; msg.style.opacity = "0"; }
    if (pct) {
      const target = s.winRate;
      const duration = 1200;
      const startTime = performance.now();
      function tick(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        pct.textContent = Math.round(eased * target) + "%";
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else if (msg) {
          const w = target;
          msg.textContent = w <= 20 ? "Temporada para el olvido"
            : w <= 35 ? "Le está costando entrar en ritmo"
            : w <= 49 ? "Puede y debe mejorar"
            : w === 50 ? "Campaña pareja"
            : w <= 65 ? "Buen rendimiento"
            : w <= 80 ? "Viene dulce"
            : "Modo campeón";
          msg.style.opacity = "1";
        }
      }
      requestAnimationFrame(tick);
    }
  }

  document.getElementById("closePlayerStatsBtn")?.addEventListener("click", () => {
    document.getElementById("playerStatsModal")?.classList.add("hidden");
  });
  document.getElementById("playerStatsModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
  });

  window.TrajectoryModal = { openPlayerStats };
})();
