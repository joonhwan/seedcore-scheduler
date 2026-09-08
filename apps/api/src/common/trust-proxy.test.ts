import { describe, expect, it } from 'vitest';
import { describeTrustedProxy, resolveTrustedProxyHops } from './trust-proxy';

describe('resolveTrustedProxyHops', () => {
  it('지정하지 않으면 아무도 믿지 않는다 (exe 배포의 기본값)', () => {
    expect(resolveTrustedProxyHops({})).toBe(0);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '' })).toBe(0);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '   ' })).toBe(0);
  });

  it('배포별 홉 수를 그대로 읽는다', () => {
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '1' })).toBe(1); // docker + nginx
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '2' })).toBe(2); // Fly.io
  });

  /**
   * 오타를 0 으로 떨어뜨리는 것이 이 함수의 안전 방향이다. 값을 크게 잡으면 믿을 이유가 없는
   * X-Forwarded-For 항목을 믿게 되어, 클라이언트가 자기 IP 를 마음대로 고를 수 있게 된다.
   */
  it('정수가 아니거나 음수인 값은 0 으로 떨어뜨린다', () => {
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: 'yes' })).toBe(0);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: 'true' })).toBe(0);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '1.5' })).toBe(0);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '-1' })).toBe(0);
  });
});

describe('describeTrustedProxy', () => {
  it('설정하지 않았음을 부팅 로그에서 알아볼 수 있다', () => {
    const line = describeTrustedProxy({});
    expect(line).toContain('신뢰 안 함');
    expect(line).toContain('TRUSTED_PROXY_HOPS=(없음)');
  });

  it('몇 홉을 믿는지와 그 근거를 함께 적는다', () => {
    const line = describeTrustedProxy({ TRUSTED_PROXY_HOPS: '2' });
    expect(line).toContain('2홉');
    expect(line).toContain('TRUSTED_PROXY_HOPS=2');
  });
});
