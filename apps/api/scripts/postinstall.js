/**
 * apps/api postinstall — Prisma Client 자동 생성
 *
 * 왜 필요한가:
 *   node_modules/.prisma/client 는 `pnpm install` 이 복원해 주지 않는 "생성물"이다.
 *   pnpm 업그레이드나 `pnpm install --force` 로 node_modules 를 갈아엎으면
 *   해당 디렉터리가 `export declare const PrismaClient: any` 스텁으로 되돌아가고,
 *   그 결과 api 전체에 TS2305 / TS7006 컴파일 에러가 수십 개 쏟아진다.
 *   (README "자주 만나는 문제" 표 참고)
 *
 * 왜 그냥 `"postinstall": "prisma generate"` 가 아닌가:
 *   apps/api/Dockerfile 은 소스를 복사하기 전에(10번째 줄) 먼저 pnpm install 을 돌린다.
 *   그 시점에는 apps/api/package.json 만 존재하고 prisma/schema.prisma 는 없다.
 *   따라서 스키마 존재 여부를 먼저 확인하고, 없으면 조용히 건너뛰어야 한다.
 *   (Docker 빌더는 이후 14번째 줄에서 prisma:generate 를 명시적으로 수행한다.)
 *
 * 참고: `prisma generate` 는 DATABASE_URL 이 없어도 동작한다. 실제 DB 접속이 필요 없기 때문에
 *       README 의 부팅 순서상 .env 복사(3번)보다 install(1번)이 먼저 와도 문제가 없다.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const apiRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(apiRoot, 'prisma', 'schema.prisma');

/**
 * `prisma generate` 자체가 실패했을 때의 처리 정책.
 *
 * 스키마가 없어서 건너뛰는 경우(= Docker 빌더 단계)와는 다른 상황이다.
 * 여기로 오는 건 스키마는 있는데 generate 가 깨진 경우다. 실제로 관측된 사례:
 *   - Windows 에서 dev 서버가 query_engine-windows.dll.node 를 잠가서 EPERM
 *   - 엔진 바이너리 다운로드 실패 (폐쇄망에서 캐시가 비어 있을 때)
 *
 * @param {{status: number|null, error?: Error}} result spawnSync 결과
 * @returns {number} 이 스크립트의 종료 코드 (0 이 아니면 pnpm install 이 실패한다)
 */
function handleGenerateFailure(result) {
  // 정책: 크게 실패시킨다. 스텁 상태로 개발을 시작하는 일을 원천 차단하는 쪽이,
  //       나중에 TS 에러 수십 개를 원인 모르고 마주하는 것보다 낫다는 판단.
  console.error('');
  console.error('  [postinstall] Prisma Client 생성 실패 — install 을 중단합니다.');
  console.error('  dev 서버가 켜져 있으면 종료 후 다시 pnpm install 하십시오.');
  console.error('');
  if (result.error) {
    console.error(`  원인: ${result.error.message}`);
    console.error('');
  }
  return result.status || 1;
}

function main() {
  if (!fs.existsSync(schemaPath)) {
    // Docker 빌더 단계 등 스키마가 아직 복사되지 않은 환경. 정상 경로이므로 조용히 통과.
    console.log('[postinstall] prisma/schema.prisma 없음 — Prisma Client 생성을 건너뜁니다.');
    return 0;
  }

  console.log('[postinstall] Prisma Client 생성 중...');
  const result = spawnSync('prisma', ['generate'], {
    cwd: apiRoot,
    stdio: 'inherit',
    shell: true,
  });

  if (result.error || result.status !== 0) {
    return handleGenerateFailure(result);
  }

  return 0;
}

process.exit(main());
