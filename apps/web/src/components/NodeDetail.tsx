import { useEffect, useState, type FormEvent, forwardRef, useImperativeHandle } from 'react';
import type { NodeTreeItem, UpdateNodeDto } from '@sam/shared';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { useUpdateNode } from '../lib/nodes';
import { FolderIcon, ItemIcon, PencilIcon } from './Icons';
import AutocompleteInput from './AutocompleteInput';

interface Props {
  projectId: string;
  node: NodeTreeItem;
  canEdit: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveSuccess?: () => void;
}

export interface NodeDetailRef {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

export const NodeDetail = forwardRef<NodeDetailRef, Props>(function NodeDetail(
  { projectId, node, canEdit, onDirtyChange, onSaveSuccess },
  ref
) {
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? '');
  const [startAt, setStartAt] = useState(node.startAt ?? '');
  const [endAt, setEndAt] = useState(node.endAt ?? '');
  const [progress, setProgress] = useState(node.progress);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  
  const update = useUpdateNode(projectId);
  const isGroup = node.kind === 'GROUP';

  useEffect(() => {
    setTitle(node.title);
    setDescription(node.description ?? '');
    setStartAt(node.startAt ?? '');
    setEndAt(node.endAt ?? '');
    setProgress(node.progress);
    setError(null);
    setIsEditingTitle(false);
  }, [node.id, node.updatedAt]);

  const handleStartAtChange = (val: string) => {
    setStartAt(val);
    if (val && endAt && val > endAt) {
      setEndAt(val);
    }
  };

  const handleEndAtChange = (val: string) => {
    setEndAt(val);
    if (val && startAt && val < startAt) {
      setStartAt(val);
    }
  };

  useEffect(() => {
    if (!canEdit || isGroup) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === ',' || e.key === '.' || e.key === '/')) {
        e.preventDefault();
        if (e.key === ',') {
          setProgress((prev) => Math.max(0, prev - 10));
        } else if (e.key === '.') {
          setProgress((prev) => Math.min(100, prev + 10));
        } else if (e.key === '/') {
          setProgress(100);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEdit, isGroup]);

  const dirty =
    title !== node.title ||
    description !== (node.description ?? '') ||
    (!isGroup && startAt !== (node.startAt ?? '')) ||
    (!isGroup && endAt !== (node.endAt ?? '')) ||
    (!isGroup && progress !== node.progress);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    save: async () => {
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
        throw new Error('시작일은 종료일보다 작거나 같아야 합니다.');
      }

      await update.mutateAsync({ id: node.id, body });
      onSaveSuccess?.();
    },
    isDirty: () => dirty,
  }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dirty) return;

    try {
      if (ref && 'current' in ref && ref.current) {
        await ref.current.save();
        toast.success('저장되었습니다.');
      }
    } catch (err: any) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* 아이콘 + 제목 + 인라인 편집 구성 (우측 상단 ✕ 닫기 버튼 침범 방지를 위해 pr-10 추가) */}
      <div className="flex items-center gap-3 py-1 min-h-[40px] pr-10">
        {isEditingTitle && canEdit ? (
          <div className="flex flex-1 items-center gap-2">
            {isGroup ? <FolderIcon className="w-6 h-6" /> : <ItemIcon className="w-6 h-6" />}
            <AutocompleteInput
              kind={node.kind as 'GROUP' | 'ITEM'}
              value={title}
              onChange={setTitle}
              maxLength={256}
              required
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (title.trim() !== '') {
                    setIsEditingTitle(false);
                  } else {
                    toast.error('제목은 필수입니다.');
                  }
                }
              }}
              className="flex-1 min-w-0 rounded border border-slate-300 bg-white px-3 py-1.5 text-base font-bold dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => {
                if (title.trim() === '') {
                  toast.error('제목은 필수입니다.');
                  return;
                }
                setIsEditingTitle(false);
              }}
              className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 shrink-0"
            >
              확인
            </button>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2 min-w-0">
            {isGroup ? <FolderIcon className="w-6 h-6" /> : <ItemIcon className="w-6 h-6" />}
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate max-w-[300px] sm:max-w-[350px]" title={title}>
              {title}
            </h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => setIsEditingTitle(true)}
                title="제목 편집"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors shrink-0"
                aria-label="제목 편집"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

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
                onChange={(e) => handleStartAtChange(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                disabled={!canEdit}
              />
            </Field>
            <Field label="종료일">
              <input
                type="date"
                value={endAt}
                onChange={(e) => handleEndAtChange(e.target.value)}
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
              {canEdit && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1.5 select-none">
                  <span>단축키: Ctrl + 쉼표(,) -10%  |  Ctrl + 마침표(.) +10%  |  Ctrl + 슬래시(/) 100% 완료</span>
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

    </form>
  );
});

export default NodeDetail;

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
