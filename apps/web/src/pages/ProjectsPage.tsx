import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectListItem, ProjectStatus } from '@sam/shared';
import { useMe } from '../lib/auth';
import { useAdminMode } from '../lib/adminMode';
import { useProjects, useDeleteProject } from '../lib/projects';
import { apiErrorMessage } from '../lib/errors';
import { toast } from '../lib/toast';

export default function ProjectsPage() {
  const me = useMe();
  const { on: adminMode } = useAdminMode();
  const projects = useProjects();
  const deleteProject = useDeleteProject();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ALL');
  
  // 정렬 상태
  const [sortBy, setSortBy] = useState<keyof ProjectListItem | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  // 페이징 상태
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 삭제 확인 모달 상태
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const canCreate = me.data?.globalRole === 'ADMIN' && adminMode;

  const handleSort = (field: keyof ProjectListItem) => {
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

    // 2. 정렬
    if (sortBy && sortOrder) {
      list.sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];

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
    }

    return list;
  }, [projects.data, searchTerm, statusFilter, adminMode, sortBy, sortOrder]);

  // 3. 페이징 처리
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

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
    <main className="mx-auto max-w-7xl p-6">
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

        {adminMode && (
          <div className="flex rounded-md border border-slate-200 p-0.5 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => { setStatusFilter('ALL'); setCurrentPage(1); }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
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
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
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
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
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
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" onClick={() => handleSort('name')} className="cursor-pointer select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <div className="flex items-center justify-center gap-1.5">
                      프로젝트 이름 {renderSortIcon('name')}
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200">
                    설명
                  </th>
                  <th scope="col" onClick={() => handleSort('status')} className="cursor-pointer select-none px-3 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      상태 {renderSortIcon('status')}
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleSort('memberCount')} className="cursor-pointer select-none px-3 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      멤버 {renderSortIcon('memberCount')}
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleSort('myRole')} className="cursor-pointer select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <div className="flex items-center justify-center gap-1.5">
                      역할 {renderSortIcon('myRole')}
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleSort('createdAt')} className="cursor-pointer select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <div className="flex items-center justify-center gap-1.5">
                      생성일 {renderSortIcon('createdAt')}
                    </div>
                  </th>
                  <th scope="col" onClick={() => handleSort('updatedAt')} className="cursor-pointer select-none px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <div className="flex items-center justify-center gap-1.5">
                      수정일 {renderSortIcon('updatedAt')}
                    </div>
                  </th>
                  {adminMode && (
                    <th scope="col" className="px-4 py-3.5 text-center font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      관리
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {paginated.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-950 dark:text-slate-50">
                      <Link to={`/projects/${p.id}`} className="text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400 dark:hover:text-sky-300">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400 max-w-md truncate" title={p.description ?? ''}>
                      {p.description ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-center">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-center text-slate-600 dark:text-slate-400">
                      {p.memberCount}명
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center text-slate-600 dark:text-slate-400">
                      {p.myRole ?? '비멤버 (ADMIN)'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center text-slate-600 dark:text-slate-400">
                      {p.createdAt.slice(0, 10)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-center text-slate-600 dark:text-slate-400">
                      {p.updatedAt.slice(0, 10)}
                    </td>
                    {adminMode && (
                      <td className="whitespace-nowrap px-4 py-4 text-center">
                        {p.status === 'ARCHIVED' ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            className="rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors"
                          >
                            삭제
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
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
