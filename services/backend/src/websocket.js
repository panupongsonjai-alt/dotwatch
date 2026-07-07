export function initWebSocket(wss) {
  wss.on('connection', (ws) => {
    console.log('Dashboard connected via WebSocket')

    ws.send(
      JSON.stringify({
        type: 'connected',
        message: 'WebSocket connected',
      })
    )
  })
}

export function broadcastToClients(wss, payload) {
  if (!wss) return

  const message = JSON.stringify(payload)

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message)
    }
  })
}
