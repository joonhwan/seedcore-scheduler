/**
 * 세션 수명을 화면 쪽에서 다루는 훅들.
 *
 * 서버 정책은 "로그인 후 12시간 고정, 연장은 사용자가 누를 때만"이다(@sam/shared 의
 * SESSION_TTL_MS 주석). 그래서 화면이 남은 시간을 스스로 세고, 끊기기 전에 연장할지 물어야 한다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MeResponse, SessionExtendResponse } from '@sam/shared';
import { api } from './api';
import { useMe } from './auth';
import { remainingMs, tickIntervalMs, type SessionClock } from './sessionCountdown';

const ME_KEY = ['auth', 'me'] as const;

/**
 * 지금 세션의 남은 시간(밀리초). 로그인 상태가 아니면 null.
 *
 * 기준점은 me 응답이 갖고 있다 — 만료 시각과 그 응답을 만든 서버 시각, 그리고 그것을 받은
 * 시점(dataUpdatedAt). 계산 자체는 sessionCountdown 의 순수 함수가 한다.
 */
export function useSessionRemaining(): number | null {
  const me = useMe();
  const [now, setNow] = useState(() => Date.now());

  const data = me.data;
  const clock: SessionClock | null =
    data && data.sessionExpiresAt && data.serverNow
      ? {
          sessionExpiresAt: data.sessionExpiresAt,
          serverNow: data.serverNow,
          receivedAtLocalMs: me.dataUpdatedAt,
        }
      : null;

  const left = clock ? remainingMs(clock, now) : null;

  useEffect(() => {
    if (left === null) return;
    // 남은 시간에 따라 간격을 바꾼다. setInterval 이 아니라 setTimeout 을 다시 거는 것은
    // 간격 자체가 도중에 달라지기 때문이다(30초 → 1초).
    const timer = setTimeout(() => setNow(Date.now()), tickIntervalMs(left));
    return () => clearTimeout(timer);
  }, [left]);

  return left;
}

/** 연장 창의 "로그인 연장". 성공하면 me 를 다시 받아 남은 시간이 새 값으로 갱신된다. */
export function useExtendSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SessionExtendResponse>('/auth/extend'),
    onSuccess: (res) => {
      // 서버가 돌려준 새 만료 시각을 캐시에 곧바로 반영한다. invalidate 만 걸면 재요청이
      // 도착하기 전까지 남은 시간이 옛 값으로 남아 연장 창이 잠깐 다시 뜬다.
      qc.setQueryData<MeResponse | null>(ME_KEY, (prev) =>
        prev
          ? {
              ...prev,
              sessionExpiresAt: res.sessionExpiresAt,
              serverNow: res.serverNow,
            }
          : prev,
      );
      return qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
