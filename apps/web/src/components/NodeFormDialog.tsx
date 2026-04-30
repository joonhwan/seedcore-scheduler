import { useState, type FormEvent } from 'react';
import { CreateNodeDto, type NodeKind, type NodeTreeItem } from '@sam/shared';
import { useCreateNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

interface Props {
  projectId: string;
  parent: NodeTreeItem | null; // null = 루트 추가
  onClose: () => void;
  onCreated: (node: NodeTreeItem) => void;
}

export default function NodeFormDialog({ projectId, parent, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<NodeKind>('ITEM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateNode(projectId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      kind,
      parentId: parent?.id ?? null,
      title: title.trim(),
    };
    if (description.trim()) payload.description = description.trim();
    if (kind === 'ITEM') {
      if (startAt) payload.startAt = startAt;
      if (endAt) payload.endAt = endAt;
    }
    const parsed = CreateNodeDto.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.');
      return;
    }

    try {
      const created = await create.mutateAsync(parsed.data);
      toast.success('노드가 생성되었습니다.');
      onCreated(created);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-base font-semibold">
          {parent ? `"${parent.title}" 의 자식 노드 추가` : '루트 노드 추가'}
        </h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="kind"
                value="ITEM"
                checked={kind === 'ITEM'}
                onChange={() => setKind('ITEM')}
              />
              ITEM (일정)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="kind"
                value="GROUP"
                checked={kind === 'GROUP'}
                onChange={() => setKind('GROUP')}
              />
              GROUP (그룹)
            </label>
          </div>

          <label className="block text-sm">
            <span className="block">제목 *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
              required
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <label className="block text-sm">
            <span className="block">설명</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {kind === 'ITEM' && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>
                <span className="block">시작일</span>
                <input
                  type="date"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label>
                <span className="block">종료일</span>
                <input
                  type="date"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>
          )}
          {kind === 'GROUP' && (
            <p className="text-xs text-slate-500">
              GROUP 의 시작/종료일은 자식 ITEM 들로부터 자동 집계됩니다.
            </p>
          )}

          {error && (
            <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {create.isPending ? '생성 중…' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
