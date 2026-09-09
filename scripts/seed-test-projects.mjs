// 기간이 서로 다른 시험용 프로젝트 셋을 만든다 (일정 40~70건, 계층 3단).
//
// 사용: node scripts/seed-test-projects.mjs
//       node scripts/seed-test-projects.mjs --base http://localhost:5173 --user admin --pass 비밀번호
//       node scripts/seed-test-projects.mjs --count 50            (대량 모드)
//       node scripts/seed-test-projects.mjs --count 50 --seed 7    (같은 씨앗이면 같은 결과)
//       node scripts/seed-test-projects.mjs --count 48 --skip 2    (앞의 2개는 건너뛴다)
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
//
// ── 대량 모드(`--count N`) ────────────────────────────────────────────────
// 목록 화면의 정렬·검색·쪽 넘김과 권한별 가시성을 사람 수만큼 다양하게 확인하려면
// 프로젝트가 수십 개 있어야 한다. `--count N` 을 주면 아래 TEMPLATES 를 돌려가며 N 개를
// 만든다. 옵션을 주지 않으면 위의 3종 세트만 만드므로 기존 용도는 그대로다.
//
// 대량 모드에서만 달라지는 것 셋:
//  - 이름에 `[시험]` 을 붙이지 않고 실제 업무명처럼 짓는다. 사람에게 보여줄 화면이 목적이다.
//  - 규모를 L·M·S 로 섞는다. 60건대와 10건대가 같은 목록에 섞여 있어야 규모별 표시를 본다.
//  - 등록된 일반 사용자에서 매니저·멤버를 뽑아 배정한다. admin 은 절반 정도에만 매니저로
//    넣어서, 일반 모드에서는 일부만 보이고 관리자 모드에서는 전부 보이는 상태를 만든다.
//
// 난수는 씨앗을 고정한 의사난수다. `--seed` 가 같으면 이름·배정·규모가 똑같이 재현된다.
//
// `--skip N` 은 이름 뒤에 붙는 번호를 N 번째부터 시작하게 한다. 이 스크립트는 같은 이름을
// 걸러내지 않으므로, 몇 개를 이미 만들어 둔 서버에 나머지를 이어 붙일 때 이 옵션으로
// 이름이 겹치는 것을 막는다.

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3000');
const USER = arg('user', 'admin');
const PASS = arg('pass', 'admin');
const COUNT = Number(arg('count', '0')) || 0;
const SEED = Number(arg('seed', '20260909')) || 20260909;
const SKIP = Number(arg('skip', '0')) || 0;
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

// ── 의사난수 (씨앗 고정) ───────────────────────────────────────────────────
// 같은 씨앗이면 같은 데이터가 나와야 한다. 화면에서 이상한 것을 발견했을 때 같은 명령으로
// 그 상태를 다시 만들 수 있어야 하기 때문이다.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);
const intBetween = (min, max) => min + Math.floor(rng() * (max - min + 1));
/** 배열에서 서로 겹치지 않게 n 개를 뽑는다. */
function sample(arr, n) {
  const rest = [...arr];
  const out = [];
  while (out.length < n && rest.length > 0) {
    out.push(...rest.splice(Math.floor(rng() * rest.length), 1));
  }
  return out;
}

// ── 규모 (대량 모드) ───────────────────────────────────────────────────────
// 단계(GROUP) 밑에 중간 단계 몇 개를 두고 그 밑에 작업(ITEM)을 몇 개 둘지 결정한다.
// L 은 기존 3종 세트와 똑같은 식이라, 옵션 없이 돌릴 때의 결과가 바뀌지 않는다.
const SCALES = {
  L: { subCount: (p) => 2 + (p % 2), itemCount: (p, s) => 2 + ((p + s) % 3) }, // 대략 50~70건
  M: { subCount: () => 2, itemCount: (p, s) => 2 + ((p + s) % 2) }, //            대략 25~35건
  S: { subCount: (p) => 1 + (p % 2), itemCount: () => 2 }, //                     대략 10~15건
};

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

