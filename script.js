"use strict";

(() => {
  const API_KEY = "OWBPVRRZ3SYEUAB6";
  const API_URL = "https://www.alphavantage.co/query";

  const els = {
    tickerInput: document.getElementById("tickerInput"),
    startBtn: document.getElementById("startBtn"),
    upBtn: document.getElementById("upBtn"),
    downBtn: document.getElementById("downBtn"),
    endBtn: document.getElementById("endBtn"),
    status: document.getElementById("statusMsg"),
    currentTicker: document.getElementById("currentTicker"),
    currentDate: document.getElementById("currentDate"),
    score: document.getElementById("score"),
    chartCanvas: document.getElementById("priceChart"),
  };

  /** @typedef {{date: string, adjustedClose: number}} DailyPoint */

  /** Global game state */
  const state = {
    ticker: null,
    series: /** @type {DailyPoint[]} */ ([]), // ascending by date
    dateToIndex: /** @type {Map<string, number>} */ (new Map()),
    chart: /** @type {import('chart.js').Chart|null} */ (null),
    score: 0,
    currentIndex: /** index of current day (start day), in series */ null,
  };

  function setStatus(message, kind = "info") {
    els.status.textContent = message || "";
    els.status.classList.remove("error", "info");
    if (kind) els.status.classList.add(kind);
  }

  function formatDateHuman(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function daysAgoFromToday(isoDate) {
    const today = new Date();
    const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const d = new Date(isoDate + "T00:00:00Z");
    const dateUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffMs = todayUTC - dateUTC;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  async function fetchDailyAdjustedSeries(ticker) {
    const url = `${API_URL}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Network error (${res.status})`);
    const data = await res.json();

    if (data.Note) {
      // API rate limited
      const e = new Error("Alpha Vantage rate limit reached. Please wait and try again.");
      e.name = "RateLimit";
      throw e;
    }
    if (data["Error Message"]) {
      const e = new Error("Invalid ticker symbol. Please try another.");
      e.name = "InvalidTicker";
      throw e;
    }

    const seriesRaw = data["Time Series (Daily)"];
    if (!seriesRaw || typeof seriesRaw !== "object") {
      const e = new Error("Unexpected API response. Please try again.");
      e.name = "BadResponse";
      throw e;
    }

    // Convert to array and sort ascending (oldest -> newest)
    const points = Object.keys(seriesRaw)
      .map((dateStr) => ({
        date: dateStr,
        adjustedClose: Number(seriesRaw[dateStr]["5. adjusted close"]) || Number(seriesRaw[dateStr]["4. close"]) || NaN,
      }))
      .filter((p) => Number.isFinite(p.adjustedClose))
      .sort((a, b) => (a.date < b.date ?  -1 : a.date > b.date ? 1 : 0));

    return points;
  }

  function buildDateIndexMap(series) {
    state.dateToIndex.clear();
    series.forEach((p, idx) => state.dateToIndex.set(p.date, idx));
  }

  function chooseRandomStartIndex(series) {
    // Select indices where date is 7..100 days ago, and ensure at least 7 prior trading days and 1 next day.
    const candidates = [];
    for (let i = 0; i < series.length; i++) {
      const point = series[i];
      const ago = daysAgoFromToday(point.date);
      if (ago >= 7 && ago <= 100) {
        if (i - 7 >= 0 && i + 1 < series.length) {
          candidates.push(i);
        }
      }
    }
    if (candidates.length === 0) return null;
    const pick = Math.floor(Math.random() * candidates.length);
    return candidates[pick];
  }

  function initChart(label, labels, values) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const ctx = els.chartCanvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, "rgba(108, 140, 255, 0.35)");
    gradient.addColorStop(1, "rgba(108, 140, 255, 0.02)");

    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: "#6c8cff",
            backgroundColor: gradient,
            tension: 0.25,
            pointRadius: 2.5,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: "#a6b1e1" },
            grid: { color: "#1e244a" },
          },
          y: {
            ticks: { color: "#a6b1e1" },
            grid: { color: "#1e244a" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { intersect: false, mode: "index" },
        },
      },
    });
  }

  function updateHUD() {
    els.currentTicker.textContent = state.ticker || "—";
    if (state.currentIndex != null) {
      els.currentDate.textContent = formatDateHuman(state.series[state.currentIndex].date);
    } else {
      els.currentDate.textContent = "—";
    }
    els.score.textContent = String(state.score);
  }

  function setPlayingEnabled(enabled) {
    els.upBtn.disabled = !enabled;
    els.downBtn.disabled = !enabled;
    els.endBtn.disabled = !enabled;
  }

  async function onStart() {
    const raw = (els.tickerInput.value || "").trim().toUpperCase();
    if (!raw) {
      setStatus("Please enter a stock ticker.", "error");
      return;
    }
    els.startBtn.disabled = true;
    setPlayingEnabled(false);
    setStatus("Loading market data…", "info");

    try {
      const series = await fetchDailyAdjustedSeries(raw);
      state.series = series;
      state.ticker = raw;
      buildDateIndexMap(series);

      const startIndex = chooseRandomStartIndex(series);
      if (startIndex == null) {
        throw new Error("Not enough data in the last 100 days for this ticker.");
      }

      state.score = 0;
      state.currentIndex = startIndex; // start day index

      // Prepare initial chart: previous 7 days + start day (8 points total)
      const from = startIndex - 7;
      const to = startIndex; // inclusive
      const labels = series.slice(from, to + 1).map((p) => p.date);
      const values = series.slice(from, to + 1).map((p) => p.adjustedClose);

      initChart(`${raw} Adjusted Close`, labels, values);
      updateHUD();
      setStatus("Make your prediction: Up or Down?", "info");
      setPlayingEnabled(true);
    } catch (e) {
      console.error(e);
      if (e && e.name === "InvalidTicker") {
        setStatus("That ticker does not exist. Please try another.", "error");
      } else if (e && e.name === "RateLimit") {
        setStatus("Rate limit reached. Wait a minute and try again.", "error");
      } else {
        setStatus(e && e.message ? e.message : "Failed to load data.", "error");
      }
    } finally {
      els.startBtn.disabled = false;
    }
  }

  function canRevealNext() {
    return state.currentIndex != null && state.currentIndex + 1 < state.series.length;
  }

  function revealNextAndScore(prediction) {
    if (!canRevealNext()) {
      setStatus("No more future trading days available.", "error");
      setPlayingEnabled(false);
      return;
    }

    const curr = state.series[state.currentIndex];
    const next = state.series[state.currentIndex + 1];
    const wentUp = next.adjustedClose > curr.adjustedClose;
    const wentDown = next.adjustedClose < curr.adjustedClose;

    let correct = false;
    if (prediction === "up") correct = wentUp;
    if (prediction === "down") correct = wentDown;
    if (correct) state.score += 1;

    // Extend chart with next point
    if (state.chart) {
      state.chart.data.labels.push(next.date);
      state.chart.data.datasets[0].data.push(next.adjustedClose);
      state.chart.update();
    }

    // Advance current day
    state.currentIndex = state.currentIndex + 1;
    updateHUD();

    const verdict = correct ? "Correct!" : "Wrong.";
    const direction = wentUp ? "up" : wentDown ? "down" : "flat";
    const note = direction === "flat" ? "It stayed the same." : `It went ${direction}.`;
    setStatus(`${verdict} ${note} Predict the next day…`, correct ? "info" : "error");

    if (!canRevealNext()) {
      setStatus(`${verdict} ${note} No further data. You can end the game.`, correct ? "info" : "error");
      setPlayingEnabled(true); // allow End Game
      els.upBtn.disabled = true;
      els.downBtn.disabled = true;
    }
  }

  function endGame() {
    setPlayingEnabled(false);
    setStatus(`Game ended. Final score: ${state.score}.`, "info");
  }

  // Wire up events
  els.startBtn.addEventListener("click", onStart);
  els.tickerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onStart();
  });
  els.upBtn.addEventListener("click", () => revealNextAndScore("up"));
  els.downBtn.addEventListener("click", () => revealNextAndScore("down"));
  els.endBtn.addEventListener("click", endGame);
})();

