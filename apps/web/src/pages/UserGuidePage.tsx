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
              SAM Scheduler v1.0
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
                onClick={() => scrollToSection('sec-4')}
                className={`block w-full text-left px-2.5 py-1.5 rounded transition-colors ${
                  activeSection === 'sec-4'
                    ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                4. 일정 트리 다루기
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
                5. 간트/타임라인 뷰
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
                6. 일정 상세 편집
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
                      <td className="p-2 border text-slate-600 dark:text-slate-400">입력하신 계정 정보를 다시 확인하세요.</td>
                    </tr>
                    <tr>
                      <td className="p-2 border font-medium">여러 차례 실패로 계정이 일시 잠금되었습니다.</td>
                      <td className="p-2 border text-slate-600 dark:text-slate-400">실패가 반복되면 계정이 보호 잠금됩니다. 관리자에게 해제를 요청하세요.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6">1.2 첫 로그인 시 비밀번호 변경</h3>
              <p className="text-slate-600 dark:text-slate-300">
                처음 로그인하거나 관리자가 비밀번호를 초기화한 경우 **비밀번호 변경 화면**으로 이동합니다.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>최소 10자 이상, 영문·숫자·특수문자 중 3종 이상 조합</li>
                <li>비밀번호에 본인 ID를 포함할 수 없음</li>
                <li>새 비밀번호는 기존 비밀번호와 달라야 함</li>
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
              <p className="text-slate-600 dark:text-slate-300">
                홈 화면(`/`)에서는 접근 가능한 프로젝트 목록을 조율하고 검색할 수 있습니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800">
                <img src="/images/02_projects_list.png" alt="프로젝트 목록 화면" className="w-full h-auto object-cover" />
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                <li>**검색 & 정렬**: 검색창을 통한 프로젝트 이름 검색, 컬럼 헤더 클릭 시 오름차순/내림차순 정렬</li>
                <li>**컬럼 폭 조절**: 경계선을 드래그하여 컬럼 너비를 자유롭게 조절(자동 저장)</li>
                <li>**🔒 프로젝트 생성을 위한 새 프로젝트 화면**: 매니저/관리자는 `+ 새 프로젝트`를 클릭해 수월하게 프로젝트를 추가합니다.</li>
              </ul>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/03_project_new.png" alt="새 프로젝트 작성" className="w-full h-auto object-cover" />
              </div>
            </div>
          </section>

          {/* 4. 일정 트리 다루기 */}
          <section id="sec-4" className="scroll-mt-6 border-b border-slate-200 pb-8 dark:border-slate-800">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300 text-sm">4</span>
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
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-4">간트 PNG 이미지 내보내기</h3>
              <p className="text-slate-600 dark:text-slate-300">
                헤더의 내보내기 메뉴에서 **이미지로 내보내기(PNG)**를 클릭하면 전체 프로젝트 간트 차트를 라이트/다크 테마 고해상도 이미지로 변환해 내보낼 수 있습니다.
              </p>
              <div className="my-3 overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-slate-800 max-w-xl">
                <img src="/images/06_gantt_export_dialog.png" alt="간트 내보내기 설정" className="w-full h-auto object-cover" />
              </div>
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
