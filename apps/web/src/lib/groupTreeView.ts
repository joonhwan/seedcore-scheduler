/**
 * 평평한 그룹 배열을 화면의 트리 순서(깊이 우선, 같은 깊이는 이름순)로 늘어놓는다.
 *
 * 부모가 사라진 고아 그룹도 빠뜨리지 않는다. 그런 데이터가 생길 일은 없어야 하지만, 화면에서
 * 사라진 그룹은 관리자가 고칠 방법이 없어 더 나쁘다.
 */
import type { UserGroupItem } from '@sam/shared';

export interface GroupTreeRow {
  group: UserGroupItem;
  depth: number;
}

export function flattenGroupTree(groups: UserGroupItem[]): GroupTreeRow[] {
  const ids = new Set(groups.map((g) => g.id));
  const byParent = new Map<string | null, UserGroupItem[]>();
  for (const g of groups) {
    // 부모가 목록에 없으면 최상위로 본다.
    const key = g.parentId !== null && ids.has(g.parentId) ? g.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(g);
    else byParent.set(key, [g]);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  const out: GroupTreeRow[] = [];
  const seen = new Set<string>();

  function walk(parentId: string | null, depth: number): void {
    for (const g of byParent.get(parentId) ?? []) {
      if (seen.has(g.id)) continue; // 순환 데이터 방어
      seen.add(g.id);
      out.push({ group: g, depth });
      walk(g.id, depth + 1);
    }
  }
  walk(null, 0);

  // 순환 때문에 뿌리에서 닿지 못한 그룹이 남으면 뒤에 붙인다.
  for (const g of groups) {
    if (!seen.has(g.id)) {
      seen.add(g.id);
      out.push({ group: g, depth: 0 });
    }
  }
  return out;
}
