// 데모 프로젝트 외 검증용 프로젝트 정리.
const BASE = 'http://localhost:3000/api/v1';
const ORIGIN = 'http://localhost:5173';
const KEEP_NAME = '신제품 출시 일정 (데모)';

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ username: 'admin', password: 'NewSecret#9876' }),
  });
  if (!loginRes.ok) throw new Error('login');
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const headers = {
    'Content-Type': 'application/json',
    Origin: ORIGIN,
    Cookie: cookie,
    'X-Admin-Mode': '1',
  };

  const listRes = await fetch(`${BASE}/projects`, { headers });
  const projects = await listRes.json();
  for (const p of projects) {
    if (p.name === KEEP_NAME) {
      console.log('keep:', p.name);
      continue;
    }
    console.log('cleanup:', p.name, p.id);
    if (p.status === 'ACTIVE') {
      const archiveRes = await fetch(`${BASE}/admin/projects/${p.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'ARCHIVED', expectedUpdatedAt: p.updatedAt }),
      });
      if (!archiveRes.ok) {
        console.error('  archive fail', archiveRes.status, await archiveRes.text());
        continue;
      }
    }
    const deleteRes = await fetch(`${BASE}/admin/projects/${p.id}`, {
      method: 'DELETE',
      headers,
    });
    console.log('  delete', deleteRes.status);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
