import { useMemo } from 'react';
import type { NodeCommentItem, NodeHistoryItem } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useComments, useDeleteComment } from '../lib/comments';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

interface Props {
  nodeId: string;
  canEdit: boolean;
}

type FeedItem =
  | { type: 'COMMENT'; timestamp: string; data: NodeCommentItem }
  | { type: 'HISTORY'; timestamp: string; data: NodeHistoryItem };

export default function ActivityFeedPanel({ nodeId, canEdit }: Props) {
  const comments = useComments(nodeId);
  const history = useNodeHistory(nodeId);
  const removeComment = useDeleteComment(nodeId);
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const isAdmin = me.data?.globalRole === 'ADMIN';

  // 댓글과 변경 이력을 병합하여 시간 역순(최신순) 정렬
  const feedItems = useMemo(() => {
    const list: FeedItem[] = [];

    comments.data?.forEach((c) => {
      list.push({ type: 'COMMENT', timestamp: c.createdAt, data: c });
    });
    history.data?.forEach((h) => {
      list.push({ type: 'HISTORY', timestamp: h.occurredAt, data: h });
    });

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [comments.data, history.data]);

  async function onDeleteComment(cId: string) {
    const ok = window.confirm('이 댓글을 삭제하시겠습니까?');
    if (!ok) return;
    try {
      await removeComment.mutateAsync(cId);
      toast.success('댓글이 삭제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const isLoading = comments.isLoading || history.isLoading;
  const isError = comments.isError || history.isError;
  const errorMessage = comments.isError
    ? apiErrorMessage(comments.error)
    : history.isError
    ? apiErrorMessage(history.error)
    : null;

  return (
    <section className="flex flex-col h-full">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">통합 작업 히스토리 & 피드</h3>

      {isLoading && <p className="text-xs text-slate-500">피드 로딩 중…</p>}
      {isError && <p className="text-xs text-rose-600">{errorMessage}</p>}

      <div className="flex-1 overflow-y-auto pr-1 max-h-[460px] border border-slate-100 dark:border-slate-800/80 rounded-lg p-3 bg-slate-50/30 dark:bg-slate-900/10 space-y-3.5">
        {feedItems.map((item) => {
          if (item.type === 'COMMENT') {
            const c = item.data;
            const isAuthor = me.data?.id === c.authorId;
            const canDelete = isAuthor || (isAdmin && adminMode);
            return (
              <div
                key={`comment-${c.id}`}
                className="flex flex-col rounded-lg border border-sky-100 bg-sky-50/35 p-3 text-xs dark:border-sky-950/40 dark:bg-sky-950/10 animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-sky-100/50 pb-1.5 mb-1.5 dark:border-sky-950/20">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    💬 {c.authorDisplayName}{' '}
                    <span className="text-slate-400 font-normal">@{c.authorUsername}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 leading-relaxed">{c.body}</p>
                {canDelete && (
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteComment(c.id)}
                      className="text-[10px] text-rose-600 hover:underline dark:text-rose-400 font-medium"
                    >
                      댓글 삭제
                    </button>
                  </div>
                )}
              </div>
            );
          } else {
            const h = item.data;
            return (
              <div
                key={`history-${h.id}`}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/40 shadow-sm animate-in fade-in-50 duration-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <ActionBadge action={h.action} />
                    <div className="truncate text-slate-700 dark:text-slate-300 font-medium text-[11px] flex items-center gap-1">
                      {renderHistorySummary(h.action, h.diff, h.actorDisplayName)}
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1 pl-1">
                    by @{h.actorUsername} · {formatDateTime(h.occurredAt)}
                  </p>
                </div>

                {/* 마우스 오버 시 상세 정보를 표시해주는 순수 CSS group-hover 툴팁 구조 */}
                <div className="relative group shrink-0 self-start">
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 hover:border-slate-300 text-[10px] text-slate-400 hover:text-slate-600 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    ℹ️
                  </button>
                  <div className="absolute right-0 top-6 z-30 hidden group-hover:block w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-300 animate-in fade-in duration-100">
                    <h4 className="font-bold border-b border-slate-100 pb-1.5 mb-1.5 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                      상세 변경 이력
                    </h4>
                    <DiffTooltip action={h.action} diff={h.diff} />
                  </div>
                </div>
              </div>
            );
          }
        })}

        {feedItems.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6">활동 내역이나 댓글이 아직 없습니다.</p>
        )}
      </div>
    </section>
  );
}

function ActionBadge({ action }: { action: NodeHistoryItem['action'] }) {
  const map: Record<NodeHistoryItem['action'], string> = {
    CREATE: 'border-emerald-200 bg-emerald-50/50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400',
    UPDATE: 'border-sky-200 bg-sky-50/50 text-sky-600 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-400',
    MOVE: 'border-amber-200 bg-amber-50/50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-400',
    DELETE: 'border-rose-200 bg-rose-50/50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-400',
    RESTORE: 'border-violet-200 bg-violet-50/50 text-violet-600 dark:border-violet-900/50 dark:bg-violet-950/20 dark:text-violet-400',
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wider ${map[action]}`}>
      {action}
    </span>
  );
}

function renderHistorySummary(action: string, diff: Record<string, any>, actorDisplayName: string): React.ReactNode {
  const actor = actorDisplayName;
  if (action === 'CREATE') {
    return <span>{actor} 님이 새 일정을 생성했습니다.</span>;
  }
  if (action === 'DELETE') {
    return <span>{actor} 님이 일정을 삭제했습니다.</span>;
  }
  if (action === 'RESTORE') {
    return <span>{actor} 님이 삭제된 일정을 복구했습니다.</span>;
  }
  if (action === 'MOVE') {
    return <span>{actor} 님이 일정의 상위(부모) 관계를 이동했습니다.</span>;
  }
  if (action === 'UPDATE') {
    const keys = Object.keys(diff);
    if (keys.includes('progress')) {
      const pDiff = diff['progress'];
      if (pDiff && typeof pDiff === 'object' && 'to' in pDiff && 'from' in pDiff) {
        const fromVal = Number(pDiff.from ?? 0);
        const toVal = Number(pDiff.to ?? 0);
        if (toVal === 100) {
          return (
            <span className="flex items-center gap-1">
              <span>🎉 {actor} 님이 진척율을 100% 완료했습니다!</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">({fromVal}% → 100%)</span>
            </span>
          );
        }
        if (toVal > fromVal) {
          return (
            <span className="flex items-center gap-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[12px]">↗</span>
              <span>{actor} 님이 진척율을 올렸습니다.</span>
              <span className="text-slate-400 dark:text-slate-500 font-mono">({fromVal}% → {toVal}%)</span>
            </span>
          );
        }
        if (toVal < fromVal) {
          return (
            <span className="flex items-center gap-1">
              <span className="text-rose-600 dark:text-rose-400 font-extrabold text-[12px]">↘</span>
              <span>{actor} 님이 진척율을 내렸습니다.</span>
              <span className="text-slate-400 dark:text-slate-500 font-mono">({fromVal}% → {toVal}%)</span>
            </span>
          );
        }
        return <span>{actor} 님이 진척율을 {toVal}%로 수정했습니다.</span>;
      }
    }
    if (keys.includes('title')) {
      return <span>{actor} 님이 일정 제목을 변경했습니다.</span>;
    }
    if (keys.includes('startAt') || keys.includes('endAt')) {
      return <span>{actor} 님이 일정의 기간 범위를 수정했습니다.</span>;
    }
    return <span>{actor} 님이 일정을 수정했습니다.</span>;
  }
  return <span>{actor} 님이 작업 이력을 남겼습니다.</span>;
}

function DiffTooltip({ action, diff }: { action: string; diff: Record<string, any> }) {
  const entries = Object.entries(diff).filter(
    ([, v]) =>
      v !== null &&
      typeof v === 'object' &&
      'from' in (v as object) &&
      'to' in (v as object),
  ) as Array<[string, { from: any; to: any }]>;

  if (entries.length === 0) {
    if (action === 'DELETE') {
      return <p className="text-[10px] text-slate-500">노드가 영구 삭제되었습니다.</p>;
    }
    return <p className="text-[10px] text-slate-500">(변경 세부내역 없음)</p>;
  }

  return (
    <ul className="space-y-1 font-mono text-[10px]">
      {entries.map(([field, ft]) => {
        const fromVal = ft.from === null || ft.from === undefined || ft.from === '' ? '없음' : String(ft.from);
        const toVal = ft.to === null || ft.to === undefined || ft.to === '' ? '없음' : String(ft.to);
        return (
          <li key={field} className="break-words">
            <span className="font-semibold text-slate-500 dark:text-slate-400">{field}:</span>{' '}
            <span className="line-through text-rose-500/70">{fromVal}</span>
            <span className="text-slate-400 mx-1">→</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{toVal}</span>
          </li>
        );
      })}
    </ul>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
