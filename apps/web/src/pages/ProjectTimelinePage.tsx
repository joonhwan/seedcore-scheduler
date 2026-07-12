import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProject } from '../lib/projects';
import { useNodes } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import NodeDetail from '../components/NodeDetail';
import NodeCommentsPanel from '../components/NodeCommentsPanel';
import NodeHistoryPanel from '../components/NodeHistoryPanel';
import Timeline, { type TimelineUnit } from '../components/Timeline';

export default function ProjectTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const project = useProject(id);
  const nodes = useNodes(id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<TimelineUnit>('week');
  const [todayCounter, setTodayCounter] = useState(0);

  const isAdmin = me.data?.globalRole === 'ADMIN';
  const myRole = project.data?.myRole ?? null;
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

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/" className="text-xs text-slate-500 hover:underline">
            ← 프로젝트 목록
          </Link>
          <h1 className="mt-1 text-xl font-bold">{project.data.name}</h1>
          <p className="text-xs text-slate-500">
            Timeline 뷰 · 읽기 전용 · 편집은 우측 패널 또는{' '}
            <Link to={`/projects/${id}`} className="text-sky-600 hover:underline">
              Tree 뷰
            </Link>
            에서
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/projects/${id}`}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Tree 뷰
          </Link>
          <span className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
            Timeline 뷰
          </span>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Timeline
            items={nodes.data ?? []}
            unit={unit}
            onUnitChange={setUnit}
            selectedId={selectedId}
            onSelect={setSelectedId}
            jumpToTodayCounter={todayCounter}
          />
        </section>

        <section className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto rounded-lg border border-slate-200 p-4 dark:border-slate-700 lg:col-span-5">
          {selected ? (
            <div className="space-y-6">
              <NodeDetail projectId={id} node={selected} canEdit={canEditNodes} />
              <NodeCommentsPanel nodeId={selected.id} canPost={canEditNodes} />
              <NodeHistoryPanel nodeId={selected.id} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">막대 또는 라벨을 클릭하여 노드 상세를 봅니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
