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
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });

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
