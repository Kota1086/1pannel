document.getElementById("getSignal").addEventListener("click", async () => {
  const res = await fetch("/api/signal");
  const data = await res.json();
  const duration = document.getElementById("duration").value;
  const amount = document.getElementById("amount").value;

  document.getElementById("result").innerHTML =
    `Signal: <span style="color:${data.signal === 'CALL' ? 'green' : 'red'}">${data.signal}</span> <br>
    Confidence: ${data.confidence}% <br>
    Duration: ${duration / 60} min | Stake: $${amount}`;
});
