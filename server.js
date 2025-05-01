const express = require("express");
const path = require("path");
const WebSocket = require("ws");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/signal", async (req, res) => {
  try {
    const signal = await getAISignal();
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: "Failed to get signal" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

async function getAISignal() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://ws.derivws.com/websockets/v3");
    const token = "0z8FuATbkZ6lb9Z";

    ws.on("open", () => {
      ws.send(JSON.stringify({ authorize: token }));
    });

    ws.on("message", msg => {
      const data = JSON.parse(msg);

      if (data.msg_type === "authorize") {
        ws.send(JSON.stringify({
          ticks_history: "R_100",
          adjust_start_time: 1,
          count: 6,
          end: "latest",
          start: 1,
          style: "candles",
          granularity: 60,
          subscribe: 0
        }));
      }

      if (data.msg_type === "candles") {
        const candles = data.candles;
        const signal = analyzeCandles(candles);
        ws.close();
        resolve(signal);
      }
    });

    ws.on("error", err => reject(err));
  });
}

function analyzeCandles(candles) {
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  let score = 0;

  if (prev.open > prev.close && curr.open < curr.close && curr.open < prev.close && curr.close > prev.open) {
    score += 60;
  } else if (prev.open < prev.close && curr.open > curr.close && curr.open > prev.close && curr.close < prev.open) {
    score -= 60;
  }

  const closes = candles.map(c => c.close);
  const sma = closes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  if (curr.close > sma) score += 20;
  if (curr.close < sma) score -= 20;

  const gains = closes.map((c, i) => i > 0 ? Math.max(0, c - closes[i - 1]) : 0);
  const losses = closes.map((c, i) => i > 0 ? Math.max(0, closes[i - 1] - c) : 0);
  const avgGain = gains.reduce((a, b) => a + b, 0) / 5;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / 5;
  const rs = avgGain / (avgLoss || 1);
  const rsi = 100 - 100 / (1 + rs);

  if (rsi < 30) score += 20;
  if (rsi > 70) score -= 20;

  let signal = "NO SIGNAL";
  if (score >= 70) signal = "CALL";
  else if (score <= -70) signal = "PUT";

  return {
    signal,
    confidence: Math.min(100, Math.abs(score))
  };
  }
