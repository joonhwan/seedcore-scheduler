import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  windowStart: number;
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
   * @returns true 면 통과, false 면 한도 초과.
   */
  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      this.gc(now, windowMs);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

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
