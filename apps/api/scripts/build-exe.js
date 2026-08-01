const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildReleaseName, readGitState } = require('./release-name');

const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.resolve(__dirname, '..');
const webDir = path.resolve(rootDir, 'apps/web');
const outputDistDir = path.resolve(rootDir, 'dist-exe');

// 배포 zip 을 쌓아두는 곳. dist-exe 안에 두지 않는 이유: cleanPreviousBuildOutputs() 가 매 빌드
// 시작에 dist-exe 를 통째로 지우므로 지난 빌드의 zip 이 매번 사라진다. 고객사에 어떤 빌드를
// 보냈는지 되짚으려면 남아 있어야 한다. 오래된 zip 은 자동으로 지우지 않는다 (하나가 150MB 대다).
const releaseDistDir = path.resolve(rootDir, 'dist-release');

// zip 을 풀면 나오는 최상위 폴더 이름.
// 폴더로 감싸는 이유: README.txt 는 exe 와 같은 위치에 ./data/, ./logs/, ./backups/ 가
// 생긴다고 안내한다. zip 을 평평하게 만들면 관리자가 다운로드 폴더에 그대로 풀었을 때
// 거기에 data/ 가 만들어진다. 폴더로 감싸면 그 사고를 막는다.
const ZIP_PAYLOAD_DIR_NAME = 'seedcore-proj';

/**
 * 빌드가 끝난 dist-exe 에 반드시 있어야 하는 파일들.
 *
 * 존재 여부만 보지 않고 최소 크기도 함께 본다. pkg 가 실패하면 보통 파일이 아예 생기지
 * 않지만, 0 바이트나 중간에 잘린 파일이 남는 경우를 걸러내기 위한 방어다.
 *
 * 여기에 exe 를 추가하거나 이름을 바꾸면 아래 5단계의 pkg 호출도 함께 고쳐야 한다
 * (같은 파일 안에 붙여 둔 이유가 그것이다 — 다른 파일로 갈라놓으면 한쪽만 고치고 넘어간다).
 */
const EXPECTED_ARTIFACTS = [
  { name: 'sp-server.exe', minBytes: 50 * 1024 * 1024 },
  { name: 'sp-backup.exe', minBytes: 50 * 1024 * 1024 },
  { name: 'sp-reset-admin.exe', minBytes: 50 * 1024 * 1024 },
  { name: 'sp-migrate.exe', minBytes: 50 * 1024 * 1024 },
  { name: 'query_engine-windows.dll.node', minBytes: 10 * 1024 * 1024 },
  { name: 'README.txt', minBytes: 1024 },
];

