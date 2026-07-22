#!/usr/bin/env node
/* dot-TH-W1 ingest simulator.
 * Uses a new ESP32 device code/secret, not the Raspberry Pi device.
 */

const https = require('https')
const http = require('http')

const apiUrl = (process.env.DOTWATCH_API_URL || 'https://dotwatch-backend.onrender.com').replace(/\/$/, '')
const deviceCode = process.env.DEVICE_CODE || ''
const deviceSecret = process.env.DEVICE_SECRET || ''

if (!deviceCode || !deviceSecret) {
  console.error('Missing DEVICE_CODE or DEVICE_SECRET environment variable.')
  process.exit(1)
}

const temperature = Number((24 + Math.random() * 8).toFixed(2))
const humidity = Number((45 + Math.random() * 20).toFixed(2))
const rssi = -55 - Math.round(Math.random() * 20)

const payload = {
  firmwareVersion: 'esp32-dht3-sim-0.1.0',
  timestamp: new Date().toISOString(),
  temperature,
  humidity,
  rssi,
  metrics: {
    metric_1: temperature,
    metric_2: humidity,
  },
}

const url = new URL(`${apiUrl}/api/ingest`)
const body = JSON.stringify(payload)
const client = url.protocol === 'https:' ? https : http

const req = client.request({
  method: 'POST',
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'dotwatch-esp32-dht3-simulator/0.1.0',
    'x-device-code': deviceCode,
    'x-device-secret': deviceSecret,
  },
}, (res) => {
  let text = ''
  res.setEncoding('utf8')
  res.on('data', (chunk) => { text += chunk })
  res.on('end', () => {
    console.log('status:', res.statusCode)
    console.log('payload:', JSON.stringify(payload, null, 2))
    console.log('response:', text || '(empty)')
    process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1)
  })
})

req.on('error', (error) => {
  console.error(error.message || error)
  process.exit(1)
})

req.write(body)
req.end()
