import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useUpdateProject } from './projects';
import { apiErrorMessage } from './errors';
import { toast } from './toast';
import { canSubmitProjectName, normalizeProjectName } from './projectName';

/**
 * 프로젝트 명칭 인라인 편집 로직
 * (docs/superpowers/specs/2026-08-01-project-list-ui-design.md §5)
 *
 * 상세 화면 헤더(ProjectNameEditor)와 목록 셀(ProjectNameCell)이 겉모습만 다르고
 * 동작은 같아서, 로직을 여기로 내리고 껍데기를 둘로 나눴다.
 * 권한 판단은 하지 않는다. 호출부가 연필 버튼을 그릴지 말지 결정한다.
 */

/**
 * 편집에 필요한 최소 정보.
 *
 * ProjectDetail 과 ProjectListItem 양쪽이 이 세 필드를 모두 갖고 있어
 * (ProjectDetail = ProjectListItem.extend({ createdById }), packages/shared)
 * 두 화면이 같은 훅을 쓸 수 있다.
 */
export interface ProjectNameTarget {
  id: string;
  name: string;
  updatedAt: string;
}

export interface ProjectNameEdit {
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  canSubmit: boolean;
  pending: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  submit: () => Promise<void>;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function useProjectNameEdit(project: ProjectNameTarget): ProjectNameEdit {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateProject = useUpdateProject(project.id);

  // 편집 진입 시 자동 포커스 + 전체 선택
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const startEdit = () => {
    setDraft(project.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(project.name);
  };

  const canSubmit = canSubmitProjectName(draft, project.name);

  const submit = async () => {
    if (!canSubmit || updateProject.isPending) return;
    try {
      await updateProject.mutateAsync({
        // 앞뒤 공백은 버리고 저장한다. 서버는 trim 하지 않는다.
        name: normalizeProjectName(draft),
        expectedUpdatedAt: project.updatedAt,
      });
      setEditing(false);
      toast.success('프로젝트 명칭이 변경되었습니다.');
    } catch (err) {
      // 409 를 포함해 실패 시에는 편집 모드를 유지한다. 방금 친 이름을 잃지 않게 하기 위함.
      // apiErrorMessage 가 409 를 CONFLICT 안내 문구로 바꿔 준다 (lib/errors.ts:36).
      toast.error(apiErrorMessage(err, '명칭 변경에 실패했습니다.'));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    canSubmit,
    pending: updateProject.isPending,
    startEdit,
    cancelEdit,
    submit,
    handleKeyDown,
  };
}
