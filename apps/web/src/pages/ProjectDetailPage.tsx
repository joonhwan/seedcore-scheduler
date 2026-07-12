import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
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

  const isMutating = useIsMutating({
    mutationKey: ['nodes', id],
  });

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



  return (
    <main className="flex h-full w-full flex-col overflow-hidden px-4 py-3">
      <ProjectHeader
        project={project.data}
        canManage={canManageProject}
        adminMode={adminMode}
        isAdmin={isAdmin}
        nodes={nodes.data ?? []}
      />

      <div className="mt-2.5 flex-1 min-h-0 w-full flex flex-col">
        {/* 단일 열 전체 영역 구성 */}
        <section className="flex-1 min-h-0 flex flex-col min-w-0">
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
              onAddRoot={() => setCreateParent('root')}
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

      {isMutating > 0 && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/30 backdrop-blur-[1.5px] cursor-wait animate-in fade-in duration-200">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-5 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150">
            <svg className="animate-spin h-5 w-5 text-sky-600 dark:text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              일정을 처리 중입니다...
            </span>
          </div>
        </div>
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
  nodes,
}: {
  project: ProjectDetail;
  canManage: boolean;
  adminMode: boolean;
  isAdmin: boolean;
  nodes: NodeTreeItem[];
}) {
  const updateProject = useUpdateProject(project.id);
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  const projectProgress = useMemo(() => {
    const rootNodes = nodes.filter((n) => !n.parentId);
    if (rootNodes.length === 0) return null;

    let sum = 0;
    let count = 0;
    for (const n of rootNodes) {
      const val = n.kind === 'GROUP' ? n.progressEffective : n.progress;
      if (val !== null && val !== undefined) {
        sum += val;
        count += 1;
      }
    }
    return count > 0 ? Math.round(sum / count) : null;
  }, [nodes]);

  async function setStatus(status: ProjectStatus) {
    if (status === 'ARCHIVED') {
      const ok = window.confirm(
        "정말 이 프로젝트를 보관 처리하시겠습니까?\n\n※ 보관된 후에도 화면 우측 상단의 '복원'(되돌리기 화살표 모양 아이콘) 버튼을 클릭하면 언제든지 다시 활성 상태로 원래대로 복구하실 수 있습니다."
      );
      if (!ok) return;
    }
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
    <header className="flex flex-col gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <span>{project.name}</span>
          {projectProgress !== null && (
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80" title="프로젝트 전체 진행률">
              진행률 {projectProgress}%
            </span>
          )}
          {project.status === 'ACTIVE' ? (
            <span className="group flex items-center gap-1 text-emerald-600 dark:text-emerald-400 cursor-help" title="활성 프로젝트">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="max-w-0 overflow-hidden text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 group-hover:max-w-[100px] transition-all duration-300 ease-in-out whitespace-nowrap opacity-0 group-hover:opacity-100">
                활성 상태
              </span>
            </span>
          ) : (
            <span className="group flex items-center gap-1 text-slate-500 dark:text-slate-400 cursor-help" title="보관중인 프로젝트">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="max-w-0 overflow-hidden text-[10px] font-semibold text-slate-500 dark:text-slate-400 group-hover:max-w-[100px] transition-all duration-300 ease-in-out whitespace-nowrap opacity-0 group-hover:opacity-100">
                보관 처리됨
              </span>
            </span>
          )}
        </h1>
        {project.description && (
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{project.description}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Link
          to={`/projects/${project.id}/members`}
          className="p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          title={`멤버 관리 (내 역할: ${project.myRole ?? '비멤버 (ADMIN 우회)'} · 멤버 ${project.memberCount}명)`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </Link>
        {canManage && project.status === 'ACTIVE' && (
          <button
            type="button"
            onClick={() => setStatus('ARCHIVED')}
            className="p-1.5 rounded-md border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 dark:text-amber-300 transition-colors"
            title="프로젝트 보관 처리"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </button>
        )}
        {canManage && project.status === 'ARCHIVED' && (
          <button
            type="button"
            onClick={() => setStatus('ACTIVE')}
            className="p-1.5 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 dark:text-emerald-300 transition-colors"
            title="프로젝트 활성 상태로 복원"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
        )}
        {showDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 dark:border-rose-800/80 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 dark:text-rose-300 transition-colors"
            title="프로젝트 영구 삭제"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}
