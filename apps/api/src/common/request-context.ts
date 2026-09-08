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
  /**
   * `X-Admin-Mode: 1` 헤더를 ADMIN 사용자가 보낸 경우에만 true.
   * non-ADMIN 의 헤더는 silently 무시됨. AdminModeMiddleware 가 채움.
   */
  adminMode?: boolean;
}

export function getClientIp(req: Request): string | undefined {
  // X-Forwarded-For 를 직접 파싱하지 않는다. Express 의 `trust proxy` 설정(main.ts 에서
  // TRUSTED_PROXY_HOPS 로 정한다)에 따라 req.ip 가 이미 올바른 값을 준다.
  //
  // 예전에는 이 함수가 X-Forwarded-For 의 첫 항목을 조건 없이 썼는데, 그 헤더는 클라이언트가
  // 직접 채워 보낼 수 있어서 로그인 제한의 통과 감사로그의 ip 를 모두 위조할 수 있었다.
  // 왜 홉 수로 판정해야 하는지는 common/trust-proxy.ts 의 주석에 적어 두었다.
  return req.ip ?? undefined;
}

export function getUserAgent(req: Request): string | undefined {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 512) : undefined;
}
