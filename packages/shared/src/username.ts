/**
 * 아이디(username) 규칙의 단일 출처.
 *
 * 이 규칙을 쓰는 곳이 두 군데다. `index.ts` 의 `Username` 스키마(API 가 검증하는 자리)와
 * `user-import.ts` 의 파서(일괄 등록 파일을 읽는 자리)다. 두 곳이 각자 정규식을 들고 있으면
 * 언젠가 갈라지고, 갈라지면 **파서는 통과시킨 아이디를 API 가 거부하는** 어긋남이 생긴다.
 *
 * 별도 파일로 뺀 이유는 순환 참조 때문이다. `index.ts` 가 `user-import.ts` 를 재출력하므로
 * 파서가 `index.ts` 를 다시 참조할 수 없다. 규칙만 담은 작은 모듈을 양쪽이 함께 본다.
 */

/** 영문·숫자와 마침표·밑줄·붙임표만 허용한다. 한글은 쓸 수 없다. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 64;

/** 규칙에 맞는 아이디인가. 스키마와 파서가 이 하나를 함께 쓴다. */
export function isValidUsername(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(value)
  );
}
