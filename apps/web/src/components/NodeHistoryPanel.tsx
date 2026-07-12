import type { NodeHistoryItem } from '@sam/shared';
import { useNodeHistory } from '../lib/history';
import { apiErrorMessage } from '../lib/errors';

interface Props {
  nodeId: string;
}

export default function NodeHistoryPanel({ nodeId }: Props) {
  const history = useNodeHistory(nodeId);

  return (
    <section>
      <h3 className="text-sm font-semibold">이력</h3>
      {history.isLoading && <p className="mt-2 text-xs text-slate-500">로딩…</p>}
      {history.isError && (
        <p className="mt-2 text-xs text-rose-600">{apiErrorMessage(history.error)}</p>
      )}
      <div className="mt-2 max-h-[220px] overflow-y-auto pr-1 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50/30 dark:bg-slate-900/10">
        <ul className="space-y-2">
          {history.data?.map((h) => (
            <li
              key={h.id}
              className="rounded border border-slate-200 bg-white p-2 text-xs dark:border-slate-700/60 dark:bg-slate-800/50"
            >
              <div className="flex items-baseline justify-between gap-2 text-slate-500">
                <span>
                  <ActionBadge action={h.action} />{' '}
                  <span className="text-slate-700 dark:text-slate-300">
                    {h.actorDisplayName}
                  </span>{' '}
                  <span className="text-slate-400">@{h.actorUsername}</span>
                </span>
                <span>{formatDateTime(h.occurredAt)}</span>
              </div>
              <DiffBlock action={h.action} diff={h.diff} />
            </li>
          ))}
          {history.data && history.data.length === 0 && (
            <li className="text-xs text-slate-500 text-center py-2">이력이 없습니다.</li>
          )}
        </ul>
      </div>
      {history.data && history.data.length >= 200 && (
        <p className="mt-2 text-[10px] text-slate-400">
          최근 200건만 표시됩니다.
        </p>
      )}
    </section>
  );
}

function ActionBadge({ action }: { action: NodeHistoryItem['action'] }) {
  const map: Record<NodeHistoryItem['action'], string> = {
    CREATE: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    UPDATE: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
    MOVE: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    DELETE: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
    RESTORE: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${map[action]}`}>
      {action}
    </span>
  );
}

function DiffBlock({
  action,
  diff,
}: {
  action: NodeHistoryItem['action'];
  diff: Record<string, unknown>;
}) {
  const entries = Object.entries(diff).filter(
    ([, v]) =>
      v !== null &&
      typeof v === 'object' &&
      'from' in (v as object) &&
      'to' in (v as object),
  ) as Array<[string, { from: unknown; to: unknown }]>;

  if (entries.length === 0) {
    if (action === 'DELETE') {
      return (
        <p className="mt-1 text-[11px] text-slate-500">노드가 삭제되었습니다.</p>
      );
    }
    return <p className="mt-1 text-[11px] text-slate-500">(변경 없음)</p>;
  }

  if (action === 'CREATE') {
    return (
      <ul className="mt-1 space-y-0.5">
        {entries
          .filter(([, ft]) => ft.to !== null && ft.to !== undefined)
          .map(([field, ft]) => (
            <li key={field} className="text-[11px]">
              <span className="text-slate-500">{field}:</span>{' '}
              <span className="text-slate-800 dark:text-slate-200">
                {formatVal(ft.to)}
              </span>
            </li>
          ))}
      </ul>
    );
  }

  return (
    <ul className="mt-1 space-y-0.5">
      {entries.map(([field, fromTo]) => (
        <li key={field} className="text-[11px]">
          <span className="text-slate-500">{field}:</span>{' '}
          <span className="text-rose-600 line-through dark:text-rose-400">
            {formatVal(fromTo.from)}
          </span>{' '}
          →{' '}
          <span className="text-emerald-700 dark:text-emerald-300">
            {formatVal(fromTo.to)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
