import dotenv from 'dotenv'

dotenv.config()

function clean(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

const backendUrl = clean(
  process.env.BACKEND_URL || process.env.WEATHER_BACKEND_URL
)
const secret = clean(process.env.WEATHER_POLL_SECRET)

if (!backendUrl) {
  throw new Error('Missing BACKEND_URL or WEATHER_BACKEND_URL')
}

if (!secret) {
  throw new Error('Missing WEATHER_POLL_SECRET')
}

const response = await fetch(`${backendUrl}/api/internal/weather/poll`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${secret}`,
    'content-type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify({}),
})

const body = await response.json().catch(() => ({}))

if (!response.ok) {
  throw new Error(
    `Weather poll failed with HTTP ${response.status}: ${body.message || 'Unknown error'}`
  )
}

console.log(JSON.stringify(body, null, 2))

if (Number(body?.data?.failed || 0) > 0) {
  process.exitCode = 2
}
