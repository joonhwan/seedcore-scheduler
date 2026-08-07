import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function UserGuidePage() {
  const [activeSection, setActiveSection] = useState<string>('sec-1');

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
              SAM Scheduler v1.5
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            일정관리 시스템의 주요 기능, 간트 차트 조작법, 댓글 및 이력 관리, 관리자 모드 사용법을 안내합니다.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          <span>프로젝트 목록으로</span>
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
                7. 댓글과 감사 이력
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
                8. 권한과 관리자 모드
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
                9. 키보드 단축키 모음
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
                10. 자주 묻는 질문(FAQ)
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
                11. 개발자 문의 및 카피라이트
              </button>
            </nav>
          </div>
        </aside>

        {/* 본문 콘텐츠 */}
        <main className="lg:col-span-3 space-y-10 text-slate-800 dark:text-slate-200">
          <div className="rounded-lg bg-amber-50 p-4 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
            💡 <span className="font-semibold">안내</span>: 이 사용설명서는 **일반 사용자** 기준으로 작성되었습니다. 프로젝트 매니저(MANAGER)나 관리자(ADMIN)만 사용 가능한 권한 전용 기능은 <span className="font-semibold text-amber-800 dark:text-amber-300">🔒 매니저/관리자 전용</span> 표시로 따로 구별됩니다.
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
                <li>브라우저에서 시스템 주소로 접속하면 **로그인 화면**이 표시됩니다.</li>
                <li>발급받은 **ID**와 **비밀번호**를 입력하고 **로그인** 버튼을 클릭합니다.</li>
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
                처음 로그인하거나 관리자가 비밀번호를 초기화한 경우 **비밀번호 변경 화면**으로 이동합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>새 비밀번호는 현재 비밀번호와 달라야 합니다.</li>
                <li>그 밖의 제한(길이, 문자 조합 등)은 없습니다. 다만 폐쇄망이라도 계정은 개인별로 구분되므로 짐작하기 쉬운 비밀번호는 피해 주십시오.</li>
              </ul>
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
              <li>**로고 및 일정관리 시스템 제목**: 클릭 시 언제든지 프로젝트 목록(홈)으로 이동합니다.</li>
              <li>**사용설명서 버튼**: 이 사용설명서 페이지(`/help`)로 빠르게 이동합니다.</li>
              <li>**테마 전환 (해/달 아이콘)**: 라이트 모드와 다크 모드를 원클릭으로 전환합니다.</li>
              <li>**🔒 관리자 전용 아이콘**: 사용자 관리, 자동완성 관리, 관리자 모드 토글 스위치.</li>
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
                홈 화면(`/`)에서는 접근 가능한 프로젝트 목록을 조율하고 검색할 수 있습니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/02_projects_list.png" alt="프로젝트 목록 화면" className="w-full h-auto object-cover" />
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**검색 & 정렬**: 검색창을 통한 프로젝트 이름 검색, 컬럼 헤더 클릭 시 오름차순/내림차순 정렬</li>
                <li>**기본 정렬**: 헤더로 정렬을 고르기 전에는 **가장 최근에 만든 프로젝트가 맨 위**에 옵니다. 목록에서 이름을 고치거나 보관 처리해도 그 행이 다른 페이지로 튀지 않습니다.</li>
                <li>**컬럼 폭 조절**: 경계선을 드래그하여 컬럼 너비를 자유롭게 조절(자동 저장). 표는 화면 폭을 가득 채우며, 남는 폭은 설명 컬럼이 흡수합니다.</li>
                <li>**🔒 상태 필터**: 관리자 모드에서는 검색창 오른쪽에 **전체 / 활성 / 보관** 필터가 나타납니다.</li>
                <li>**🔒 프로젝트 생성을 위한 새 프로젝트 화면**: 매니저/관리자는 `+ 새 프로젝트`를 클릭해 수월하게 프로젝트를 추가합니다.</li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/03_project_new.png" alt="새 프로젝트 작성" className="w-full h-auto object-cover" />
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.2 프로젝트 명칭 바로 고치기 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                ADMIN 계정이 **관리자 모드를 켠 상태**에서는 프로젝트 이름을 그 자리에서 고칠 수 있습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**목록에서**: 행에 마우스를 올리면 이름 옆에 **연필 아이콘**이 나타납니다. 누르면 그 칸이 입력창으로 바뀝니다.</li>
                <li>**프로젝트 상세 화면에서**: 제목 옆의 연필 아이콘을 눌러 같은 방식으로 고칩니다.</li>
                <li>**Enter** 로 저장하고 **ESC** 로 취소합니다. 앞뒤 공백은 저장할 때 자동으로 잘립니다(최대 128자).</li>
                <li>저장하는 사이에 다른 사람이 같은 프로젝트를 먼저 고쳤다면 변경이 거부되고 안내가 뜹니다. 이때 입력한 이름은 사라지지 않으니, 화면을 새로고침해 최신 내용을 확인한 뒤 다시 저장하십시오.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.3 보관과 복원 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                관리자 모드에서는 목록 맨 오른쪽에 **관리** 컬럼이 나타나고, 행마다 **보관 / 복제 / 삭제** 버튼이 놓입니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**보관**: 끝난 프로젝트를 목록에서 걷어냅니다. 데이터는 그대로 남고 상태만 `보관` 으로 바뀝니다. 누르면 확인 창이 한 번 뜹니다.</li>
                <li>**복원**: 보관된 프로젝트의 같은 자리에 나타납니다. 눌러서 언제든 `활성` 으로 되돌릴 수 있습니다(확인 창 없음).</li>
                <li>**삭제**: **보관된 프로젝트에만** 보입니다. 프로젝트 이름을 정확히 입력해야 실행되며, 일정·댓글·이력이 모두 영구히 사라집니다.</li>
              </ul>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">
                3.4 프로젝트 복제 🔒 <span className="text-xs font-normal text-amber-700 dark:text-amber-400">관리자 모드 전용</span>
              </h3>
              <p className="text-slate-600 dark:text-slate-300">
                1호기·2호기처럼 **일정 구조가 거의 같은 프로젝트를 반복해서 만들 때** 씁니다. 잘 만들어 둔 프로젝트를
                템플릿 삼아, 일정 트리는 그대로 물려받고 날짜만 새 기간으로 옮긴 새 프로젝트를 한 번에 만듭니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**어디서 시작하나**: 목록 `관리` 컬럼의 **복제** 버튼, 또는 프로젝트 상세 화면 오른쪽 위 툴바의 복제(서류 두 장) 아이콘.</li>
                <li>**보관된 프로젝트도 복제할 수 있습니다.** 지난 호기를 템플릿으로 써도 새로 만들어지는 프로젝트는 항상 `활성` 으로 시작합니다.</li>
              </ul>
              <p className="text-slate-600 dark:text-slate-300 mt-3">
                복제 화면(`/projects/:id/clone`)에서 이름·설명·일정 처리 방식·멤버를 정합니다. 일정 처리는 세 가지 중 하나를 고릅니다.
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
                      <td className="p-2 border text-slate-600 dark:text-slate-400">전체 일정을 통째로 옮깁니다. **각 작업의 기간과 작업 사이 간격은 그대로** 유지됩니다.</td>
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
                날짜를 입력하면 `복제 후: 2026-09-01 ~ 2027-02-24` 처럼 예상 결과가 즉시 표시됩니다.
                원본에 날짜가 들어 있는 일정이 하나도 없으면 뒤의 두 가지는 선택할 수 없습니다.
              </p>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800 mt-3">
                <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs mb-1.5">무엇이 복사되고, 무엇이 복사되지 않나</div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <li>**복사됩니다**: 일정 트리 전체(제목·설명·그룹/일정 구분·순서·계층), 일정(ITEM)의 시작일·종료일</li>
                  <li>**복사되지 않습니다**: 진행률(**전부 0% 로 초기화**), 댓글, 원본의 변경 이력</li>
                  <li>**멤버**: 원본 멤버가 역할까지 채워진 채로 뜹니다. 체크를 풀어 제외하거나, MANAGER ↔ MEMBER 를 바꾸거나, 검색으로 새 인원을 추가할 수 있습니다. MANAGER 는 최소 1명이 필요합니다.</li>
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
                각 일정 항목은 시작일부터 종료일까지 **주말(토요일, 일요일)을 제외한 평일(영업일)** 동안 매일 일정한 속도로 진행된다고 가정하여 **오늘 날짜 기준 달성해야 할 예상 진척률(Expected Progress)**을 산출합니다.
              </p>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  1. 영업일(주말 제외) 기준 예상 진척률 공식
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <li>**오늘 &lt; 시작일**: `0%` (아직 시작하지 않은 일정)</li>
                  <li>**오늘 &ge; 종료일**: `100%` (이미 기간이 지난 일정이므로 100% 완료가 목표)</li>
                  <li>**시작일 &le; 오늘 &lt; 종료일**:
                    <br />
                    <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] font-mono mt-1 inline-block">
                      예상 진척률(%) = (시작일~오늘 경과 영업일 수) / (전체 기간 영업일 수) × 100
                    </code>
                  </li>
                  <li className="text-sky-700 dark:text-sky-300 font-medium">
                    ⓘ **주말 특성**: 토요일과 일요일에는 영업일수가 증가하지 않으므로 예상 진척률이 오르지 않고 금요일 종료 시점의 진척률이 동결 유지됩니다.
                  </li>
                </ul>

              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  2. 지연 차이(delayGap) 및 상태 기준
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    지연 차이 = 예상 진척률 - 실제 진척률 (%p)
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
                        <td className="p-2 border font-mono">30%p 이상 미달 (또는 마감일 초과)</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          눈길을 끄는 🚨 **펄스(Ping Pulse) 경고 뱃지**와 붉은색 그라데이션이 적용되어 즉시 구별할 수 있습니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-semibold text-amber-600 dark:text-amber-400">⚠️ 주의 지연</td>
                        <td className="p-2 border font-mono">15%p ~ 29%p 미달</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          ⚠️ **주황색 주의 뱃지**와 하이라이트 배경으로 지연 위험을 알려줍니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-medium text-blue-600 dark:text-blue-400">📉 소폭 지연</td>
                        <td className="p-2 border font-mono">1%p ~ 14%p 미달</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          예상보다 소폭 늦어지고 있는 상태를 나타냅니다.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-medium text-emerald-600 dark:text-emerald-400">✅ 정상</td>
                        <td className="p-2 border font-mono">지연 없음 (0%p 이하)</td>
                        <td className="p-2 border text-slate-600 dark:text-slate-400">
                          정상 일정 범위 내 진행 중이거나 미리 완료된 항목입니다.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-3">
                <h3 className="font-semibold text-amber-900 dark:text-amber-300 text-sm flex items-center gap-1.5">
                  <span>⚡</span> 단기 일정(영업일 1~3일) 조기 지연 완화 정책
                </h3>
                <p className="text-xs text-amber-800/90 dark:text-amber-400/90 leading-relaxed">
                  1~3일짜리 단기 일정은 작업 마감일이나 퇴근 무렵 100%로 한 번에 처리하는 현장 특성을 고려하여, **진행 중일 때 불필요한 지연 경고가 뜨지 않도록 완화**됩니다.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-amber-800/90 dark:text-amber-400/90">
                  <li>**진행 중 (오늘 &lt; 종료일)**: 진척률을 당장 입력하지 않았더라도 진행 중인 동안은 **✅ 정상(ON_TRACK)** 상태를 유지합니다.</li>
                  <li>**종료일 당일 (오늘 ＝ 종료일)**: 오늘이 마감일인데 미완료된 경우 **⚠️ 주의(WARNING)** 경고로 리마인드합니다.</li>
                  <li>**종료일 경과 (오늘 &gt; 종료일)**: 마감일이 지났는데 완료(100%)되지 않은 경우 **🚨 심각 지연(CRITICAL)**으로 판정됩니다.</li>
                </ul>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 space-y-3">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  3. 그룹(GROUP) 노드의 지연 상태 전파(Bubble-up) 규칙
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  그룹 노드는 통째 기간의 선형 착시를 방지하기 위해 **하위 세부 일정(ITEM)들의 지연 상태를 상위 그룹으로 전파(Bubble-up)**하여 결정합니다.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <li>**🚨 심각 지연**: 하위 세부 일정 중 🚨 **심각 지연 항목이 1개라도 존재하는 경우** 즉시 상위 그룹 전체로 경고가 전파됩니다.</li>
                  <li>**⚠️ 주의 지연**: 하위 세부 일정 중 심각 지연은 없으나 ⚠️ **주의 지연 항목이 존재하는 경우** 주의 상태로 전파됩니다.</li>
                  <li>**✅ 정상**: 하위 세부 일정이 모두 제시간에 진행 중인 경우 그룹도 **정상**으로 표기되어 억울한 허위 지연 착시가 완전히 방지됩니다.</li>
                </ul>
              </div>

              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                  4. 주요 활용 및 시각 효과
                </h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>**프로젝트 목록 요약 카운터**: 상단 대시보드 위젯에서 전체/심각지연/주의/정상 개수를 한눈에 확인하고, 클릭 한 번으로 지연된 프로젝트만 모아볼 수 있습니다.</li>
                  <li>**진척 바 상의 예상 마커(Needle Marker)**: 일정 상세 창이나 목록의 진행 바 상에 **오늘 기준 예상 목표 위치(세로 핀)**가 표시되어 눈으로 즉시 차이를 파악할 수 있습니다.</li>
                  <li>**⚠️ 지연 항목만 보기 필터**: 일정 트리 상단의 지연 항목 버튼을 누르면 프로젝트 내 지연 중인 일정들만 빠르게 선별해 검토할 수 있습니다.</li>
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
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 상세 화면 왼쪽 영역에는 일정 트리가 위치합니다. 일정은 **GROUP(그룹)**과 **ITEM(일정)**으로 구별됩니다.
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

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">4.2 체크박스 다중 선택 및 일정 조정 (Offset)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                트리 노드 좌측의 **체크박스**를 선택하면 다중 선택 모드가 활성화되어 간트 차트 상단에 **임시 팝업 툴바**가 표시됩니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>100% 완료</b>: 선택한 모든 일정(또는 그룹 하위 일정)의 진척율을 100% 완료 상태로 일괄 변경합니다.</li>
                <li><b>일정 조정</b>: 선택한 일정들의 기간을 <b>N일만큼 앞으로(당김:-N일) 또는 뒤로(연기:+N일)</b> 일괄 이동시킵니다. 선택 대상에 그룹(GROUP)이 포함되어 있으면 그 하위에 속한 자손 일정(ITEM)들의 시작일과 종료일이 함께 이동됩니다.</li>
                <li><b>삭제 (🔒 매니저/관리자)</b>: 선택한 노드 및 자손 항목 전체를 일괄 영구 삭제합니다.</li>
                <li><b>선택 해제</b>: 체크박스 선택 상태를 전체 초기화합니다.</li>
              </ul>
            </div>
          </section>

          {/* 5. 간트/타임라인 뷰 */}
          <section id="sec-5" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">5</span>
              간트/타임라인 뷰 & 내보내기
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                시간 축에 맞춰 일정 막대를 시각화합니다. 🔒 편집 권한이 있으면 막대를 마우스 드래그하여 이동하거나 날짜 기간을 직접 확장할 수 있습니다.
              </p>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">5.1 내보내기 메뉴</h3>
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 헤더 오른쪽의 **내보내기(아래 화살표) 아이콘**을 누르면 세 가지 형식이 나옵니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**엑셀 간트차트 내보내기(.xlsx)** — 아래 5.2 참고</li>
                <li>**CSV 내보내기(.csv)** — 일정 목록을 표 형태로 저장합니다. `일정1~일정5`(단계별 제목), `시작일`, `종료일`, `진척율` 8개 컬럼이며, 그룹은 자동 계산된 기간과 평균 진행률이 들어갑니다. 엑셀에서 한글이 깨지지 않게 저장됩니다.</li>
                <li>**이미지로 내보내기(PNG)** — 전체 간트 차트를 라이트/다크 테마 고해상도 이미지로 저장합니다.</li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/06_gantt_export_dialog.png" alt="간트 내보내기 설정" className="w-full h-auto object-cover" />
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">5.2 엑셀 간트차트 내보내기 (.xlsx)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                화면의 간트 차트를 **엑셀 파일 그대로** 받는 기능입니다. 이미지가 아니라 실제 셀로 만들어지므로,
                엑셀에서 열어 편집하거나 보고서에 붙여 쓸 수 있습니다. 일정 막대는 셀 배경색으로 그려집니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                만들어지는 시트(`일정표`)의 왼쪽에는 `일정 1단계 ~ 일정 5단계`, `구분`, `시작일`, `종료일`, `진행률`
                컬럼이 놓이고, 그 오른쪽으로 시간 축이 이어집니다.
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-3">
                메뉴에서 고르면 설정 창이 뜹니다. 정한 뒤 **엑셀 다운로드**를 누르면 파일이 내려받아집니다(취소는 **ESC**).
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
                        긴 프로젝트를 `일` 단위로 내보내면 컬럼이 아주 많아지니 주의하십시오.
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
                시간 축에는 프로젝트 시작 전과 종료 후로 각각 **1단위씩 여유 기간**이 함께 들어갑니다.
                일정이 많으면 파일을 만드는 데 몇 초 걸릴 수 있으며, 그동안 버튼에 &quot;엑셀 생성 중…&quot; 이 표시됩니다.
              </p>
            </div>
          </section>

          {/* 6. 일정 상세 편집 */}
          <section id="sec-6" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">6</span>
              일정 상세 편집 대화상자
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                트리의 노드를 **더블클릭**하거나 선택 후 **Enter**를 누르면 상세 편집 창이 팝업됩니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/05_node_detail_dialog.png" alt="일정 상세 편집 창" className="w-full h-auto object-cover" />
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**왼쪽**: 일정 제목, 설명, 기간 설정 및 진행률 슬라이더(-10%, +10%, 100% 완료 버튼)</li>
                <li>**오른쪽 피드**: 댓글 작성/삭제 및 해당 일정의 변경 감사 이력 실시간 확인</li>
              </ul>
            </div>
          </section>

          {/* 7. 댓글과 감사 이력 */}
          <section id="sec-7" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">7</span>
              댓글과 프로젝트 감사 이력
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 헤더의 **이력 조회 아이콘(시계 모양)**을 누르면 프로젝트 전체의 변경 로그 및 댓글을 한번에 모아볼 수 있는 이력 페이지(`/projects/:id/history`)로 이동합니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/07_project_history.png" alt="프로젝트 감사 이력 페이지" className="w-full h-auto object-cover" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                기간 필터(1주/1달/직접 지정) 및 주제 필터(진행률 낮춤, 삭제됨, 기간 변경, 댓글)를 조합하여 투명하게 감사를 진행할 수 있습니다.
              </p>
            </div>
          </section>

          {/* 8. 권한과 관리자 모드 */}
          <section id="sec-8" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">8</span>
              권한과 관리자 기능 🔒
            </h2>
            <div className="space-y-4 text-sm leading-relaxed">
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 매니저(MANAGER) 및 관리자(ADMIN)는 멤버 관리, 계정 관리, 자동완성 단어 동기화 등을 수행합니다.
              </p>
              <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                아래 기능은 ADMIN 계정이 헤더의 **관리자 모드 스위치를 켠 상태**에서만 화면에 나타납니다.
                끄면 본인이 멤버로 속한 프로젝트만 보이고 관리 버튼도 함께 사라집니다.
                <span className="block mt-1">
                  프로젝트 생성 · 명칭 변경(3.2) · 보관/복원(3.3) · 복제(3.4) · 영구 삭제 · 상태 필터
                </span>
              </div>

              {/* 8.1 각 권한별 기능 차이 비교표 */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">8.1 각 권한별 기능 차이 비교표</h3>
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
                      <td className="p-2 border font-semibold">사용자 계정 관리 / 비번 리셋 / 잠금 해제</td>
                      <td className="p-2 border text-emerald-600 font-medium dark:text-emerald-400">가능 (/admin/users)</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                      <td className="p-2 border text-rose-600 dark:text-rose-400">불가</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 8.2 프로젝트 멤버 역할 관리 (승격 및 격상) */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-2">8.2 프로젝트 멤버 역할 관리 (승격 및 격상)</h3>
              <p className="text-slate-600 dark:text-slate-300">
                프로젝트 멤버 관리 페이지(`프로젝트 상세 → 멤버 관리`)에서 등록된 멤버의 역할(MEMBER ↔ MANAGER)을 드롭다운 선택으로 실시간 전환할 수 있습니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300 my-2">
                <li><b>MEMBER → MANAGER (승격)</b>: 일반 멤버에게 프로젝트 관리 권한(일정 생성/삭제, 멤버 추가/제거)을 부여합니다.</li>
                <li><b>MANAGER → MEMBER (격상)</b>: 프로젝트 관리 권한을 해제하고 일반 수정 권한으로 전환합니다. (단, 프로젝트에 마지막 남은 MANAGER인 경우 해제할 수 없으며 경고 알림이 발생합니다.)</li>
                <li><b>자기 자신 역할 변경 제약</b>: 일반 MANAGER 사용자는 자신의 실수나 권한 남용을 방지하기 위해 <b>자기 자신의 역할은 변경할 수 없습니다</b> (비활성 처리). 단, ADMIN 모드의 관리자(ADMIN)는 본인의 프로젝트 역할도 변경할 수 있습니다.</li>
              </ul>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3">
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">멤버 관리 (`/members`)</div>
                  <img src="/images/08_project_members.png" alt="멤버 관리" className="rounded w-full h-auto object-cover" />
                </div>
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">사용자 관리 (`/admin/users`)</div>
                  <img src="/images/09_admin_users.png" alt="사용자 관리" className="rounded w-full h-auto object-cover" />
                </div>
                <div className="rounded-lg border border-slate-200 p-2 shadow-sm dark:border-slate-800">
                  <div className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">자동완성 사전 (`/admin/autocomplete`)</div>
                  <img src="/images/10_admin_autocomplete.png" alt="자동완성 관리" className="rounded w-full h-auto object-cover" />
                </div>
              </div>
            </div>
          </section>

          {/* 9. 키보드 단축키 */}
          <section id="sec-9" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">9</span>
              키보드 단축키 모음
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              프로젝트 화면 어디서나 <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800">h</kbd> 또는 <kbd className="px-1.5 py-0.5 rounded border bg-slate-100 dark:bg-slate-800">?</kbd> 키를 누르면 아래의 단축키 안내 창을 열 수 있습니다. 단축키는 **메인 화면 탐색**과 **상세 편집 창 내부** 2가지 상황별로 구분됩니다.
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
                        <td className="p-2 border">선택한 일정/그룹의 상세 편집 대화상자(모달) 열기</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + I</td>
                        <td className="p-2 border">새 일정/그룹 스마트 추가 창 팝업</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">Ctrl + D</td>
                        <td className="p-2 border">선택한 일정 삭제 (삭제 확인 대화상자)</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">- / + (또는 =)</td>
                        <td className="p-2 border">간트 타임라인 축소 및 확대</td>
                      </tr>
                      <tr>
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">? / h</td>
                        <td className="p-2 border">키보드 단축키 안내 대화상자 토글</td>
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
                        <td className="p-2 border font-mono font-bold text-sky-600 dark:text-sky-400">ESC</td>
                        <td className="p-2 border">열려있는 상세 편집 모달 또는 단축키 도우미 창 닫기/취소</td>
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
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">10</span>
              자주 묻는 질문 (FAQ)
            </h2>
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Q. 그룹의 날짜나 진행률을 직접 바꿀 수 없나요?</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  그룹(GROUP)의 기간과 진행률은 내부 자식 일정(ITEM)들의 기간 및 평균값으로 **자동 집계(Effective)**됩니다. 그룹의 값을 수정하시려면 내부 일정의 날짜나 진행률을 변경해 주십시오.
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
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">11</span>
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
                <div>&quot;Club 300&quot; all right reserverd (c) 2029</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
