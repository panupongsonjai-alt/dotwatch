// dotwatch-backend/src/scripts/simulator.js

const API_URL = "http://localhost:4000/api/ingest";

const DEVICE_ID = "dotwatch-001";
const DEVICE_SECRET = "e63f12334c02e9cd8bf85ca9d4498a9f62c4";

function randomValue(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

async function sendData() {
  const temperature = randomValue(28, 32);
  const humidity = randomValue(55, 75);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": DEVICE_ID,
      "x-device-secret": DEVICE_SECRET,
    },
    body: JSON.stringify({
      temperature,
      humidity,
    }),
  });

  const data = await res.json();
  console.log({ temperature, humidity, data });
}

setInterval(sendData, 5000);
sendData();
