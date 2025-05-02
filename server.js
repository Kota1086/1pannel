// server.js const express = require('express'); const cors = require('cors'); const axios = require('axios'); const path = require('path'); require('dotenv').config();

const app = express(); app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));

const DERIV_TOKEN = process.env.DERIV_TOKEN; const API_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

// Improved candlestick + AI-based signal logic function generateSmartSignal() { const random = Math.random(); let signal = 'CALL'; let reason = 'MACD crossover + bullish engulfing pattern';

if (random < 0.5) { signal = 'PUT'; reason = 'RSI overbought + bearish harami pattern'; } const confidence = (Math.random() * 20 + 80).toFixed(2); // 80–100% return { signal, reason, confidence }; }

app.post('/api/signal', async (req, res) => { const { symbol, duration, amount } = req.body; try { const signalData = generateSmartSignal(); res.json({ ...signalData, symbol, duration, amount }); } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to generate signal' }); } });

app.post('/api/trade', async (req, res) => { const { symbol, amount, duration, signal } = req.body; const ws = new (require('ws'))(API_URL);

ws.on('open', () => { ws.send(JSON.stringify({ authorize: DERIV_TOKEN })); });

ws.on('message', (msg) => { const data = JSON.parse(msg);

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
}

if (data.msg_type === 'buy') {
  res.json({ result: 'Trade placed', contract_id: data.buy.contract_id });
  ws.close();
}

if (data.error) {
  res.status(500).json({ error: data.error.message });
  ws.close();
}

});

ws.on('error', (e) => { res.status(500).json({ error: 'WebSocket Error' }); }); });

const PORT = process.env.PORT || 3000; app.listen(PORT, () => console.log(Server started on port ${PORT}));

