import { useEffect, useState, type FormEvent } from 'react';
import type { NodeTreeItem, UpdateNodeDto } from '@sam/shared';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { useUpdateNode } from '../lib/nodes';

interface Props {
  projectId: string;
  node: NodeTreeItem;
  canEdit: boolean;
}

export default function NodeDetail({ projectId, node, canEdit }: Props) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? '');
  const [startAt, setStartAt] = useState(node.startAt ?? '');
  const [endAt, setEndAt] = useState(node.endAt ?? '');
  const [progress, setProgress] = useState(node.progress);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateNode(projectId);
  const isGroup = node.kind === 'GROUP';

  useEffect(() => {
    setTitle(node.title);
    setDescription(node.description ?? '');
    setStartAt(node.startAt ?? '');
    setEndAt(node.endAt ?? '');
    setProgress(node.progress);
    setError(null);
  }, [node.id, node.updatedAt]);

  const dirty =
    title !== node.title ||
    description !== (node.description ?? '') ||
    (!isGroup && startAt !== (node.startAt ?? '')) ||
    (!isGroup && endAt !== (node.endAt ?? '')) ||
    (!isGroup && progress !== node.progress);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dirty) return;

    const body: UpdateNodeDto = { expectedUpdatedAt: node.updatedAt };
    if (title !== node.title) body.title = title.trim();
    if (description !== (node.description ?? '')) {
      body.description = description.trim() === '' ? null : description.trim();
    }
    if (!isGroup) {
      if (startAt !== (node.startAt ?? '')) body.startAt = startAt === '' ? null : startAt;
      if (endAt !== (node.endAt ?? '')) body.endAt = endAt === '' ? null : endAt;
      if (progress !== node.progress) body.progress = progress;
    }
    if (startAt && endAt && startAt > endAt) {
      setError('시작일은 종료일보다 작거나 같아야 합니다.');
      return;
    }

    try {
      await update.mutateAsync({ id: node.id, body });
      toast.success('저장되었습니다.');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{isGroup ? 'GROUP 노드' : 'ITEM 노드'}</h2>
        <span className="text-xs text-slate-500">depth {node.depth} · sortOrder {node.sortOrder}</span>
      </div>

      <Field label="제목 *">
        <input
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={256}
          required
          disabled={!canEdit}
        />
      </Field>

      <Field label="설명">
        <textarea
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          disabled={!canEdit}
        />
      </Field>

      {isGroup ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작일 (집계)">
              <input
                type="text"
                readOnly
                value={node.startAtEffective ?? '—'}
                className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              />
            </Field>
            <Field label="종료일 (집계)">
              <input
                type="text"
                readOnly
                value={node.endAtEffective ?? '—'}
                className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              />
            </Field>
          </div>
          <Field label="진행율 (자손 ITEM 평균)">
            <ProgressReadOnly value={node.progressEffective} />
          </Field>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="시작일">
              <input
                type="date"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                disabled={!canEdit}
              />
            </Field>
            <Field label="종료일">
              <input
                type="date"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                disabled={!canEdit}
              />
            </Field>
          </div>
          <Field label={`진행율 — ${progress}%`}>
            <div className="flex flex-col gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(parseInt(e.target.value, 10))}
                disabled={!canEdit}
                className="w-full accent-sky-600 disabled:opacity-50"
              />
              {canEdit && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setProgress((prev) => Math.max(0, prev - 10))}
                    className="flex-1 rounded border border-slate-300 bg-white py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    -10%
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress((prev) => Math.min(100, prev + 10))}
                    className="flex-1 rounded border border-slate-300 bg-white py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    +10%
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgress(100)}
                    className="rounded border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300 dark:hover:bg-sky-900"
                  >
                    100% 완료
                  </button>
                </div>
              )}
            </div>
          </Field>
        </>
      )}

      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!dirty || update.isPending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {update.isPending ? '저장 중…' : '저장'}
          </button>
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block text-slate-700 dark:text-slate-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ProgressReadOnly({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="text-xs text-slate-500 dark:text-slate-400">
        자손 ITEM 이 없어 산출되지 않습니다.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full bg-sky-600"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-12 text-right font-mono text-sm">{value}%</span>
    </div>
  );
}
