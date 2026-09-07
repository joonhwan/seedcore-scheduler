import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionsService } from '../sessions/sessions.service';
import type { AuthenticatedRequest } from '../common/request-context';

export const SESSION_COOKIE_NAME = 'sam_sid';

/**
 * 라우트에 @Public() 을 달면 인증 검사를 건너뜀.
 * (예: /auth/login, /health 류)
 */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 라우트에 @AllowPasswordChange() 을 달면 password_must_change=1 인 사용자도 통과.
 * (/auth/me, /auth/change-password, /auth/logout 에 부착)
 */
export const ALLOW_PASSWORD_CHANGE_KEY = 'auth:allowPasswordChange';
export const AllowPasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

/**
 * 라우트에 @AdminOnly() 을 달면 globalRole='ADMIN' 만 통과.
 */
export const ADMIN_ONLY_KEY = 'auth:adminOnly';
export const AdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_ONLY_KEY, true);

/**
 * 라우트에 @NoSessionTouch() 를 달면 인증은 그대로 하되 lastSeenAt 을 갱신하지 않음.
 *
 * 예고 폴링처럼 사용자가 조작하지 않았는데도 주기적으로 오는 요청에 붙인다. 그런 요청까지
 * 활동으로 기록하면 관리자 화면의 접속자 목록이 "브라우저를 켜 둔 사람 전부"가 되어 버린다.
 */
export const NO_SESSION_TOUCH_KEY = 'auth:noSessionTouch';
export const NoSessionTouch = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_SESSION_TOUCH_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const cls = context.getClass();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      handler,
      cls,
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sid = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!sid) throw new UnauthorizedException({ error: 'NO_SESSION' });

    const noTouch =
      this.reflector.getAllAndOverride<boolean>(NO_SESSION_TOUCH_KEY, [handler, cls]) ??
      false;
    const session = noTouch
      ? await this.sessions.peek(sid)
      : await this.sessions.touch(sid);
    if (!session) throw new UnauthorizedException({ error: 'SESSION_EXPIRED' });

    req.user = {
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      globalRole: session.user.globalRole === 'ADMIN' ? 'ADMIN' : 'USER',
      passwordMustChange: session.user.passwordMustChange,
    };
    req.session = { sid: session.sid, expiresAt: session.expiresAt };

    // X-Admin-Mode: 1 헤더는 ADMIN 사용자에 한해 의미가 있음.
    // non-ADMIN 의 헤더는 silently 무시 (UX 힌트일 뿐 권한 클레임이 아님).
    const adminModeHeader = req.headers['x-admin-mode'];
    req.adminMode =
      typeof adminModeHeader === 'string' &&
      adminModeHeader === '1' &&
      req.user.globalRole === 'ADMIN';

    const allowPasswordChange =
      this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [
        handler,
        cls,
      ]) ?? false;
    if (req.user.passwordMustChange && !allowPasswordChange) {
      throw new ForbiddenException({ error: 'PASSWORD_CHANGE_REQUIRED' });
    }

    const adminOnly =
      this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, [handler, cls]) ??
      false;
    if (adminOnly && req.user.globalRole !== 'ADMIN') {
      throw new ForbiddenException({ error: 'ADMIN_REQUIRED' });
    }

    return true;
  }
}
