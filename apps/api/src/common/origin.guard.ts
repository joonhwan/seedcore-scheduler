import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF 방어 — 상태변경 요청에 대해 Origin/Referer 가 허용된 출처와 일치하는지 검사.
 * 사내 단일 SPA origin 가정. 더블서밋 토큰 미사용.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
    const origin = (req.headers.origin as string | undefined)?.replace(/\/$/, '');
    if (origin) {
      if (origin === allowed) return true;
      throw new ForbiddenException({ error: 'CSRF_ORIGIN_MISMATCH' });
    }

    // Origin 이 없는 경우 Referer 로 폴백 (일부 same-origin POST).
    const referer = req.headers.referer as string | undefined;
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (refOrigin === allowed) return true;
      } catch {
        // fallthrough
      }
    }
    throw new ForbiddenException({ error: 'CSRF_ORIGIN_MISSING' });
  }
}
