/**
 * 배포 zip 파일 이름을 만든다.
 *
 * 왜 따로 뺐는가:
 *   이름 규칙에 분기가 몇 개 있다 — 작업 트리가 더러우면 `-dirty`, git 이 없으면 `nogit`,
 *   월/일 0 패딩. build-exe.js 안에 두면 exe 를 다 빌드해 봐야(수 분) 확인이 되므로
 *   순수 함수로 떼어내 테스트한다. (scripts/backup-cli-lib.ts 를 뗀 것과 같은 이유)
 *
 * 이름에 날짜와 커밋 해시를 함께 넣는 이유:
 *   폐쇄망 고객사에는 zip 을 매체(USB 등)로 전달한다. 현장에서 문제가 생겼을 때
 *   "그 매체에 담긴 게 어느 소스에서 나온 빌드였나" 를 되짚을 수 있어야 한다.
 *   package.json 의 version 은 이 리포지터리에서 관리되지 않는다 (v1.0 태그가 있는데도
 *   0.1.0 으로 남아 있다). 그래서 버전 대신 커밋 해시를 쓴다.
 */

const { execFileSync } = require('child_process');

/** Date -> 'YYYYMMDD' (로컬 시간 기준. 크론과 로그가 모두 Asia/Seoul 로컬을 쓴다). */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 배포 이름을 만든다 (확장자 없음).
 *
 * @param {object} opts
 * @param {Date}   opts.date   빌드 시각
 * @param {string|null} opts.sha   커밋 short hash. null/빈 값이면 'nogit' 으로 대체한다
 *                                 (git 이 없거나 .git 없이 소스만 풀어놓은 환경)
 * @param {boolean} opts.dirty 커밋되지 않은 변경이 있는지
 * @param {string} [opts.prefix]
 * @returns {string} 예: 'sam-scheduler-exe-20260801-1140f3f'
 */
function buildReleaseName({ date, sha, dirty, prefix = 'sam-scheduler-exe' }) {
  const parts = [prefix, formatDate(date), sha ? sha : 'nogit'];
  if (dirty) {
    // 커밋되지 않은 변경이 섞인 빌드는 해시만으로 재현할 수 없다. 이름에 드러내
    // 실수로 고객사에 전달하는 일을 줄인다.
    parts.push('dirty');
  }
  return parts.join('-');
}

/**
 * 현재 git 상태를 읽는다. 순수 함수가 아니므로 테스트 대상에서 제외한다.
 * git 이 없거나 저장소가 아니면 예외를 던지지 않고 { sha: null, dirty: false } 를 돌려준다 —
 * 빌드 자체는 git 없이도 되어야 한다.
 */
function readGitState(cwd) {
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const sha = git(['rev-parse', '--short', 'HEAD']).trim();
    const dirty = git(['status', '--porcelain']).trim().length > 0;
    return { sha, dirty };
  } catch {
    return { sha: null, dirty: false };
  }
}

module.exports = { buildReleaseName, formatDate, readGitState };