// ── 대량 모드의 업무 유형 ──────────────────────────────────────────────────
// 유형마다 기간 길이·규모·이름 뒤에 붙는 구분자가 다르다. 구분자를 유형별로 달리 두는 이유는
// 전부 "… 1차/2차" 로 끝나면 목록이 한눈에 지루해지고, 검색어 시험에도 변화가 없기 때문이다.
// `dept` 는 매니저·멤버를 주로 뽑아 올 부서다. 실제로도 한 프로젝트의 사람은 한 부서에
// 몰려 있고 몇 명이 다른 부서에서 섞여 들어온다.
const TEMPLATES = [
  {
    base: '반도체 검사장비 개발',
    phases: ['요구 정의', '기구 설계', '제어 소프트웨어', '조립·검증', '양산 이관'],
    spanDays: 120,
    scale: 'L',
    dept: '기구완성팀',
    suffix: (n) => `(2026 ${n}차)`,
  },
  {
    base: '신공장 증설',
    phases: ['부지·인허가', '토목', '건축', '설비 반입', '시운전', '준공'],
    spanDays: 330,
    scale: 'L',
    dept: '생산기술팀',
    suffix: (n) => `${'ABCDEF'[(n - 1) % 6]}동`,
  },
  {
    base: '라인 정지 긴급 대응',
    phases: ['원인 조사', '임시 조치', '재발 방지'],
    spanDays: 21,
    scale: 'S',
    dept: '생산기술팀',
    suffix: (n) => `#${10 + n}`,
  },
  {
    base: '검사 레시피 표준화',
    phases: ['현황 조사', '기준 수립', '적용', '검증'],
    spanDays: 90,
    scale: 'M',
    dept: '품질보증팀',
    suffix: (n) => `${n}라인`,
  },
  {
    base: '설비 예방정비 계획',
    phases: ['정비 이력 분석', '주기 산정', '작업 표준화', '시행'],
    spanDays: 180,
    scale: 'M',
    dept: '생산기술팀',
    suffix: (n) => `${((n - 1) % 4) + 1}분기`,
  },
  {
    base: '품질 부적합 개선',
    phases: ['원인 분석', '대책 수립', '효과 확인'],
    spanDays: 35,
    scale: 'S',
    dept: '품질보증팀',
    suffix: (n) => `#${100 + n}`,
  },
  {
    base: '자동화 설비 도입',
    phases: ['타당성 검토', '사양 확정', '발주·제작', '설치', '안정화'],
    spanDays: 240,
    scale: 'L',
    dept: '기구완성팀',
    suffix: (n) => `${n}단계`,
  },
  {
    base: '협력사 부품 이원화',
    phases: ['후보 조사', '샘플 평가', '승인', '전환'],
    spanDays: 150,
    scale: 'M',
    dept: '구매팀',
    suffix: (n) => `${n}차`,
  },
  {
    base: '생산관리 시스템 고도화',
    phases: ['요건 정의', '설계', '개발', '시험', '이행'],
    spanDays: 300,
    scale: 'L',
    dept: '경영관리',
    suffix: (n) => `v2.${n}`,
  },
  {
    base: '클린룸 환경 개선',
    phases: ['측정', '설비 보완', '재측정', '인증'],
    spanDays: 70,
    scale: 'M',
    dept: '품질보증팀',
    suffix: (n) => `${n}차`,
  },
  {
    base: '계측 장비 교정',
    phases: ['대상 선정', '교정 실시', '결과 정리'],
    spanDays: 18,
    scale: 'S',
    dept: '품질보증팀',
    suffix: (n) => `${((n - 1) % 4) + 1}분기 ${n}회`,
  },
  {
    base: '신제품 시험생산',
    phases: ['치공구 준비', '시험 생산', '수율 분석', '조건 확정'],
    spanDays: 100,
    scale: 'M',
    dept: '생산기술팀',
    suffix: (n) => `${n}호기`,
  },
];

const SUB_TITLES = ['설계', '검토', '제작', '시험', '문서화', '승인'];
const TASK_TITLES = [
  '사양서 작성', '도면 배포', '부품 발주', '입고 검사', '가공 의뢰',
  '조립', '배선', '단위 시험', '통합 시험', '결함 수정',
  '성능 측정', '보고서 작성', '내부 검토', '고객 검토', '변경 반영',
];

/**
 * 대량 모드에서 만들 프로젝트 목록을 짠다.
 *
 * 시작일을 오늘 기준 -300 ~ +90 일에 흩뿌리는 이유: 끝난 것·진행 중인 것·아직 시작하지
 * 않은 것이 목록에 섞여 있어야 진행률 표시와 지연 표시를 한 화면에서 볼 수 있다.
 */
function buildBulkPlans(count, skip = 0) {
  const plans = [];
  for (let n = 0; n < count; n++) {
    const i = n + skip;
    const t = TEMPLATES[i % TEMPLATES.length];
    const round = Math.floor(i / TEMPLATES.length) + 1;
    const start = addDays(TODAY, intBetween(-300, 90));
    // 유형별 기간을 ±20% 흔든다. 같은 유형 프로젝트의 막대 길이가 전부 같으면 어색하다.
    const span = Math.max(7, Math.round(t.spanDays * (0.8 + rng() * 0.4)));
    plans.push({
      name: `${t.base} ${t.suffix(round)}`,
      description: `${t.dept} 주관. ${t.base} 건.`,
      start,
      end: addDays(start, span),
      phases: t.phases,
      scale: t.scale,
      dept: t.dept,
      // 기간이 통째로 과거인 프로젝트는 날짜 기준으로 전부 100% 가 된다. 그 중 일부는
      // 일부러 미완료를 남겨서 "끝난 기간인데 안 끝난 일정" 즉 지연 표시가 뜨게 한다.
      progressFor: rng() < 0.3 ? (n) => (n % 7 === 3 ? 40 : n % 11 === 5 ? 0 : 100) : null,
    });
  }
  return plans;
}

