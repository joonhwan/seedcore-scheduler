// 기간이 서로 다른 시험용 프로젝트 셋을 만든다 (일정 40~70건, 계층 3단).
//
// 사용: node scripts/seed-test-projects.mjs
//       node scripts/seed-test-projects.mjs --base http://localhost:5173 --user admin --pass 비밀번호
//
// 왜 기간을 다르게 만드는가: 6차의 "기간을 지정한 출력"과 "여러 장으로 잘라 PDF 한 부"는
// 기간 길이에 따라 갈리는 기능이다. 4개월을 4주씩 넉 장, 1년을 한 달씩 열두 장, 3주를
// 1주씩 석 장으로 시험할 수 있도록 셋을 만든다. 4차의 목록 세로 스크롤과 간트 배율을
// 확인할 때도 일정이 충분히 들어 있어야 한다.
//
// 화면과 같은 API 를 거치므로 sortOrder 재조정·깊이 검사 같은 서버 규칙이 실제와 똑같이
// 적용된다. Prisma 로 행을 직접 넣으면 그 규칙을 건너뛰어 실제와 다른 데이터가 된다.
//
// 주의: scripts/cleanup-test-projects.mjs 는 데모 프로젝트 하나만 남기고 나머지를 지우므로,
// 그것을 돌리면 여기서 만든 것도 함께 사라진다.
//
// 여러 번 돌리면 같은 것이 또 생긴다. 이름이 같은 프로젝트를 걸러내지 않는다.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3000');
const USER = arg('user', 'admin');
const PASS = arg('pass', 'admin');
const ORIGIN = 'http://localhost:5173';

let cookie = '';

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      'X-Admin-Mode': '1',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith('sam_sid=')) cookie = c.split(';')[0];
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// ── 날짜 도우미 ────────────────────────────────────────────────────────────
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

const TODAY = ymd(new Date());

/** 오늘을 기준으로 그럴듯한 진행률을 매긴다. 지난 것은 완료, 걸친 것은 경과 비율, 앞은 0. */
function progressByDate(startAt, endAt) {
  if (endAt < TODAY) return 100;
  if (startAt > TODAY) return 0;
  const span = Math.max(1, daysBetween(startAt, endAt));
  const done = Math.max(0, daysBetween(startAt, TODAY));
  return Math.min(95, Math.max(5, Math.round((done / span) * 100)));
}

const PLANS = [
  {
    name: '[시험] 반도체 검사장비 개발 (4개월)',
    description: '기간 지정 출력·PDF 분할 확인용. 대부분 완료, 일부 미완료로 두어 지연 표시가 뜬다.',
    start: '2026-03-02',
    end: '2026-06-30',
    phases: ['요구 정의', '기구 설계', '제어 소프트웨어', '조립·검증', '양산 이관'],
    // 기간이 통째로 과거라 날짜 기준으로는 전부 100% 가 된다. 지연 표시를 만들려고
    // 일부러 몇 건을 남긴다.
    progressFor: (i) => (i % 7 === 3 ? 40 : i % 11 === 5 ? 0 : 100),
  },
  {
    name: '[시험] 신공장 증설 (1년)',
    description: '기간 지정 출력·PDF 분할 확인용. 오늘을 걸치는 긴 기간.',
    start: '2026-01-05',
    end: '2026-12-31',
    phases: ['부지·인허가', '토목', '건축', '설비 반입', '시운전', '준공'],
    progressFor: null, // 날짜로 계산
  },
  {
    name: '[시험] 라인 정지 긴급 대응 (3주)',
    description: '일 단위 확인용 짧은 기간.',
    start: '2026-09-07',
    end: '2026-09-25',
    phases: ['원인 조사', '임시 조치', '부품 교체', '재발 방지'],
    progressFor: null,
  },
];

const SUB_TITLES = ['설계', '검토', '제작', '시험', '문서화', '승인'];
const TASK_TITLES = [
  '사양서 작성', '도면 배포', '부품 발주', '입고 검사', '가공 의뢰',
  '조립', '배선', '단위 시험', '통합 시험', '결함 수정',
  '성능 측정', '보고서 작성', '내부 검토', '고객 검토', '변경 반영',
];

async function createProject(plan, meId) {
  console.log(`\n── ${plan.name}`);
  const project = await api('/admin/projects', {
    method: 'POST',
    body: { name: plan.name, description: plan.description, managerUserIds: [meId] },
  });

  const totalDays = daysBetween(plan.start, plan.end);
  const phaseDays = Math.floor(totalDays / plan.phases.length);

  let made = 0;
  let taskIndex = 0;

  for (let p = 0; p < plan.phases.length; p++) {
    // 단계는 GROUP. 기간과 진행률은 자손 ITEM 에서 자동 계산되므로 넣지 않는다.
    const phase = await api(`/projects/${project.id}/nodes`, {
      method: 'POST',
      body: { kind: 'GROUP', title: `${p + 1}. ${plan.phases[p]}` },
    });
    made++;

    const phaseStart = addDays(plan.start, p * phaseDays);
    const subCount = 2 + (p % 2);
    const subDays = Math.floor(phaseDays / subCount);

    for (let s = 0; s < subCount; s++) {
      const sub = await api(`/projects/${project.id}/nodes`, {
        method: 'POST',
        body: {
          kind: 'GROUP',
          parentId: phase.id,
          title: `${p + 1}.${s + 1} ${SUB_TITLES[(p + s) % SUB_TITLES.length]}`,
        },
      });
      made++;

      const subStart = addDays(phaseStart, s * subDays);
      // 앞뒤로 조금씩 겹치게 두어 간트가 계단처럼 보이게 한다.
      const itemCount = 2 + ((p + s) % 3);
      const itemDays = Math.max(2, Math.floor(subDays / itemCount) + 2);

      for (let t = 0; t < itemCount; t++) {
        const startAt = addDays(subStart, t * Math.max(1, itemDays - 2));
        const rawEnd = addDays(startAt, itemDays - 1);
        const endAt = rawEnd > plan.end ? plan.end : rawEnd;

        await api(`/projects/${project.id}/nodes`, {
          method: 'POST',
          body: {
            kind: 'ITEM',
            parentId: sub.id,
            title: TASK_TITLES[taskIndex % TASK_TITLES.length],
            startAt,
            endAt,
            progress: plan.progressFor ? plan.progressFor(taskIndex) : progressByDate(startAt, endAt),
          },
        });
        made++;
        taskIndex++;
      }
    }
  }

  console.log(`   일정 ${made}건 생성`);
  return { id: project.id, name: plan.name, nodes: made };
}

async function main() {
  await api('/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  const me = await api('/auth/me');
  const meId = me.id ?? me.user?.id;
  if (!meId) throw new Error(`사용자 id 를 못 찾음: ${JSON.stringify(me).slice(0, 200)}`);
  console.log(`로그인: ${USER} (${meId})`);

  const made = [];
  for (const plan of PLANS) made.push(await createProject(plan, meId));

  console.log('\n── 결과');
  for (const m of made) {
    console.log(`   ${String(m.nodes).padStart(3)}건  ${m.name}`);
    console.log(`        http://localhost:5173/projects/${m.id}`);
  }
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
