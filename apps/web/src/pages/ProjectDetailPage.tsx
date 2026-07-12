import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import type { NodeTreeItem, ProjectDetail, ProjectStatus } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import {
  useProject,
  useDeleteProject,
  useUpdateProject,
} from '../lib/projects';
import { useNodes, useDeleteNode, useMoveNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import NodeDetail from '../components/NodeDetail';
import NodeFormDialog from '../components/NodeFormDialog';
import ParentPickerDialog from '../components/ParentPickerDialog';
import NodeCommentsPanel from '../components/NodeCommentsPanel';
import NodeHistoryPanel from '../components/NodeHistoryPanel';
import Timeline, { type TimelineUnit } from '../components/Timeline';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();

  const project = useProject(id);
  const nodes = useNodes(id);
  const deleteNode = useDeleteNode(id ?? '');
  const moveNode = useMoveNode(id ?? '');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createParent, setCreateParent] = useState<NodeTreeItem | null | 'root'>(
    null,
  );
  const [pickParentFor, setPickParentFor] = useState<NodeTreeItem | null>(null);
  const [unit, setUnit] = useState<TimelineUnit>('week');
  const [todayCounter, setTodayCounter] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDetailDirty, setIsDetailDirty] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const detailFormRef = useRef<HTMLFormElement>(null);
  const isSaveAndCloseActionRef = useRef(false);

  const handleSelectNode = (nodeId: string | null) => {
    setSelectedId(nodeId);
    isSaveAndCloseActionRef.current = false;
    if (nodeId) {
      setIsDetailModalOpen(true);
    } else {
      setIsDetailModalOpen(false);
      setIsDetailDirty(false);
      setShowConfirmClose(false);
    }
  };

  const attemptCloseDetail = () => {
    if (isDetailDirty) {
      setShowConfirmClose(true);
    } else {
      handleSelectNode(null);
    }
  };

  const handleSaveAndClose = () => {
    isSaveAndCloseActionRef.current = true;
    if (detailFormRef.current) {
      detailFormRef.current.requestSubmit();
    }
    setShowConfirmClose(false);
  };

  const handleSaveSuccess = () => {
    if (isSaveAndCloseActionRef.current) {
      handleSelectNode(null);
    }
    isSaveAndCloseActionRef.current = false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedId && isDetailModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (showConfirmClose) {
            setShowConfirmClose(false);
          } else {
            attemptCloseDetail();
          }
        } else if (e.key === 'Enter') {
          if (showConfirmClose) {
            e.preventDefault();
            handleSaveAndClose();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId, isDetailModalOpen, isDetailDirty, showConfirmClose]);

  const isAdmin = me.data?.globalRole === 'ADMIN';
  const myRole = project.data?.myRole ?? null;
  const canManageProject = myRole === 'MANAGER' || (isAdmin && adminMode);
  const canEditNodes =
    myRole === 'MANAGER' || myRole === 'MEMBER' || (isAdmin && adminMode);

  const selected = useMemo(
    () => (nodes.data && selectedId ? nodes.data.find((n) => n.id === selectedId) ?? null : null),
    [nodes.data, selectedId],
  );

  if (project.isLoading || nodes.isLoading) {
    return <div className="p-6 text-sm text-slate-500">로딩…</div>;
  }
  if (project.isError) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-rose-600">{apiErrorMessage(project.error)}</p>
        <Link to="/" className="mt-3 inline-block text-sm text-sky-600 underline">
          ← 프로젝트 목록
        </Link>
      </main>
    );
  }
  if (!project.data || !id) return null;

  async function onMoveSibling(node: NodeTreeItem, direction: -1 | 1) {
    const siblings =
      nodes.data?.filter((n) => n.parentId === node.parentId).sort((a, b) => a.sortOrder - b.sortOrder) ?? [];
    const idx = siblings.findIndex((n) => n.id === node.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;
    const target = siblings[targetIdx];
    if (!target) return;
    const targetSortOrder = target.sortOrder;
    try {
      await moveNode.mutateAsync({
        id: node.id,
        body: {
          newParentId: node.parentId,
          newSortOrder: targetSortOrder,
          expectedUpdatedAt: node.updatedAt,
        },
      });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onDeleteNode(node: NodeTreeItem) {
    const childCount =
      nodes.data?.filter(
        (n) => n.id !== node.id && isDescendant(nodes.data!, n.id, node.id),
      ).length ?? 0;
    const ok = window.confirm(
      childCount > 0
        ? `"${node.title}" 와 하위 노드 ${childCount}개를 삭제합니다. 계속할까요?`
        : `"${node.title}" 노드를 삭제합니다. 계속할까요?`,
    );
    if (!ok) return;
    try {
      await deleteNode.mutateAsync(node.id);
      if (selectedId === node.id) handleSelectNode(null);
      toast.success('노드가 삭제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    const parent = document.getElementById('app-main-content');
    if (parent) {
      parent.classList.remove('overflow-y-auto');
      parent.classList.add('overflow-hidden');
    }
    return () => {
      if (parent) {
        parent.classList.remove('overflow-hidden');
        parent.classList.add('overflow-y-auto');
      }
    };
  }, []);

  return (
    <main className="flex h-full w-full flex-col overflow-hidden px-6 py-6">
      <ProjectHeader
        project={project.data}
        canManage={canManageProject}
        adminMode={adminMode}
        isAdmin={isAdmin}
      />

      <div className="mt-6 flex-1 min-h-0 w-full flex flex-col">
        {/* 단일 열 전체 영역 구성 */}
        <section className="flex-1 min-h-0 flex flex-col space-y-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-1 rounded border border-slate-300 p-0.5 dark:border-slate-700">
              {(['day', 'week', 'month', 'quarter'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`rounded px-2 py-1 text-xs ${
                    unit === u
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {u === 'day' ? '일' : u === 'week' ? '주' : u === 'month' ? '월' : '분기'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {canEditNodes && (
                <button
                  type="button"
                  onClick={() => setCreateParent('root')}
                  className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  + 루트 노드 추가
                </button>
              )}
              <button
                type="button"
                onClick={() => setTodayCounter((n) => n + 1)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                오늘로 이동
              </button>
              <span className="text-[11px] text-slate-500">
                노드 {nodes.data?.length ?? 0}개
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 w-full flex flex-col">
            <Timeline
              items={nodes.data ?? []}
              unit={unit}
              onUnitChange={setUnit}
              selectedId={selectedId}
              onSelect={handleSelectNode}
              jumpToTodayCounter={todayCounter}
              canEdit={canEditNodes}
              onAddChild={(p) => setCreateParent(p)}
              onAddSibling={(s) => {
                const parentNode = s.parentId
                  ? (nodes.data ?? []).find((n) => n.id === s.parentId) ?? null
                  : null;
                setCreateParent(parentNode ?? 'root');
              }}
              onMoveSibling={onMoveSibling}
              onChangeParent={(n) => setPickParentFor(n)}
              onDelete={onDeleteNode}
            />
          </div>
        </section>
      </div>

      {/* 노드 상세 및 편집용 모달 대화상자 (모든 해상도에서 공통 사용) */}
      {selected && isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-150">
            <button
              type="button"
              onClick={attemptCloseDetail}
              className="absolute right-4 top-4 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 p-1.5 transition-colors"
              aria-label="닫기"
            >
              <span className="text-xl font-bold">✕</span>
            </button>
            <div className="mt-2 space-y-6">
              <NodeDetail
                projectId={id}
                node={selected}
                canEdit={canEditNodes}
                onDirtyChange={setIsDetailDirty}
                formRef={detailFormRef}
                onSaveSuccess={handleSaveSuccess}
              />
              <NodeCommentsPanel nodeId={selected.id} canPost={canEditNodes} />
              <NodeHistoryPanel nodeId={selected.id} />
            </div>
          </div>
        </div>
      )}

      {/* 변경사항 유실 경고 모달 대화상자 */}
      {showConfirmClose && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-100">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              저장하지 않은 변경사항이 있습니다.
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              편집 중인 내용이 저장되지 않았습니다. 어떻게 진행하시겠습니까?
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmClose(false);
                  setIsDetailDirty(false); // 더티 플래그 강제 리셋
                  handleSelectNode(null); // 편집 모달 닫기
                }}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                그냥 닫기 (변경사항 파기)
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmClose(false)} // 닫기 취소 (대화상자만 꺼짐)
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                닫기 취소 (계속 편집)
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
              >
                저장하고 닫기 (Enter)
              </button>
            </div>
          </div>
        </div>
      )}

      {createParent !== null && (
        <NodeFormDialog
          projectId={id}
          parent={createParent === 'root' ? null : createParent}
          onClose={() => setCreateParent(null)}
          onCreated={(n) => handleSelectNode(n.id)}
        />
      )}
      {pickParentFor && nodes.data && (
        <ParentPickerDialog
          projectId={id}
          items={nodes.data}
          node={pickParentFor}
          onClose={() => setPickParentFor(null)}
        />
      )}
    </main>
  );
}

function isDescendant(items: NodeTreeItem[], candidateId: string, ancestorId: string): boolean {
  if (candidateId === ancestorId) return true;
  let cur = items.find((n) => n.id === candidateId);
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = items.find((n) => n.id === cur!.parentId);
  }
  return false;
}

function ProjectHeader({
  project,
  canManage,
  adminMode,
  isAdmin,
}: {
  project: ProjectDetail;
  canManage: boolean;
  adminMode: boolean;
  isAdmin: boolean;
}) {
  const updateProject = useUpdateProject(project.id);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  async function setStatus(status: ProjectStatus) {
    try {
      await updateProject.mutateAsync({
        status,
        expectedUpdatedAt: project.updatedAt,
      });
      toast.success(status === 'ARCHIVED' ? '보관 처리되었습니다.' : '복원되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  async function onDelete() {
    const ok = window.confirm(
      `"${project.name}" 프로젝트를 영구 삭제합니다. 모든 노드/이력이 함께 삭제됩니다. 계속할까요?`,
    );
    if (!ok) return;
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success('프로젝트가 삭제되었습니다.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  const showDelete = isAdmin && adminMode && project.status === 'ARCHIVED';

  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Link to="/" className="text-xs text-slate-500 hover:underline">
          ← 프로젝트 목록
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-bold">
          <span>{project.name}</span>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
              project.status === 'ACTIVE'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {project.status === 'ACTIVE' ? '활성' : '보관'}
          </span>
        </h1>
        {project.description && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{project.description}</p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          내 역할: {project.myRole ?? '비멤버 (ADMIN 우회)'} · 멤버 {project.memberCount}명
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          to={`/projects/${project.id}/members`}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          멤버 관리
        </Link>
        {canManage && project.status === 'ACTIVE' && (
          <button
            type="button"
            onClick={() => setStatus('ARCHIVED')}
            className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            보관 처리
          </button>
        )}
        {canManage && project.status === 'ARCHIVED' && (
          <button
            type="button"
            onClick={() => setStatus('ACTIVE')}
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            복원
          </button>
        )}
        {showDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
          >
            영구 삭제
          </button>
        )}
      </div>
    </header>
  );
}