async function createProject(plan, roles) {
  console.log(`\n── ${plan.name}`);
  const project = await api('/admin/projects', {
    method: 'POST',
    body: {
      name: plan.name,
      description: plan.description,
      managerUserIds: roles.managerUserIds,
      memberUserIds: roles.memberUserIds,
    },
  });

  const scale = SCALES[plan.scale ?? 'L'];
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
    const subCount = scale.subCount(p);
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
      const itemCount = scale.itemCount(p, s);
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

  console.log(
    `   일정 ${made}건 · 매니저 ${roles.managerUserIds.length}명 · 멤버 ${roles.memberUserIds.length}명`,
  );
  return { id: project.id, name: plan.name, nodes: made };
}

/**
 * 등록된 사용자를 부서별로 묶는다. 부서는 표시 이름의 `-` 뒤에서 읽는다
 * (예: `김민준-기구완성팀`). 규칙에 맞지 않는 이름은 `기타` 로 몰아 둔다.
 */
function groupByDept(users) {
  const byDept = new Map();
  for (const u of users) {
    const dept = u.displayName?.includes('-') ? u.displayName.split('-').pop() : '기타';
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(u.id);
  }
  return byDept;
}

/**
 * 프로젝트 하나에 붙일 매니저·멤버를 뽑는다.
 *
 * 주관 부서에서 매니저 1~2명과 멤버 몇 명을 뽑고, 다른 부서에서 1~3명을 더 섞는다.
 * admin 은 절반 정도에만 매니저로 넣는다 — 일반 모드에서 일부만 보이고 관리자 모드에서
 * 전부 보이는 상태를 만들어야 관리자 모드의 효과를 눈으로 확인할 수 있다.
 */
function assignRoles(plan, byDept, allUserIds, adminId) {
  const own = byDept.get(plan.dept) ?? [];
  const others = allUserIds.filter((id) => !own.includes(id));

  const managers = sample(own, Math.min(own.length, intBetween(1, 2)));
  // 주관 부서에 사람이 없으면(부서명이 바뀐 경우) 아무 데서나 한 명 세운다.
  if (managers.length === 0) managers.push(...sample(allUserIds, 1));

  const ownMembers = sample(
    own.filter((id) => !managers.includes(id)),
    Math.min(Math.max(0, own.length - managers.length), intBetween(1, 4)),
  );
  const guestMembers = sample(others, intBetween(1, 3));

  const managerUserIds = [...managers];
  if (adminId && rng() < 0.5) managerUserIds.push(adminId);

  return {
    managerUserIds,
    memberUserIds: [...ownMembers, ...guestMembers].filter((id) => !managerUserIds.includes(id)),
  };
}

async function main() {
  await api('/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  const me = await api('/auth/me');
  const meId = me.id ?? me.user?.id;
  if (!meId) throw new Error(`사용자 id 를 못 찾음: ${JSON.stringify(me).slice(0, 200)}`);
  console.log(`로그인: ${USER} (${meId})`);

  const made = [];

  if (COUNT > 0) {
    // 대량 모드. 배정할 사람이 있어야 하므로 사용자 목록을 먼저 읽는다.
    const users = await api('/admin/users?status=active');
    const assignable = users.filter((u) => u.id !== meId && u.isActive && !u.retiredAt);
    if (assignable.length === 0) {
      throw new Error('배정할 일반 사용자가 없다. 먼저 사용자를 등록하라.');
    }
    const byDept = groupByDept(assignable);
    const allUserIds = assignable.map((u) => u.id);
    const deptSummary = [...byDept].map(([d, ids]) => `${d} ${ids.length}`).join(', ');
    console.log(`배정 대상 ${allUserIds.length}명 (${deptSummary})`);
    console.log(`프로젝트 ${COUNT}개 생성 (씨앗 ${SEED})`);

    const plans = buildBulkPlans(COUNT, SKIP);
    for (const plan of plans) {
      made.push(await createProject(plan, assignRoles(plan, byDept, allUserIds, meId)));
    }
  } else {
    for (const plan of PLANS) {
      made.push(await createProject(plan, { managerUserIds: [meId], memberUserIds: [] }));
    }
  }

  console.log('\n── 결과');
  for (const m of made) {
    console.log(`   ${String(m.nodes).padStart(3)}건  ${m.name}`);
    if (COUNT === 0) console.log(`        http://localhost:5173/projects/${m.id}`);
  }
  console.log(
    `\n   프로젝트 ${made.length}개 · 일정 합계 ${made.reduce((a, m) => a + m.nodes, 0)}건`,
  );
}

main().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
