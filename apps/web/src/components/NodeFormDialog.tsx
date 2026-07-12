import { useState, type FormEvent, useEffect } from 'react';
import { CreateNodeDto, type NodeKind, type NodeTreeItem } from '@sam/shared';
import { useCreateNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { FolderIcon, ItemIcon } from './Icons';

interface Props {
  projectId: string;
  parent: NodeTreeItem | null; // null = 루트 추가
  onClose: () => void;
  onCreated: (node: NodeTreeItem) => void;
}

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export default function NodeFormDialog({ projectId, parent, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<NodeKind>(parent ? 'ITEM' : 'GROUP');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const todayStr = getTodayString();
  const [startAt, setStartAt] = useState(todayStr);
  const [endAt, setEndAt] = useState(todayStr);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateNode(projectId);

  // ESC 단축키 바인딩
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleStartAtChange = (val: string) => {
    setStartAt(val);
    if (val && (!endAt || endAt < val)) {
      setEndAt(val);
    }
  };

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
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          {parent ? `"${parent.title}" 의 자식 노드 추가` : '최상단 항목 추가'}
        </h2>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          {/* GROUP / ITEM 라디오 선택 영역 (아이콘 매핑) */}
          <div className="flex gap-4 text-sm font-medium py-1">
            <label className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 bg-white dark:bg-slate-900">
              <input
                type="radio"
                name="kind"
                value="ITEM"
                checked={kind === 'ITEM'}
                onChange={() => setKind('ITEM')}
                className="accent-sky-600"
              />
              <ItemIcon className="w-4 h-4 ml-0.5" />
              <span className="text-slate-700 dark:text-slate-300">ITEM (일정)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 bg-white dark:bg-slate-900">
              <input
                type="radio"
                name="kind"
                value="GROUP"
                checked={kind === 'GROUP'}
                onChange={() => setKind('GROUP')}
                className="accent-violet-600"
              />
              <FolderIcon className="w-4 h-4 ml-0.5" />
              <span className="text-slate-700 dark:text-slate-300">GROUP (그룹)</span>
            </label>
          </div>

          <label className="block text-sm">
            <span className="block text-slate-700 dark:text-slate-300">제목 *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
              required
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
          </label>

          <label className="block text-sm">
            <span className="block text-slate-700 dark:text-slate-300">설명</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />
          </label>

          {kind === 'ITEM' && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label>
                <span className="block text-slate-700 dark:text-slate-300">시작일</span>
                <input
                  type="date"
                  value={startAt}
                  onChange={(e) => handleStartAtChange(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                />
              </label>
              <label>
                <span className="block text-slate-700 dark:text-slate-300">종료일</span>
                <input
                  type="date"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
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
              className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
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