function formatSize(bytes) {
  // README.txt 는 24KB 라서 MB 로만 찍으면 '0.0 MB' 가 되어 검증 로그가 쓸모없어진다.
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function log(msg) {
  console.log(`\n📦 [Build-EXE] ${msg}`);
}

function run(cmd, cwd = rootDir) {
  console.log(`> ${cmd} (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 복사된 migrations 디렉터리가 비어 있지 않은지 확인한다.
// copyDirRecursive 는 빈 디렉터리도 조용히 성공시키므로, 잘못된 리베이스나 실수로 폴더 이름이
// 바뀌어 migration.sql 이 하나도 없는 채로 exe 에 내장되면 이 단계에서는 아무 에러도 나지 않고
// 넘어간다. 그 결과는 고객사 현장에서 exit 6("마이그레이션 파일을 찾을 수 없습니다")로만
// 드러나는데, 그 시점에 할 수 있는 해결책은 매체를 다시 보내는 것뿐이다. 그래서 여기서 미리 막는다.
function assertMigrationsEmbedded(dir) {
  const hasAny = fs
    .readdirSync(dir, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, 'migration.sql')));
  if (!hasAny) {
    console.error(`❌ ${dir} 에 migration.sql 을 담은 디렉터리가 하나도 없습니다. 내장이 비어 있습니다.`);
    process.exit(1);
  }
}

// 이전 빌드가 남긴 apiPublic / dist-bundle / dist-exe 를 통째로 지운다.
//
// copyDirRecursive 는 파괴적이지 않다 — dest 에 이미 있는데 src 에는 더 이상 없는 항목을
// 지우지 않고 그대로 둔다. 그래서 이 정리 없이 재빌드하면, 소스에서 지우거나 이름을 바꾼
// migration.sql 디렉터리나 React 정적 자원이 이전 빌드 결과물 안에 그대로 남아 다음 exe 에도
// 다시 내장된다.
//
// 이게 특히 위험한 이유(단순 빌드 위생 문제가 아니다): exe 에 남은 낡은 migrations 디렉터리는
// listMigrationFiles() 가 그대로 목록에 집어넣지만, 어떤 고객 DB 의 _prisma_migrations 에도
// 그 이름과 일치하는 행이 존재할 수 없다(그 마이그레이션은 프로젝트에서 이미 삭제됐으므로).
// 그러면 그 항목은 영원히 "미적용" 으로 보고된다 — sp-server.exe 는 exit 3 으로 계속 멈추고,
// sp-migrate.exe 는 존재하지도 않는(의도적으로 지운) 마이그레이션을 적용하려 시도한다.
// 에어갭 현장에서 이 상태를 되돌리는 방법은 새 매체를 다시 보내는 것뿐이다. 그래서 사람이
// 폴더를 손으로 지우는 걸 잊지 않는 것에 기대지 않고, 매 빌드 시작 시 강제로 깨끗하게 지운다.
// (증분 빌드 속도를 위해 이 정리를 지우고 싶어질 수 있는데, 위 이유 때문에 지우면 안 된다.)
function cleanPreviousBuildOutputs() {
  const apiPublicDir = path.join(apiDir, 'public');
  for (const dir of [apiPublicDir, path.join(apiDir, 'dist-bundle'), outputDistDir]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * dist-exe 에 기대한 산출물이 다 있는지 확인한다. 하나라도 어긋나면 zip 을 만들지 않고 멈춘다.
 *
 * 왜 필요한가: 이 스크립트는 단계마다 execSync(stdio: 'inherit') 로 외부 명령을 부르는데,
 * 그중 하나가 경고만 내고 파일을 만들지 않아도 로그가 수백 줄이라 사람이 놓친다. 실제로
 * sp-reset-admin.exe 는 pkg 가 "Warning Cannot stat" 만 내고 넘어가는 상태로 배포됐다가,
 * 현장에서 실행해 보고 나서야 못 쓰는 파일이었음이 드러났다.
 */
function verifyArtifacts() {
  const problems = [];
  for (const { name, minBytes } of EXPECTED_ARTIFACTS) {
    const filePath = path.join(outputDistDir, name);
    if (!fs.existsSync(filePath)) {
      problems.push(`${name} — 생성되지 않았습니다`);
      continue;
    }
    const { size } = fs.statSync(filePath);
    if (size < minBytes) {
      problems.push(
        `${name} — ${formatSize(size)} 로 최소 기대치 ${formatSize(minBytes)} 보다 작습니다 ` +
          `(빌드가 중간에 깨진 것으로 보입니다)`,
      );
    }
  }

  if (problems.length > 0) {
    console.error(`\n❌ 산출물 검증 실패 (${outputDistDir}):`);
    for (const problem of problems) {
      console.error(`   - ${problem}`);
    }
    console.error('\n   zip 을 만들지 않고 중단합니다. 위 단계들의 로그에서 실패 원인을 찾으십시오.');
    process.exit(1);
  }

  console.log(`✅ 산출물 ${EXPECTED_ARTIFACTS.length}개 확인 완료`);
  for (const { name } of EXPECTED_ARTIFACTS) {
    const { size } = fs.statSync(path.join(outputDistDir, name));
    console.log(`   - ${name} (${formatSize(size)})`);
  }
}

/**
 * dist-exe 의 내용을 zip 하나로 묶어 dist-release/ 에 놓는다.
 *
 * 압축은 Windows 내장 Compress-Archive 를 쓴다. 이 빌드는 pkg --target host 와
 * query_engine-windows.dll.node 때문에 이미 Windows 전용이라 새로운 종속성이 아니고,
 * 큰 파일 몇 개를 묶는 이 용도에서는 tar.exe(bsdtar) 와 속도·크기 차이가 없다
 * (87MB 짜리 exe 하나로 재보면 2.8초 / 33.8MB 대 3.0초 / 32.8MB).
 *
 * @returns {string} 만들어진 zip 파일의 절대 경로
 */
function packageRelease() {
  const { sha, dirty } = readGitState(rootDir);
  const releaseName = buildReleaseName({ date: new Date(), sha, dirty });
  if (dirty) {
    console.warn(
      '⚠️  커밋되지 않은 변경이 있는 상태로 빌드했습니다 — zip 이름에 -dirty 가 붙습니다.',
    );
  }

  fs.mkdirSync(releaseDistDir, { recursive: true });

  // Compress-Archive 에 디렉터리를 넘기면 그 디렉터리가 zip 의 최상위 항목이 된다. 원하는 이름
  // (ZIP_PAYLOAD_DIR_NAME)으로 감싸려면 그 이름의 디렉터리가 실제로 있어야 하므로 스테이징한다.
  // dist-exe 를 그대로 넘기면 최상위가 'dist-exe' 가 되어 고객이 받는 이름으로는 부적절하다.
  //
  // 하드링크나 rename 되돌리기로 복사를 피할 수도 있지만, 중간에 죽으면 dist-exe 가 사라지는
  // 실패 경로가 생긴다. 몇 초 더 걸리더라도 복사가 안전하다.
  const stageRoot = path.join(releaseDistDir, '.stage');
  const payloadDir = path.join(stageRoot, ZIP_PAYLOAD_DIR_NAME);
  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(payloadDir, { recursive: true });

  // dist-exe 를 통째로 복사하지 않고 EXPECTED_ARTIFACTS 만 골라 담는다.
  //
  // 통째로 복사하면 dist-exe 에 남아 있는 것이 무엇이든 고객사로 간다. 그 폴더에서 exe 를
  // 한 번이라도 실행하면 data\sam.db / logs\ / backups\ / sp-server.lock 이 생기는데,
  // 테스트 데이터가 담긴 DB 를 고객사 매체에 실어 보내는 것은 단순한 위생 문제가 아니다.
  // 매 빌드가 cleanPreviousBuildOutputs() 로 시작하니 보통은 깨끗하지만, 빌드 후에 누가
  // 그 폴더에서 exe 를 실행하고 zip 만 다시 만드는 순간 그 가정은 깨진다.
  for (const { name } of EXPECTED_ARTIFACTS) {
    fs.copyFileSync(path.join(outputDistDir, name), path.join(payloadDir, name));
  }

  // 반대 방향의 실수도 알린다: pkg 로 새 exe 를 만들어 놓고 EXPECTED_ARTIFACTS 에 추가하는 것을
  // 잊으면, 검증도 통과하고 zip 도 만들어지는데 그 exe 만 조용히 빠진다. 그건 현장에서
  // "파일이 없다" 로만 드러난다. 그래서 목록에 없는 항목을 발견하면 이름을 찍어 준다.
  const expectedNames = new Set(EXPECTED_ARTIFACTS.map((a) => a.name));
  const strays = fs
    .readdirSync(outputDistDir, { withFileTypes: true })
    .map((entry) => entry.name + (entry.isDirectory() ? '\\' : ''))
    .filter((name) => !expectedNames.has(name.replace(/\\$/, '')));
  if (strays.length > 0) {
    console.warn('⚠️  dist-exe 에 목록(EXPECTED_ARTIFACTS)에 없는 항목이 있어 zip 에서 빠집니다:');
    for (const stray of strays) {
      console.warn(`   - ${stray}`);
    }
    console.warn('   배포에 포함해야 하는 것이라면 EXPECTED_ARTIFACTS 에 추가하십시오.');
  }

  const zipPath = path.join(releaseDistDir, `${releaseName}.zip`);
  try {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Compress-Archive -Path '${payloadDir}' -DestinationPath '${zipPath}' -Force`,
      ],
      { stdio: 'inherit' },
    );
  } finally {
    // 성공이든 실패든 432MB 스테이징을 남기지 않는다.
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }

  if (!fs.existsSync(zipPath)) {
    console.error(`❌ 압축은 끝났는데 zip 파일이 없습니다: ${zipPath}`);
    process.exit(1);
  }

  const { size } = fs.statSync(zipPath);
  console.log(`✅ 배포 zip 생성: ${zipPath} (${formatSize(size)})`);
  console.log(`   zip 을 풀면 '${ZIP_PAYLOAD_DIR_NAME}' 폴더 하나가 나옵니다.`);
  return zipPath;
}

