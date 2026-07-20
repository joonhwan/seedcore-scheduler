import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProject } from '../lib/projects';
import { useNodes } from '../lib/nodes';
import { apiErrorMessage } from '../lib/errors';
import NodeDetail from '../components/NodeDetail';
import NodeCommentsPanel from '../components/NodeCommentsPanel';
import NodeHistoryPanel from '../components/NodeHistoryPanel';
import Timeline, { type TimelineUnit, type TimelineHandle } from '../components/Timeline';
import ExportMenu from '../components/ExportMenu';
import GanttExportDialog from '../components/GanttExportDialog';
import { useTheme } from '../lib/theme';

export default function ProjectTimelinePage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const project = useProject(id);
  const nodes = useNodes(id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unit, setUnit] = useState<TimelineUnit>('week');
  const [todayCounter, setTodayCounter] = useState(0);
  const timelineRef = useRef<TimelineHandle>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const { theme } = useTheme();

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
          {/* 간트 확대/축소/화면맞춤/오늘 조절 */}
          <div className="flex items-center gap-0.5 rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
            <button
              type="button"
              onClick={() => timelineRef.current?.zoomOut()}
              title="축소 (단축키: -)"
              className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              －
            </button>
            <button
              type="button"
              onClick={() => timelineRef.current?.zoomIn()}
              title="확대 (단축키: +, =)"
              className="flex h-6 w-6 items-center justify-center rounded text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => timelineRef.current?.fitToScreen()}
              title="화면에 꽉 차게 맞춤"
              className="flex h-6 items-center justify-center rounded px-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              화면맞춤
            </button>
            <button
              type="button"
              onClick={() => setTodayCounter((c) => c + 1)}
              title="오늘 날짜 위치로 스크롤"
              className="flex h-6 items-center justify-center rounded px-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              오늘
            </button>
          </div>
          <ExportMenu onSelectImage={() => setExportOpen(true)} />
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
            ref={timelineRef}
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

      {exportOpen && (
        <GanttExportDialog
          items={nodes.data ?? []}
          currentUnit={unit}
          currentTheme={theme}
          projectName={project.data.name}
          onClose={() => setExportOpen(false)}
        />
      )}
    </main>
  );
}
