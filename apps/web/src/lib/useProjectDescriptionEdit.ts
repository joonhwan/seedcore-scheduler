import { useState, type KeyboardEvent } from 'react';
import { useUpdateProject } from './projects';
import { apiErrorMessage } from './errors';
import { toast } from './toast';

/**
 * 프로젝트 설명 인라인 편집 로직.
 *
 * 목록 셀(ProjectDescriptionCell)과 상세 화면 헤더(ProjectDescriptionEditor)가
 * 겉모습만 다르고 동작은 같아서, 로직을 여기로 내리고 껍데기를 둘로 나눴다.
 * 이름 편집(useProjectNameEdit)과 같은 구조다.
 *
 * 처음에는 목록에서만 쓰여 컴포넌트 안에 두었으나, 상세 화면에도 같은 편집이
 * 생기면서 빼냈다. 따로 두면 한쪽만 고쳐지는 어긋남이 생긴다.
 *
 * 권한 판단은 하지 않는다. 호출부가 연필 버튼을 그릴지 말지 결정한다.
 */

/**
 * 편집에 필요한 최소 정보.
 *
 * ProjectListItem 과 ProjectDetail 양쪽이 이 세 필드를 모두 갖고 있어
 * (ProjectDetail = ProjectListItem.extend({ createdById }), packages/shared)
 * 두 화면이 같은 훅을 쓸 수 있다.
 */
export interface ProjectDescriptionTarget {
  id: string;
  description: string | null;
  updatedAt: string;
}

export interface ProjectDescriptionEdit {
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  pending: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  submit: () => Promise<void>;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function useProjectDescriptionEdit(
  project: ProjectDescriptionTarget,
): ProjectDescriptionEdit {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.description ?? '');
  const updateProject = useUpdateProject(project.id);

  const startEdit = () => {
    setDraft(project.description ?? '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(project.description ?? '');
    setEditing(false);
  };

  const submit = async () => {
    // 이미 저장 중이면 다시 부르지 않는다. 저장을 마치면 편집이 닫히고, 닫히면서
    // 입력창이 사라지며 blur 가 뒤따른다 — 거기서 다시 submit 을 부르면 이미 최신이
    // 된 project.updatedAt 을 모른 채 낡은 값으로 두 번째 요청을 보내 409 로 실패한다.
    // 그래서 blur 로는 저장하지 않고(껍데기에 onBlur 가 없다), 혹시 남는 재호출
    // 경로에 대비해 이 가드도 둔다 (이름 편집과 같은 이유 — useProjectNameEdit.ts).
    if (updateProject.isPending) return;

    const next = draft.trim();
    const before = project.description ?? '';
    if (next === before) {
      setEditing(false);
      return;
    }

    try {
      await updateProject.mutateAsync({
        // 빈 문자열은 "설명 없음" 이므로 null 로 보낸다. 빈 문자열 그대로 보내면
        // 설명이 있는데 내용이 빈 상태가 되어 "지운 것" 과 구별되지 않는다.
        description: next === '' ? null : next,
        expectedUpdatedAt: project.updatedAt,
      });
      setEditing(false);
    } catch (err) {
      // 409 를 포함해 실패 시에는 편집 모드를 유지한다. 방금 쓴 내용을 잃지 않게 하기
      // 위함이다. apiErrorMessage 가 409 를 CONFLICT 안내 문구로 바꿔 준다.
      toast.error(apiErrorMessage(err));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 여러 줄 입력이므로 Enter 는 줄바꿈이다. 저장은 Ctrl+Enter 로 한다.
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return {
    editing,
    draft,
    setDraft,
    pending: updateProject.isPending,
    startEdit,
    cancelEdit,
    submit,
    handleKeyDown,
  };
}
