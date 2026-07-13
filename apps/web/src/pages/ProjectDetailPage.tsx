import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useIsMutating } from '@tanstack/react-query';
import { MAX_TREE_DEPTH, ImportCsvDto, type NodeTreeItem, type ProjectDetail, type ProjectStatus } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import {
  useProject,
  useDeleteProject,
  useUpdateProject,
  useImportCsv,
} from '../lib/projects';
import { useNodes, useDeleteNode, useMoveNode } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import NodeDetail from '../components/NodeDetail';
import NodeFormDialog from '../components/NodeFormDialog';
import ParentPickerDialog from '../components/ParentPickerDialog';
import CommentInputForm from '../components/CommentInputForm';
import ActivityFeedPanel from '../components/ActivityFeedPanel';
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
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [pickParentFor, setPickParentFor] = useState<NodeTreeItem | null>(null);
  const [unit, setUnit] = useState<TimelineUnit>('week');
  const [todayCounter, setTodayCounter] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDetailDirty, setIsDetailDirty] = useState(false);
  const [isCommentDirty, setIsCommentDirty] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  const detailRef = useRef<any>(null);
  const commentsRef = useRef<any>(null);
  const isSaveAndCloseActionRef = useRef(false);

  const handleSelectNode = (nodeId: string | null) => {
    setSelectedId(nodeId);
    isSaveAndCloseActionRef.current = false;
    if (!nodeId) {
      setIsDetailModalOpen(false);
      setIsDetailDirty(false);
      setIsCommentDirty(false);
      setShowConfirmClose(false);
    }
  };

  const handleEditNode = (nodeId: string) => {
    setSelectedId(nodeId);
    isSaveAndCloseActionRef.current = false;
    setIsDetailModalOpen(true);
  };

  const handleHeaderAddNode = () => {
    if (!selected || selectedId === 'empty-row-placeholder') {
      setCreateParent('root');
    } else if (selected.kind === 'GROUP') {
      if (selected.depth + 1 >= MAX_TREE_DEPTH) {
        toast.error(`최대 깊이(${MAX_TREE_DEPTH}단계)를 초과하여 하위 일정을 생성할 수 없습니다.`);
        return;
      }
      setCreateParent(selected);
    } else {
      const parentNode = selected.parentId
        ? (nodes.data ?? []).find((n) => n.id === selected.parentId) ?? null
        : null;
      setCreateParent(parentNode ?? 'root');
    }
  };

  const attemptCloseDetail = () => {
    const isModalDirty = isDetailDirty || isCommentDirty;
    if (isModalDirty) {
      setShowConfirmClose(true);
    } else {
      setIsDetailModalOpen(false);
    }
  };

  const handleSaveAndClose = async () => {
    isSaveAndCloseActionRef.current = true;
    try {
      // 1. 일정 상세 정보 저장 (변경된 경우에만)
      if (detailRef.current && detailRef.current.isDirty()) {
        await detailRef.current.save();
      }

      // 2. 댓글 작성 (내용이 있는 경우에만)
      if (commentsRef.current && commentsRef.current.hasContent()) {
        await commentsRef.current.submitComment();
      }

      setIsDetailModalOpen(false);
      isSaveAndCloseActionRef.current = false;
    } catch (err: any) {
      toast.error(err.message || apiErrorMessage(err));
    }
    setShowConfirmClose(false);
  };

  const handleSaveSuccess = () => {};

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

  // Ctrl 단축키 처리 (Ctrl-Enter: 편집, Ctrl-I: 추가, Ctrl-D: 삭제)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 상세 편집 모달이 열려있거나 포커스가 입력 필드에 있을 때는 단축키 처리 제외
      if (isDetailModalOpen) return;

      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          tagName === 'select' ||
          activeEl.getAttribute('contenteditable') === 'true'
        ) {
          return;
        }
      }

      if (e.key === 'Enter') {
        if (selected) {
          e.preventDefault();
          handleEditNode(selected.id);
        }
      } else if (e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === 'i') {
          if (canEditNodes) {
            e.preventDefault();
            handleHeaderAddNode();
          }
        } else if (key === 'd') {
          if (selected && canEditNodes) {
            e.preventDefault();
            onDeleteNode(selected);
          }
        }
      } else if (e.key === '?' || (e.key === 'h' && !e.ctrlKey)) {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selected, canEditNodes, isDetailModalOpen, handleHeaderAddNode, onDeleteNode, handleEditNode]);

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
        canEdit={canEditNodes}
        onAddNode={handleHeaderAddNode}
        onToggleHelp={() => setIsHelpOpen((prev) => !prev)}
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
              onEdit={handleEditNode}
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
          <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-150">
            <button
              type="button"
              onClick={attemptCloseDetail}
              className="absolute right-4 top-4 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 p-1.5 transition-colors"
              aria-label="닫기"
            >
              <span className="text-xl font-bold">✕</span>
            </button>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800/80 items-start">
              {/* 좌측 열: NodeDetail & CommentInputForm */}
              <div className="space-y-4">
                <NodeDetail
                  ref={detailRef}
                  projectId={id}
                  node={selected}
                  canEdit={canEditNodes}
                  onDirtyChange={setIsDetailDirty}
                  onSaveSuccess={handleSaveSuccess}
                />
                <CommentInputForm
                  ref={commentsRef}
                  nodeId={selected.id}
                  canPost={canEditNodes}
                  onDirtyChange={setIsCommentDirty}
                  onSaveAndClose={handleSaveAndClose}
                />
              </div>
              {/* 우측 열: 통합 피드 & 변경 이력 */}
              <div className="space-y-6 md:pl-6 pt-6 md:pt-0">
                <ActivityFeedPanel nodeId={selected.id} canEdit={canEditNodes} />
              </div>
            </div>

            {/* 통합 하단 저장/취소 버튼 바 */}
            {canEditNodes && (
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={attemptCloseDetail}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndClose}
                  disabled={!(isDetailDirty || isCommentDirty)}
                  className="rounded-md bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-60 transition-colors"
                >
                  저장
                </button>
              </div>
            )}
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
                  setIsCommentDirty(false); // 댓글 더티 리셋
                  setIsDetailModalOpen(false); // 편집 모달 닫기
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
          onCreated={() => {}}
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

      {/* 화면 하단 미세 단축키 도움말 가이드 */}
      <footer className="mt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1 select-none shrink-0 border-t border-slate-100 pt-2 dark:border-slate-800/80">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span>🖱️ <b>더블클릭/Enter</b>: 편집</span>
          <span>➕ <b>Ctrl+I</b>: 일정 추가</span>
          <span>❌ <b>Ctrl+D</b>: 일정 삭제</span>
          <span>↕️ <b>위/아래 방향키</b>: 탐색</span>
          <span>↔️ <b>좌우 방향키(그룹선택시)</b>: 접기/펴기</span>
        </div>
        <button
          type="button"
          onClick={() => setIsHelpOpen(true)}
          className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-semibold flex items-center gap-0.5 shrink-0"
        >
          도움말 보기 (?)
        </button>
      </footer>

      {/* 키보드 단축키 및 사용법 도움말 모달 */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in-50 duration-100">
          <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-200">
            <button
              type="button"
              onClick={() => setIsHelpOpen(false)}
              className="absolute right-4 top-4 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 p-1.5 transition-colors"
              aria-label="도움말 닫기"
            >
              <span className="text-xl font-bold">✕</span>
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 text-sky-600 dark:text-sky-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
              </svg>
              키보드 단축키 & 사용 가이드
            </h3>
            <div className="mt-4 space-y-3.5 text-xs text-slate-600 dark:text-slate-400 font-normal">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-2 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300">
                <div>동작</div>
                <div className="col-span-2">단축키 / 조작법</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">일정 선택</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">마우스 클릭</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">일정 편집</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">더블클릭</kbd> 또는 <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Enter</kbd></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">새 일정 추가</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Ctrl + I</kbd> 또는 상단 버튼</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">일정 삭제</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Ctrl + D</kbd> (확인 팝업 노출)</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">위/아래 이동</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">↑</kbd> / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">↓</kbd> 화살표 키</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">그룹 접기/펴기</div>
                <div className="col-span-2">선택된 그룹에서 <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">←</kbd>(접기) / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">→</kbd>(펴기)</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center border-t border-slate-100 dark:border-slate-800/60 pt-2">
                <div className="font-semibold text-slate-700 dark:text-slate-300">편집창 내 동작</div>
                <div className="col-span-2"></div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">진행률 조절</div>
                <div className="col-span-2"><kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono">Ctrl + ,</kbd>(-10%) / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono">Ctrl + .</kbd>(+10%) / <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px] font-mono">Ctrl + /</kbd>(100% 완료)</div>
              </div>
              <div className="grid grid-cols-3 gap-2 items-center">
                <div className="font-medium text-slate-800 dark:text-slate-200">댓글 작성</div>
                <div className="col-span-2">댓글 입력창에서 <kbd className="px-1.5 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[10px]">Ctrl + Enter</kbd></div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 space-y-1">
                <div>💡 <span className="font-semibold">스마트 추가</span>: 그룹 선택 시 하위 자식 노드로, 아이템 선택 시 이웃 형제 노드로 생성됩니다.</div>
                <div>⌨️ <span className="font-semibold">추가 창 종류 전환</span>: 텍스트 입력창 포커스를 유지한 채 <kbd className="px-1 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[9px]">Alt + 1</kbd>(일정) 또는 <kbd className="px-1 py-0.5 rounded border bg-slate-50 dark:bg-slate-800 text-[9px]">Alt + 2</kbd>(그룹)로 종류를 전환할 수 있습니다.</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 text-xs font-semibold transition-colors"
              >
                닫기
              </button>
            </div>
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
  canEdit,
  onAddNode,
  onToggleHelp,
}: {
  project: ProjectDetail;
  canManage: boolean;
  adminMode: boolean;
  isAdmin: boolean;
  nodes: NodeTreeItem[];
  canEdit: boolean;
  onAddNode: () => void;
  onToggleHelp: () => void;
}) {
  const updateProject = useUpdateProject(project.id);
  const deleteProject = useDeleteProject();
  const importCsv = useImportCsv(project.id);
  const navigate = useNavigate();

  // 삭제 모달 상태
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // 가져오기 모달 상태
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvInputText, setCsvInputText] = useState('');

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

  function onDelete() {
    setIsDeleteModalOpen(true);
  }

  async function handleDeleteExecute() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success('프로젝트가 영구 삭제되었습니다.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setIsDeleteModalOpen(false);
      setDeleteConfirmText('');
    }
  }

  // CSV 내보내기 (Export)
  const handleExportCsv = () => {
    const header = ['일정1', '일정2', '일정3', '일정4', '일정5', '시작일', '종료일', '진척율'];
    const rows = nodes.map((n) => {
      const isItem = n.kind === 'ITEM';
      const start = isItem ? (n.startAt ?? '') : (n.startAtEffective ?? '');
      const end = isItem ? (n.endAt ?? '') : (n.endAtEffective ?? '');
      const progress = isItem ? (n.progress ?? 0) : (n.progressEffective ?? 0);

      const line = ['', '', '', '', '', start, end, `${progress}%`];

      if (n.depth >= 0 && n.depth <= 4) {
        line[n.depth] = n.title;
      }

      return line.map((val) => {
        const clean = val.replace(/"/g, '""');
        return `"${clean}"`;
      }).join(',');
    });

    const csvContent = [header.join(','), ...rows].join('\n');
    // Excel 에서 한글 깨짐 방지를 위해 BOM(\ufeff) 추가
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${project.name}_일정_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('일정이 CSV 파일로 내보내졌습니다.');
  };

  // CSV 가져오기 실행
  const handleImportCsvExecute = async () => {
    if (!csvInputText.trim()) return;
    try {
      await importCsv.mutateAsync({ csvText: csvInputText });
      toast.success('CSV 일정을 성공적으로 가져왔습니다.');
      setIsImportModalOpen(false);
      setCsvInputText('');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  // CSV 파일 첨부 처리
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvInputText(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const showDelete = isAdmin && adminMode && project.status === 'ARCHIVED';

  return (
    <>
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
          {/* CSV 가져오기/내보내기 기능 임시 숨김 처리 (요구사항 반영)
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold"
              title="CSV 파일에서 일정 일괄 가져오기 (덮어쓰기)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="hidden md:inline">가져오기</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className="p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-1 text-xs font-semibold"
            title="현재 프로젝트 일정을 CSV 파일로 내보내기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="hidden md:inline">내보내기</span>
          </button>
          */}
          {canEdit && onAddNode && (
            <button
              type="button"
              onClick={onAddNode}
              className="px-2.5 py-1.5 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 dark:border-sky-800/80 dark:bg-sky-950/40 dark:hover:bg-sky-950/70 dark:text-sky-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="새 일정 추가 (선택된 그룹의 자식 또는 아이템의 형제로 추가)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span>일정 추가</span>
            </button>
          )}
          <button
            type="button"
            onClick={onToggleHelp}
            className="p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="단축키 및 사용법 도움말 (h 또는 ?)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </button>
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

      {/* 프로젝트 삭제 확인 모달 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in-50 duration-100">
          <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-200">
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
              프로젝트 영구 삭제
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-normal">
              이 작업은 되돌릴 수 없습니다. 프로젝트 내부의 모든 일정, 댓글 및 변경 이력이 영구적으로 파괴됩니다.
            </p>
            
            <div className="mt-4 rounded bg-rose-50 p-3 text-xs border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30">
              <p className="text-rose-800 dark:text-rose-300 font-semibold">
                경고: 이 프로젝트를 완전히 삭제하시려면 확인을 위해 아래 입력란에 프로젝트 명칭을 정확히 입력하십시오.
              </p>
              <p className="mt-2 text-slate-700 dark:text-slate-300 font-mono font-bold select-all bg-white px-2 py-1 rounded border dark:bg-slate-800 dark:border-slate-700">
                {project.name}
              </p>
            </div>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="프로젝트 명칭 입력"
              className="mt-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs placeholder-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-normal"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteConfirmText('');
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== project.name}
                onClick={handleDeleteExecute}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV 일정 가져오기 모달 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in-50 duration-100">
          <div className="relative flex flex-col w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-200">
            <h3 className="text-base font-bold text-sky-600 dark:text-sky-400">
              CSV 일정 가져오기 (Import)
            </h3>
            
            <div className="mt-3 rounded-lg border border-rose-300 bg-rose-50/50 p-3.5 text-xs dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="font-semibold text-rose-800 dark:text-rose-400">
                ⚠️ 경고: 기존 프로젝트의 모든 일정이 초기화(삭제)되고, CSV 데이터로 완전히 덮어씁니다.
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-400">
                가져오기 형식: 총 8개 컬럼 구조이며, `일정1 ~ 일정5` 중 한 곳에 이름을 넣으십시오.
                (예: `일정1,일정2,일정3,일정4,일정5,시작일,종료일,진척율`)
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                CSV 파일 선택
              </label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-350 cursor-pointer"
              />
            </div>

            <div className="mt-4 flex-1 flex flex-col">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                CSV 데이터 텍스트 직접 입력 / 확인
              </label>
              <textarea
                value={csvInputText}
                onChange={(e) => setCsvInputText(e.target.value)}
                placeholder="일정1,일정2,일정3,일정4,일정5,시작일,종료일,진척율 형태로 입력 또는 붙여넣기"
                rows={10}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-mono focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 resize-y"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setCsvInputText('');
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!csvInputText.trim() || importCsv.isPending}
                onClick={handleImportCsvExecute}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                일정 가져오기
              </button>
            </div>
          </div>
        </div>
      )}

      {(updateProject.isPending || deleteProject.isPending || importCsv.isPending) && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/30 backdrop-blur-[1.5px] cursor-wait animate-in fade-in duration-200">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-5 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150">
            <svg className="animate-spin h-5 w-5 text-sky-600 dark:text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              프로젝트를 처리 중입니다...
            </span>
          </div>
        </div>
      )}
    </>
  );
}
