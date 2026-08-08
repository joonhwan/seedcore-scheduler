import { describe, it, expect } from 'vitest';
import { describeCookieSecure, resolveCookieSecure } from './cookie-security';

describe('resolveCookieSecure', () => {
  describe('실제 배포 경로', () => {
    it('sp-server.exe (폐쇄망): WEB_ORIGIN 이 없으면 OFF — 사내 IP 평문 접속이 되어야 한다', () => {
      expect(resolveCookieSecure({})).toBe(false);
    });

    it('sp-server.exe: 관리자가 사내 IP 를 WEB_ORIGIN 에 넣어도 http 면 OFF', () => {
      expect(resolveCookieSecure({ WEB_ORIGIN: 'http://192.168.0.10:3000' })).toBe(false);
    });

    it('로컬 개발: http://localhost:5173 이면 OFF', () => {
      expect(resolveCookieSecure({ WEB_ORIGIN: 'http://localhost:5173' })).toBe(false);
    });

    it('Fly.io: WEB_ORIGIN 이 https 면 ON', () => {
      expect(
        resolveCookieSecure({ WEB_ORIGIN: 'https://seedcore-scheduler.fly.dev' }),
      ).toBe(true);
    });

    it('docker compose (deploy/.env.example): http://localhost:8080 이면 OFF', () => {
      expect(resolveCookieSecure({ WEB_ORIGIN: 'http://localhost:8080' })).toBe(false);
    });
  });

  describe('NODE_ENV 와 무관해야 한다', () => {
    // 원래 구현은 secure: process.env.NODE_ENV === 'production' 이었다. exe 배포판에
    // NODE_ENV=production 을 넣는 순간 폐쇄망 사무실 전체가 로그인 불가가 되므로,
    // 실제 프로세스 환경을 오염시켜 그 회귀를 잡는다.
    it('process.env.NODE_ENV=production 이어도 http 면 OFF', () => {
      const saved = process.env.NODE_ENV;
      const savedOrigin = process.env.WEB_ORIGIN;
      const savedSecure = process.env.COOKIE_SECURE;
      try {
        process.env.NODE_ENV = 'production';
        process.env.WEB_ORIGIN = 'http://192.168.0.10:8080';
        delete process.env.COOKIE_SECURE;
        // 인자 없이 부르면 process.env 를 본다 — 운영에서 실제로 도는 경로다.
        expect(resolveCookieSecure()).toBe(false);
      } finally {
        if (saved === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = saved;
        if (savedOrigin === undefined) delete process.env.WEB_ORIGIN;
        else process.env.WEB_ORIGIN = savedOrigin;
        if (savedSecure === undefined) delete process.env.COOKIE_SECURE;
        else process.env.COOKIE_SECURE = savedSecure;
      }
    });
  });

  describe('COOKIE_SECURE override', () => {
    it("'1' 이면 WEB_ORIGIN 이 http 라도 ON", () => {
      expect(
        resolveCookieSecure({ COOKIE_SECURE: '1', WEB_ORIGIN: 'http://localhost:8080' }),
      ).toBe(true);
    });

    it("'true' 도 ON (대소문자 무시)", () => {
      expect(resolveCookieSecure({ COOKIE_SECURE: 'TRUE' })).toBe(true);
    });

    it("'0' 이면 WEB_ORIGIN 이 https 라도 OFF", () => {
      expect(
        resolveCookieSecure({ COOKIE_SECURE: '0', WEB_ORIGIN: 'https://example.com' }),
      ).toBe(false);
    });

    it('오타 값은 켜지 않는다 — 잘못 켜면 사무실 전체가 로그인 불가가 된다', () => {
      expect(resolveCookieSecure({ COOKIE_SECURE: 'yes' })).toBe(false);
      expect(resolveCookieSecure({ COOKIE_SECURE: 'on' })).toBe(false);
    });

    it('빈 문자열은 미설정으로 보고 WEB_ORIGIN 유도로 넘어간다', () => {
      expect(
        resolveCookieSecure({ COOKIE_SECURE: '', WEB_ORIGIN: 'https://example.com' }),
      ).toBe(true);
    });
  });

  describe('입력 정규화', () => {
    it('대문자 스킴과 앞뒤 공백을 견딘다', () => {
      expect(resolveCookieSecure({ WEB_ORIGIN: '  HTTPS://Example.COM  ' })).toBe(true);
    });

    it('https 가 스킴이 아니라 경로에 들어간 경우는 ON 이 아니다', () => {
      expect(resolveCookieSecure({ WEB_ORIGIN: 'http://proxy/https://x' })).toBe(false);
    });
  });
});

describe('describeCookieSecure', () => {
  it('OFF 일 때 판정 근거로 WEB_ORIGIN 을 보여준다', () => {
    const msg = describeCookieSecure({ WEB_ORIGIN: 'http://192.168.0.10:3000' });
    expect(msg).toContain('Secure=OFF');
    expect(msg).toContain('http://192.168.0.10:3000');
  });

  it('WEB_ORIGIN 이 없으면 "(없음)" 으로 보여준다', () => {
    expect(describeCookieSecure({})).toContain('(없음)');
  });

  it('override 로 켜졌으면 WEB_ORIGIN 이 아니라 COOKIE_SECURE 를 근거로 보여준다', () => {
    const msg = describeCookieSecure({ COOKIE_SECURE: '1', WEB_ORIGIN: 'http://x' });
    expect(msg).toContain('Secure=ON');
    expect(msg).toContain('COOKIE_SECURE=1');
  });
});
