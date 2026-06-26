import { auth } from './firebase'

let socket = null
let currentUserId = null
let reconnectTimer = null
let reconnectAttempt = 0
let heartbeatTimer = null
let shouldReconnect = false
let lastMessageAt = null
let lastConnectedAt = null
let lastDisconnectedAt = null
let lastError = ''

const listeners = new Set()
const statusListeners = new Set()
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const MAX_RECONNECT_DELAY = 15_000
const HEARTBEAT_INTERVAL = 25_000

async function getRealtimeToken() {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User not logged in')
  }

  return user.getIdToken()
}

function closeSocketWithError(message) {
  lastError = message

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    socket.close(1008, message)
  }

  notifyStatusListeners()
}

function getWsUrl() {
  return API_URL.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
}

function getSocketState() {
  if (!socket) return 'disconnected'
  if (socket.readyState === WebSocket.CONNECTING) return 'connecting'
  if (socket.readyState === WebSocket.OPEN) return 'connected'
  if (socket.readyState === WebSocket.CLOSING) return 'closing'
  if (socket.readyState === WebSocket.CLOSED) return 'disconnected'
  return 'unknown'
}

function getStatusSnapshot() {
  return {
    state: getSocketState(),
    connected: socket?.readyState === WebSocket.OPEN,
    connecting: socket?.readyState === WebSocket.CONNECTING,
    reconnecting: Boolean(reconnectTimer),
    reconnectAttempt,
    listenerCount: listeners.size,
    userId: currentUserId,
    firebaseUserId: auth.currentUser?.uid || null,
    authenticated: Boolean(auth.currentUser),
    wsUrl: getWsUrl(),
    lastMessageAt,
    lastConnectedAt,
    lastDisconnectedAt,
    lastError,
  }
}

function notifyStatusListeners() {
  const snapshot = getStatusSnapshot()

  statusListeners.forEach((listener) => {
    try {
      listener?.(snapshot)
    } catch (error) {
      console.error('Realtime status listener error:', error)
    }
  })
}

function safeSend(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false

  try {
    socket.send(JSON.stringify(payload))
    return true
  } catch (error) {
    lastError = error.message || 'Realtime send error'
    console.error('Realtime send error:', error)
    notifyStatusListeners()
    return false
  }
}

function clearReconnectTimer() {
  if (!reconnectTimer) return
  clearTimeout(reconnectTimer)
  reconnectTimer = null
  notifyStatusListeners()
}

function stopHeartbeat() {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function startHeartbeat() {
  stopHeartbeat()

  heartbeatTimer = setInterval(() => {
    safeSend({
      type: 'ping',
      time: new Date().toISOString(),
    })
  }, HEARTBEAT_INTERVAL)
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

function scheduleReconnect() {
  if (!shouldReconnect || !currentUserId || listeners.size === 0) return
  if (!auth.currentUser) return
  if (reconnectTimer) return

  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY)
  reconnectAttempt += 1

  console.log(`Realtime reconnecting in ${delay}ms`)
  notifyStatusListeners()

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    openSocket(currentUserId)
  }, delay)
}

function closeSocket({ keepListeners = true, allowReconnect = false } = {}) {
  clearReconnectTimer()
  stopHeartbeat()

  const closingSocket = socket
  socket = null

  if (!keepListeners) {
    listeners.clear()
  }

  if (!allowReconnect) {
    shouldReconnect = false
    reconnectAttempt = 0
  }

  if (!closingSocket) {
    notifyStatusListeners()
    return
  }

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

  lastDisconnectedAt = new Date().toISOString()
  notifyStatusListeners()
}

function openSocket(userId) {
  if (!userId) return

  const sameSocket =
    socket &&
    currentUserId === String(userId) &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)

  if (sameSocket) return

  closeSocket({ keepListeners: true, allowReconnect: true })

  currentUserId = String(userId)
  shouldReconnect = true
  lastError = ''
  socket = new WebSocket(getWsUrl())
  notifyStatusListeners()

  socket.onopen = async () => {
    reconnectAttempt = 0
    lastConnectedAt = new Date().toISOString()
    lastDisconnectedAt = null
    lastError = ''
    console.log('Realtime connected')

    try {
      const token = await getRealtimeToken()

      const subscribed = safeSend({
        type: 'subscribe',
        token,
      })

      if (!subscribed) {
        closeSocketWithError('Realtime subscribe failed')
        return
      }

      startHeartbeat()
      notifyStatusListeners()
    } catch (error) {
      console.error('Realtime auth error:', error)
      closeSocketWithError(error.message || 'Realtime auth error')
    }
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      lastMessageAt = new Date().toISOString()
      notifyStatusListeners()
      notifyListeners(payload)
    } catch (error) {
      lastError = error.message || 'Realtime parse error'
      console.error('Realtime parse error:', error)
      notifyStatusListeners()
    }
  }

  socket.onerror = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) return
    lastError = 'Realtime socket error'
    console.error('Realtime error')
    notifyStatusListeners()
  }

  socket.onclose = () => {
    console.log('Realtime disconnected')
    stopHeartbeat()
    socket = null
    lastDisconnectedAt = new Date().toISOString()
    notifyStatusListeners()
    scheduleReconnect()
  }
}

export function connectRealtime(userId, onMessage) {
  if (!userId) return () => {}

  if (onMessage) {
    listeners.add(onMessage)
  }

  currentUserId = String(userId)
  shouldReconnect = true
  openSocket(currentUserId)
  notifyStatusListeners()

  return () => {
    if (onMessage) {
      listeners.delete(onMessage)
    }

    if (listeners.size === 0) {
      closeSocket({ keepListeners: false, allowReconnect: false })
      currentUserId = null
    }

    notifyStatusListeners()
  }
}

export function disconnectRealtime() {
  closeSocket({ keepListeners: false, allowReconnect: false })
  currentUserId = null
  notifyStatusListeners()
}

export function getRealtimeStatus() {
  return getStatusSnapshot()
}

export function subscribeRealtimeStatus(listener) {
  if (!listener) return () => {}

  statusListeners.add(listener)
  listener(getStatusSnapshot())

  return () => {
    statusListeners.delete(listener)
  }
}
