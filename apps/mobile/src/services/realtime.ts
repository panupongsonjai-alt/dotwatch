import type { User } from 'firebase/auth';
import { AppState, type AppStateStatus } from 'react-native';

import { env } from '@/config/env';

export type RealtimeMessage = {
  type?: string;
  data?: unknown;
  [key: string]: unknown;
};

export function connectRealtime(
  user: User,
  onMessage: (message: RealtimeMessage) => void,
  onStateChange?: (connected: boolean) => void,
  onForeground?: () => void
): () => void {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let appState: AppStateStatus = AppState.currentState;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const closeSocket = () => {
    if (!socket) return;

    socket.onclose = null;
    socket.close();
    socket = null;
    onStateChange?.(false);
  };

  const scheduleReconnect = () => {
    if (closedByClient || appState !== 'active') return;

    clearReconnectTimer();

    const delay = Math.min(1_000 * 2 ** reconnectAttempt, 30_000);
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (closedByClient || appState !== 'active') return;

    clearReconnectTimer();
    closeSocket();

    try {
      const token = await user.getIdToken();

      if (closedByClient || appState !== 'active') return;

      socket = new WebSocket(env.wsUrl);

      socket.onopen = () => {
        reconnectAttempt = 0;
        onStateChange?.(true);
        socket?.send(JSON.stringify({ type: 'subscribe', token }));
      };

      socket.onmessage = (event) => {
        try {
          onMessage(JSON.parse(String(event.data)) as RealtimeMessage);
        } catch {
          // Ignore malformed messages without breaking the connection.
        }
      };

      socket.onerror = () => {
        onStateChange?.(false);
      };

      socket.onclose = () => {
        socket = null;
        onStateChange?.(false);
        scheduleReconnect();
      };
    } catch {
      onStateChange?.(false);
      scheduleReconnect();
    }
  };

  const appStateSubscription = AppState.addEventListener(
    'change',
    (nextState) => {
      const wasBackground = appState !== 'active';
      appState = nextState;

      if (nextState !== 'active') {
        clearReconnectTimer();
        closeSocket();
        return;
      }

      if (wasBackground) {
        onForeground?.();
      }

      void connect();
    }
  );

  void connect();

  return () => {
    closedByClient = true;
    clearReconnectTimer();
    appStateSubscription.remove();
    closeSocket();
  };
}
