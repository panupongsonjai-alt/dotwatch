let socket = null
let currentUserId = null

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getWsUrl() {
  return API_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}

export function connectRealtime(userId, onMessage) {
  if (!userId) return null

  if (
    socket &&
    currentUserId === userId &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return socket
  }

  disconnectRealtime()

  currentUserId = userId
  socket = new WebSocket(getWsUrl())

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'subscribe', userId }))
    console.log('Realtime connected')
  }

  socket.onmessage = (event) => {
    try {
      onMessage?.(JSON.parse(event.data))
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

  return socket
}

export function disconnectRealtime() {
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
