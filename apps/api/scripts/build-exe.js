const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.resolve(__dirname, '..');
const webDir = path.resolve(rootDir, 'apps/web');
const outputDistDir = path.resolve(rootDir, 'dist-exe');

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

async function main() {
  log('1/5. 공유 패키지 및 프론트엔드/백엔드 빌드 수행');
  run('pnpm -F @sam/shared build');
  run('pnpm -F @sam/web build');
  run('pnpm -F @sam/api build');

  log('2/5. React SPA 정적 빌드 자원 복사 (apps/web/dist -> apps/api/public)');
  const webDist = path.join(webDir, 'dist');
  const apiPublic = path.join(apiDir, 'public');
  if (fs.existsSync(webDist)) {
    copyDirRecursive(webDist, apiPublic);
    console.log(`✅ React SPA 자원이 ${apiPublic}으로 복사되었습니다.`);
  } else {
    console.error(`❌ ${webDist} 디렉터리를 찾을 수 없습니다.`);
    process.exit(1);
  }

  log('3/5. TS 스크립트 컴파일 (backup-cli.ts & reset-admin-cli.ts)');
  run('npx tsc scripts/backup-cli.ts scripts/reset-admin-cli.ts --module commonjs --target es2021 --esModuleInterop --skipLibCheck --outDir dist/scripts', apiDir);

  log('4/5. NCC 단일 파일 번들링 (Server, Backup CLI, Reset-Admin CLI)');
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
  run(`npx ncc build dist/scripts/backup-cli.js -o dist-bundle/backup --no-cache`, apiDir);
  // 암호 재설정 CLI 번들링
  run(`npx ncc build dist/scripts/reset-admin-cli.js -o dist-bundle/reset-admin --no-cache`, apiDir);

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

  log('5/5. PKG를 이용한 Windows 단일 Executable (.exe) 생성 (100% 자원 내장)');
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


  console.log('\n====================================================');
  console.log('  🎉 Windows 단일 실행 파일(.exe) 빌드 완료!');
  console.log(`  - 출력이 완료된 디렉터리: ${outputDistDir}`);
  console.log('  - 생성된 실행 파일:');
  console.log(`    1) ${path.join(outputDistDir, 'sp-server.exe')}`);
  console.log(`    2) ${path.join(outputDistDir, 'sp-backup.exe')}`);
  console.log(`    3) ${path.join(outputDistDir, 'sp-reset-admin.exe')}`);
  console.log(`    4) ${path.join(outputDistDir, 'sp-migrate.exe')}`);
  console.log(`    5) ${path.join(outputDistDir, 'README.txt')}`);
  console.log('====================================================\n');



}

main().catch((err) => {
  console.error('❌ 빌드 에러 발생:', err);
  process.exit(1);
});
