let socket = null
let currentUserId = null
let reconnectTimer = null
let reconnectAttempt = 0
let shouldReconnect = false

const listeners = new Set()

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const WS_URL = import.meta.env.VITE_WS_URL

function getWsUrl() {
  if (WS_URL) return WS_URL

  return API_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}

function clearReconnectTimer() {
  if (!reconnectTimer) return

  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function notifyListeners(payload) {
  listeners.forEach((listener) => {
    try {
      listener?.(payload)
    } catch (error) {
      console.error('Realtime listener error:', error)
    }
  })
}

function cleanupSocketHandlers(targetSocket) {
  if (!targetSocket) return

  targetSocket.onopen = null
  targetSocket.onmessage = null
  targetSocket.onerror = null
  targetSocket.onclose = null
}

function getReconnectDelay() {
  const baseDelay = 1000 * Math.max(1, reconnectAttempt)
  return Math.min(30000, baseDelay)
}

function scheduleReconnect() {
  if (!shouldReconnect || !currentUserId) return
  if (reconnectTimer) return

  reconnectAttempt += 1

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null

    if (!shouldReconnect || !currentUserId) return

    openSocket(currentUserId)
  }, getReconnectDelay())
}

function openSocket(userId) {
  if (!userId) return

  const existingSocket = socket

  if (
    existingSocket &&
    (existingSocket.readyState === WebSocket.OPEN ||
      existingSocket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  const nextSocket = new WebSocket(getWsUrl())

  socket = nextSocket

  nextSocket.onopen = () => {
    if (socket !== nextSocket) return

    reconnectAttempt = 0

    console.log('Realtime connected')

    nextSocket.send(
      JSON.stringify({
        type: 'subscribe',
        userId,
      })
    )

    notifyListeners({
      type: 'realtime:connected',
    })
  }

  nextSocket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      console.log('Realtime payload:', payload)

      notifyListeners(payload)
    } catch (error) {
      console.error('Realtime parse error:', error)
    }
  }

  nextSocket.onerror = (error) => {
    if (socket !== nextSocket) return

    console.error('Realtime error:', error)

    notifyListeners({
      type: 'realtime:error',
    })
  }

  nextSocket.onclose = () => {
    if (socket === nextSocket) {
      socket = null
    }

    cleanupSocketHandlers(nextSocket)

    console.log('Realtime disconnected')

    notifyListeners({
      type: 'realtime:disconnected',
    })

    scheduleReconnect()
  }
}

export function connectRealtime(userId, onMessage) {
  if (!userId) return () => {}

  if (onMessage) listeners.add(onMessage)

  const nextUserId = String(userId)

  if (currentUserId && currentUserId !== nextUserId) {
    disconnectRealtime()
  }

  currentUserId = nextUserId
  shouldReconnect = true

  openSocket(currentUserId)

  return () => {
    if (onMessage) listeners.delete(onMessage)
  }
}

export function disconnectRealtime() {
  shouldReconnect = false
  currentUserId = null
  reconnectAttempt = 0

  clearReconnectTimer()
  listeners.clear()

  const closingSocket = socket
  socket = null

  if (!closingSocket) return

  cleanupSocketHandlers(closingSocket)

  if (
    closingSocket.readyState === WebSocket.OPEN ||
    closingSocket.readyState === WebSocket.CONNECTING
  ) {
    closingSocket.close()
  }
}

export function getRealtimeStatus() {
  if (!socket) {
    return {
      connected: false,
      readyState: 'CLOSED',
    }
  }

  const stateMap = {
    [WebSocket.CONNECTING]: 'CONNECTING',
    [WebSocket.OPEN]: 'OPEN',
    [WebSocket.CLOSING]: 'CLOSING',
    [WebSocket.CLOSED]: 'CLOSED',
  }

  return {
    connected: socket.readyState === WebSocket.OPEN,
    readyState: stateMap[socket.readyState] || String(socket.readyState),
  }
}
