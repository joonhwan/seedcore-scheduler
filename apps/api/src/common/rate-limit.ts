import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * 단순 인메모리 슬라이딩 윈도우 카운터.
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
