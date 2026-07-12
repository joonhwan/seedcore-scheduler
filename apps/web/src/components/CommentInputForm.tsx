import { useState, type FormEvent, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { CreateCommentDto } from '@sam/shared';
import { useAddComment } from '../lib/comments';
import { apiErrorMessage } from '../lib/errors';

interface Props {
  nodeId: string;
  canPost: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveAndClose?: () => void;
}

export interface CommentInputFormRef {
  submitComment: () => Promise<void>;
  hasContent: () => boolean;
}

export const CommentInputForm = forwardRef<CommentInputFormRef, Props>(function CommentInputForm(
  { nodeId, canPost, onDirtyChange, onSaveAndClose },
  ref
) {
  const add = useAddComment(nodeId);
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
      if (body.trim().length === 0) return;
      const parsed = CreateCommentDto.safeParse({ body: body.trim() });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? '댓글 내용을 입력하세요.');
        return;
      }
      await add.mutateAsync(parsed.data);
      setBody('');
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

  if (!canPost) return null;

  return (
    <div className="mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-4">
      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">작업 완료 댓글 작성</h4>
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          ref={textareaRef}
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="댓글 내용을 입력하여 저장을 완료하세요..."
          maxLength={4000}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
        />
        {error && (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono select-none">
            Ctrl + Enter: 일괄 저장 후 닫기
          </span>
        </div>
      </form>
    </div>
  );
});

export default CommentInputForm;
