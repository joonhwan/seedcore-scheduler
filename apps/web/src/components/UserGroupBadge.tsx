/**
 * 사용자의 소속 그룹을 보여주는 배지.
 *
 * 목록 행의 폭이 좁으므로 **말단 이름만** 보이고, 마우스를 올리면 경로 전진이 나온다.
 * 소속이 없으면 아무것도 그리지 않는다.
 */
export default function UserGroupBadge({ path }: { path: string[] }) {
  if (path.length === 0) return null;
  const leaf = path[path.length - 1]!;
  return (
    <span
      title={path.join(' › ')}
      className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
    >
      {leaf}
    </span>
  );
}
