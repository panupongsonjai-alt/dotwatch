import type { User } from 'firebase/auth';

import { env } from '@/config/env';

export type RealtimeMessage = {
  type?: string;
  data?: unknown;
  [key: string]: unknown;
};

export function connectRealtime(
  user: User,
  onMessage: (message: RealtimeMessage) => void,
  onStateChange?: (connected: boolean) => void
): () => void {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  const connect = async () => {
    try {
      const token = await user.getIdToken();
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
        onStateChange?.(false);

        if (closedByClient) return;

        const delay = Math.min(1_000 * 2 ** reconnectAttempt, 30_000);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    } catch {
      onStateChange?.(false);
    }
  };

  void connect();

  return () => {
    closedByClient = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    socket?.close();
  };
}
