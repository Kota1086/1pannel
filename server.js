// File: server.js const express = require("express"); const axios = require("axios"); const cors = require("cors"); require("dotenv\config");

const app = express(); app.use(cors()); app.use(express.json()); app.use(express.static("public"));

const API_TOKEN = process.env.DERIV_TOKEN;

app.post("/api/signal", async (req, res) => { const { symbol, duration, amount } = req.body;

// Simulate advanced AI + strategy signal generation (simplified) const response = await axios.post("https://api.deriv.com/websockets/v3", { ticks_history: symbol, style: "candles", count: 10, granularity: 60 });

const candles = response.data.candles; const last = candles[candles.length - 1]; const secondLast = candles[candles.length - 2];

// Basic strategy + candlestick pattern let signal = "unknown"; let reason = "";

if (secondLast.open < secondLast.close && last.open > last.close) { signal = "put"; reason = "Bearish engulfing pattern detected."; } else if (secondLast.open > secondLast.close && last.open < last.close) { signal = "call"; reason = "Bullish engulfing pattern detected."; }

res.json({ signal, confidence: "high", reason, symbol, duration, amount }); });

app.post("/api/trade", async (req, res) => { const { signal, symbol, duration, amount } = req.body; const contract_type = signal === "call" ? "CALL" : "PUT";

try { const response = await axios.post("https://api.deriv.com/binary", { authorize: API_TOKEN, buy: 1, price: amount, parameters: { amount, basis: "stake", contract_type, currency: "USD", duration, duration_unit: "s", symbol } }); res.json({ status: "Trade executed", details: response.data }); } catch (err) { res.status(500).json({ error: "Trade failed", details: err.message }); } });

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(Bot running on port ${PORT}));

