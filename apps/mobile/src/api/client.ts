import { firebaseAuth } from '@/config/firebase';
import { env } from '@/config/env';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Without a timeout a request on a bad mobile network can hang until the OS
// gives up (minutes), leaving screens stuck in a loading state.
const REQUEST_TIMEOUT_MS = 20_000;

async function getToken(): Promise<string> {
  const user = firebaseAuth.currentUser;

  if (!user) {
    throw new ApiError('กรุณาเข้าสู่ระบบอีกครั้ง', 401);
  }

  return user.getIdToken();
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers
      }
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError('Backend ตอบช้าเกินไป กรุณาลองใหม่', 0);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `API request failed (${response.status})`;

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
