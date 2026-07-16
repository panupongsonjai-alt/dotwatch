import { env } from '@/config/env';

export interface BackendHealth {
  ok?: boolean;
  status?: string;
  service?: string;
  environment?: string;
  timestamp?: string;
  requestId?: string;
}

export async function getBackendHealth(): Promise<BackendHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`${env.apiUrl}/health/live`, {
      headers: {
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => ({}))) as BackendHealth;

    if (!response.ok) {
      throw new Error(`Backend health check failed (${response.status})`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
