const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DERIV_TOKEN = process.env.DERIV_TOKEN;
const API_URL = 'wss://ws.binaryws.com/websockets/v3?app_id=1089';

app.post('/api/signal', async (req, res) => {
  const { symbol, duration, amount } = req.body;

  try {
    // Sample signal logic based on random + mock confidence
    const direction = Math.random() > 0.5 ? 'CALL' : 'PUT';
    const confidence = (Math.random() * 30 + 70).toFixed(2); // 70% to 100%
    const reason = direction === 'CALL' ? 'Strong bullish candlestick' : 'Bearish pressure detected';

    res.json({
      signal: direction,
      confidence,
      reason,
      symbol,
      duration,
      amount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate signal' });
  }
});

app.post('/api/trade', async (req, res) => {
  const { symbol, amount, duration, signal } = req.body;
  const ws = new (require('ws'))(API_URL);

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
    }

    if (data.msg_type === 'buy') {
      res.json({
        result: 'Trade placed',
        contract_id: data.buy.contract_id
      });
      ws.close();
    }

    if (data.error) {
      res.status(500).json({ error: data.error.message });
      ws.close();
    }
  });

  ws.on('error', (e) => {
    res.status(500).json({ error: 'WebSocket Error' });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
