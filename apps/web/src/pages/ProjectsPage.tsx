import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectListItem, ProjectStatus } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProjects, useDeleteProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';
import { DEFAULT_COLUMN_WIDTHS, computeRenderedWidths, type ProjectColumnKey } from '../lib/projectListColumns';
import { compareProjectsByNewestFirst } from '../lib/projectListSort';
import ProjectNameCell from '../components/ProjectNameCell';
import ProjectArchiveButton from '../components/ProjectArchiveButton';
import DelayStatusBadge from '../components/DelayStatusBadge';
import ProgressBarWithExpected from '../components/ProgressBarWithExpected';

export default function ProjectsPage() {
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const projects = useProjects();
  const deleteProject = useDeleteProject();

  const STORAGE_KEY = 'sam_project_list_column_widths_v3';


  // 기본 컬럼 폭은 lib/projectListColumns.ts 가 단일 원본이다.
  const defaultWidths = DEFAULT_COLUMN_WIDTHS;

  // 컬럼 폭 상태 관리 (Local Storage 로드 우선)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultWidths, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load column widths', e);
    }
    return defaultWidths;
  });

  // 테이블을 감싼 요소의 실제 폭. ResizeObserver 로 관찰한다.
  // 감싼 요소는 조건부로 렌더링되므로 useEffect + ref 대신 콜백 ref 로 붙인다.
  //
  // 이 옵저버의 주인은 콜백 ref 하나뿐이어야 한다. 정리를 useEffect cleanup 에도
  // 걸어 두면 안 된다 — React 18 의 StrictMode 이중 호출은 이펙트만 다시 돌리고
  // ref 콜백은 재호출하지 않으므로, cleanup 이 옵저버를 끊은 뒤 아무도 다시 붙이지
  // 않는 상태가 된다. 그러면 containerWidth 가 0 에 머물러 테이블이 화면을 못 채운다.
  // (목록 → 상세 → back 으로 돌아왔을 때 재현된다. 그때는 react-query 캐시 덕에
  //  첫 커밋부터 이 div 가 렌더되어 이중 호출 구간에 걸리기 때문이다.)
  // 언마운트 정리는 React 가 항상 ref(null) 을 호출해 주므로 아래 분기가 담당한다.
  const [containerWidth, setContainerWidth] = useState(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const attachTableWrap = useCallback((el: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    resizeObserverRef.current = ro;
  }, []);

  // 실제로 그릴 폭. 남는 폭은 설명 컬럼이 흡수한다.
  const { widths: renderedWidths, tableWidth } = useMemo(
    () => computeRenderedWidths(columnWidths, containerWidth, adminMode),
    [columnWidths, containerWidth, adminMode],
  );

  // 드래그 상태 관리
  const resizingColumn = useRef<ProjectColumnKey | null>(null);
  const startX = useRef<number>(0);
  const startWidth = useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent, columnKey: ProjectColumnKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumn.current = columnKey;
    startX.current = e.clientX;
    // 저장값이 아니라 화면에 실제로 그려진 폭에서 출발한다.
    // 설명 컬럼은 남는 폭이 얹혀 있어 저장값과 다르고, 저장값에서 출발하면
    // 드래그를 시작하는 순간 폭이 뚝 튄다.
    startWidth.current = renderedWidths[columnKey];

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingColumn.current) return;
    const deltaX = e.clientX - startX.current;
    const newWidth = Math.max(60, startWidth.current + deltaX);
    
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumn.current!]: newWidth,
    }));
  };

  const handleMouseUp = () => {
    if (resizingColumn.current) {
      setColumnWidths((prev) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
        return prev;
      });
    }
    resizingColumn.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  const [delayFilter, setDelayFilter] = useState<'ALL' | 'CRITICAL' | 'DELAYED'>('ALL');
  
  // 정렬 상태
  const [sortBy, setSortBy] = useState<keyof ProjectListItem | 'progress' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  // 페이징 상태
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 삭제 확인 모달 상태
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const canCreate = me.data?.globalRole === 'ADMIN' && adminMode;
  const canRename = me.data?.globalRole === 'ADMIN' && adminMode;

  // 지연 카운터 집계
  const delayCounts = useMemo(() => {
    const list = projects.data ?? [];
    let critical = 0;
    let warning = 0;
    let slight = 0;
    let onTrack = 0;
    for (const p of list) {
      const st = p.delaySummary?.status;
      if (st === 'CRITICAL') critical++;
      else if (st === 'WARNING') warning++;
      else if (st === 'SLIGHT') slight++;
      else if (st === 'ON_TRACK') onTrack++;
    }
    return {
      total: list.length,
      critical,
      warning,
      delayed: critical + warning,
      onTrack,
    };
  }, [projects.data]);

  const handleSort = (field: keyof ProjectListItem | 'progress') => {
    if (sortBy === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortBy(null);
        setSortOrder(null);
      }
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const handleDeleteExecute = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject.mutateAsync(deleteTarget.id);
      toast.success('프로젝트가 영구 삭제되었습니다.');
    } catch (err: any) {
      toast.error(apiErrorMessage(err));
    } finally {
      setDeleteTarget(null);
      setDeleteConfirmText('');
    }
  };

  // 1. 검색 및 필터링
  const filtered = useMemo(() => {
    let list = projects.data ? [...projects.data] : [];

    // 검색어 필터링
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(term));
    }

    // 관리자 모드 보관 여부 필터링
    if (adminMode) {
      if (statusFilter === 'ACTIVE') {
        list = list.filter((p) => p.status === 'ACTIVE');
      } else if (statusFilter === 'ARCHIVED') {
        list = list.filter((p) => p.status === 'ARCHIVED');
      }
    }

    // 예상보다 많이 지연 중인 프로젝트 필터링
    if (delayFilter === 'CRITICAL') {
      list = list.filter((p) => p.delaySummary?.status === 'CRITICAL');
    } else if (delayFilter === 'DELAYED') {
      list = list.filter(
        (p) => p.delaySummary?.status === 'CRITICAL' || p.delaySummary?.status === 'WARNING',
      );
    }

    // 2. 정렬
    if (sortBy && sortOrder) {
      list.sort((a, b) => {
        if (sortBy === 'progress') {
          const gapA = a.delaySummary?.avgDelayGap ?? -999;
          const gapB = b.delaySummary?.avgDelayGap ?? -999;
          return sortOrder === 'asc' ? gapA - gapB : gapB - gapA;
        }

        const valA = a[sortBy as keyof ProjectListItem];
        const valB = b[sortBy as keyof ProjectListItem];

        if (valA === null || valA === undefined) return sortOrder === 'asc' ? 1 : -1;
        if (valB === null || valB === undefined) return sortOrder === 'asc' ? -1 : 1;

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return sortOrder === 'asc'
            ? (valA as number) - (valB as number)
            : (valB as number) - (valA as number);
        }
      });
    } else {
      list.sort(compareProjectsByNewestFirst);
    }

    return list;
  }, [projects.data, searchTerm, statusFilter, delayFilter, adminMode, sortBy, sortOrder]);


  // 3. 페이징 처리
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // 마지막 페이지의 마지막 항목을 보관(또는 삭제)하면 그 행이 목록에서 빠지면서
  // currentPage 가 totalPages 를 넘어 빈 표가 남는다. 이때 마지막 페이지로 당긴다.
  // totalPages 가 0 이면 건드리지 않는다 — 결과가 없을 때는 페이징 컨트롤 자체가 숨겨지고
  // "조건에 부합하는 프로젝트가 없습니다" 안내가 대신 뜬다.
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const renderSortIcon = (field: keyof ProjectListItem) => {
    if (sortBy !== field || !sortOrder) {
      return (
        <svg className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      );
    }
    return sortOrder === 'asc' ? (
      <svg className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  return (
    <main className="px-3 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold">프로젝트</h1>
        {canCreate && (
          <Link
            to="/projects/new"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors shrink-0 self-start sm:self-auto"
          >
            + 새 프로젝트
          </Link>
        )}
      </div>

      {/* 프로젝트 지연 상태 요약 대시보드 위젯 */}
      {projects.data && projects.data.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => { setDelayFilter('ALL'); setCurrentPage(1); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              delayFilter === 'ALL'
                ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 ring-1 ring-sky-500'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">전체 프로젝트</div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{delayCounts.total}개</div>
          </button>

          <button
            type="button"
            onClick={() => { setDelayFilter('CRITICAL'); setCurrentPage(1); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              delayFilter === 'CRITICAL'
                ? 'border-red-500 bg-red-50/50 dark:bg-red-950/30 ring-1 ring-red-500'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-medium text-red-600 dark:text-red-400">
              <span>🚨 심각 지연</span>
              {delayCounts.critical > 0 && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{delayCounts.critical}개</div>
          </button>

          <button
            type="button"
            onClick={() => { setDelayFilter('DELAYED'); setCurrentPage(1); }}
            className={`p-3 rounded-lg border text-left transition-all ${
              delayFilter === 'DELAYED'
                ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 ring-1 ring-amber-500'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-amber-300'
            }`}
          >
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">⚠️ 전체 지연 프로젝트</div>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{delayCounts.delayed}개</div>
          </button>

          <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-left">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✅ 정상 진행 중</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{delayCounts.onTrack}개</div>
          </div>
        </div>
      )}

      {/* 필터 및 검색 바 */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="프로젝트 이름 검색..."
            className="block w-full rounded-md border border-slate-300 bg-white py-1.5 pl-10 pr-3 text-sm placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 지연 상태 필터 버튼 */}
          <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <button
              type="button"
              onClick={() => { setDelayFilter('ALL'); setCurrentPage(1); }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                delayFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => { setDelayFilter('CRITICAL'); setCurrentPage(1); }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                delayFilter === 'CRITICAL'
                  ? 'bg-red-500 text-white shadow-sm font-semibold'
                  : 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300'
              }`}
            >
              🚨 심각 지연만
            </button>
            <button
              type="button"
              onClick={() => { setDelayFilter('DELAYED'); setCurrentPage(1); }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                delayFilter === 'DELAYED'
                  ? 'bg-amber-500 text-white shadow-sm font-semibold'
                  : 'text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300'
              }`}
            >
              ⚠️ 지연 포함
            </button>
          </div>

          {adminMode && (
            <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('ACTIVE'); setCurrentPage(1); }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                활성
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter('ARCHIVED'); setCurrentPage(1); }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  statusFilter === 'ARCHIVED'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                보관
              </button>
            </div>
          )}
        </div>
      </div>

      {projects.isLoading && (
        <p className="mt-6 text-sm text-slate-500">로딩…</p>
      )}
      {projects.isError && (
        <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">
          {apiErrorMessage(projects.error)}
        </p>
      )}
      {projects.data && projects.data.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          {adminMode
            ? '등록된 프로젝트가 없습니다. "+ 새 프로젝트" 로 생성하세요.'
            : '소속된 프로젝트가 없습니다. 관리자에게 멤버 추가를 요청하세요.'}
        </p>
      )}
      {projects.data && projects.data.length > 0 && filtered.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">
          검색 및 필터 조건에 부합하는 프로젝트가 없습니다.
        </p>
      )}

      {projects.data && filtered.length > 0 && (
        <div className="mt-6">
          <div
            ref={attachTableWrap}
            className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <table
              className="divide-y divide-slate-200 dark:divide-slate-800 text-sm"
              style={{ tableLayout: 'fixed', width: `${tableWidth}px` }}
            >
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th
                    scope="col"
                    className="relative select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.name}px` }}
                  >
                    <div
                      onClick={() => handleSort('name')}
                      className="cursor-pointer flex items-center justify-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      프로젝트 이름 {renderSortIcon('name')}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'name')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.description}px` }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      설명
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'description')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-3 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.progress}px` }}
                  >
                    <div
                      onClick={() => handleSort('progress')}
                      className="cursor-pointer flex items-center justify-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                    >
                      진척 현황 {renderSortIcon('progress' as any)}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'progress')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-3 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.status}px` }}
                  >
                    <div
                      onClick={() => handleSort('status')}
                      className="cursor-pointer flex items-center justify-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                    >
                      상태 {renderSortIcon('status')}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'status')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-3 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.memberCount}px` }}
                  >
                    <div
                      onClick={() => handleSort('memberCount')}
                      className="cursor-pointer flex items-center justify-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap"
                    >
                      멤버 {renderSortIcon('memberCount')}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'memberCount')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.myRole}px` }}
                  >
                    <div
                      onClick={() => handleSort('myRole')}
                      className="cursor-pointer flex items-center justify-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      역할 {renderSortIcon('myRole')}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'myRole')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.createdAt}px` }}
                  >
                    <div
                      onClick={() => handleSort('createdAt')}
                      className="cursor-pointer flex items-center justify-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      생성일 {renderSortIcon('createdAt')}
                    </div>
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'createdAt')}
                      className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                    />
                  </th>
                  <th
                    scope="col"
                    className="relative select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 group/th"
                    style={{ width: `${renderedWidths.updatedAt}px` }}
                  >
                    <div
                      onClick={() => handleSort('updatedAt')}
                      className="cursor-pointer flex items-center justify-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      수정일 {renderSortIcon('updatedAt')}
                    </div>
                    {adminMode && (
                      <div
                        onMouseDown={(e) => handleMouseDown(e, 'updatedAt')}
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-slate-300 dark:bg-slate-700 opacity-0 group-hover/th:opacity-100 hover:!bg-sky-500 hover:opacity-100 active:!bg-sky-600 active:opacity-100 transition-opacity"
                      />
                    )}
                  </th>
                  {adminMode && (
                    <th
                      scope="col"
                      className="px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                      style={{ width: `${renderedWidths.manage}px` }}
                    >
                      관리
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {paginated.map((p) => {
                  const summary = p.delaySummary;
                  const isCritical = summary?.status === 'CRITICAL';
                  const isWarning = summary?.status === 'WARNING';
                  return (
                    <tr
                      key={p.id}
                      className={`group/row transition-colors ${
                        isCritical
                          ? 'bg-red-500/5 hover:bg-red-500/10 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                          : isWarning
                          ? 'bg-amber-500/5 hover:bg-amber-500/10 dark:bg-amber-950/15 dark:hover:bg-amber-950/25'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td
                        className="px-4 py-3 font-semibold text-slate-950 dark:text-slate-50"
                        style={{ width: `${renderedWidths.name}px`, maxWidth: `${renderedWidths.name}px` }}
                      >
                        <ProjectNameCell project={p} canRename={canRename} />
                      </td>
                      <td
                        className="px-4 py-3 text-slate-600 dark:text-slate-400 truncate"
                        style={{ width: `${renderedWidths.description}px`, maxWidth: `${renderedWidths.description}px` }}
                        title={p.description ?? ''}
                      >
                        {p.description ?? '-'}
                      </td>
                      <td
                        className="px-3 py-3"
                        style={{ width: `${renderedWidths.progress}px`, maxWidth: `${renderedWidths.progress}px` }}
                      >
                        {summary ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <DelayStatusBadge
                                status={summary.status}
                                delayGap={summary.avgDelayGap}
                                size="sm"
                              />
                            </div>
                            <ProgressBarWithExpected
                              actualProgress={summary.avgActualProgress}
                              expectedProgress={summary.avgExpectedProgress}
                              status={summary.status}
                              height="h-2"
                              showLabels
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono text-center block">-</span>
                        )}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-center"
                        style={{ width: `${renderedWidths.status}px`, maxWidth: `${renderedWidths.status}px` }}
                      >
                        <StatusBadge status={p.status} />
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-center text-slate-600 dark:text-slate-400 truncate"
                        style={{ width: `${renderedWidths.memberCount}px`, maxWidth: `${renderedWidths.memberCount}px` }}
                      >
                        {p.memberCount}명
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-center text-slate-600 dark:text-slate-400 truncate"
                        style={{ width: `${renderedWidths.myRole}px`, maxWidth: `${renderedWidths.myRole}px` }}
                        title={p.myRole ?? '비멤버 (ADMIN)'}
                      >
                        {p.myRole ?? '비멤버 (ADMIN)'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-center text-slate-600 dark:text-slate-400 truncate"
                        style={{ width: `${renderedWidths.createdAt}px`, maxWidth: `${renderedWidths.createdAt}px` }}
                      >
                        {p.createdAt.slice(0, 10)}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-center text-slate-600 dark:text-slate-400 truncate"
                        style={{ width: `${renderedWidths.updatedAt}px`, maxWidth: `${renderedWidths.updatedAt}px` }}
                      >
                        {p.updatedAt.slice(0, 10)}
                      </td>
                      {adminMode && (
                        <td
                          className="whitespace-nowrap px-4 py-3 text-center"
                          style={{ width: `${renderedWidths.manage}px`, maxWidth: `${renderedWidths.manage}px` }}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <ProjectArchiveButton project={p} />
                            <Link
                              to={`/projects/${p.id}/clone`}
                              className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-400 dark:hover:bg-sky-950/60 transition-colors"
                              title="이 프로젝트를 템플릿으로 새 프로젝트 만들기"
                            >
                              복제
                            </Link>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              className="rounded px-2 py-1 text-xs font-medium bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50 transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>


          {/* 페이징 컨트롤 */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                총 <span className="font-semibold text-slate-900 dark:text-slate-100">{totalItems}</span>개 중{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {Math.min((currentPage - 1) * pageSize + 1, totalItems)}
                </span>
                -
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {Math.min(currentPage * pageSize, totalItems)}
                </span>
                개 표시
              </div>
              <div className="flex gap-1 self-center">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  이전
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => setCurrentPage(page)}
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                      currentPage === page
                        ? 'bg-sky-600 text-white shadow-sm hover:bg-sky-700'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 프로젝트 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in-50 zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
              프로젝트 영구 삭제
            </h3>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              이 작업은 되돌릴 수 없습니다. 프로젝트 내부의 모든 일정, 댓글 및 변경 이력이 영구적으로 파괴됩니다.
            </p>
            
            <div className="mt-4 rounded bg-rose-50 p-3 text-xs border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/30">
              <p className="text-rose-800 dark:text-rose-300 font-semibold">
                경고: 이 프로젝트를 완전히 삭제하시려면 확인을 위해 아래 입력란에 프로젝트 명칭을 정확히 입력하십시오.
              </p>
              <p className="mt-2 text-slate-700 dark:text-slate-300 font-mono font-bold select-all bg-white px-2 py-1 rounded border dark:bg-slate-800 dark:border-slate-700">
                {deleteTarget.name}
              </p>
            </div>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="프로젝트 명칭 입력"
              className="mt-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs placeholder-slate-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmText('');
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleteConfirmText !== deleteTarget.name}
                onClick={handleDeleteExecute}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteProject.isPending && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/30 backdrop-blur-[1.5px] cursor-wait animate-in fade-in duration-200">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-5 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150">
            <svg className="animate-spin h-5 w-5 text-sky-600 dark:text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              프로젝트를 삭제 중입니다...
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const cls =
    status === 'ACTIVE'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
      : 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {status === 'ACTIVE' ? '활성' : '보관'}
    </span>
  );
}
