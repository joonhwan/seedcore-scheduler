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

    const host = req.headers.host;
    const originsToCheck = new Set<string>();

    if (process.env.WEB_ORIGIN) {
      originsToCheck.add(process.env.WEB_ORIGIN.replace(/\/$/, ''));
    }
    if (host) {
      originsToCheck.add(`http://${host}`.replace(/\/$/, ''));
      originsToCheck.add(`https://${host}`.replace(/\/$/, ''));
    }
    originsToCheck.add('http://localhost:5173');
    originsToCheck.add('http://localhost:3000');
    originsToCheck.add('http://127.0.0.1:3000');

    const origin = (req.headers.origin as string | undefined)?.replace(/\/$/, '');
    if (origin) {
      if (originsToCheck.has(origin)) return true;
      throw new ForbiddenException({ error: 'CSRF_ORIGIN_MISMATCH' });
    }

    // Origin 이 없는 경우 Referer 로 폴백
    const referer = req.headers.referer as string | undefined;
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin.replace(/\/$/, '');
        if (originsToCheck.has(refOrigin)) return true;
      } catch {
        // fallthrough
      }
    }
    throw new ForbiddenException({ error: 'CSRF_ORIGIN_MISSING' });
  }
}

