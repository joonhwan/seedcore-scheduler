import type { CheckState } from './bulkSelection';

/**
 * 멤버 관리 화면의 체크박스 선택을 다루는 순수 함수들.
 *
 * 일정 트리의 선택(bulkSelection.ts)은 부모·자손 관계를 따라가야 하지만, 멤버 목록은
 * 평평한 명단이라 계산이 훨씬 단순하다. 화면에서 분리해 둔 이유는 경계 조건 셋이
 * 실제로 어긋났던 자리이기 때문이다 — 빈 목록의 머리 체크박스, 목록에서 사라진 선택,
 * 확인 문구의 인원수.
 */

/** 목록 머리 체크박스의 상태. 일부만 골랐으면 중간 상태로 보여 준다. */
export function headerCheckState(selectedCount: number, totalCount: number): CheckState {
  if (totalCount === 0 || selectedCount === 0) return 'unchecked';
  if (selectedCount >= totalCount) return 'checked';
  return 'indeterminate';
}

/**
 * 지금 목록에 남아 있는 사람만 선택에 남긴다.
 *
 * 바뀐 것이 없으면 받은 집합을 그대로 돌려준다. React 상태에 그대로 넣기 때문에, 내용이
 * 같은데 새 집합을 만들면 다시 그리는 일이 늘고 효과 안에서 쓰면 무한 반복이 된다.
 */
export function pruneSelection(selected: Set<string>, availableIds: string[]): Set<string> {
  const available = new Set(availableIds);
  const kept = [...selected].filter((id) => available.has(id));
  if (kept.length === selected.size) return selected;
  return new Set(kept);
}

/** 확인 문구에 넣을 명단. 길면 앞의 몇 명만 적고 나머지는 인원수로 줄인다. */
export function summarizeNames(names: string[], max = 3): string {
  const head = names.slice(0, max).join(', ');
  const rest = names.length - max;
  return rest > 0 ? `${head} 외 ${rest}명` : head;
}
