// 데모 프로젝트 시드 (UTF-8 안전 — node native fetch).
// 사용: node scripts/seed-demo.mjs

const BASE = 'http://localhost:3000/api/v1';
const ORIGIN = 'http://localhost:5173';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'NewSecret#9876';

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const cookieRaw = loginRes.headers.get('set-cookie');
  if (!cookieRaw) throw new Error('no cookie');
  const cookie = cookieRaw.split(';')[0];

  const me = await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie } }).then((r) => r.json());
  console.log('logged in as', me.username, me.id);

  const headers = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: cookie,
    'X-Admin-Mode': '1',
  };

  const projRes = await fetch(`${BASE}/admin/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: '신제품 출시 일정 (데모)',
      description: '고객 검수용 샘플 프로젝트 — 기획·개발·QA·출시 단계',
      managerUserIds: [me.id],
    }),
  });
  if (!projRes.ok) throw new Error(`project ${projRes.status} ${await projRes.text()}`);
  const project = await projRes.json();
  console.log('project created:', project.name, project.id);
  const PID = project.id;

  async function createNode(input) {
    const r = await fetch(`${BASE}/projects/${PID}/nodes`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`node ${input.title} → ${r.status} ${await r.text()}`);
    const j = await r.json();
    console.log('  +', j.kind, j.title);
    return j;
  }

  const planning = await createNode({ kind: 'GROUP', title: '기획' });
  await createNode({
    kind: 'ITEM',
    parentId: planning.id,
    title: '요구사항 분석',
    startAt: '2026-04-15',
    endAt: '2026-04-22',
    progress: 100,
  });
  await createNode({
    kind: 'ITEM',
    parentId: planning.id,
    title: 'UI/UX 설계',
    startAt: '2026-04-23',
    endAt: '2026-05-05',
    progress: 80,
  });

  const dev = await createNode({ kind: 'GROUP', title: '개발' });
  const backend = await createNode({ kind: 'GROUP', parentId: dev.id, title: '백엔드' });
  await createNode({
    kind: 'ITEM',
    parentId: backend.id,
    title: 'DB 스키마 확정',
    startAt: '2026-05-06',
    endAt: '2026-05-10',
    progress: 100,
  });
  await createNode({
    kind: 'ITEM',
    parentId: backend.id,
    title: 'API 구현',
    startAt: '2026-05-11',
    endAt: '2026-05-25',
    progress: 60,
  });

  const frontend = await createNode({ kind: 'GROUP', parentId: dev.id, title: '프론트엔드' });
  await createNode({
    kind: 'ITEM',
    parentId: frontend.id,
    title: '컴포넌트 개발',
    startAt: '2026-05-12',
    endAt: '2026-06-05',
    progress: 40,
  });
  await createNode({
    kind: 'ITEM',
    parentId: frontend.id,
    title: 'API 연동',
    startAt: '2026-06-01',
    endAt: '2026-06-15',
    progress: 10,
  });

  await createNode({
    kind: 'ITEM',
    title: 'QA / 베타 테스트',
    startAt: '2026-06-15',
    endAt: '2026-06-25',
    progress: 0,
  });
  await createNode({
    kind: 'ITEM',
    title: '정식 출시',
    startAt: '2026-06-30',
    endAt: '2026-06-30',
    progress: 0,
  });

  console.log('seed done. project id =', PID);
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
