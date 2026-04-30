import { useState, type FormEvent } from 'react';
import { CreateCommentDto, type NodeCommentItem } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useAddComment, useComments, useDeleteComment } from '../lib/comments';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

interface Props {
  nodeId: string;
  canPost: boolean;
}

export default function NodeCommentsPanel({ nodeId, canPost }: Props) {
  const comments = useComments(nodeId);
  const add = useAddComment(nodeId);
  const remove = useDeleteComment(nodeId);
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const isAdmin = me.data?.globalRole === 'ADMIN';

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = CreateCommentDto.safeParse({ body: body.trim() });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '댓글 내용을 입력하세요.');
      return;
    }
    try {
      await add.mutateAsync(parsed.data);
      setBody('');
    } catch (err) {
      setError(apiErrorMessage(err));
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

      <ul className="mt-2 space-y-2">
        {comments.data?.map((c) => {
          const isAuthor = me.data?.id === c.authorId;
          const canDelete = isAuthor || (isAdmin && adminMode);
          return (
            <li
              key={c.id}
              className="rounded border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-800/50"
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
        {comments.data && comments.data.length === 0 && (
          <li className="text-xs text-slate-500">댓글이 아직 없습니다.</li>
        )}
      </ul>

      {canPost && (
        <form onSubmit={onSubmit} className="mt-3 space-y-2">
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="댓글을 입력하세요"
            maxLength={4000}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={add.isPending || body.trim().length === 0}
              className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {add.isPending ? '작성 중…' : '작성'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
