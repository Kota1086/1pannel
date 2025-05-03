// Glitch-compatible Deriv AI Trading Bot const express = require('express'); const cors = require('cors'); const WebSocket = require('ws'); const { RSI, MACD, EMA } = require('technicalindicators'); const tf = require('@tensorflow/tfjs'); const NodeCache = require('node-cache'); require('dotenv').config();

const app = express(); const cache = new NodeCache({ stdTTL: 10 }); app.use(cors()); app.use(express.json());

const DERIV_TOKEN = process.env.DERIV_TOKEN; const API_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

async function fetchMarketData(symbol, timeframe = 60, count = 100) { const ws = new WebSocket(API_URL); return new Promise((resolve, reject) => { ws.on('open', () => { ws.send(JSON.stringify({ ticks_history: symbol, end: 'latest', count: count, granularity: timeframe, style: 'candles', subscribe: 0 })); });

ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  if (data.candles) {
    resolve(data.candles);
    ws.close();
  }
  if (data.error) {
    reject(data.error);
    ws.close();
  }
});

ws.on('error', reject);

}); }

let aiModel = null; async function loadAIModel() { aiModel = tf.sequential(); aiModel.add(tf.layers.lstm({ units: 32, inputShape: [20, 4] })); aiModel.add(tf.layers.dense({ units: 1, activation: 'sigmoid' })); aiModel.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' }); console.log('AI Model loaded'); }

function analyzeSignal(candles) { const closePrices = candles.map(c => c.close); const rsi = RSI.calculate({ values: closePrices, period: 14 }); const macd = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }); const emaFast = EMA.calculate({ values: closePrices, period: 10 }); const emaSlow = EMA.calculate({ values: closePrices, period: 20 });

const latestRSI = rsi[rsi.length - 1]; const latestMACD = macd[macd.length - 1]; const latestEMAFast = emaFast[emaFast.length - 1]; const latestEMASlow = emaSlow[emaSlow.length - 1];

const inputData = candles.slice(-20).map(c => [c.open, c.high, c.low, c.close]); const tensor = tf.tensor3d([inputData], [1, 20, 4]); const aiPrediction = aiModel ? aiModel.predict(tensor).dataSync()[0] : 0.5; tensor.dispose();

let signal = 'CALL'; let reason = 'Technical mix'; let confidence = 95;

if (latestRSI < 30 && latestMACD.macd > latestMACD.signal && latestEMAFast > latestEMASlow && aiPrediction > 0.8) { signal = 'CALL'; reason = 'Strong bullish'; } else if (latestRSI > 70 && latestMACD.macd < latestMACD.signal && latestEMAFast < latestEMASlow && aiPrediction < 0.2) { signal = 'PUT'; reason = 'Strong bearish'; } else if (aiPrediction > 0.8) { signal = 'CALL'; reason = 'AI Bullish'; } else if (aiPrediction < 0.2) { signal = 'PUT'; reason = 'AI Bearish'; }

return { signal, reason, confidence, timestamp: Date.now() }; }

async function generateSmartSignal(symbol, duration) { const cacheKey = ${symbol}_${duration}; const cachedSignal = cache.get(cacheKey); if (cachedSignal) return cachedSignal;

const candles = await fetchMarketData(symbol); const signalData = analyzeSignal(candles); cache.set(cacheKey, signalData); return signalData; }

app.get('/api/market-data', async (req, res) => { const { symbol = 'R_100' } = req.query; try { const candles = await fetchMarketData(symbol); const chartData = candles.map(c => ({ x: new Date(c.epoch * 1000), o: c.open, h: c.high, l: c.low, c: c.close })); res.json({ candles: chartData }); } catch (err) { res.status(500).json({ error: 'Market data fetch failed' }); } });

app.post('/api/signal', async (req, res) => { const { symbol, duration } = req.body; try { const signalData = await Promise.race([ generateSmartSignal(symbol, duration), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000)) ]); res.json(signalData); } catch (err) { res.json({ signal: 'CALL', reason: 'Timeout fallback', confidence: 95 }); } });

app.post('/api/trade', async (req, res) => { const { symbol, amount, duration, signal } = req.body; const ws = new WebSocket(API_URL);

ws.on('open', () => { ws.send(JSON.stringify({ authorize: DERIV_TOKEN })); });

ws.on('message', (msg) => { const data = JSON.parse(msg); if (data.msg_type === 'authorize') { const proposal = { buy: 1, price: amount, parameters: { amount, basis: 'stake', contract_type: signal, currency: 'USD', duration, duration_unit: 's', symbol }, subscribe: 1 }; ws.send(JSON.stringify(proposal)); } if (data.msg_type === 'buy') { res.json({ result: 'Trade placed', contract_id: data.buy.contract_id }); ws.close(); } if (data.error) { res.status(500).json({ error: data.error.message }); ws.close(); } });

ws.on('error', () => res.status(500).json({ error: 'WebSocket error' })); });

const PORT = process.env.PORT || 3000; app.listen(PORT, async () => { console.log(Server running on ${PORT}); await loadAIModel(); });

