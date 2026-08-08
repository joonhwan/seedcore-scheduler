/**
 * 세션 쿠키에 Secure 속성을 붙일지 판정한다.
 *
 * **NODE_ENV 로 판단하면 안 된다.** 이 프로젝트는 배포 경로마다 TLS 유무가 다른데
 * NODE_ENV 는 그것과 아무 상관이 없다.
 *
 *  - sp-server.exe (폐쇄망 사무실): 서버 PC 에서 실행하고 팀원들이 http://192.168.x.x:3000 으로
 *    붙는다. TLS 없음 → Secure 를 붙이면 안 된다.
 *  - Fly.io (고객 시범용): https://seedcore-scheduler.fly.dev, TLS 는 Fly 엣지에서 끝난다
 *    → Secure 를 붙여야 한다.
 *
 * Secure 쿠키를 평문 HTTP 로 내려보내면 브라우저가 **에러도 경고도 없이 그냥 버린다**(RFC 6265bis).
 * 서버는 200 과 Set-Cookie 를 정상적으로 보냈고 LOGIN_SUCCESS 감사로그까지 남으므로, 증상은
 * "로그인 → 다시 로그인 화면" 무한 반복으로만 나타난다. 비밀번호 오류와 구분이 안 된다.
 *
 * 더 고약한 건 재현 조건이다. 크롬·파이어폭스는 http://localhost 를 신뢰할 수 있는 출처로
 * 취급해 Secure 쿠키를 받아준다. 그래서 **서버 PC 에서 확인하면 멀쩡하고 다른 PC 에서만 깨진다.**
 * main.ts 의 helmet 설정 주석에 적힌 upgrade-insecure-requests 사고와 원인·재현조건이 같다.
 *
 * 판정 기준을 WEB_ORIGIN 으로 삼는 이유: 이 값은 "브라우저가 실제로 치는 주소" 라서 TLS 유무와
 * 정의상 일치한다. fly.toml 은 이미 https 를, deploy/.env.example 은 http 를 담고 있고 exe 는
 * 아예 비어 있으므로, 세 배포 경로 모두 설정 파일을 한 줄도 고치지 않고 올바른 값이 나온다.
 *
 * COOKIE_SECURE 는 그 유도를 덮어쓰는 탈출구다. 앞단에 TLS 종단을 따로 두면서 WEB_ORIGIN 은
 * 내부 주소로 남겨야 하는 구성 같은, 유도가 틀리는 경우를 위한 것이다.
 * (BACKUP_DB_PATH 가 "비어 있으면 자동 해석, 있으면 override" 인 것과 같은 패턴이다.)
 *
 * @param env 판정에 쓰는 환경변수. 테스트에서 주입할 수 있도록 인자로 받는다.
 */
export function resolveCookieSecure(
  env: { COOKIE_SECURE?: string | undefined; WEB_ORIGIN?: string | undefined } = process.env,
): boolean {
  const override = env.COOKIE_SECURE;
  if (override !== undefined && override !== '') {
    // '1' / 'true' 만 켠다. 오타('yes', '0' 등)는 끈 것으로 본다 — 잘못 켜서 사무실 전체가
    // 로그인 불가가 되는 쪽이, 잘못 꺼져서 사내망에 평문 쿠키가 흐르는 쪽보다 훨씬 아프다.
    return override === '1' || override.toLowerCase() === 'true';
  }
  return (env.WEB_ORIGIN ?? '').trim().toLowerCase().startsWith('https://');
}

/** 부팅 로그에 쓸 설명 문구. 로그인이 안 된다는 문의가 왔을 때 첫 번째로 볼 단서다. */
export function describeCookieSecure(
  env: { COOKIE_SECURE?: string | undefined; WEB_ORIGIN?: string | undefined } = process.env,
): string {
  const secure = resolveCookieSecure(env);
  const reason =
    env.COOKIE_SECURE !== undefined && env.COOKIE_SECURE !== ''
      ? `COOKIE_SECURE=${env.COOKIE_SECURE}`
      : `WEB_ORIGIN=${env.WEB_ORIGIN ?? '(없음)'}`;
  return secure
    ? `세션 쿠키 Secure=ON (${reason}) — HTTPS 로만 로그인됩니다`
    : `세션 쿠키 Secure=OFF (${reason}) — 평문 HTTP 접속 허용`;
}