async function main() {
  log('이전 빌드 산출물 정리 (public / dist-bundle / dist-exe)');
  cleanPreviousBuildOutputs();

  log('1/7. 공유 패키지 및 프론트엔드/백엔드 빌드 수행');
  run('pnpm -F @sam/shared build');
  run('pnpm -F @sam/web build');
  run('pnpm -F @sam/api build');

  log('2/7. React SPA 정적 빌드 자원 복사 (apps/web/dist -> apps/api/public)');
  const webDist = path.join(webDir, 'dist');
  const apiPublic = path.join(apiDir, 'public');
  if (fs.existsSync(webDist)) {
    copyDirRecursive(webDist, apiPublic);
    console.log(`✅ React SPA 자원이 ${apiPublic}으로 복사되었습니다.`);
  } else {
    console.error(`❌ ${webDist} 디렉터리를 찾을 수 없습니다.`);
    process.exit(1);
  }

  log('3/7. TS 스크립트 컴파일 (backup-cli.ts & reset-admin-cli.ts)');
  // --rootDir . 이 필요한 이유: reset-admin-cli.ts 가 src/common/db-path.ts 를 가져다 쓴다
  // (서버와 DB 경로 규칙을 공유하기 위해 — 그 파일 주석 참고). rootDir 을 주지 않으면 tsc 가
  // 입력들의 공통 상위(= apps/api)를 rootDir 로 추론해 출력 경로가 조용히 한 단계 깊어지고,
  // 아래 ncc 진입점 경로가 어긋난다. 명시해서 dist/cli/scripts/*.js 로 고정한다.
  run('npx tsc scripts/backup-cli.ts scripts/reset-admin-cli.ts --rootDir . --module commonjs --target es2021 --esModuleInterop --skipLibCheck --outDir dist/cli', apiDir);

  log('4/7. NCC 단일 파일 번들링 (Server, Backup CLI, Reset-Admin CLI)');
  const bundleOutDir = path.join(apiDir, 'dist-bundle');
  if (!fs.existsSync(bundleOutDir)) {
    fs.mkdirSync(bundleOutDir, { recursive: true });
  }

  // 메인 서버 번들링
  const serverBundleDir = path.join(bundleOutDir, 'server');
  run(`npx ncc build dist/main.js -o dist-bundle/server --no-cache`, apiDir);

  // React SPA 자원을 번들 디렉터리 내 public으로 복사 후 pkg assets로 내장
  const serverPublicDir = path.join(serverBundleDir, 'public');
  copyDirRecursive(apiPublic, serverPublicDir);

  // 마이그레이션 SQL 을 번들 디렉터리로 복사해 pkg assets 로 내장한다.
  // sp-server.exe 도 판정에 파일 목록이 필요하므로 함께 내장한다 (SQL 내용은 쓰지 않지만 이름 비교용).
  const migrationsSrcDir = path.join(apiDir, 'prisma', 'migrations');
  copyDirRecursive(migrationsSrcDir, path.join(serverBundleDir, 'migrations'));
  assertMigrationsEmbedded(path.join(serverBundleDir, 'migrations'));
  console.log('✅ 마이그레이션 SQL 내장 (server)');

  // PKG가 정적 자원을 .exe 내부 가상 파일시스템(snapshot)으로 임베딩하도록 package.json 생성
  const serverPkgConfig = {
    name: 'seedcore-scheduler-server',
    bin: 'index.js',
    pkg: {
      assets: ['public/**/*', 'migrations/**/*'],
    },
  };
  fs.writeFileSync(
    path.join(serverBundleDir, 'package.json'),
    JSON.stringify(serverPkgConfig, null, 2),
  );

  // 백업 CLI 번들링
  run(`npx ncc build dist/cli/scripts/backup-cli.js -o dist-bundle/backup --no-cache`, apiDir);
  // 암호 재설정 CLI 번들링
  run(`npx ncc build dist/cli/scripts/reset-admin-cli.js -o dist-bundle/reset-admin --no-cache`, apiDir);

  // 마이그레이션 CLI 번들링 (src/migrate-main.ts → nest build 산출물)
  const migrateBundleDir = path.join(bundleOutDir, 'migrate');
  run(`npx ncc build dist/migrate-main.js -o dist-bundle/migrate --no-cache`, apiDir);
  copyDirRecursive(migrationsSrcDir, path.join(migrateBundleDir, 'migrations'));
  assertMigrationsEmbedded(path.join(migrateBundleDir, 'migrations'));

  const migratePkgConfig = {
    name: 'seedcore-scheduler-migrate',
    bin: 'index.js',
    pkg: {
      assets: ['migrations/**/*'],
    },
  };
  fs.writeFileSync(
    path.join(migrateBundleDir, 'package.json'),
    JSON.stringify(migratePkgConfig, null, 2),
  );
  console.log('✅ 마이그레이션 SQL 내장 (migrate)');

  log('5/7. PKG를 이용한 Windows 단일 Executable (.exe) 생성 (100% 자원 내장)');
  if (!fs.existsSync(outputDistDir)) {
    fs.mkdirSync(outputDistDir, { recursive: true });
  }

  // PKG 실행 (package.json 위치를 인자로 전달)
  const pkgTarget = 'host';
  
  // 1) sp-server.exe (React SPA public 자원 내장)
  run(`npx pkg dist-bundle/server/package.json --target ${pkgTarget} --output ${path.join(outputDistDir, 'sp-server.exe')}`, apiDir);
  // 2) sp-backup.exe
  run(`npx pkg dist-bundle/backup/index.js --target ${pkgTarget} --output ${path.join(outputDistDir, 'sp-backup.exe')}`, apiDir);
  // 3) sp-reset-admin.exe
  run(`npx pkg dist-bundle/reset-admin/index.js --target ${pkgTarget} --output ${path.join(outputDistDir, 'sp-reset-admin.exe')}`, apiDir);
  // 4) sp-migrate.exe (마이그레이션 SQL 내장)
  run(`npx pkg dist-bundle/migrate/package.json --target ${pkgTarget} --output ${path.join(outputDistDir, 'sp-migrate.exe')}`, apiDir);

  // Prisma Query Engine 바이너리 탐색 및 복사
  function findEngineFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        findEngineFiles(fullPath, fileList);
      } else if (
        item.name.includes('query_engine') ||
        item.name.includes('query-engine') ||
        item.name.endsWith('.dll.node')
      ) {
        if (item.name.endsWith('.dll.node') || item.name.endsWith('.exe')) {
          fileList.push(fullPath);
        }
      }
    }
    return fileList;
  }

  const nodeModulesDir = path.join(rootDir, 'node_modules');
  const engineFiles = findEngineFiles(nodeModulesDir);

  for (const engPath of engineFiles) {
    const destName = path.basename(engPath);
    fs.copyFileSync(engPath, path.join(outputDistDir, destName));
    console.log(`✅ Prisma Engine 바이너리 복사: ${destName}`);
  }

  // 관리자용 README.txt 사용 설명서 복사 (apps/api/scripts/README-exe.txt -> dist-exe/README.txt)
  const readmeTemplatePath = path.join(__dirname, 'README-exe.txt');
  const readmeDestPath = path.join(outputDistDir, 'README.txt');
  if (fs.existsSync(readmeTemplatePath)) {
    fs.copyFileSync(readmeTemplatePath, readmeDestPath);
    console.log(`✅ 관리자 안내 문서 복사 완료: ${readmeDestPath}`);
  } else {
    console.warn(`⚠️ README 템플릿 파일을 찾을 수 없습니다: ${readmeTemplatePath}`);
  }


  log('6/7. 산출물 검증');
  verifyArtifacts();

  log('7/7. 배포 zip 패키징');
  const zipPath = packageRelease();

  console.log('\n====================================================');
  console.log('  🎉 Windows 단일 실행 파일(.exe) 빌드 완료!');
  console.log(`  - 실행 파일 디렉터리 : ${outputDistDir}`);
  console.log(`  - 배포용 zip         : ${zipPath}`);
  console.log(`  - zip 최상위 폴더    : ${ZIP_PAYLOAD_DIR_NAME}/`);
  console.log('  - 고객사 전달 시 zip 파일 하나만 매체에 담으면 됩니다.');
  console.log('====================================================\n');
}

// 직접 실행할 때만 빌드를 시작한다. require 로 불러올 때 곧바로 수 분짜리 전체 빌드가
// 돌아가면 6·7단계만 따로 확인할 방법이 없어진다 (exe 를 다시 만들지 않고 검증·압축만
// 재실행해 보는 경우).
if (require.main === module) {
  main().catch((err) => {
    console.error('❌ 빌드 에러 발생:', err);
    process.exit(1);
  });
}

module.exports = { verifyArtifacts, packageRelease, EXPECTED_ARTIFACTS, ZIP_PAYLOAD_DIR_NAME };
