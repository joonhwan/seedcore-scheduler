/**
 * 얇은 fetch 래퍼 — 세션 쿠키 자동 포함, 4xx/5xx 시 throw.
 * Origin 검사를 위해 모든 상태변경 요청은 fetch 의 기본 Origin 헤더에 의존한다 (브라우저 자동).
 * adminMode 가 켜져 있으면 모든 요청에 X-Admin-Mode: 1 헤더를 부착한다 (서버는 ADMIN 외의 헤더는 silently 무시).
 */
import { isAdminModeOn } from './adminMode';

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    if (this.body && typeof this.body === 'object') {
      const c = (this.body as { code?: unknown; error?: unknown }).code;
      if (typeof c === 'string') return c;
      const e = (this.body as { error?: unknown }).error;
      if (typeof e === 'string') return e;
    }
    return undefined;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function configureApi(opts: { onUnauthorized?: () => void }): void {
  if ('onUnauthorized' in opts) unauthorizedHandler = opts.onUnauthorized ?? null;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (isAdminModeOn()) headers['X-Admin-Mode'] = '1';

  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers,
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text.length > 0 ? safeJson(text) : undefined;
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/me' && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
