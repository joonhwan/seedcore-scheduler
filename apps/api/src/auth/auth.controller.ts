import {
  Body,
  Controller,
  HttpCode,
  Post,
  Get,
  Req,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ChangePasswordDto,
  LoginDto,
  type MeResponse,
} from '@sam/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  getClientIp,
  getUserAgent,
  type AuthenticatedRequest,
} from '../common/request-context';
import { OriginGuard } from '../common/origin.guard';
import { AuthService } from './auth.service';
import {
  AllowPasswordChange,
  Public,
  SESSION_COOKIE_NAME,
} from './auth.guard';

const cookieOptions = (expiresAt: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1',
  expires: expiresAt,
});

const clearCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
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
    return {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      globalRole: req.user.globalRole,
      passwordMustChange: req.user.passwordMustChange,
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
