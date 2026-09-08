import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  /** true 면 통과, false 면 한도 초과. */
  allowed: boolean;
  /**
   * 다시 시도할 수 있을 때까지 남은 시간(ms). 통과했으면 0.
   *
   * 이 값을 돌려주는 이유는 화면 때문이다. 예전에는 통과 여부만 알려줬고, 그래서 서버도
   * "얼마나 기다려야 하는지" 를 몰라 사용자에게 "잠시 후 다시 시도하세요" 라고만 말할 수
   * 있었다. 고정 윈도우라 남은 시간은 창 시작 시각에서 바로 나오므로 알려주지 않을 이유가 없다.
   */
  retryAfterMs: number;
}

/**
 * 단순 인메모리 **고정 윈도우(fixed window)** 카운터.
 *
 * 주석이 "슬라이딩 윈도우" 라고 되어 있었으나 구현은 고정 윈도우다 — 첫 요청 시각부터
 * windowMs 동안 세고, 창이 지나면 카운터를 0 부터 다시 시작한다. 창 경계 직전과 직후에
 * 요청을 몰면 순간적으로 한도의 2 배까지 통과할 수 있다(고정 윈도우의 알려진 성질).
 * 사내 폐쇄망 + 로그인 경로에만 쓰는 지금 용도에는 충분하지만, 실제 동작과 다른 이름을
 * 달아두면 나중에 읽는 사람이 보장되지 않는 성질을 가정하게 되므로 이름을 맞춘다.
 *
 * 단일 인스턴스 전제. 운영 시 외부 캐시 도입은 v2.
 */
@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * 한 번의 시도를 세고 통과 여부를 판정한다.
   *
   * 막힌 상태에서 다시 불러도 `windowStart` 는 밀지 않는다. 즉 **재시도가 벌칙을 늘리지
   * 않는다.** 남은 대기 시간이 계속 줄어들기만 하므로 사용자에게 알려준 시각이 지켜진다.
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      this.gc(now, windowMs);
      return { allowed: true, retryAfterMs: 0 };
    }
    bucket.count += 1;
    if (bucket.count <= limit) return { allowed: true, retryAfterMs: 0 };
    return {
      allowed: false,
      retryAfterMs: Math.max(0, bucket.windowStart + windowMs - now),
    };
  }

  /**
   * 통을 비운다. 로그인에 성공한 순간 그 IP 의 통을 비우는 데 쓴다 — 제한의 목적은 비밀번호
   * 추측을 늦추는 것이므로 실패만 누적하면 충분하고, 성공까지 세면 정상 사용자가 남의 성공
   * 로그인 때문에 막힌다 (같은 IP 는 계정과 무관하게 통 하나를 공유하기 때문이다).
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  private gc(now: number, windowMs: number): void {
    if (this.buckets.size < 1000) return;
    for (const [k, v] of this.buckets) {
      if (now - v.windowStart >= windowMs) this.buckets.delete(k);
    }
  }
}
