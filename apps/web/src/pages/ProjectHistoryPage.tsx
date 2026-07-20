import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  classifyChange,
  type HistoryRange,
  type HistoryTopic,
  type ProjectHistoryEntry,
  type ProjectHistoryQuery,
} from '@sam/shared';
import { useProjectHistory } from '../lib/projectHistory';
import { apiErrorMessage } from '../lib/errors';
import { KIND_STYLE, historyLabelText, formatDateTime } from '../lib/historyView';

const TOPICS: { value: HistoryTopic; label: string }[] = [
  { value: 'ALL', label: '모든 이력' },
  { value: 'PROGRESS_DOWN', label: '진행률 낮춤' },
  { value: 'DELETED', label: '삭제됨' },
  { value: 'PERIOD_CHANGE', label: '기간 변경' },
  { value: 'COMMENTS', label: '댓글' },
];

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '1w', label: '지난 1주' },
  { value: '1m', label: '지난 1달' },
  { value: 'custom', label: '직접 범위' },
];

export default function ProjectHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const [topic, setTopic] = useState<HistoryTopic>('ALL');
  const [range, setRange] = useState<HistoryRange>('1m');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query: ProjectHistoryQuery =
    range === 'custom' ? { topic, range, from, to } : { topic, range };
  const ready = range !== 'custom' || (!!from && !!to && from <= to);
  const q = useProjectHistory(ready ? id : undefined, query);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">이력 조회</h1>
        <Link to={`/projects/${id}`} className="text-sm text-sky-600 hover:underline">
          ← 프로젝트로
        </Link>
      </div>

      {/* 기간 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.value} type="button" onClick={() => setRange(r.value)} className={chip(range === r.value)}>
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <span className="flex items-center gap-1 text-sm">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={DATE_INPUT} />
            <span className="text-slate-400">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={DATE_INPUT} />
          </span>
        )}
      </div>

      {/* 주제 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTopic(t.value)} className={chip(topic === t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      {range === 'custom' && !ready && (
        <p className="text-xs text-slate-500">시작일과 종료일을 올바르게 선택하세요.</p>
      )}
      {q.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
      {q.isError && <p className="text-sm text-rose-600">{apiErrorMessage(q.error)}</p>}

      {q.data && (
        <>
          {q.data.truncated && (
            <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              최근 500건만 표시했습니다. 기간을 좁혀 보세요.
            </p>
          )}
          {q.data.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">이 기간에 해당하는 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {q.data.items.map((item) => (
                <Row key={`${item.type}-${item.id}`} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Row({ item }: { item: ProjectHistoryEntry }) {
  let icon: string;
  let strip: string;
  let text: string;
  let label: string;
  let who: string;
  let when: string;

  if (item.type === 'COMMENT') {
    icon = '💬';
    strip = 'bg-sky-400';
    text = 'text-sky-600 dark:text-sky-400';
    label = item.body;
    who = item.authorDisplayName;
    when = item.createdAt;
  } else {
    const s = KIND_STYLE[classifyChange(item.action, item.diff)];
    icon = s.icon;
    strip = s.strip;
    text = s.text;
    label = historyLabelText(item.action, item.diff);
    who = item.actorDisplayName;
    when = item.occurredAt;
  }

  return (
    <li className="flex items-stretch overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
      <span className={`w-1 shrink-0 ${strip}`} aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
        <span className={`shrink-0 ${text}`}>{icon}</span>
        <span className="truncate text-slate-700 dark:text-slate-200">{label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
          <span className={item.nodeDeleted ? 'text-slate-400 line-through' : 'text-slate-500'}>
            "{item.nodeTitle}"
          </span>
          {item.nodeDeleted && (
            <span className="rounded border border-slate-300 px-1 text-[10px] text-slate-500 dark:border-slate-700">
              삭제됨
            </span>
          )}
          <span>
            · {who} · {formatDateTime(when)}
          </span>
        </span>
      </div>
    </li>
  );
}

const CHIP_BASE = 'rounded-full border px-3 py-1 text-xs transition-colors';
function chip(active: boolean): string {
  return active
    ? `${CHIP_BASE} border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300`
    : `${CHIP_BASE} border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`;
}
const DATE_INPUT = 'rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900';
