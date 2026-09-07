/**
 * 재시작 예고를 화면 쪽에서 다루는 훅들.
 *
 * 남은 시간은 화면이 스스로 센다. 그래서 폴링은 "예고가 새로 걸렸는가, 취소되었는가"를
 * 알아채는 용도이고, 주기가 촘촘할 이유가 없다. 예고가 잡혀 있을 때만 조금 빠르게 돈다.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActiveServerNoticeResponse,
  ActiveSessionsResponse,
  CreateServerNoticeDto,
  ServerNoticeView,
} from '@sam/shared';
import { api } from './api';
import { useMe } from './auth';
import { signedRemainingMsFrom, tickIntervalMs } from './sessionCountdown';

const ACTIVE_NOTICE_KEY = ['server-notice', 'active'] as const;
const NOTICE_HISTORY_KEY = ['admin', 'server-notices'] as const;
const ACTIVE_SESSIONS_KEY = ['admin', 'sessions', 'active'] as const;

/** 예고가 없을 때의 폴링 주기. */
const IDLE_POLL_MS = 60_000;
/** 예고가 잡혀 있을 때의 폴링 주기. 취소를 빨리 반영하기 위해 조금 빠르다. */
const ACTIVE_POLL_MS = 30_000;

export function useActiveServerNotice() {
  const me = useMe();
  return useQuery<ActiveServerNoticeResponse>({
    queryKey: ACTIVE_NOTICE_KEY,
    queryFn: () => api.get<ActiveServerNoticeResponse>('/server-notices/active'),
    enabled: !!me.data,
    // 예고가 걸리면 주기를 좁힌다. 취소했는데 팝업이 30초 넘게 남아 있으면 혼란스럽다.
    refetchInterval: (query) =>
      query.state.data?.notice ? ACTIVE_POLL_MS : IDLE_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * 유효한 예고와 지금 남은 시간(지났으면 음수).
 *
 * 기준점은 응답이 갖고 있다 — 예정 시각과 그 응답을 만든 서버 시각, 그리고 그것을 받은
 * 시점(dataUpdatedAt). 계산 자체는 sessionCountdown 의 순수 함수가 한다.
 */
export function useNoticeRemaining(): {
  notice: ServerNoticeView;
  signedRemainingMs: number;
} | null {
  const me = useMe();
  const q = useActiveServerNotice();
  const [now, setNow] = useState(() => Date.now());

  const data = q.data;
  // 로그인 상태가 아니면 예고를 알리지 않는다.
  //
  // useActiveServerNotice 의 enabled 는 새 요청만 막고 이미 받아 둔 캐시는 남긴다. 그래서
  // 이 확인이 없으면 로그아웃한 뒤에도 캐시에 남은 예고로 팝업이 계속 떠, 로그인 화면 위에
  // "서버가 곧 재시작됩니다" 가 뜬다. 세션이 만료돼 자동 로그아웃된 경우도 마찬가지다.
  // 여기 한 곳에서 막으면 로그아웃·만료·비로그인 세 경로가 함께 닫힌다.
  const notice = me.data ? (data?.notice ?? null) : null;
  const serverNow = data?.serverNow ?? null;

  const signed =
    notice && serverNow
      ? signedRemainingMsFrom(
          {
            targetAt: notice.scheduledAt,
            serverNow,
            receivedAtLocalMs: q.dataUpdatedAt,
          },
          now,
        )
      : null;

  useEffect(() => {
    if (signed === null) return;
    // setInterval 이 아니라 setTimeout 을 다시 거는 것은 간격 자체가 도중에 달라지기
    // 때문이다(30초 → 1초). 세션 연장 창과 같은 방식이다.
    const timer = setTimeout(() => setNow(Date.now()), tickIntervalMs(Math.max(signed, 0)));
    return () => clearTimeout(timer);
  }, [signed]);

  if (!notice || signed === null) return null;
  return { notice, signedRemainingMs: signed };
}

export function useServerNoticeHistory(enabled: boolean) {
  return useQuery<ServerNoticeView[]>({
    queryKey: NOTICE_HISTORY_KEY,
    queryFn: () => api.get<ServerNoticeView[]>('/admin/server-notices'),
    enabled,
  });
}

export function useCreateServerNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServerNoticeDto) =>
      api.post<ServerNoticeView>('/admin/server-notices', input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ACTIVE_NOTICE_KEY });
      await qc.invalidateQueries({ queryKey: NOTICE_HISTORY_KEY });
    },
  });
}

export function useCancelServerNotice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ServerNoticeView>(`/admin/server-notices/${id}/cancel`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ACTIVE_NOTICE_KEY });
      await qc.invalidateQueries({ queryKey: NOTICE_HISTORY_KEY });
    },
  });
}

/** 관리자 화면의 접속자 목록. 30초마다 스스로 갱신한다. */
export function useActiveSessions(enabled: boolean) {
  return useQuery<ActiveSessionsResponse>({
    queryKey: ACTIVE_SESSIONS_KEY,
    queryFn: () => api.get<ActiveSessionsResponse>('/admin/sessions/active'),
    enabled,
    refetchInterval: 30_000,
  });
}
