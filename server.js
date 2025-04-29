const express = require("express");
const app = express();
const path = require("path");
const bodyParser = require("body-parser");

let latestSignal = null;

// Serve frontend
app.use(express.static("public"));
app.use(bodyParser.json());

// Webhook endpoint
app.post("/webhook", (req, res) => {
  const data = req.body;
  if (data.signal) {
    latestSignal = {
      asset: data.asset || "Unknown",
      direction: data.signal,
      time: new Date().toLocaleTimeString(),
    };
    console.log("Signal received:", latestSignal);
  }
  res.sendStatus(200);
});

// Send signal to frontend
app.get("/signals", (req, res) => {
  res.json(latestSignal ? [latestSignal] : []);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});