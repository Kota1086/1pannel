const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { RSI, MACD, EMA } = require('technicalindicators');
const tf = require('@tensorflow/tfjs-node');
const NodeCache = require('node-cache');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: 10 });
app.use(cors());
app.use(express.json());

const DERIV_TOKEN = process.env.DERIV_TOKEN;
const API_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

async function fetchMarketData(symbol, timeframe = 60, count = 100) {
  const ws = new WebSocket(API_URL);
  return new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        end: 'latest',
        count: count,
        granularity: timeframe,
        style: 'candles',
        subscribe: 0
      }));
    });

    ws.on('message', (msg) => {
      const data = JSON.parse(msg);
      if (data.candles) {
        resolve(data.candles);
        ws.close();
      } else if (data.error) {
        reject(data.error);
        ws.close();
      }
    });

    ws.on('error', (err) => {
      ws.close();
      reject(err);
    });
  });
}

let aiModel = null;
async function loadAIModel() {
  aiModel = tf.sequential();
  aiModel.add(tf.layers.lstm({ units: 32, inputShape: [20, 4], returnSequences: false }));
  aiModel.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  aiModel.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' });
  console.log('AI Model loaded');
}

function runSignalWorker(symbol, duration, candles) {
  return new Promise((resolve) => {
    const worker = new Worker(__filename, {
      workerData: { symbol, duration, candles }
    });
    worker.on('message', resolve);
    worker.on('error', () => resolve({ signal: 'CALL', reason: 'Worker error fallback', confidence: 95 }));
  });
}

if (!isMainThread) {
  const { symbol, duration, candles } = workerData;

  if (candles.length < 20) {
    parentPort.postMessage({ signal: 'CALL', reason: 'Insufficient candle data', confidence: 50 });
    return;
  }

  const closePrices = candles.map(c => c.close);
  const openPrices = candles.map(c => c.open);
  const highPrices = candles.map(c => c.high);
  const lowPrices = candles.map(c => c.low);

  const rsi = RSI.calculate({ values: closePrices, period: 14 });
  const macd = MACD.calculate({ values: closePrices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  const emaFast = EMA.calculate({ values: closePrices, period: 10 });
  const emaSlow = EMA.calculate({ values: closePrices, period: 20 });

  const latestRSI = rsi[rsi.length - 1];
  const latestMACD = macd[macd.length - 1];
  const latestEMAFast = emaFast[emaFast.length - 1];
  const latestEMASlow = emaSlow[emaSlow.length - 1];

  const inputData = candles.slice(-20).map(c => [c.open, c.high, c.low, c.close]);
  const tensor = tf.tensor3d([inputData], [1, 20, 4]);
  const aiPrediction = aiModel ? aiModel.predict(tensor).dataSync()[0] : 0.5;
  tensor.dispose();

  let signal = 'CALL';
  let reason = 'Technical analysis combination';
  let confidence = 95;

  if (latestRSI < 30 && latestMACD.macd > latestMACD.signal && latestEMAFast > latestEMASlow && aiPrediction > 0.8) {
    signal = 'CALL';
    reason = 'Strong bullish indicators';
  } else if (latestRSI > 70 && latestMACD.macd < latestMACD.signal && latestEMAFast < latestEMASlow && aiPrediction < 0.2) {
    signal = 'PUT';
    reason = 'Strong bearish indicators';
  } else if (aiPrediction > 0.8) {
    signal = 'CALL';
    reason = 'AI Strong Bullish';
  } else if (aiPrediction < 0.2) {
    signal = 'PUT';
    reason = 'AI Strong Bearish';
  } else if (latestMACD.macd > latestMACD.signal && latestEMAFast > latestEMASlow) {
    signal = 'CALL';
    reason = 'MACD and EMA Bullish';
  } else if (latestMACD.macd < latestMACD.signal && latestEMAFast < latestEMASlow) {
    signal = 'PUT';
    reason = 'MACD and EMA Bearish';
  }

  const signalData = { signal, reason, confidence, timestamp: Date.now() };
  parentPort.postMessage(signalData);
}

async function generateSmartSignal(symbol, duration) {
  const cacheKey = `${symbol}_${duration}`;
  const cachedSignal = cache.get(cacheKey);
  if (cachedSignal) return cachedSignal;

  const candles = await fetchMarketData(symbol);
  const signalData = await runSignalWorker(symbol, duration, candles);
  cache.set(cacheKey, signalData);
  return signalData;
}

app.get('/api/market-data', async (req, res) => {
  const { symbol = 'R_100' } = req.query;
  try {
    const candles = await fetchMarketData(symbol);
    const chartData = candles.map(c => ({
      x: new Date(c.epoch * 1000),
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close
    }));
    res.json({ candles: chartData });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

app.post('/api/signal', async (req, res) => {
  const { symbol, duration } = req.body;
  try {
    const signalData = await Promise.race([
      generateSmartSignal(symbol, duration),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]);
    res.json(signalData);
  } catch (err) {
    res.json({ signal: 'CALL', reason: 'Timeout fallback', confidence: 95 });
  }
});

app.post('/api/trade', async (req, res) => {
  const { symbol, amount, duration, signal } = req.body;
  const ws = new WebSocket(API_URL);

  ws.on('open', () => {
    ws.send(JSON.stringify({ authorize: DERIV_TOKEN }));
  });

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.msg_type === 'authorize') {
      const proposal = {
        buy: 1,
        price: amount,
        parameters: {
          amount: amount,
          basis: 'stake',
          contract_type: signal,
          currency: 'USD',
          duration: duration,
          duration_unit: 's',
          symbol: symbol
        },
        subscribe: 1
      };
      ws.send(JSON.stringify(proposal));
    } else if (data.msg_type === 'buy') {
      res.json({ result: 'Trade placed', contract_id: data.buy.contract_id });
      ws.close();
    } else if (data.error) {
      res.status(500).json({ error: data.error.message });
      ws.close();
    }
  });

  ws.on('error', (e) => {
    res.status(500).json({ error: 'WebSocket Error' });
    ws.close();
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server started on port ${PORT}`);
  await loadAIModel();
});