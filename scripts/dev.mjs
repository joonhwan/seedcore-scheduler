// 개발 서버를 한 번에 띄운다 (`pnpm dev`).
//
// 이 스크립트가 있는 이유는 순서를 손으로 지키다 보면 반드시 틀리기 때문이다.
// 아래 두 단계를 건너뛰면 증상이 조용해서 원인을 찾기 어렵다.
//
//  1. `@sam/shared` 빌드 — web 과 api 는 소스가 아니라 `packages/shared/dist` 를 읽는다.
//     빌드하지 않으면 방금 고친 shared 코드가 반영되지 않는다.
//  2. vite 사전 번들 캐시 삭제 — shared 에 **새 이름**(새 export)을 추가한 경우, 캐시에 그
//     심볼이 없어 `undefined` 가 된다. 에러 한 줄 없이 화면만 하얗게 뜬다 (AGENTS.md §5).
//
// 캐시 삭제를 조건부로 하지 않고 매번 지우는 것은 의도한 것이다. "새 export 를 추가했는가"를
// 사람이 판단하게 만들면 언젠가 틀리고, 그때 잃는 시간이 재번들 몇 초보다 훨씬 크다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Windows 에서 pnpm 은 pnpm.cmd 라 shell 을 거쳐야 실행된다.
const run = (args, opts = {}) =>
  spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', shell: true, ...opts });

function step(n, total, message) {
  console.log(`\n[${n}/${total}] ${message}`);
}

// ─── 1. 공유 패키지 빌드 ─────────────────────────────────────────────────────
step(1, 3, '@sam/shared 빌드');
const build = run(['-F', '@sam/shared', 'build']);
if (build.status !== 0) {
  console.error('\n@sam/shared 빌드에 실패했습니다. 위 오류를 먼저 해결하십시오.');
  process.exit(build.status ?? 1);
}

// ─── 2. vite 사전 번들 캐시 삭제 ─────────────────────────────────────────────
step(2, 3, 'vite 사전 번들 캐시 삭제');
const viteCache = path.join(root, 'apps', 'web', 'node_modules', '.vite');
if (fs.existsSync(viteCache)) {
  fs.rmSync(viteCache, { recursive: true, force: true });
  console.log(`   지움: ${path.relative(root, viteCache)}`);
} else {
  console.log('   지울 캐시가 없습니다.');
}

// ─── 3. 개발 서버 기동 ───────────────────────────────────────────────────────
step(3, 3, '개발 서버 기동 (web + api)');
console.log(`
┌──────────────────────────────────────────────────────────────┐
│  브라우저로 열 주소:  http://localhost:5173                  │
│                                                              │
│  3000 번은 API 전용입니다. 브라우저로 직접 열지 마십시오 —   │
│  exe 빌드가 남긴 옛 화면(apps/api/public)이 떠서 "고친 것이  │
│  반영되지 않는다"고 헤매게 됩니다. 5173 이 뒤에서 3000 을    │
│  호출하므로, API 는 이 창에서 함께 떠 있습니다.              │
└──────────────────────────────────────────────────────────────┘
`);

// dev:raw 를 부른다. 여기서 `dev` 를 부르면 이 스크립트가 자기를 다시 부른다.
const dev = spawn('pnpm', ['run', 'dev:raw'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

// Ctrl+C 를 자식에게 그대로 넘겨 web/api 가 정리될 시간을 준다.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => dev.kill(signal));
}
dev.on('exit', (code) => process.exit(code ?? 0));
