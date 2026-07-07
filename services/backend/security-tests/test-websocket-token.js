/*
dotWatch WebSocket Token Test

ใช้ทดสอบว่า WebSocket subscribe ต้องใช้ Firebase token
วิธีใช้:
1. ติดตั้ง Node 18+
2. cd dotwatch-dashboard หรือ folder ที่มี package.json
3. npm install ws
4. ตั้งค่า env แล้วรัน:
   node scripts/test-websocket-token.js

ENV:
- DOTWATCH_WS_URL เช่น ws://localhost:4000 หรือ wss://dotwatch-backend.onrender.com
- FIREBASE_ID_TOKEN token จาก frontend login/session
*/

import WebSocket from 'ws'

const wsUrl = process.env.DOTWATCH_WS_URL || 'ws://localhost:4000'
const token = process.env.FIREBASE_ID_TOKEN

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function testNoToken() {
  console.log('\n[Test] Subscribe without token should be rejected')

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        userId: 'fake-user-id',
      })
    )
  })

  ws.on('message', (message) => {
    console.log('[No token message]', String(message))
  })

  await new Promise((resolve) => {
    ws.on('close', (code, reason) => {
      console.log(`[PASS] Closed without token: ${code} ${String(reason)}`)
      resolve()
    })

    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log('[FAIL] Socket still open without token')
        ws.close()
      }
      resolve()
    }, 5000)
  })
}

async function testWithToken() {
  if (!token) {
    console.log('\n[Skip] Set FIREBASE_ID_TOKEN to test valid token subscribe')
    return
  }

  console.log('\n[Test] Subscribe with Firebase token should pass')

  const ws = new WebSocket(wsUrl)

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        token,
      })
    )
  })

  await new Promise((resolve) => {
    let subscribed = false

    ws.on('message', (message) => {
      const payload = JSON.parse(String(message))
      console.log('[With token message]', payload)

      if (payload.type === 'subscribed') {
        subscribed = true
        console.log('[PASS] Subscribed with token')
        ws.close()
        resolve()
      }
    })

    ws.on('close', (code, reason) => {
      if (!subscribed) {
        console.log(`[FAIL] Closed before subscribed: ${code} ${String(reason)}`)
      }
      resolve()
    })

    setTimeout(() => {
      if (!subscribed) {
        console.log('[FAIL] No subscribed message after 5 seconds')
        ws.close()
      }
      resolve()
    }, 5000)
  })
}

await testNoToken()
await wait(500)
await testWithToken()
