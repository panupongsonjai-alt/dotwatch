import assert from 'node:assert/strict'
import {
  buildOpenMeteoUrl,
  buildWeatherSnapshotData,
  parseOpenMeteoCurrentResponse,
} from '../src/services/weatherVirtualDevice.service.js'

const url = buildOpenMeteoUrl({
  latitude: 13.7563,
  longitude: 100.5018,
})

assert.equal(url.hostname, 'api.open-meteo.com')
assert.equal(url.searchParams.get('latitude'), '13.7563')
assert.equal(url.searchParams.get('longitude'), '100.5018')
assert.equal(
  url.searchParams.get('current'),
  'temperature_2m,relative_humidity_2m'
)
assert.equal(url.searchParams.get('timezone'), 'UTC')

const parsed = parseOpenMeteoCurrentResponse({
  current: {
    time: '2026-07-16T08:30',
    temperature_2m: 32.4,
    relative_humidity_2m: 68,
  },
})

assert.equal(parsed.observedAt, '2026-07-16T08:30:00.000Z')
assert.equal(parsed.temperature, 32.4)
assert.equal(parsed.humidity, 68)

const snapshot = buildWeatherSnapshotData(
  parsed,
  '2026-07-16T08:31:00.000Z'
)

assert.deepEqual(snapshot.metrics, { temperature: 32.4, humidity: 68 })
assert.equal(snapshot.timestamp, '2026-07-16T08:31:00.000Z')
assert.equal(snapshot.firmwareVersion, 'weather-api/open-meteo')

assert.throws(() =>
  parseOpenMeteoCurrentResponse({
    current: {
      time: 'invalid',
      temperature_2m: 32.4,
      relative_humidity_2m: 68,
    },
  })
)

console.log('Weather virtual device tests passed')
