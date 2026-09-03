/**
 * 오래 걸리는 조작이 진행되는 동안 화면 전체를 덮는 대기 표시.
 *
 * 이 저장소는 프로젝트 삭제(`ProjectsPage`)와 일정·프로젝트 처리(`ProjectDetailPage` 두 곳)에서
 * 이미 같은 모양의 덮개를 쓰고 있었는데, 그 12줄짜리 덩어리가 세 곳에 복사되어 있었다. 네 번째
 * 복사본을 만들지 않으려고 여기로 뽑았다. **기존 세 곳은 이번 작업 범위가 아니라 그대로 두었다.**
 *
 * 화면을 덮어 클릭을 막는 것도 이 컴포넌트의 몫이다. 서버를 여러 번 다녀오는 조작에서 사용자가
 * 같은 버튼을 다시 눌러 작업이 겹쳐 시작되는 것을 막는다.
 */
export default function BusyOverlay({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/30 backdrop-blur-[1.5px] cursor-wait animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-5 py-3 shadow-lg dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150">
        <svg
          className="animate-spin h-5 w-5 text-sky-600 dark:text-sky-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      </div>
    </div>
  );
}
