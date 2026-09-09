import { useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION_LABEL } from '../version';
import { useMe } from '../lib/auth';

export default function UserGuidePage() {
  const [activeSection, setActiveSection] = useState<string>('sec-1');
  const me = useMe();
  const loggedIn = me.data !== null && me.data !== undefined;

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* 상단 네비게이션 헤더 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">사용설명서</h1>
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {APP_VERSION_LABEL}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            일정관리 시스템의 주요 기능, 간트 차트 조작법, 댓글 및 이력 관리, 관리자 모드 사용법을 안내합니다.
          </p>
        </div>
        {/*
          이 화면은 로그인하지 않아도 열리므로 돌아갈 곳이 두 가지다. 로그인한 사람은
          프로젝트 목록으로, 아직 로그인하지 않은 사람은 로그인 화면으로 보낸다. 늘
          "프로젝트 목록으로" 라고 적어 두면 비로그인 방문자가 그 버튼을 눌렀을 때
          로그인 화면이 떠서 문구와 어긋난다.

          useMe 는 서버에 물어보지 못했을 때(5xx·연결 실패) data 를 비우지 않고 isError 로
          남기므로(lib/auth.ts), 로그인한 사람이 서버 재시작 중에 이 화면을 열어도 문구가
          로그인 쪽으로 바뀌지 않는다.
        */}
        <Link
          to={loggedIn ? '/' : '/login'}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          <span>{loggedIn ? '프로젝트 목록으로' : '로그인 화면으로'}</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        {/* 왼쪽 목차 고정 네비게이션 */}
        <aside className="lg:col-span-1">
          <div className="sticky top-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
              목차
            </h2>
            <nav className="space-y-1 text-xs">
              <button
                type="button"
                onClick={() => scrollToSection('sec-1')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-1'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                1. 시작하기 — 로그인과 비번
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-2')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-2'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                2. 화면 둘러보기
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-3')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-3'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                3. 프로젝트 목록 다루기
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-delay')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-delay'
                    ? 'bg-red-50 font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                4. 🚨 예상 진척률 & 지연 검출 원리
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-4')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-4'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                5. 일정 트리 다루기
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-5')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-5'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                6. 간트/타임라인 뷰
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-6')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-6'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                7. 일정 상세 편집
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('sec-7')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-7'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                8. 댓글과 감사 이력
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-8')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-8'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                9. 권한과 관리자 모드
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-9')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-9'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                10. 키보드 단축키 모음
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-10')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-10'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                11. 자주 묻는 질문(FAQ)
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('sec-11')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-11'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                12. 개발자 문의 및 카피라이트
              </button>
            </nav>
          </div>
        </aside>

        {/* 본문 콘텐츠 */}
        <main className="lg:col-span-3 space-y-10 text-slate-800 dark:text-slate-200">
          <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
            💡 <span className="font-semibold">안내</span>: 이 사용설명서는 <strong className="font-semibold">일반 사용자</strong> 기준으로 작성되었습니다. 프로젝트 매니저(MANAGER)나 관리자(ADMIN)만 사용 가능한 권한 전용 기능은 <span className="font-semibold text-amber-800 dark:text-amber-300">🔒 매니저/관리자 전용</span> 표시로 따로 구별됩니다.
          </div>

          {/* 1. 시작하기 */}
          <section id="sec-1" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">1</span>
              시작하기 — 로그인과 비밀번호
            </h2>

            <div className="space-y-4 text-sm leading-relaxed">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">1.1 로그인</h3>
              <ol className="list-decimal pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>브라우저에서 시스템 주소로 접속하면 <strong className="font-semibold">로그인 화면</strong>이 표시됩니다.</li>
                <li>발급받은 <strong className="font-semibold">ID</strong>와 <strong className="font-semibold">비밀번호</strong>를 입력하고 <strong className="font-semibold">로그인</strong> 버튼을 클릭합니다.</li>
              </ol>

              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/01_login_page.png" alt="로그인 화면" className="w-full h-auto object-cover" />
              </div>

              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border border-slate-200 dark:border-slate-800">안내 메시지</th>
                      <th className="p-2 border border-slate-200 dark:border-slate-800">뜻과 대처 방법</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-medium">ID 또는 비밀번호가 올바르지 않습니다.</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">입력하신 계정 정보를 다시 확인하세요. 관리자가 계정을 사용 중지한 경우에도 같은 안내가 나오므로, 계속 실패하면 관리자에게 문의하세요.</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">요청이 너무 많습니다. 잠시 후 다시 시도하세요.</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">짧은 시간에 로그인을 너무 자주 시도한 경우입니다. 잠시 기다렸다가 다시 시도하세요.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">1.2 첫 로그인 시 비밀번호 변경</h3>
              <p className="text-slate-600 dark:text-slate-300">
                처음 로그인하거나 관리자가 비밀번호를 초기화한 경우 <strong className="font-semibold">비밀번호 변경 화면</strong>으로 이동합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>새 비밀번호는 현재 비밀번호와 달라야 합니다.</li>
                <li>그 밖의 제한(길이, 문자 조합 등)은 없습니다. 다만 폐쇄망이라도 계정은 개인별로 구분되므로 짐작하기 쉬운 비밀번호는 피해 주십시오.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">1.3 로그인 유지 시간과 연장</h3>
              <p className="text-slate-600 dark:text-slate-300">
                한 번 로그인하면 <strong className="font-semibold">12시간 동안</strong> 유지됩니다. 이 시간은 로그인한 순간부터 재며, 중간에 계속
                작업한다고 해서 저절로 늘어나지는 않습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>
                  <strong className="font-semibold">남은 시간 표시</strong>: 남은 시간이 30분 이하로 줄면 화면 오른쪽 위, 이름 왼쪽에 남은 시간이
                  나타납니다. 10분 이하가 되면 붉은색으로 바뀝니다. 여유가 있을 때는 표시되지 않습니다.
                </li>
                <li>
                  <strong className="font-semibold">연장 창</strong>: 만료 10분 전에 화면 가운데로 <strong className="font-semibold">로그인 시간이 곧 만료됩니다</strong> 창이 뜹니다.
                  남은 시간이 초 단위로 줄어드는 것이 보입니다.
                </li>
                <li>
                  <strong className="font-semibold">로그인 연장</strong>을 누르면 그 시점부터 다시 12시간을 확보합니다. 연장 횟수에 제한은 없습니다.
                  <strong className="font-semibold">지금 로그아웃</strong>을 누르면 곧바로 로그아웃됩니다.
                </li>
              </ul>
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                연장하지 않고 시간이 다 지나면 자동으로 로그아웃되며, <strong>저장하지 않은 편집 내용은
                사라집니다.</strong> 연장 창이 뜨면 편집 중인 내용을 먼저 저장한 뒤 연장하는 것이 안전합니다.
              </p>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">1.4 서버 재시작 예고 팝업</h3>
              <p className="text-slate-600 dark:text-slate-300">
                관리자가 서버를 다시 시작해야 할 때 예정 시각을 미리 등록합니다. 그러면 접속 중인 모든
                화면에 <strong className="font-semibold">서버가 곧 재시작됩니다</strong> 창이 떠서 남은 시간을 알립니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>
                  <strong className="font-semibold">언제 뜨나</strong>: 예정 시각 <strong className="font-semibold">5분 전</strong>부터 뜹니다. 남은 시간이
                  <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">3분 20초</code>
                  처럼 초 단위로 줄어드는 것이 보입니다.
                </li>
                <li>
                  <strong className="font-semibold">닫아도 다시 뜹니다</strong>: <strong className="font-semibold">확인</strong>을 누르면 사라지지만,
                  1분이 지날 때마다 다시 떠서 남은 시간을 알립니다(5분 전, 4분 전, … 1분 전).
                </li>
                <li>
                  <strong className="font-semibold">예정 시각이 지나도 사라지지 않습니다</strong>: 문구가
                  <strong className="font-semibold"> 곧 재시작됩니다</strong>로 바뀌어 계속 뜹니다. 재시작이 몇 분 늦어지는 일이 흔한데,
                  그 사이에 창이 사라지면 다시 편집을 시작한 내용을 잃기 때문입니다.
                </li>
                <li>
                  <strong className="font-semibold">서버가 다시 켜지면 저절로 멈춥니다</strong>. 서버가 살아났다는 것이 곧 재시작이 끝났다는
                  뜻이므로, 관리자가 따로 손대지 않아도 창이 더 뜨지 않습니다.
                </li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/14_server_notice_dialog.png" alt="서버 재시작 예고 팝업" className="w-full h-auto object-cover" />
              </div>
              <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                창에는 늘 <strong>저장하지 않은 변경이 있으면 지금 저장해 주십시오</strong> 안내가 함께 붙습니다.
                편집 중인지 아닌지를 가리지 않고 항상 띄우므로, 이 창을 보면 <strong>먼저 저장한 뒤</strong> 기다려
                주십시오. 서버가 내려가는 동안 저장하지 않은 내용은 되살릴 수 없습니다.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                서버가 내려간 동안 화면을 새로고침하면 <strong className="font-semibold">서버에 연결할 수 없습니다</strong> 안내가 나옵니다.
                로그아웃된 것이 아니므로 다시 로그인할 필요가 없습니다. 서버가 돌아오면 보고 있던 화면으로
                저절로 되돌아갑니다.
              </p>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">1.5 내 정보 — 이름과 비밀번호 바꾸기</h3>
              <p className="text-slate-600 dark:text-slate-300">
                화면 오른쪽 위에 있는 <strong className="font-semibold">자기 이름을 클릭</strong>하면
                <strong className="font-semibold"> 내 정보</strong> 화면이 열립니다. 여기서 표시 이름과 비밀번호를 스스로 바꿉니다.
                1.2 의 비밀번호 변경 화면은 첫 로그인처럼 <strong className="font-semibold">반드시 바꿔야 하는 때</strong>에만 나타나므로,
                평소에 바꾸려면 이 화면으로 들어오십시오.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>
                  <strong className="font-semibold">이름</strong>: 고쳐서 <strong className="font-semibold">저장</strong>을 누르면 곧바로
                  반영됩니다. 이 이름은 프로젝트 멤버 목록, 일정의 담당자와 수정 이력, 댓글에 그대로 나타나므로
                  <strong className="font-semibold"> 남이 나를 알아볼 수 있는 이름</strong>으로 두십시오.
                </li>
                <li>
                  <strong className="font-semibold">비밀번호</strong>: <strong className="font-semibold">현재 비밀번호</strong>를 함께 넣어야
                  바꿀 수 있습니다. 새 비밀번호는 현재 비밀번호와 달라야 합니다(그 밖의 제한은 1.2 와 같이 없습니다).
                  바꾼 뒤에도 <strong className="font-semibold">로그인은 그대로 유지</strong>되므로 다시 로그인하지 않아도 됩니다.
                </li>
                <li>
                  <strong className="font-semibold">ID 는 바꿀 수 없습니다.</strong> 로그인과 기록을 잇는 값이라 관리자도 바꾸지 않습니다.
                  ID 를 잘못 발급받았다면 관리자에게 계정을 다시 만들어 달라고 요청하십시오.
                </li>
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                비밀번호를 잊었을 때는 스스로 되돌릴 수 없습니다. 관리자에게 초기화를 요청하면 임시 비밀번호를
                받게 되고, 그 비밀번호로 로그인하면 1.2 의 변경 화면이 나타납니다.
              </p>
            </div>
          </section>

          {/* 2. 화면 둘러보기 */}
          <section id="sec-2" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">2</span>
              화면 둘러보기
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              로그인 후 화면 상단 헤더 툴바에서 주요 메뉴로 빠르게 이동할 수 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300 mt-2">
              <li><strong className="font-semibold">로고 및 일정관리 시스템 제목</strong>: 클릭 시 언제든지 프로젝트 목록(홈)으로 이동합니다.</li>
              <li><strong className="font-semibold">사용설명서 버튼</strong>: 이 사용설명서 페이지(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/help</code>)로 빠르게 이동합니다.</li>
              <li><strong className="font-semibold">테마 전환 (해/달 아이콘)</strong>: 라이트 모드와 다크 모드를 원클릭으로 전환합니다.</li>
              <li><strong className="font-semibold">🔒 관리자 전용 아이콘</strong>: 사용자 관리, 자동완성 관리, 관리자 모드 토글 스위치.</li>
            </ul>
          </section>

          {/* 3. 프로젝트 목록 다루기 */}
          <section id="sec-3" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">3</span>
              프로젝트 목록 다루기
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">3.1 목록 보기와 정렬</h3>
              <p className="text-slate-600 dark:text-slate-300">
                홈 화면(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/</code>)에서는 접근 가능한 프로젝트 목록을 조율하고 검색할 수 있습니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/02_projects_list.png" alt="프로젝트 목록 화면" className="w-full h-auto object-cover" />
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">검색 & 정렬</strong>: 검색창을 통한 프로젝트 이름 검색, 컬럼 헤더 클릭 시 오름차순/내림차순 정렬</li>
                <li><strong className="font-semibold">세로 스크롤</strong>: 등록된 프로젝트가 <strong className="font-semibold">한 줄로 모두 이어져</strong> 있습니다. 목록 아래의 페이지 번호(1 2 3)는 없어졌고, 표 안에서 세로로 스크롤해 내려보면 됩니다. 스크롤을 내려도 <strong className="font-semibold">표 머리글은 위에 남으므로</strong> 어느 칸이 무엇인지 계속 알 수 있습니다. 검색창과 지연 현황 카드도 스크롤과 무관하게 늘 화면에 남습니다.</li>
                <li><strong className="font-semibold">기본 정렬</strong>: 헤더로 정렬을 고르기 전에는 <strong className="font-semibold">가장 최근에 수정한 프로젝트가 맨 위</strong>에 옵니다. 손이 자주 가는 프로젝트를 목록 위쪽에서 바로 찾을 수 있습니다. 목록에서 프로젝트를 고쳐도 그 행이 화면 안에서 자리만 옮기므로, 보고 있던 항목을 놓치지 않습니다.</li>
                <li><strong className="font-semibold">수정일</strong>: 프로젝트 자체를 고친 때(이름·설명·보관 상태)와 <strong className="font-semibold">일정을 고친 때</strong>(추가·수정·순서 변경·삭제) 중 더 최근 날짜입니다. 날짜에 마우스를 올리면 일정이 마지막으로 바뀐 시각을 분 단위까지 볼 수 있습니다. 댓글 작성은 수정일에 반영되지 않습니다.</li>
                <li><strong className="font-semibold">컬럼 폭 조절</strong>: 경계선을 드래그하여 컬럼 너비를 자유롭게 조절(자동 저장). 표는 화면 폭을 가득 채우며, 남는 폭은 설명 컬럼이 흡수합니다.</li>
                <li><strong className="font-semibold">🔒 상태 필터</strong>: 관리자 모드에서는 검색창 오른쪽에 <strong className="font-semibold">전체 / 활성 / 보관</strong> 필터가 나타납니다.</li>
                <li><strong className="font-semibold">🔒 프로젝트 생성을 위한 새 프로젝트 화면</strong>: 매니저/관리자는 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">+ 새 프로젝트</code>를 클릭해 수월하게 프로젝트를 추가합니다.</li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/03_project_new.png" alt="새 프로젝트 작성" className="w-full h-auto object-cover" />
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.2 프로젝트 명칭 바로 고치기 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                ADMIN 계정이 <strong className="font-semibold">관리자 모드를 켠 상태</strong>에서는 프로젝트 이름을 그 자리에서 고칠 수 있습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">목록에서</strong>: 행에 마우스를 올리면 이름 옆에 <strong className="font-semibold">연필 아이콘</strong>이 나타납니다. 누르면 그 칸이 입력창으로 바뀝니다.</li>
                <li><strong className="font-semibold">프로젝트 상세 화면에서</strong>: 제목 옆의 연필 아이콘을 눌러 같은 방식으로 고칩니다.</li>
                <li><strong className="font-semibold">Enter</strong> 로 저장하고 <strong className="font-semibold">ESC</strong> 로 취소합니다. 앞뒤 공백은 저장할 때 자동으로 잘립니다(최대 128자).</li>
                <li>저장하는 사이에 다른 사람이 같은 프로젝트를 먼저 고쳤다면 변경이 거부되고 안내가 뜹니다. 이때 입력한 이름은 사라지지 않으니, 화면을 새로고침해 최신 내용을 확인한 뒤 다시 저장하십시오.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.3 보관과 복원 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                관리자 모드에서는 목록 맨 오른쪽에 <strong className="font-semibold">관리</strong> 컬럼이 나타나고, 행마다 <strong className="font-semibold">보관 / 복제 / 삭제</strong> 버튼이 놓입니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">보관</strong>: 끝난 프로젝트를 목록에서 걷어냅니다. 데이터는 그대로 남고 상태만 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">보관</code> 으로 바뀝니다. 누르면 확인 창이 한 번 뜹니다.</li>
                <li><strong className="font-semibold">복원</strong>: 보관된 프로젝트의 같은 자리에 나타납니다. 눌러서 언제든 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">활성</code> 으로 되돌릴 수 있습니다(확인 창 없음).</li>
                <li><strong className="font-semibold">삭제</strong>: <strong className="font-semibold">보관된 프로젝트에만</strong> 보입니다. 프로젝트 이름을 정확히 입력해야 실행되며, 일정·댓글·이력이 모두 영구히 사라집니다.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.4 프로젝트 복제 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                1호기·2호기처럼 <strong className="font-semibold">일정 구조가 거의 같은 프로젝트를 반복해서 만들 때</strong> 씁니다. 잘 만들어 둔 프로젝트를
                템플릿 삼아, 일정 트리는 그대로 물려받고 날짜만 새 기간으로 옮긴 새 프로젝트를 한 번에 만듭니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">어디서 시작하나</strong>: 목록 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">관리</code> 컬럼의 <strong className="font-semibold">복제</strong> 버튼, 또는 프로젝트 상세 화면 오른쪽 위 툴바의 복제(서류 두 장) 아이콘.</li>
                <li><strong className="font-semibold">보관된 프로젝트도 복제할 수 있습니다.</strong> 지난 호기를 템플릿으로 써도 새로 만들어지는 프로젝트는 항상 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">활성</code> 으로 시작합니다.</li>
              </ul>
              <p className="text-slate-600 dark:text-slate-300 mt-3">
                복제 화면(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/projects/:id/clone</code>)에서 이름·설명·일정 처리 방식·멤버를 정합니다. 일정 처리는 세 가지 중 하나를 고릅니다.
              </p>
              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border w-32">일정 처리</th>
                      <th className="p-2 border w-40">입력하는 값</th>
                      <th className="p-2 border">결과</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-semibold">날짜 그대로</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">없음</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">원본 날짜를 손대지 않고 그대로 복사합니다.</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">통째로 밀기</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">새 시작일</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">전체 일정을 통째로 옮깁니다. <strong className="font-semibold">각 작업의 기간과 작업 사이 간격은 그대로</strong> 유지됩니다.</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">기간에 맞추기</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">새 시작일 + 새 종료일</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">원본 전체 기간을 새 기간에 비례해 늘리거나 줄입니다. 6개월짜리를 12개월로 늘리면 2주 작업은 4주가 됩니다.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                날짜를 입력하면 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">복제 후: 2026-09-01 ~ 2027-02-24</code> 처럼 예상 결과가 즉시 표시됩니다.
                원본에 날짜가 들어 있는 일정이 하나도 없으면 뒤의 두 가지는 선택할 수 없습니다.
              </p>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 mt-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs mb-1.5">무엇이 복사되고, 무엇이 복사되지 않나</div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <li><strong className="font-semibold">복사됩니다</strong>: 일정 트리 전체(제목·설명·그룹/일정 구분·순서·계층), 일정(ITEM)의 시작일·종료일</li>
                  <li><strong className="font-semibold">복사되지 않습니다</strong>: 진행률(<strong className="font-semibold">전부 0% 로 초기화</strong>), 댓글, 원본의 변경 이력</li>
                  <li><strong className="font-semibold">멤버</strong>: 원본 멤버가 역할까지 채워진 채로 뜹니다. 체크를 풀어 제외하거나, MANAGER ↔ MEMBER 를 바꾸거나, 검색으로 새 인원을 추가할 수 있습니다. MANAGER 는 최소 1명이 필요합니다. <strong className="font-semibold">그룹으로 담기</strong> 로 부서째 한 번에 채울 수도 있습니다(9.3 참고).</li>
                </ul>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                복제로 만들어진 일정은 상세 편집 창의 이력에 &quot;다른 프로젝트에서 복제되어 생성됨&quot; 으로 표시되어, 어디서 온 일정인지 나중에도 확인할 수 있습니다.
              </p>
            </div>
          </section>

          {/* 4. 예상 진척률과 지연 검출 원리 */}
          <section id="sec-delay" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 text-sm">4</span>
              🚨 예상 진척률과 지연 검출 원리
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                각 일정 항목은 시작일부터 종료일까지 <strong className="font-semibold">주말(토요일, 일요일)을 제외한 평일(영업일)</strong> 동안 매일 일정한 속도로 진행된다고 가정하여 <strong className="font-semibold">오늘 날짜 기준 달성해야 할 예상 진척률(Expected Progress)</strong>을 산출합니다.
              </p>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  1. 영업일(주말 제외) 기준 예상 진척률 공식
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li><strong className="font-semibold">오늘 &lt; 시작일</strong>: <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">0%</code> (아직 시작하지 않은 일정)</li>
                  <li><strong className="font-semibold">오늘 &ge; 종료일</strong>: <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">100%</code> (이미 기간이 지난 일정이므로 100% 완료가 목표)</li>
                  <li><strong className="font-semibold">시작일 &le; 오늘 &lt; 종료일</strong>:
                    <br />
                    <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono mt-1 inline-block">
                      예상 진척률(%) = (시작일~오늘 경과 영업일 수) / (전체 기간 영업일 수) × 100
                    </code>
                  </li>
                  <li className="text-sky-700 dark:text-sky-300 font-medium">
                    ⓘ <strong className="font-semibold">주말 특성</strong>: 토요일과 일요일에는 영업일수가 증가하지 않으므로 예상 진척률이 오르지 않고 금요일 종료 시점의 진척률이 동결 유지됩니다.
                  </li>
                </ul>

              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  2. 지연 차이(delayGap) 및 상태 기준
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    지연 차이 = 예상 진척률 - 실제 진척률 (%)
                  </code>
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-2 border w-24">상태</th>
                        <th className="p-2 border w-36">판단 기준</th>
                        <th className="p-2 border">시각적 효과 및 특징</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="p-2 border font-bold text-red-600 dark:text-red-400">🚨 심각 지연</td>
                        <td className="p-2 border font-mono">30% 이상 미달 (또는 마감일 초과)</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          눈길을 끄는 🚨 <strong className="font-semibold">펄스(Ping Pulse) 경고 뱃지</strong>와 붉은색 그라데이션이 적용되어 즉시 구별할 수 있습니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-semibold text-amber-600 dark:text-amber-400">⚠️ 주의 지연</td>
                        <td className="p-2 border font-mono">15% ~ 29% 미달</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          ⚠️ <strong className="font-semibold">주황색 주의 뱃지</strong>와 하이라이트 배경으로 지연 위험을 알려줍니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-medium text-blue-600 dark:text-blue-400">📉 소폭 지연</td>
                        <td className="p-2 border font-mono">1% ~ 14% 미달</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          예상보다 소폭 늦어지고 있는 상태를 나타냅니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-medium text-emerald-600 dark:text-emerald-400">✅ 정상</td>
                        <td className="p-2 border font-mono">지연 없음 (0% 이하)</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          정상 일정 범위 내 진행 중이거나 미리 완료된 항목입니다.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/20 space-y-3">
                <h3 className="font-semibold text-red-900 dark:text-red-300 text-sm flex items-center gap-1.5">
                  <span>🚨</span> "심각 지연" 상태가 판정되는 3가지 세부 조건
                </h3>
                <p className="text-xs text-red-800/90 dark:text-red-300/90 leading-relaxed">
                  지연 수치(%)가 작더라도 아래 조건 중 <strong>하나라도 해당하는 경우</strong> 즉시 🚨 <strong>심각 지연(CRITICAL)</strong> 상태로 판정되어 경고가 표시됩니다.
                </p>
                <ul className="list-disc pl-5 space-y-2 text-xs text-red-800/90 dark:text-red-300/90">
                  <li>
                    <strong>1) 진척률 30% 이상 미달 (delayGap &ge; 30%)</strong>: 예상 진행률 대비 실제 완료율 차이가 30% 이상 벌어진 경우
                  </li>
                  <li>
                    <strong>2) 마감일(종료일) 초과 미완료 (isOverdue)</strong>: 지연 수치(%)가 30% 미만(예: 5%, 29% 등)이더라도, <strong>종료일이 이미 지났는데 100% 완료되지 않은 일정</strong>은 무조건 심각 지연으로 처리됩니다. (툴팁 안내: <em>"마감일 경과 항목이 존재합니다."</em>)
                  </li>
                  <li>
                    <strong>3) 하위 세부 일정 전파 (Bubble-up)</strong>: 프로젝트 전체나 상위 그룹 노드의 지연%는 하위 항목들의 평균 수치로 계산되지만, 하위 세부 일정 중 <strong>마감 초과 또는 심각 지연 항목이 1개라도 있으면</strong> 상위 전체 상태가 심각 지연으로 전파됩니다.
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-3">
                <h3 className="font-semibold text-amber-900 dark:text-amber-300 text-sm flex items-center gap-1.5">
                  <span>⚡</span> 단기 일정(영업일 1~3일) 조기 지연 완화 정책
                </h3>
                <p className="text-xs text-amber-800/90 dark:text-amber-400/90 leading-relaxed">
                  1~3일짜리 단기 일정은 작업 마감일이나 퇴근 무렵 100%로 한 번에 처리하는 현장 특성을 고려하여, <strong className="font-semibold">진행 중일 때 불필요한 지연 경고가 뜨지 않도록 완화</strong>됩니다.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800/90 dark:text-amber-400/90">
                  <li><strong className="font-semibold">진행 중 (오늘 &lt; 종료일)</strong>: 진척률을 당장 입력하지 않았더라도 진행 중인 동안은 <strong className="font-semibold">✅ 정상(ON_TRACK)</strong> 상태를 유지합니다.</li>
                  <li><strong className="font-semibold">종료일 당일 (오늘 ＝ 종료일)</strong>: 오늘이 마감일인데 미완료된 경우 <strong className="font-semibold">⚠️ 주의(WARNING)</strong> 경고로 리마인드합니다.</li>
                  <li><strong className="font-semibold">종료일 경과 (오늘 &gt; 종료일)</strong>: 마감일이 지났는데 완료(100%)되지 않은 경우 <strong className="font-semibold">🚨 심각 지연(CRITICAL)</strong>으로 판정됩니다.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  3. 그룹(GROUP) 노드의 지연 상태 전파(Bubble-up) 규칙
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  그룹 노드는 통째 기간의 선형 착시를 방지하기 위해 <strong className="font-semibold">하위 세부 일정(ITEM)들의 지연 상태를 상위 그룹으로 전파(Bubble-up)</strong>하여 결정합니다.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <li><strong className="font-semibold">🚨 심각 지연</strong>: 하위 세부 일정 중 🚨 <strong className="font-semibold">심각 지연 항목이 1개라도 존재하는 경우</strong> 즉시 상위 그룹 전체로 경고가 전파됩니다.</li>
                  <li><strong className="font-semibold">⚠️ 주의 지연</strong>: 하위 세부 일정 중 심각 지연은 없으나 ⚠️ <strong className="font-semibold">주의 지연 항목이 존재하는 경우</strong> 주의 상태로 전파됩니다.</li>
                  <li><strong className="font-semibold">✅ 정상</strong>: 하위 세부 일정이 모두 제시간에 진행 중인 경우 그룹도 <strong className="font-semibold">정상</strong>으로 표기되어 억울한 허위 지연 착시가 완전히 방지됩니다.</li>
                </ul>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  4. 주요 활용 및 시각 효과
                </h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong className="font-semibold">프로젝트 목록 요약 카운터</strong>: 상단 대시보드 위젯에서 전체/심각지연/주의/정상 개수를 한눈에 확인하고, 클릭 한 번으로 지연된 프로젝트만 모아볼 수 있습니다.</li>
                  <li><strong className="font-semibold">진척 바 상의 예상 마커(Needle Marker)</strong>: 일정 상세 창이나 목록의 진행 바 상에 <strong className="font-semibold">오늘 기준 예상 목표 위치(세로 핀)</strong>가 표시되어 눈으로 즉시 차이를 파악할 수 있습니다.</li>
                  <li><strong className="font-semibold">⚠️ 지연 항목만 보기 필터</strong>: 일정 트리 상단의 지연 항목 버튼을 누르면 프로젝트 내 지연 중인 일정들만 빠르게 선별해 검토할 수 있습니다.</li>
                </ul>
              </div>

            </div>
          </section>

          {/* 5. 일정 트리 다루기 */}
          <section id="sec-4" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">5</span>
              일정 트리 다루기 — 그룹과 일정
            </h2>

            <div className="space-y-4 text-sm leading-relaxed">
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">5.1 그룹(GROUP)과 일정(ITEM)의 차이</h3>
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 상세 화면 왼쪽 영역에는 일정 트리가 위치합니다. 일정은 <strong className="font-semibold">GROUP(그룹)</strong>과 <strong className="font-semibold">ITEM(일정)</strong>으로 구별됩니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/04_project_gantt_detail.png" alt="프로젝트 상세 및 간트 차트" className="w-full h-auto object-cover" />
              </div>

              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border">구분</th>
                      <th className="p-2 border">GROUP (그룹)</th>
                      <th className="p-2 border">ITEM (일정)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-semibold">역할</td>
                      <td className="p-2 border">하위 일정을 담는 폴더</td>
                      <td className="p-2 border">실제 작업 단위</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">시작/종료일</td>
                      <td className="p-2 border text-amber-700 dark:text-amber-400 font-medium">직접 입력 불가 (자식 일정에서 자동 계산)</td>
                      <td className="p-2 border">직접 입력</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">진행률</td>
                      <td className="p-2 border text-amber-700 dark:text-amber-400 font-medium">직접 입력 불가 (자식 일정들의 평균)</td>
                      <td className="p-2 border">직접 입력 (0~100%)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">5.2 체크박스 다중 선택 및 일정 조정 (Offset)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                트리 노드 좌측의 <strong className="font-semibold">체크박스</strong>를 선택하면 다중 선택 모드가 활성화되어 간트 차트 상단에 <strong className="font-semibold">임시 팝업 툴바</strong>가 표시됩니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>100% 완료</b>: 선택한 모든 일정(또는 그룹 하위 일정)의 진척율을 100% 완료 상태로 일괄 변경합니다.</li>
                <li><b>일정 조정</b>: 선택한 일정들의 기간을 <b>N일만큼 앞으로(당김:-N일) 또는 뒤로(연기:+N일)</b> 일괄 이동시킵니다. 선택 대상에 그룹(GROUP)이 포함되어 있으면 그 하위에 속한 자손 일정(ITEM)들의 시작일과 종료일이 함께 이동됩니다.</li>
                <li><b>삭제 (🔒 매니저/관리자)</b>: 선택한 노드 및 자손 항목 전체를 일괄 영구 삭제합니다.</li>
                <li><b>선택 해제</b>: 체크박스 선택 상태를 전체 초기화합니다.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">5.3 드래그 앤 드롭으로 순서·부모 바꾸기 (🔒 매니저/관리자)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                행에 마우스를 올리면 제목 왼쪽 끝에 <b>드래그 핸들(⠿)</b>이 나타납니다. 이 핸들을 잡고 끌면 <b>형제 간 순서 변경</b>과 <b>부모 그룹 변경</b>을 한 동작으로 처리할 수 있습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>위아래로 끌기</b>: 놓일 자리가 가로 <b>삽입선</b>으로 표시됩니다.</li>
                <li><b>좌우로 끌기</b>: 같은 자리에서도 오른쪽으로 밀면 <b>바로 위 그룹의 자식</b>으로, 왼쪽으로 당기면 <b>상위 그룹 밖으로</b> 빠집니다. 삽입선의 들여쓰기 위치가 곧 새 부모입니다.</li>
                <li><b>커서 배지</b>: 끄는 동안 결과를 미리 알려주는 문구가 커서를 따라다닙니다. 순서만 바뀌면 <span className="font-mono text-xs">3번째로 이동</span>, 부모가 바뀌면 <span className="font-mono text-xs">&quot;○○&quot; 안 3번째로 이동</span>, 최상위로 뺄 때는 <span className="font-mono text-xs">최상위 3번째로 이동</span>으로 표시됩니다.</li>
                <li><b>자동 스크롤</b>: 트리의 위/아래 가장자리로 끌면 알아서 스크롤됩니다.</li>
                <li><b>취소</b>: 놓기 전에 <b>Esc</b>를 누르거나 트리 밖에 놓으면 아무 일도 일어나지 않습니다.</li>
              </ul>
              <p className="text-slate-600 dark:text-slate-300">
                놓을 수 없는 자리에서는 배지가 붉게 바뀌며 이유를 알려줍니다.
              </p>
              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border">배지 문구</th>
                      <th className="p-2 border">뜻</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-medium">자기 하위로는 옮길 수 없습니다</td>
                      <td className="p-2 border">자기 자신이나 자기 자손 아래로는 넣을 수 없습니다(트리가 끊어집니다).</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">일반 항목에는 넣을 수 없습니다</td>
                      <td className="p-2 border">ITEM(일정)은 하위를 가질 수 없으므로 부모가 될 수 없습니다.</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">최대 깊이 10단계를 넘습니다</td>
                      <td className="p-2 border">끌고 있는 가지의 높이까지 더해서 판단합니다. 3단 짜리 그룹은 8단계 자리에 넣을 수 없습니다.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-slate-600 dark:text-slate-300 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md p-3">
                편집 권한이 없으면 드래그 핸들 자체가 나타나지 않습니다. 또한 서버에 이동을 반영하는 동안에는 잠깐 드래그가 잠기며, 핸들에 마우스를 올리면 &quot;앞서 옮긴 일정을 반영하는 중입니다&quot; 툴팁이 뜹니다. 드래그가 어렵거나 멀리 떨어진 그룹으로 옮길 때는 행 액션의 <b>↑ 위로 / ↓ 아래로</b> 버튼과 <b>⇄ 부모 그룹 변경</b> 대화상자를 쓰면 됩니다.
              </p>
            </div>
          </section>

          {/* 5. 간트/타임라인 뷰 */}
          <section id="sec-5" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">6</span>
              간트/타임라인 뷰 & 내보내기
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                시간 축에 맞춰 일정 막대를 시각화합니다. 🔒 편집 권한이 있으면 막대를 마우스 드래그하여 이동하거나 날짜 기간을 직접 확장할 수 있습니다.
              </p>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">6.1 확대·축소(배율)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                간트 도구막대에서 시간 축의 배율을 조절합니다. 프로젝트 상세 화면과 타임라인 화면이 같은
                도구막대를 씁니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>
                  <strong className="font-semibold">－ / ＋ 버튼</strong>: 한 번 누를 때마다 <strong className="font-semibold">10%씩</strong> 확대·축소합니다.
                  키보드 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">-</code> /
                  <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">+</code> 로도 됩니다.
                </li>
                <li>
                  <strong className="font-semibold">슬라이더</strong>: 두 버튼 사이의 막대를 끌면 한 번에 원하는 배율로 맞출 수 있습니다.
                  10%씩 움직이는 버튼을 여러 번 누르지 않아도 됩니다.
                </li>
                <li>
                  <strong className="font-semibold">현재 배율 표시</strong>: 버튼 오른쪽에 <strong className="font-semibold">100%</strong> 처럼 지금 배율이 숫자로 나옵니다.
                  하루가 기본 너비로 보이는 상태가 100% 이며, <strong className="font-semibold">1%부터 278%까지</strong> 움직입니다.
                </li>
                <li>
                  <strong className="font-semibold">화면맞춤</strong>: 프로젝트 전체 기간이 화면 폭에 꼭 맞도록 배율을 자동으로 맞춥니다.
                </li>
                <li>
                  <strong className="font-semibold">오늘</strong>: 배율은 그대로 두고 오늘 날짜가 보이는 위치로 이동합니다.
                </li>
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                축소하다 보면 시간 축의 눈금이 일 → 주 → 월 → 분기로 저절로 바뀝니다. 배율에 따라 알맞은
                눈금이 골라지는 것이며 따로 고를 필요가 없습니다.
              </p>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">6.2 내보내기 메뉴</h3>
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 헤더 오른쪽의 <strong className="font-semibold">내보내기(아래 화살표) 아이콘</strong>을 누르면 세 가지 형식이 나옵니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">엑셀 간트차트 내보내기(.xlsx)</strong> — 아래 6.3 참고</li>
                <li><strong className="font-semibold">CSV 내보내기(.csv)</strong> — 일정 목록을 표 형태로 저장합니다. <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">일정1~일정5</code>(단계별 제목), <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">시작일</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">종료일</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">진척율</code> 8개 컬럼이며, 그룹은 자동 계산된 기간과 평균 진행률이 들어갑니다. 엑셀에서 한글이 깨지지 않게 저장됩니다.</li>
                <li><strong className="font-semibold">이미지로 내보내기(PNG)</strong> — 전체 간트 차트를 라이트/다크 테마 고해상도 이미지로 저장합니다.</li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/06_gantt_export_dialog.png" alt="간트 내보내기 설정" className="w-full h-auto object-cover" />
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">6.3 엑셀 간트차트 내보내기 (.xlsx)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                화면의 간트 차트를 <strong className="font-semibold">엑셀 파일 그대로</strong> 받는 기능입니다. 이미지가 아니라 실제 셀로 만들어지므로,
                엑셀에서 열어 편집하거나 보고서에 붙여 쓸 수 있습니다. 일정 막대는 셀 배경색으로 그려집니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                만들어지는 시트(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">일정표</code>)의 왼쪽에는 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">일정 1단계 ~ 일정 5단계</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">구분</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">시작일</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">종료일</code>, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">진행률</code>
                컬럼이 놓이고, 그 오른쪽으로 시간 축이 이어집니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-3">
                메뉴에서 고르면 설정 창이 뜹니다. 정한 뒤 <strong className="font-semibold">엑셀 다운로드</strong>를 누르면 파일이 내려받아집니다(취소는 <strong className="font-semibold">ESC</strong>).
              </p>
              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border w-36">설정</th>
                      <th className="p-2 border">설명</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-semibold">시간 단위</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">
                        일 / 주 / 월 / 분기 중 선택합니다. 고른 단위에 맞춰 엑셀 컬럼이 만들어지며, 처음에는 지금 화면에서 보고 있는 단위가 선택되어 있습니다.
                        긴 프로젝트를 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">일</code> 단위로 내보내면 컬럼이 아주 많아지니 주의하십시오.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">엑셀 색상 테마</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">
                        Light(기본) / Dark 중 선택합니다. 화면 테마와 별개로 정하며, 인쇄하거나 문서에 붙일 것이라면 Light 를 권합니다.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">
                        윤곽(Outline) 접기 포함
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">베타</span>
                      </td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">
                        켜면 엑셀에서 하위 일정을 레벨 단추(1, 2, 3…)로 접고 펼칠 수 있게 됩니다. 기본은 꺼져 있으며, 아직 베타 기능입니다.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                시간 축에는 프로젝트 시작 전과 종료 후로 각각 <strong className="font-semibold">1단위씩 여유 기간</strong>이 함께 들어갑니다.
                일정이 많으면 파일을 만드는 데 몇 초 걸릴 수 있으며, 그동안 버튼에 &quot;엑셀 생성 중…&quot; 이 표시됩니다.
              </p>
            </div>
          </section>

          {/* 6. 일정 상세 편집 */}
          <section id="sec-6" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">7</span>
              일정 상세 편집 대화상자
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                트리의 노드를 <strong className="font-semibold">더블클릭</strong>하거나 선택 후 <strong className="font-semibold">Enter</strong>를 누르면 상세 편집 창이 팝업됩니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/05_node_detail_dialog.png" alt="일정 상세 편집 창" className="w-full h-auto object-cover" />
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li><strong className="font-semibold">왼쪽</strong>: 일정 제목, 설명, 기간 설정 및 진행률 슬라이더(-10%, +10%, 100% 완료 버튼)</li>
                <li><strong className="font-semibold">오른쪽 피드</strong>: 댓글 작성/삭제 및 해당 일정의 변경 감사 이력 실시간 확인</li>
              </ul>
            </div>
          </section>

          {/* 7. 댓글과 감사 이력 */}
          <section id="sec-7" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">8</span>
              댓글과 프로젝트 감사 이력
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 헤더의 <strong className="font-semibold">이력 조회 아이콘(시계 모양)</strong>을 누르면 프로젝트 전체의 변경 로그 및 댓글을 한번에 모아볼 수 있는 이력 페이지(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/projects/:id/history</code>)로 이동합니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/07_project_history.png" alt="프로젝트 감사 이력 페이지" className="w-full h-auto object-cover" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                기간 필터(1주/1달/직접 지정) 및 주제 필터(진행률 낮춤, 삭제됨, 기간 변경, 댓글)를 조합하여 투명하게 감사를 진행할 수 있습니다.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                각 이력의 윗줄에는 그 일정이 속한 <strong className="font-semibold">상위 경로</strong>가 표시되므로, 서로 다른 그룹 밑에 있는 같은 이름의 일정을 구분할 수 있습니다. 이력을 클릭하면 프로젝트 화면으로 이동해 해당 일정이 선택된 채로 보입니다. 이미 삭제된 일정은 경로가 남지 않으며 클릭해도 이동하지 않습니다.
              </p>
            </div>
          </section>

          {/* 8. 권한과 관리자 모드 */}
          <section id="sec-8" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">9</span>
              권한과 관리자 기능 🔒
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 매니저(MANAGER) 및 관리자(ADMIN)는 멤버 관리, 계정 관리, 사용자 그룹 관리,
                자동완성 단어 동기화, 서버 재시작 예고 등을 수행합니다.
              </p>
              <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                아래 기능은 ADMIN 계정이 헤더의 <strong className="font-semibold">관리자 모드 스위치를 켠 상태</strong>에서만 화면에 나타납니다.
                끄면 본인이 멤버로 속한 프로젝트만 보이고 관리 버튼도 함께 사라집니다.
                <span className="block mt-1">
                  프로젝트 생성 · 명칭 변경(3.2) · 보관/복원(3.3) · 복제(3.4) · 영구 삭제 · 상태 필터 ·
                  사용자 그룹 관리(9.3) · 사용자 상세(9.4) · 계정 정리(9.5) · 서버 관리(9.6) · 일괄 등록(9.7)
                </span>
              </div>

              {/* 8.1 각 권한별 기능 차이 비교표 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.1 각 권한별 기능 차이 비교표</h3>
              <p className="text-slate-600 dark:text-slate-300">
                시스템 전역 역할(ADMIN / USER)과 프로젝트 내 역할(MANAGER / MEMBER / 비소속)에 따른 기능 제약 매트릭스입니다.
              </p>

              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border">기능 구분</th>
                      <th className="p-2 border bg-sky-50 dark:bg-sky-950/60">ADMIN (관리자 모드 On)</th>
                      <th className="p-2 border">ADMIN (관리자 모드 Off) / 프로젝트 MANAGER</th>
                      <th className="p-2 border">프로젝트 MEMBER</th>
                      <th className="p-2 border">비소속 USER</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <td className="p-2 border font-semibold">프로젝트 가시성</td>
                      <td className="p-2 border font-medium text-sky-700 dark:text-sky-300">전체 프로젝트 (보관 포함)</td>
                      <td className="p-2 border">소속 프로젝트만</td>
                      <td className="p-2 border">소속 프로젝트만</td>
                      <td className="p-2 border text-slate-400">비공개 (접근 불가)</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">프로젝트 생성 / 복제 / 보관 / 복원</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">프로젝트 영구 삭제</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (ARCHIVED 상태만)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">일정 (노드) 생성 및 영구 삭제</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">전체 프로젝트 가능</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">소속 프로젝트 가능</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가 (추가/삭제 버튼 비활성)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">일정 기간/진척율 수정 & 다중 일정 조정</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">전체 프로젝트 가능</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">소속 프로젝트 가능</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">소속 프로젝트 가능 (공동 편집)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">프로젝트 멤버 추가 / 제거</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">전체 프로젝트 가능</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">소속 프로젝트 가능</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">멤버 역할 승격/격상 (MEMBER ↔ MANAGER)</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">자기 자신 포함 전체 가능</td>
                      <td className="p-2 border text-amber-700 dark:text-amber-300 font-medium">타인 멤버 변경 가능 (본인 변경 불가)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">사용자 계정 관리 / 비번 리셋</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (/admin/users)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">계정 정리 (완전 삭제 / 퇴사·복직 처리)</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (9.5)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">사용자 그룹 만들기 / 인원 배정</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (9.3)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">인원별 참여 프로젝트 일괄 관리</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (9.4)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">서버 재시작 예고 등록 / 접속자 확인</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (9.6)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                사용자 관리 목록에는 <strong className="font-semibold">잠금 해제</strong> 버튼도 있으나, 현재 <strong className="font-semibold">계정 잠금 기능이 켜져 있지 않아</strong>
                로그인을 여러 번 실패해도 계정이 잠기지 않습니다. 따라서 이 버튼을 쓸 일은 없습니다.
                로그인 실패 횟수는 목록에 계속 표시되며 기록에도 남습니다.
              </p>

              {/* 8.2 프로젝트 멤버 역할 관리 (승격 및 격상) */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.2 프로젝트 멤버 역할 관리 (승격 및 격상)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 멤버 관리 페이지(<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">프로젝트 상세 → 멤버 관리</code>)에서 등록된 멤버의 역할(MEMBER ↔ MANAGER)을 드롭다운 선택으로 실시간 전환할 수 있습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>MEMBER → MANAGER (승격)</b>: 일반 멤버에게 프로젝트 관리 권한(일정 생성/삭제, 멤버 추가/제거)을 부여합니다.</li>
                <li><b>MANAGER → MEMBER (격상)</b>: 프로젝트 관리 권한을 해제하고 일반 수정 권한으로 전환합니다. (단, 프로젝트에 마지막 남은 MANAGER인 경우 해제할 수 없으며 경고 알림이 발생합니다.)</li>
                <li><b>자기 자신 역할 변경 제약</b>: 일반 MANAGER 사용자는 자신의 실수나 권한 남용을 방지하기 위해 <b>자기 자신의 역할은 변경할 수 없습니다</b> (비활성 처리). 단, ADMIN 모드의 관리자(ADMIN)는 본인의 프로젝트 역할도 변경할 수 있습니다.</li>
                <li><b>참여자 추가</b>: 검색으로 한 사람씩 넣거나, 관리자 모드에서는 <b>그룹으로 담기</b> 로 부서째 한 번에 넣습니다(9.3). 명단에는 각자의 <b>소속 그룹 배지</b>가 함께 나옵니다.</li>
                <li>
                  <b>체크박스로 여러 명을 한 번에</b>: 현재 멤버 목록과 아래 후보 목록 모두 이름 왼쪽에 체크박스가
                  있습니다. 골라 두면 목록 위에 <b>선택 N명 제거</b> · <b>선택 N명 추가</b> 버튼이 나타납니다.
                  한 명만 다룰 때는 그 행의 <b>제거</b> · <b>+ 추가</b> 버튼을 그대로 쓰면 됩니다.
                  머리의 <b>전체 선택</b>은 지금 보이는 목록만 다루므로, 검색으로 걸러 둔 상태에서 누르면
                  걸러진 사람만 골라집니다.
                </li>
                <li>
                  <b>후보 목록의 선택은 검색어를 바꿔도 유지됩니다.</b> 세 명을 고른 뒤 네 번째 사람을 찾으려
                  검색어를 넣어도 앞서 고른 사람이 풀리지 않습니다. 지금 몇 명을 골랐는지는 버튼 옆 숫자로
                  확인하십시오. 추가할 <b>역할</b>은 오른쪽 위 선택 상자의 값이 고른 전원에게 함께 적용됩니다.
                </li>
                <li>
                  <b>MANAGER 를 모두 뺄 수는 없습니다.</b> 고른 인원을 빼면 MANAGER 가 한 명도 남지 않는 경우{' '}
                  <b>전체가 거부되고 아무도 빠지지 않습니다</b>. 절반만 빠진 상태로 남는 일은 없으므로, 안내를
                  받으면 MANAGER 한 명을 선택에서 풀고 다시 누르십시오.
                </li>
                <li>
                  <b>목록 순서</b>: 현재 멤버는 MANAGER 를 위에 모아 두고 그 안에서 이름순, 후보는 이름순입니다.{' '}
                  <b>영문 이름이 한글 이름보다 앞에</b> 오므로, 한글 이름을 찾을 때는 목록 아래쪽을 보십시오.
                </li>
              </ul>

              {/* 9.3 사용자 그룹 관리 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.3 사용자 그룹 관리 (/admin/groups)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                인원을 부서 단위로 묶어 두고, 프로젝트를 만들 때 <strong className="font-semibold">그룹째로 참여자를 채우는</strong> 기능입니다.
                한 사람은 <strong className="font-semibold">한 그룹에만</strong> 속합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>
                  <strong className="font-semibold">그룹 만들기</strong>: <strong className="font-semibold">+ 최상위 그룹</strong> 으로 시작하고, 그룹 행의 <strong className="font-semibold">＋</strong> 로 하위 그룹을
                  만듭니다. 상위·하위로 엮어 조직 계층을 표현합니다. 왼쪽 계층 트리에서 그룹을 고르면
                  오른쪽에 상세가 나옵니다.
                </li>
                <li>
                  <strong className="font-semibold">인원 넣기</strong>: 상세의 <strong className="font-semibold">+ 인원 추가</strong> 로 여러 명을 한 번에 넣습니다. 고른 사람이 이미 다른
                  그룹에 속해 있으면 <strong className="font-semibold">누가 어느 그룹에 있는지 알려주고 옮길지 물어봅니다.</strong> 모르는 사이에 소속이
                  바뀌는 일이 없습니다.
                </li>
                <li>
                  <strong className="font-semibold">인원 수</strong>: 트리의 각 그룹에 <strong className="font-semibold">하위까지 합친 인원</strong>과 <strong className="font-semibold">직속 인원</strong>이 함께 나옵니다.
                </li>
                <li>
                  <strong className="font-semibold">참여 중인 프로젝트</strong>: 그룹 상세 아래쪽에 그 그룹 인원이 참여 중인 프로젝트가 나오고,
                  <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">8명 중 5명 참여</code>
                  처럼 표시됩니다. 빠뜨린 사람을 찾을 때 씁니다.
                </li>
                <li>
                  <strong className="font-semibold">그룹 삭제</strong>: <strong className="font-semibold">소속 인원이나 하위 그룹이 남아 있으면 지워지지 않습니다.</strong> 버튼에 마우스를
                  올리면 그 이유가 나옵니다. 인원을 옮기거나 뺀 뒤에 지우십시오.
                </li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/11_admin_groups.png" alt="그룹 관리 화면" className="w-full h-auto object-cover" />
              </div>

              <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300">프로젝트에 그룹째로 담기</p>
              <p className="text-slate-600 dark:text-slate-300">
                만들어 둔 그룹은 세 자리에서 씁니다 — <strong className="font-semibold">새 프로젝트</strong> 화면, <strong className="font-semibold">프로젝트 복제</strong> 화면(3.4),
                그리고 기존 프로젝트의 <strong className="font-semibold">멤버 관리</strong> 화면입니다. 어느 쪽에서든 <strong className="font-semibold">그룹으로 담기</strong> 버튼을
                누르면 그룹을 골라 인원을 한 번에 채웁니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>
                  <strong className="font-semibold">상위 그룹을 고르면 하위 그룹까지 함께</strong> 선택됩니다. 필요 없는 하위 그룹은 그 체크만 풀면
                  되고, 그때 상위 그룹은 <strong className="font-semibold">반쯤 체크된 상태</strong>로 바뀌어 일부만 골랐다는 것을 한눈에 알 수
                  있습니다.
                </li>
                <li>겹치는 사람은 <strong className="font-semibold">한 번만</strong> 들어갑니다. <strong className="font-semibold">비활성 사용자는 제외</strong>되며 몇 명이 빠지는지 알려줍니다.</li>
                <li>담긴 사람의 역할은 <strong className="font-semibold">MEMBER</strong> 입니다. 담은 뒤 명단에서 사람마다 역할을 바꾸거나 뺄 수 있습니다.</li>
                <li>
                  이 버튼은 <strong className="font-semibold">ADMIN 이 관리자 모드를 켠 상태에서만</strong> 나타납니다. 프로젝트 MANAGER 는 그룹 목록을
                  볼 수 없으므로 검색으로 한 사람씩 넣습니다.
                </li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/15_group_picker_dialog.png" alt="그룹으로 담기 창 — 상위 그룹이 반쯤 체크된 상태" className="w-full h-auto object-cover" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                위 그림에서 <strong className="font-semibold">응용기술그룹</strong>이 반쯤 체크된 것은 하위 둘 중 <strong className="font-semibold">개발팀</strong>만 골랐기 때문입니다.
                아래에 담길 인원 수와 제외되는 비활성 사용자 수가 함께 나옵니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                사용자 목록과 프로젝트 참여자 명단에는 <strong className="font-semibold">소속 그룹 배지</strong>가 붙어, 누가 어느 부서인지 바로
                보입니다. 사용자 관리 화면의 검색창에서는 <strong className="font-semibold">그룹 이름으로도</strong> 사람을 찾을 수 있습니다.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                사람이 나오는 목록은 모두 <strong className="font-semibold">이름순</strong>입니다(사용자 관리, 프로젝트 멤버 관리,
                인원 추가 대화상자, 프로젝트를 만들 때의 명단 편집기). 이때
                <strong className="font-semibold"> 영문 이름이 한글 이름보다 앞에</strong> 오므로, 한글 이름을 찾을 때는 목록 아래쪽을
                보십시오.
              </p>
              <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300">
                <strong>그룹은 명단을 복사하는 방식입니다.</strong> 프로젝트를 만들 때 그룹을 고르면 그 순간의 인원이
                참여자로 들어갑니다. <strong>나중에 그룹 인원이 바뀌어도 이미 만들어진 프로젝트의 참여자는 그대로</strong>
                입니다. 새로 들어온 사람은 그룹에 넣은 뒤 프로젝트에도 따로 넣어 주십시오 — 위의
                &quot;참여 중인 프로젝트&quot; 집계가 그 빠진 자리를 찾는 데 쓰입니다.
                <span className="mt-1 block">
                  사용자 상세(9.4)에서 <strong>소속을 옮기면</strong>, 옛 소속이 참여하던 프로젝트에서 뺄지와 새 소속이
                  참여하는 프로젝트에 넣을지를 <strong>따로 물어봅니다.</strong> 소속 변경은 이미 반영되므로 그 창을 취소해도
                  소속은 되돌아가지 않고, 프로젝트 참여만 그대로 남습니다.
                </span>
              </p>

              {/* 9.4 사용자 상세 — 인원별 참여 프로젝트 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.4 사용자 상세 — 인원별 참여 프로젝트 (/admin/users/:id)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                사용자 관리 목록에서 이름을 누르면 그 사람의 상세 화면이 열립니다. <strong className="font-semibold">한 사람을 기준으로</strong>
                참여 프로젝트와 소속 그룹을 한자리에서 다룹니다. 프로젝트를 하나씩 열어 들어가 사람을 찾는
                걸음이 없어집니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>
                  <strong className="font-semibold">참여 프로젝트</strong>: 지금 참여 중인 프로젝트가 모두 나옵니다. 각 행에서 역할을
                  MANAGER ↔ MEMBER 로 바꾸거나 <strong className="font-semibold">제외</strong> 할 수 있습니다. 보관된 프로젝트는 <strong className="font-semibold">보관됨</strong> 으로
                  표시됩니다.
                </li>
                <li>
                  <strong className="font-semibold">+ 프로젝트 일괄 추가</strong>: 프로젝트를 검색해 여러 건을 골라 한 번에 참여시킵니다. 이미
                  참여 중인 것은 <strong className="font-semibold">참여 중</strong> 으로 표시되고 건너뜁니다.
                </li>
                <li>
                  <strong className="font-semibold">소속 그룹</strong>: 같은 화면에서 소속을 옮기거나 뺍니다. 그룹 <strong className="font-semibold">자체를</strong> 만들거나 지우는 것은
                  9.3 의 그룹 관리 화면에서 합니다.
                </li>
                <li>
                  <strong className="font-semibold">표시 이름</strong>도 여기서 고칩니다. 다만 이 자리는
                  <strong className="font-semibold"> 관리자가 다른 사람의 이름을 고치는 곳</strong>입니다. 본인 이름은 각자
                  내 정보 화면에서 직접 바꿀 수 있으므로(1.5), 대신 고쳐 달라는 요청을 받았을 때만 쓰십시오.
                  비밀번호 리셋과 활성·비활성 전환은 사용자 관리 목록에서 합니다.
                </li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/12_admin_user_detail.png" alt="사용자 상세 화면" className="w-full h-auto object-cover" />
              </div>

              {/* 9.5 계정 정리 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.5 계정 정리 — 완전 삭제와 퇴사 처리</h3>
              <p className="text-slate-600 dark:text-slate-300">
                사용자 상세 화면 아래쪽 <strong className="font-semibold">계정 정리</strong> 영역에서 다룹니다. 이 시스템은 &quot;누가 언제 무엇을
                고쳤는지&quot;를 추적할 수 있어야 하므로, <strong className="font-semibold">활동 기록이 있는 계정은 지울 수 없습니다.</strong> 그래서
                두 가지 길이 있습니다.
              </p>
              <div className="overflow-x-auto my-3">
                <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <tr>
                      <th className="p-2 border">구분</th>
                      <th className="p-2 border">계정 삭제</th>
                      <th className="p-2 border">퇴사 처리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    <tr>
                      <td className="p-2 border font-semibold">쓸 수 있는 때</td>
                      <td className="p-2 border">활동 기록이 <strong className="font-semibold">하나도 없을 때</strong> (잘못 만든 계정 등)</td>
                      <td className="p-2 border">활동 기록이 있을 때 (대부분의 실제 계정)</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">결과</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">데이터베이스에서 영구히 사라집니다</td>
                      <td className="p-2 border">로그인이 막히고 목록 기본 화면에서 감춰집니다</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-semibold">되돌리기</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (복직 처리)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>
                  <strong className="font-semibold">활동 기록</strong>을 화면이 세어 보여줍니다. 지울 수 없는 계정에는 <strong className="font-semibold">무엇이 남아 있어 지울 수
                  없는지</strong> 함께 나옵니다(예: <em>이 계정은 일정 47건 수정, 댓글 3건 기록이 있어 삭제할 수 없습니다</em>).
                  참여 프로젝트나 그룹 소속처럼 <strong className="font-semibold">정리하면 없어지는 것</strong>은 &quot;정리하면 삭제할 수 있다&quot;고 따로
                  안내합니다.
                </li>
                <li>
                  <strong className="font-semibold">퇴사 처리하면</strong> 로그인이 막히고 <strong className="font-semibold">접속 중이던 세션이 즉시 끊어집니다.</strong> 프로젝트 참여자
                  선택 목록과 그룹 인원 후보에서도 빠집니다.
                </li>
                <li>
                  <strong className="font-semibold">퇴사해도 남는 것</strong>: 소속 그룹과 참여 중인 프로젝트는 그대로이고, 과거 일정 이력과 댓글의
                  이름도 그대로 남습니다.
                </li>
                <li>
                  <strong className="font-semibold">퇴사자 다시 보기</strong>: 사용자 관리 목록의 <strong className="font-semibold">퇴사자 포함</strong> 을 켜면 나타나며, 행에 <strong className="font-semibold">퇴사</strong> 표시가
                  붙습니다. 상세 화면에서 <strong className="font-semibold">복직 처리</strong> 를 누르면 다시 로그인할 수 있습니다.
                </li>
                <li>
                  <strong className="font-semibold">자기 자신은</strong> 퇴사 처리도 삭제도 할 수 없습니다.
                </li>
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <strong className="font-semibold">비활성</strong>과 <strong className="font-semibold">퇴사</strong>는 뜻이 다릅니다. 비활성은 &quot;잠시 접속을 막음&quot; 이라 목록에 그대로
                보이고, 퇴사는 &quot;조직을 떠나 목록에서 감춤&quot; 입니다.
              </p>

              {/* 9.6 서버 관리 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.6 서버 관리 — 재시작 예고와 접속자 확인 (/admin/server)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                서버를 다시 시작하기 전에 <strong className="font-semibold">쓰고 있는 사람에게 미리 알리고</strong>, 지금 누가 접속해 있는지
                확인하는 화면입니다. 사용자 쪽에 무엇이 뜨는지는 1.4 를 참고하십시오.
              </p>
              <p className="mt-2 font-semibold text-slate-700 dark:text-slate-300">재시작 예고</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>
                  <strong className="font-semibold">빠른 선택</strong>(5분 뒤 · 10분 뒤 · 30분 뒤)으로 시각을 채우거나, 내일 새벽처럼 미리 잡을
                  때는 날짜와 시각을 직접 고릅니다. 빠른 선택은 <strong className="font-semibold">서버 시계</strong>를 기준으로 계산하므로 관리자 PC
                  시계가 어긋나 있어도 정확합니다.
                </li>
                <li>
                  <strong className="font-semibold">안내 문구</strong>는 기본값이 채워져 있어 그대로 등록해도 됩니다. 이 문구가 사용자 팝업에
                  그대로 나옵니다.
                </li>
                <li>
                  <strong className="font-semibold">이미 지난 시각은 등록되지 않습니다.</strong> 등록하는 순간 이미 늦은 예고는 실수로 보아 거절합니다.
                </li>
                <li>
                  <strong className="font-semibold">예고는 한 번에 하나만</strong> 걸립니다. 걸려 있는 동안에는 등록 칸 대신 현황과 <strong className="font-semibold">예고 취소</strong>
                  버튼이 나옵니다. 시각을 바꾸려면 취소한 뒤 다시 등록하십시오.
                </li>
                <li>
                  <strong className="font-semibold">사용자에게 언제 보이는지 알려줍니다.</strong> 아직 5분 전이 아니면
                  <em> 사용자 화면에는 오후 12:25:00 부터 표시됩니다</em>, 표시 구간이면 <em>지금 사용자 화면에 표시되고
                  있습니다</em> 로 나옵니다. 예정 시각을 멀리 잡았을 때 팝업이 안 뜨는 것이 정상인지 헷갈리지
                  않게 하려는 것입니다.
                </li>
                <li>
                  <strong className="font-semibold">지난 예고 기록</strong>을 접었다 펼 수 있고, 예고가 <strong className="font-semibold">어떻게 끝났는지</strong> 구분해 보여줍니다 —
                  <strong className="font-semibold"> 관리자 취소</strong> 와 <strong className="font-semibold">서버 재시작으로 종료</strong> 가 다르게 나옵니다. 서버가 실제로 언제 재시작되었는지
                  이 기록으로 확인할 수 있습니다.
                </li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/13_admin_server.png" alt="서버 관리 화면 — 재시작 예고와 접속자 목록" className="w-full h-auto object-cover" />
              </div>

              <p className="mt-2 font-semibold text-slate-700 dark:text-slate-300">현재 접속자</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li>이름, <strong className="font-semibold">마지막 활동</strong>(몇 분 전), <strong className="font-semibold">접속 IP</strong> 가 나오고 30초마다 저절로 갱신됩니다.</li>
                <li>
                  <strong className="font-semibold">최근 5분 이내에 활동한 사람</strong>을 접속 중으로 봅니다. 같은 사람이 창을 여러 개 열어 두었으면
                  한 줄로 묶어 보여주고, IP 가 서로 다르면 함께 나열합니다.
                </li>
                <li>
                  <strong className="font-semibold">브라우저를 그냥 닫은 사람은 최대 5분 동안 남습니다.</strong> 서버가 알 수 없는 정보라 근사치입니다.
                  그래서 재시작 직전에는 이 목록만 믿지 말고 <strong className="font-semibold">예고를 함께 걸어 두는 것</strong>이 실질적인 대비입니다.
                </li>
                <li>
                  목록을 보는 <strong className="font-semibold">관리자 자신도 포함</strong>됩니다. 다만 이 화면을 켜 두는 것 자체는 활동으로 세지
                  않으므로, 화면만 켜 놓고 자리를 비우면 5분 뒤 목록에서 빠집니다.
                </li>
              </ul>

              {/* 9.7 텍스트 파일로 사용자 일괄 등록 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">9.7 텍스트 파일로 사용자 일괄 등록 (/admin/users)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                조직도를 적은 <strong className="font-semibold">텍스트 파일 한 장</strong>으로 그룹 계층과 계정을 한 번에 만듭니다.
                개통 시점처럼 수십 명을 넣어야 할 때, 9.1 의 개별 추가를 사람 수만큼 되풀이하지 않아도 됩니다.
                사용자 관리 화면 오른쪽 위의 <strong className="font-semibold">일괄 등록</strong> 버튼으로 엽니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-2">
                <b>형식을 처음부터 만들 필요는 없습니다.</b> 대화상자 위쪽의 <strong className="font-semibold">예시 파일 내려받기</strong> 를 누르면
                아래 형식대로 채워진 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">사용자-일괄등록-예시.txt</code> 가 저장됩니다.
                메모장 같은 편집기로 열어 조직 이름과 사람 목록만 우리 회사 것으로 바꿔 저장한 뒤, 그 파일을 그대로 다시 올리면 됩니다.
                빈 파일에서 시작하는 것보다 훨씬 빠르고, 들여쓰기를 잘못 잡는 실수도 줄어듭니다.
              </p>

              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-1">파일 형식</h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>들여쓰기가 조직 계층입니다.</b> 한 단계에 <b>탭 하나</b>를 권합니다. 공백으로 맞춰도 되지만, 한 파일 안에서 탭과 공백을 섞으면 계층이 어긋납니다.</li>
                <li><b>사람은 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">- 아이디, 이름</code> 으로 적습니다.</b> 줄 앞의 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">- </code> 이 사람과 그룹을 가릅니다. 첫 쉼표만 구분자이므로 이름에 쉼표가 들어가도 잘리지 않습니다.</li>
                <li><b>이름은 자유롭게 정하셔도 됩니다.</b> 아래 예시가 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">강준서-생산기술팀</code> 처럼 부서명을 붙여 둔 것은 <b>규칙이 아니라 보기</b>입니다. <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">강준서</code> 만 써도 되고, <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">강준서-과장-생산기술팀</code> 처럼 직위를 더 넣어도 됩니다. 소속은 이름이 아니라 들여쓰기가 정하므로, 이름에 무엇을 적든 그룹 배정은 달라지지 않습니다. 나중에 바꾸고 싶으면 관리자가 사용자 상세(9.4)에서 고쳐 줍니다.</li>
                <li><b>아이디에는 한글을 쓸 수 없습니다.</b> 영문·숫자와 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">. _ -</code> 만 3~64자입니다. 부서 이름을 넣으려면 <code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">gigu01</code> 처럼 영문 약칭을 쓰십시오.</li>
                <li><b>들여쓰기 없는 사람 줄은 소속이 없는 사람</b>이 됩니다. 임원처럼 어느 팀에도 속하지 않는 인원이 여기에 듭니다.</li>
                <li><code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">#</code> 로 시작하는 줄과 빈 줄은 건너뜁니다.</li>
              </ul>
              <pre className="my-2 overflow-x-auto rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" style={{ tabSize: 2 }}>{`운영기술센터
	기구완성팀
		- gigu01, 김민준-기구완성팀
		- gigu02, 이서연-기구완성팀
	생산기술팀
		- saeng01, 박도윤-생산기술팀
	- center01, 정하준-센터장
구매팀
	- gumae01, 한지호-구매팀
- ceo01, 최정우-대표이사`}</pre>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                위 예시에서 <b>센터장</b>은 팀보다 한 단계 얕게 적어 세 팀 어디에도 속하지 않고 운영기술센터 직속이 되고,
                <b> 대표이사</b>는 들여쓰기가 없어 소속이 없습니다.
              </p>

              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-1">등록하는 순서</h4>
              <ol className="list-decimal pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>예시 파일을 내려받아 고칩니다.</b> 대화상자 위쪽의 <strong className="font-semibold">예시 파일 내려받기</strong> 로 저장한 다음, 조직 이름과 사람 목록을 우리 회사 것으로 바꿉니다. 이미 준비된 파일이 있으면 이 단계는 건너뜁니다.</li>
                <li><b>파일을 고르거나 내용을 붙여넣습니다.</b> 고른 뒤에도 아래 칸에서 바로 고칠 수 있습니다.</li>
                <li><b>&quot;확인&quot;을 누릅니다.</b> 이 단계에서는 <b>아무것도 만들어지지 않습니다.</b> 새로 만들 그룹과 사람이 몇인지, 각자 어느 그룹에 들어가는지, 고쳐야 할 줄이 몇 번째인지를 보여 줍니다.</li>
                <li><b>초기 비밀번호를 한 번 입력합니다.</b> 전원에게 같은 값이 들어가며, 각자 <b>첫 로그인 때 반드시 바꿉니다</b>(1.2).</li>
                <li><b>&quot;등록&quot;을 누릅니다.</b> 버튼 왼쪽에 지금 무엇을 해야 하는지가 늘 적혀 있으니, 등록이 눌리지 않으면 그 문구를 보십시오.</li>
              </ol>

              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-4 mb-1">알아두실 점</h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>고쳐야 할 줄이 하나라도 있으면 등록되지 않습니다.</b> 몇 번째 줄이 왜 문제인지 한꺼번에 보여 주므로, 파일을 고쳐 다시 &quot;확인&quot;을 누르십시오.</li>
                <li><b>이미 있는 아이디가 섞여 있으면</b> 목록으로 알려 주고 <b>&quot;이미 있는 아이디는 건너뛰고 나머지만 만들기&quot;</b> 선택이 나타납니다. 켜지 않으면 등록이 거절됩니다. 같은 파일을 두 번 올려도 사고가 나지 않게 하려는 것입니다.</li>
                <li><b>이미 있는 그룹은 그대로 씁니다.</b> 없는 그룹만 새로 만들며, 기존 그룹의 이름이나 상위 그룹을 덮어쓰지 않습니다.</li>
                <li><b>기존 계정은 건드리지 않습니다.</b> 이 기능은 새로 만드는 일만 합니다. 이름이나 소속을 고치는 것은 9.4 의 사용자 상세에서 합니다.</li>
                <li><b>전부 아니면 전무입니다.</b> 도중에 무엇 하나라도 실패하면 그때까지 만든 것이 모두 되돌아갑니다. 절반만 만들어진 상태가 남지 않습니다.</li>
                <li><b>미리 본 뒤 다른 관리자가 사람이나 그룹을 만들었다면</b> 등록이 거절되고 미리보기를 자동으로 다시 받아 옵니다. 입력한 내용은 그대로 남으니 처음부터 다시 하실 필요는 없습니다. 미리 본 것과 다른 결과가 조용히 만들어지는 일을 막기 위한 것입니다.</li>
                <li>만들어진 계정은 모두 <b>일반 사용자(USER)</b> 입니다. 관리자 권한은 이 기능으로 주지 않습니다.</li>
              </ul>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3">
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">멤버 관리 (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/members</code>)</div>
                  <img src="/images/08_project_members.png" alt="멤버 관리" className="rounded w-full h-auto object-cover" />
                </div>
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">사용자 관리 (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/admin/users</code>)</div>
                  <img src="/images/09_admin_users.png" alt="사용자 관리" className="rounded w-full h-auto object-cover" />
                </div>
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">자동완성 사전 (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/admin/autocomplete</code>)</div>
                  <img src="/images/10_admin_autocomplete.png" alt="자동완성 관리" className="rounded w-full h-auto object-cover" />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                관리자 화면은 위의 셋 말고도 <strong className="font-semibold">사용자 상세</strong>
                (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/admin/users/:id</code>, 9.4·9.5),
                <strong className="font-semibold"> 그룹 관리</strong>
                (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/admin/groups</code>, 9.3),
                <strong className="font-semibold"> 서버 관리</strong>
                (<code className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">/admin/server</code>, 9.6)
                가 있습니다. 모두 헤더의 관리자 아이콘에서 들어갑니다.
              </p>
            </div>
          </section>

          {/* 9. 키보드 단축키 */}
          <section id="sec-9" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">10</span>
              키보드 단축키 모음
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              <strong className="font-semibold">어느 화면에서나</strong> <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800">h</kbd> 또는 <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800">?</kbd> 키를 누르면 단축키 안내 창이 열립니다(로그인 화면에서도 열립니다).
              화면 맨 아래 <strong className="font-semibold">단축키 (?)</strong> 버튼을 눌러도 같은 창이 뜨고, 그 버튼에 마우스만 올려도 같은 목록이 미리 보입니다.
            </p>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 mb-3">
              <strong>단축키가 동작하지 않는 두 경우가 있습니다.</strong> 입력 칸에 커서가 있을 때, 그리고
              <strong> 체크박스로 여러 일정을 고르는 중</strong>일 때입니다. 뒤의 경우에는 화살표 탐색과 확대·축소까지
              함께 멈추므로, 선택을 풀고 나서 다시 쓰십시오.
            </p>
            <div className="space-y-4">
              {/* 범주 1: 메인 화면 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <span>📌 1) 메인 화면 (트리노드 & 간트차트 탐색 중)</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-2 border w-40">단축키</th>
                        <th className="p-2 border">동작 설명 및 시점</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">↑ / ↓</td>
                        <td className="p-2 border">트리 노드 목록을 위/아래로 탐색 및 선택 이동</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">← / →</td>
                        <td className="p-2 border">선택한 그룹(GROUP) 노드를 접기(Collapse) / 펴기(Expand)</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Enter / 더블클릭</td>
                        <td className="p-2 border">선택한 일정/그룹의 상세 편집 대화상자(모달) 열기. <strong className="font-semibold">Enter 는 일정을 고른 뒤에만</strong> 열립니다(더블클릭은 그 자리에서 바로 열립니다).</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + I</td>
                        <td className="p-2 border">새 일정/그룹 스마트 추가 창 팝업. <span className="font-semibold text-amber-700 dark:text-amber-300">🔒 매니저/관리자 전용</span> — 권한이 없으면 눌러도 아무 일이 없습니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + D</td>
                        <td className="p-2 border">선택한 일정 삭제 (삭제 확인 대화상자). <span className="font-semibold text-amber-700 dark:text-amber-300">🔒 매니저/관리자 전용</span>이며 <strong className="font-semibold">고른 일정이 있을 때만</strong> 동작합니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">- / + / =</td>
                        <td className="p-2 border">간트 타임라인 축소 및 확대(한 번에 10%). 확대는 <strong className="font-semibold">＋ 와 ＝ 둘 다</strong> 됩니다 — ＋ 는 Shift 를 함께 눌러야 나오므로 ＝ 가 더 편합니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Esc</td>
                        <td className="p-2 border"><strong className="font-semibold">드래그 도중</strong> 누르면 그 드래그를 취소합니다. 간트 막대는 곧바로 원래 날짜로 돌아가고, 트리 행은 이동이 취소됩니다.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 범주 2: 상세 편집 창 내부 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <span>📝 2) 일정 상세 / 편집 대화상자 내부</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-2 border w-40">단축키</th>
                        <th className="p-2 border">동작 설명 및 시점</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + , / . / /</td>
                        <td className="p-2 border">일정(ITEM) 편집 모달에서 진행률 빠른 조정 (<code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Ctrl+,</code>: -10%, <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Ctrl+.</code>: +10%, <code className="text-[11px] bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Ctrl+/</code>: 100% 완료)</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Alt + 1 / Alt + 2</td>
                        <td className="p-2 border">일정/그룹 추가 모달에서 작성할 노드의 종류(일정 ITEM ↔ 그룹 GROUP) 즉시 전환</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + Enter</td>
                        <td className="p-2 border"><strong className="font-semibold">댓글 칸에서</strong> 누르면 댓글을 저장하고 창을 닫습니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">ESC</td>
                        <td className="p-2 border">열려있는 상세 편집 모달 또는 단축키 도우미 창 닫기/취소</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 범주 3: 자동완성 목록 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <span>💡 3) 자동완성 후보 목록이 떴을 때</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse border border-slate-200 dark:border-slate-800">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="p-2 border w-40">단축키</th>
                        <th className="p-2 border">동작 설명 및 시점</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">↑ / ↓</td>
                        <td className="p-2 border">후보 사이를 오갑니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Enter</td>
                        <td className="p-2 border">고른 후보를 입력 칸에 넣습니다.</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Esc</td>
                        <td className="p-2 border">후보 목록만 닫습니다(편집 창은 그대로 열려 있습니다).</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          {/* 10. FAQ */}
          <section id="sec-10" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">11</span>
              자주 묻는 질문 (FAQ)
            </h2>
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Q. 그룹의 날짜나 진행률을 직접 바꿀 수 없나요?</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  그룹(GROUP)의 기간과 진행률은 내부 자식 일정(ITEM)들의 기간 및 평균값으로 <strong className="font-semibold">자동 집계(Effective)</strong>됩니다. 그룹의 값을 수정하시려면 내부 일정의 날짜나 진행률을 변경해 주십시오.
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Q. 일정 편집 중 &quot;다른 사용자에 의해 변경되었습니다&quot; 안내가 뜹니다.</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  동시성 안전을 위해 동일한 노드가 다른 사용자에 의해 먼저 수정된 경우 변경이 보호됩니다. 화면을 새로고침하여 최신 데이터를 반영한 뒤 다시 편집해 주십시오.
                </p>
              </div>
            </div>
          </section>

          {/* 11. 개발자 문의 및 카피라이트 */}
          <section id="sec-11" className="scroll-mt-6 pb-8">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">12</span>
              개발자 문의 및 시스템 정보
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4 text-sm">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-1">개발자 문의처</h3>
                <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                  시스템 이용 중 문의사항이나 기능 개선 요청 및 기술 지원이 필요하신 경우 아래 개발자 이메일로 문의해 주시기 바랍니다.
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <a href="mailto:joonhwan.lee@gmail.com" className="hover:underline font-mono">
                    joonhwan.lee@gmail.com
                  </a>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
                <div className="font-medium text-slate-700 dark:text-slate-300 mb-0.5">Copyright</div>
                <div>&quot;Club 300&quot; All rights reserved (c) 2026</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
