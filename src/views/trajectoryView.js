(function () {
  let chartInstance = null;

  const COLOR_START      = "#008B8B";
  const COLOR_END_DARK   = "#1a3a4a";
  const COLOR_END_LIGHT  = "#4BC0C0";

  function buildData(matches) {
    const played = matches.filter(
      (m) => m.status === "played" && m.scoreA != null && m.scoreB != null
    );

    if (!played.length) return null;

    const wins = {};

    played.forEach((m) => {
      const draw = m.scoreA === m.scoreB;
      const winTeam = !draw ? (m.scoreA > m.scoreB ? m.teamA : m.teamB) : null;

      [...(m.teamA || []), ...(m.teamB || [])].forEach((p) => {
        const n = p.nickname || p.name;
        if (!wins[n]) wins[n] = 0;
      });

      if (winTeam) {
        winTeam.forEach((p) => {
          const n = p.nickname || p.name;
          wins[n] = (wins[n] || 0) + 1;
        });
      }
    });

    const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([name]) => name),
      values: sorted.map(([, v]) => v),
    };
  }

  function makeGradient(ctx, chartArea, isDark) {
    const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
    gradient.addColorStop(0, COLOR_START);
    gradient.addColorStop(1, isDark ? COLOR_END_DARK : COLOR_END_LIGHT);
    return gradient;
  }

  async function renderTrajectory() {
    const canvas = document.getElementById("trajectoryChart");
    const emptyMsg = document.getElementById("trajectoryEmpty");
    if (!canvas) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    let matches = [];
    try {
      matches = await window.FobalApi.getMatches();
    } catch (e) {
      console.error("TrajectoryView: error fetching matches", e);
    }

    const result = buildData(matches);

    if (!result) {
      canvas.classList.add("hidden");
      if (emptyMsg) emptyMsg.classList.remove("hidden");
      return;
    }

    canvas.classList.remove("hidden");
    if (emptyMsg) emptyMsg.classList.add("hidden");

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "#1F2937" : "rgba(0,0,0,0.07)";
    const tickColor = isDark ? "#bbb" : "#555";
    const barCount = result.labels.length;

    const container = canvas.parentElement;
    container.style.height = Math.max(180, barCount * 38) + "px";

    // Leader label with star
    const yLabels = result.labels.map((name, i) => i === 0 ? "☆ " + name : name);

    chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: yLabels,
        datasets: [
          {
            label: "Victorias",
            data: result.values,
            backgroundColor: function (context) {
              const chart = context.chart;
              const { ctx, chartArea } = chart;
              if (!chartArea) return isDark ? COLOR_END_DARK : COLOR_END_LIGHT;
              return makeGradient(ctx, chartArea, isDark);
            },
            borderWidth: 0,
            borderRadius: 5,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          datalabels: {
            anchor: (ctx) => ctx.dataset.data[ctx.dataIndex] === 0 ? "start" : "end",
            align: (ctx) => ctx.dataset.data[ctx.dataIndex] === 0 ? "end" : "start",
            color: "#ffffff",
            font: (ctx) => ({
              weight: "700",
              size: ctx.dataset.data[ctx.dataIndex] === 0 ? 12 : 13,
            }),
            formatter: (value) => value === 0 ? "0" : value,
          },
        },
        layout: {
          padding: { right: 4 },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: tickColor, stepSize: 1, precision: 0, font: { size: 11 } },
            grid: { color: gridColor },
          },
          y: {
            ticks: {
              color: (ctx) => ctx.index === 0 ? (isDark ? "#4BC0C0" : "#2a9d8f") : tickColor,
              font: (ctx) => ctx.index === 0
                ? { size: 12, weight: "700" }
                : { size: 12 },
            },
            grid: { display: false },
          },
        },
      },
      plugins: [ChartDataLabels],
    });
  }

  window.TrajectoryView = { renderTrajectory };
})();
