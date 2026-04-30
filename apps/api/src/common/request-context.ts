import type { Request } from 'express';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  globalRole: 'ADMIN' | 'USER';
  passwordMustChange: boolean;
}

export interface AuthSession {
  sid: string;
  expiresAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  session?: AuthSession;
}

export function getClientIp(req: Request): string | undefined {
  // Trust proxy 설정이 없으면 req.ip 가 직접 연결의 IP. 운영 nginx 뒤에서는
  // X-Forwarded-For 의 첫 번째 항목을 우선 사용.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim();
  }
  return req.ip ?? undefined;
}

export function getUserAgent(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 512) : undefined;
}
