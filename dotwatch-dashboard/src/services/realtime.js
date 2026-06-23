let socket = null
let currentUserId = null
const listeners = new Set()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getWsUrl() {
  return API_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}

export function connectRealtime(userId, onMessage) {
  if (!userId) return () => {}

  if (onMessage) listeners.add(onMessage)

  const sameSocket =
    socket &&
    currentUserId === userId &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)

  if (sameSocket) {
    return () => {
      listeners.delete(onMessage)
    }
  }

  disconnectRealtime()

  currentUserId = userId
  socket = new WebSocket(getWsUrl())

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
      console.log('Realtime payload:', payload)

      listeners.forEach((listener) => {
        listener?.(payload)
      })
    } catch (error) {
      console.error('Realtime parse error:', error)
    }
  }

  socket.onerror = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) return
    console.error('Realtime error')
  }

  socket.onclose = () => {
    console.log('Realtime disconnected')
    socket = null
    currentUserId = null
  }

  return () => {
    listeners.delete(onMessage)
  }
}

export function disconnectRealtime() {
  listeners.clear()

  if (!socket) return

  const closingSocket = socket
  socket = null
  currentUserId = null

  closingSocket.onopen = null
  closingSocket.onmessage = null
  closingSocket.onerror = null
  closingSocket.onclose = null

  if (
    closingSocket.readyState === WebSocket.OPEN ||
    closingSocket.readyState === WebSocket.CONNECTING
  ) {
    closingSocket.close()
  }
}
