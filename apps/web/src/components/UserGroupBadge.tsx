/**
 * 사용자의 소속 그룹을 보여주는 배지.
 *
 * 목록 행의 폭이 좁으므로 **말단 이름만** 보이고, 마우스를 올리면 경로 전진이 나온다.
 * 소속이 없으면 아무것도 그리지 않는다.
 *
 * 상태가 아니라 정보이므로, 옆에 놓이는 채워진 상태 배지들(ADMIN·비활성·잠김 등)과 달리
 * 테두리만 두고 배경을 비운다. 색을 그것들에 맞추려 하지 말 것.
 */
export default function UserGroupBadge({ path }: { path: string[] }) {
  if (path.length === 0) return null;
  const leaf = path[path.length - 1]!;
  return (
    <span
      title={path.join(' › ')}
      className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400"
    >
      {leaf}
    </span>
  );
}
