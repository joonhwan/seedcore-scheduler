import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ChangePasswordDto,
  LoginDto,
  type MeResponse,
  type SessionExtendResponse,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { OriginGuard } from '../common/origin.guard';
import { resolveCookieSecure } from '../common/cookie-security';
import { AuthService } from './auth.service';
import {
  AllowPasswordChange,
  Public,
  SESSION_COOKIE_NAME,
} from './auth.guard';

// secure 판정은 resolveCookieSecure() 한 곳에만 있다 — 왜 NODE_ENV 를 쓰지 않는지는
// common/cookie-security.ts 의 docstring 참고. 두 함수의 속성은 반드시 일치해야 한다:
// clearCookie 는 Set-Cookie 로 만료를 덮어쓰는 방식이라 secure/sameSite/path 가 하나라도
// 어긋나면 브라우저가 다른 쿠키로 보고 원본을 남겨둔다 (= 로그아웃이 안 된다).
const cookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: resolveCookieSecure(),
  sameSite: 'lax' as const,
  path: '/api/v1',
  expires: expiresAt,
});

const clearCookieOptions = () => ({
  httpOnly: true,
  secure: resolveCookieSecure(),
  sameSite: 'lax' as const,
  path: '/api/v1',
});

@Controller('auth')
@UseGuards(OriginGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(LoginDto))
  async login(
    @Body() body: LoginDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ passwordMustChange: boolean }> {
    const result = await this.auth.login(body.username, body.password, {
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
    res.cookie(SESSION_COOKIE_NAME, result.sid, cookieOptions(result.expiresAt));
    return { passwordMustChange: result.passwordMustChange };
  }

  @Post('logout')
  @AllowPasswordChange()
  @HttpCode(204)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    if (req.session && req.user) {
      await this.auth.logout(req.session.sid, req.user.id, {
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
      });
    }
    res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions());
  }

  @Get('me')
  @AllowPasswordChange()
  me(@Req() req: AuthenticatedRequest): MeResponse {
    if (!req.user) throw new Error('user missing — guard misconfigured');
    if (!req.session) throw new Error('session missing — guard misconfigured');
    return {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      globalRole: req.user.globalRole,
      passwordMustChange: req.user.passwordMustChange,
      sessionExpiresAt: req.session.expiresAt.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }

  /**
   * 세션 연장 (연장 창의 "로그인 연장" 버튼).
   *
   * 쿠키를 반드시 다시 내려보내야 한다. 브라우저 쿠키의 만료 시각은 로그인 때 박힌 값
   * 그대로이므로, DB 의 만료만 미루면 브라우저가 먼저 쿠키를 버려 연장이 무효가 된다
   * (이것이 원래의 "작업 중에 로그인 화면으로 튕기던" 결함의 정체다).
   */
  @Post('extend')
  @AllowPasswordChange()
  @HttpCode(200)
  async extend(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionExtendResponse> {
    if (!req.session) throw new Error('session missing — guard misconfigured');
    const extended = await this.auth.extendSession(req.session.sid);
    if (!extended) {
      throw new UnauthorizedException({ error: 'SESSION_EXPIRED' });
    }
    res.cookie(SESSION_COOKIE_NAME, extended.sid, cookieOptions(extended.expiresAt));
    return {
      sessionExpiresAt: extended.expiresAt.toISOString(),
      serverNow: new Date().toISOString(),
    };
  }

  @Post('change-password')
  @AllowPasswordChange()
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(ChangePasswordDto))
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    if (!req.user) throw new Error('user missing — guard misconfigured');
    await this.auth.changePassword(req.user.id, body.current, body.next, {
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  }
}
