// server.js require('dotenv').config(); const express = require('express'); const axios = require('axios'); const path = require('path');

const app = express(); const PORT = process.env.PORT || 3000; const DERIV_TOKEN = process.env.DERIV_TOKEN;

app.use(express.static('public')); app.use(express.json());

app.post('/api/signal', async (req, res) => { try { const response = await axios.post('https://ws.derivws.com/websockets/v3', { authorize: DERIV_TOKEN });

// Simulated signal
const signal = Math.random() > 0.5 ? 'CALL' : 'PUT';
const confidence = Math.floor(Math.random() * 30) + 70; // 70-100%

res.json({ signal, confidence });

} catch (error) { res.status(500).json({ error: 'Failed to fetch signal.' }); } });

app.listen(PORT, () => console.log(Server running on port ${PORT}));

