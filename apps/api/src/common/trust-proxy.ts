/**
 * 앞단 프록시를 몇 홉까지 믿을지 판정한다. Express 의 `trust proxy` 설정값이 된다.
 *
 * **왜 필요한가.** 예전에는 `getClientIp()` 가 `X-Forwarded-For` 의 첫 항목을 조건 없이 썼다.
 * 그런데 그 헤더는 **클라이언트가 직접 채워 보낼 수 있다.** 프록시를 거쳐 왔는지 확인하는
 * 절차가 없었으므로:
 *
 *  - sp-server.exe 는 프록시 없이 직접 서비스하니 클라이언트가 적은 값이 그대로 채택됐다.
 *  - nginx 뒤에서도 마찬가지였다. `$proxy_add_x_forwarded_for` 는 클라이언트가 보낸 값 **뒤에**
 *    실제 IP 를 덧붙이는 방식이라(deploy/nginx.conf), 첫 항목은 여전히 클라이언트가 적은 값이다.
 *
 * 그 IP 는 로그인 제한의 통을 가르는 열쇠이자 감사로그에 남는 값이다. 즉 요청마다 헤더를 바꾸면
 * 제한이 없는 것과 같았고, 감사로그의 ip 컬럼도 믿을 수 없었다.
 *
 * **왜 유도하지 않고 환경변수로 받는가.** 쿠키 Secure 판정(cookie-security.ts)은 WEB_ORIGIN 에서
 * 유도했지만 이 값은 그럴 수 없다. 틀렸을 때의 방향이 다르기 때문이다.
 *
 *  - 실제보다 **낮게** 잡으면: 프록시 뒤의 사용자 전원이 프록시 IP 하나로 묶여 로그인 제한 통을
 *    함께 쓴다. 불편하지만 안전하고, 성공한 로그인이 통을 비우므로(auth.service.ts) 체감도 작다.
 *  - 실제보다 **높게** 잡으면: 믿을 이유가 없는 항목을 믿게 되어 위조 구멍이 그대로 되살아난다.
 *
 * 그래서 기본값은 0(아무도 믿지 않음)이고, 프록시가 실제로 있는 배포에서만 명시한다.
 * 유도가 한 번이라도 틀리면 조용히 위험해지는 값을 추측으로 정하지 않는다.
 *
 * **배포별 올바른 값** (오른쪽부터 세어, 믿을 수 있는 중계자의 수):
 *
 *  - `sp-server.exe` (폐쇄망 사무실): **0**. 브라우저가 3000 번 포트에 직접 붙는다.
 *  - `deploy/compose.yaml` (docker + nginx): **1**. 브라우저 → nginx → api 이므로 nginx 하나.
 *  - Fly.io (`Dockerfile.fly`): **2**. 브라우저 → Fly 엣지 → 컨테이너 안의 nginx → api 로
 *    중계가 둘이다 (deploy/nginx.fly.conf 가 127.0.0.1:3000 으로 넘긴다).
 *
 * @param env 판정에 쓰는 환경변수. 테스트에서 주입할 수 있도록 인자로 받는다.
 */
export function resolveTrustedProxyHops(
  env: { TRUSTED_PROXY_HOPS?: string | undefined } = process.env,
): number {
  const raw = (env.TRUSTED_PROXY_HOPS ?? '').trim();
  if (raw === '') return 0;

  const parsed = Number(raw);
  // 오타는 0 으로 본다. 잘못된 값 때문에 믿을 이유가 없는 헤더를 믿는 쪽이 훨씬 아프다.
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

/** 부팅 로그에 쓸 설명 문구. 로그인 제한이나 감사로그 IP 가 이상할 때 첫 번째로 볼 단서다. */
export function describeTrustedProxy(
  env: { TRUSTED_PROXY_HOPS?: string | undefined } = process.env,
): string {
  const hops = resolveTrustedProxyHops(env);
  const raw = (env.TRUSTED_PROXY_HOPS ?? '').trim();
  const reason = raw === '' ? 'TRUSTED_PROXY_HOPS=(없음)' : `TRUSTED_PROXY_HOPS=${raw}`;
  return hops === 0
    ? `앞단 프록시 신뢰 안 함 (${reason}) — 접속한 IP 를 그대로 씁니다. 프록시 뒤에 두었다면 이 값을 지정하십시오`
    : `앞단 프록시 ${hops}홉 신뢰 (${reason}) — X-Forwarded-For 에서 실제 접속자 IP 를 찾습니다`;
}
