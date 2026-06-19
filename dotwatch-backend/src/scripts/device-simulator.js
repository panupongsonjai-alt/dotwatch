const API_URL = 'https://dotwatch-backend.onrender.com/api/ingest'

const DEVICE_ID = 'dotwatch-1781860306439'
const DEVICE_SECRET = 'f312bbca-7388-49dd-9c37-8b7fd048ba50'

function randomValue(base, range) {
  return Number((base + (Math.random() - 0.5) * range).toFixed(1))
}

async function sendReading() {
  const payload = {
    temperature: randomValue(28, 4),
    humidity: randomValue(65, 10),
    rssi: -55,
    firmwareVersion: 'simulator-1.0.0',
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': DEVICE_ID,
      'x-device-secret': DEVICE_SECRET,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    console.error('Send failed:', response.status, data)
    return
  }

  console.log('Sent:', data)
}

sendReading()
setInterval(sendReading, 10_000)