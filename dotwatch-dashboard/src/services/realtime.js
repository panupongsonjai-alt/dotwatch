let socket = null

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export function connectRealtime(userId, onMessage) {
  if (!userId) return null

  disconnectRealtime()

  const wsUrl = API_URL.replace('http://', 'ws://').replace(
    'https://',
    'wss://'
  )

  socket = new WebSocket(wsUrl)

  socket.onopen = () => {
    console.log('Realtime connected')

    socket.send(
      JSON.stringify({
        type: 'subscribe',
        userId,
      })
    )
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      onMessage?.(payload)
    } catch (error) {
      console.error('Realtime parse error:', error)
    }
  }

  socket.onerror = (error) => {
    console.error('Realtime error:', error)
  }

  socket.onclose = () => {
    console.log('Realtime disconnected')
  }

  return socket
}

export function disconnectRealtime() {
  if (socket) {
    socket.close()
    socket = null
  }
}
