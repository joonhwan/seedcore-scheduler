import { version } from '../package.json';

/**
 * 화면에 표기하는 애플리케이션 버전의 단일 원본.
 *
 * 값은 `apps/web/package.json` 의 `version` 을 그대로 읽어오므로,
 * 버전을 올릴 때 소스 코드의 문자열을 따로 고칠 필요가 없다.
 * (패키지 4개를 한 번에 올리려면 루트에서 `pnpm version:set <버전>`)
 */
export const APP_VERSION = version;

/** 헤더·사용설명서 배지에 쓰는 표기 (`1.7.1` → `v1.7.1`). */
export const APP_VERSION_LABEL = `v${version}`;
