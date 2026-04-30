import { useMemo, useState } from 'react';
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
import NodeTree from '../components/NodeTree';
import NodeDetail from '../components/NodeDetail';
import NodeFormDialog from '../components/NodeFormDialog';
import ParentPickerDialog from '../components/ParentPickerDialog';
import NodeCommentsPanel from '../components/NodeCommentsPanel';
import NodeHistoryPanel from '../components/NodeHistoryPanel';

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
      if (selectedId === node.id) setSelectedId(null);
      toast.success('노드가 삭제되었습니다.');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <ProjectHeader
        project={project.data}
        canManage={canManageProject}
        adminMode={adminMode}
        isAdmin={isAdmin}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <h2 className="mb-2 text-sm font-semibold">트리</h2>
          <NodeTree
            items={nodes.data ?? []}
            selectedId={selectedId}
            canEdit={canEditNodes}
            onSelect={setSelectedId}
            onAddRoot={() => setCreateParent('root')}
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
        </section>

        <section className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          {selected ? (
            <div className="space-y-6">
              <NodeDetail projectId={id} node={selected} canEdit={canEditNodes} />
              <NodeCommentsPanel nodeId={selected.id} canPost={canEditNodes} />
              <NodeHistoryPanel nodeId={selected.id} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">왼쪽 트리에서 노드를 선택하세요.</p>
          )}
        </section>
      </div>

      {createParent !== null && (
        <NodeFormDialog
          projectId={id}
          parent={createParent === 'root' ? null : createParent}
          onClose={() => setCreateParent(null)}
          onCreated={(n) => setSelectedId(n.id)}
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
