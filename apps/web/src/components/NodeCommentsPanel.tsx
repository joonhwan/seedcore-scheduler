import { useState, type FormEvent, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { CreateCommentDto, type NodeCommentItem } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useAddComment, useComments, useDeleteComment } from '../lib/comments';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

interface Props {
  nodeId: string;
  canPost: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveAndClose?: () => void;
}

export interface NodeCommentsRef {
  submitComment: () => Promise<void>;
  hasContent: () => boolean;
}

export const NodeCommentsPanel = forwardRef<NodeCommentsRef, Props>(function NodeCommentsPanel(
  { nodeId, canPost, onDirtyChange, onSaveAndClose },
  ref
) {
  const comments = useComments(nodeId);
  const add = useAddComment(nodeId);
  const remove = useDeleteComment(nodeId);
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const isAdmin = me.data?.globalRole === 'ADMIN';

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 작성 상태 더티 유무를 부모에게 공유
  useEffect(() => {
    onDirtyChange?.(body.trim().length > 0);
  }, [body, onDirtyChange]);

  // 마운트 시 첫 번째 포커스를 댓글 입력창에 지정
  useEffect(() => {
    if (canPost && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [canPost, nodeId]);

  // 댓글 시간의 역순(최신 댓글이 맨 위로) 가공
  const sortedComments = useMemo(() => {
    return [...(comments.data ?? [])].reverse();
  }, [comments.data]);

  useImperativeHandle(ref, () => ({
    submitComment: async () => {
      if (body.trim().length === 0) return;
      const parsed = CreateCommentDto.safeParse({ body: body.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? '댓글 내용을 입력하세요.');
      }
      await add.mutateAsync(parsed.data);
      setBody('');
    },
    hasContent: () => body.trim().length > 0,
  }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (ref && 'current' in ref && ref.current) {
        await ref.current.submitComment();
      }
    } catch (err: any) {
      setError(err.message || apiErrorMessage(err));
    }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      onSaveAndClose?.();
    }
  }

  async function onRemove(c: NodeCommentItem) {
    const ok = window.confirm('이 댓글을 삭제하시겠습니까?');
    if (!ok) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success('댓글이 삭제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold">댓글</h3>

      {comments.isLoading && <p className="mt-2 text-xs text-slate-500">로딩…</p>}
      {comments.isError && (
        <p className="mt-2 text-xs text-rose-600">{apiErrorMessage(comments.error)}</p>
      )}

      {/* 신규 댓글 입력창을 맨위에 배치 */}
      {canPost && (
        <form onSubmit={onSubmit} className="mt-2 space-y-2">
          <textarea
            ref={textareaRef}
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="댓글을 입력하세요"
            maxLength={4000}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          />
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono select-none">
              Ctrl + Enter: 일괄 저장 후 닫기
            </span>
          </div>
        </form>
      )}

      {/* 댓글 목록 역순 정렬 렌더링 */}
      <div className="mt-3 max-h-[220px] overflow-y-auto pr-1 border border-slate-100 dark:border-slate-800 rounded-lg p-2 bg-slate-50/30 dark:bg-slate-900/10">
        <ul className="space-y-2">
          {sortedComments.map((c) => {
            const isAuthor = me.data?.id === c.authorId;
            const canDelete = isAuthor || (isAdmin && adminMode);
            return (
              <li
                key={c.id}
                className="rounded border border-slate-200 bg-white p-2 text-sm dark:border-slate-700/60 dark:bg-slate-800/50"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {c.authorDisplayName}{' '}
                    <span className="text-slate-400">@{c.authorUsername}</span>
                  </span>
                  <span>{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                {canDelete && (
                  <div className="mt-1 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(c)}
                      className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {sortedComments.length === 0 && (
            <li className="text-xs text-slate-500 text-center py-2">댓글이 아직 없습니다.</li>
          )}
        </ul>
      </div>
    </section>
  );
});

export default NodeCommentsPanel;

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
