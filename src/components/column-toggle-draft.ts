// 컬럼 설정 창 "저장 방식(저장 눌러야 반영)" 초안(draft) 계산 — 순수 로직.
//
// 초안 = { order: 전체 컬럼 순서(숨은 칸 포함), visible: 표시집합(표시된 키들) }.
// 표시/숨김은 order 와 별개(부모의 colOrder = 전체 순서, visibleColumns = 표시 필터 와 동일 계약).
// 창 안 ▲▼ 는 "표시된 칸끼리만" 자리를 바꾸되, 숨은 칸은 자기 슬롯을 지킨다.

export type ColumnDraft = { order: string[]; visible: string[] };

/** 목록에 key 가 없으면 끝에 추가, 있으면 제거(표시 토글용). 원본 불변. */
export function toggleInList(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/**
 * 창을 열 때 초안 스냅샷 만들기.
 * - order: orderedKeys 를 따르되 allKeys 에 없는 키(삭제된 칸)는 버리고, 중복은 첫 등장만,
 *   orderedKeys 에 빠진 allKeys 는 allKeys 순서로 뒤에 붙인다 → 항상 allKeys 전체를 1번씩 담는다.
 * - visible: allKeys 중 isVisible 이 참인 키(allKeys 순서).
 */
export function initDraft(
  allKeys: string[],
  orderedKeys: string[],
  isVisible: (key: string) => boolean,
): ColumnDraft {
  const allSet = new Set(allKeys);
  const order: string[] = [];
  const seen = new Set<string>();
  for (const k of orderedKeys) {
    if (allSet.has(k) && !seen.has(k)) {
      order.push(k);
      seen.add(k);
    }
  }
  for (const k of allKeys) {
    if (!seen.has(k)) {
      order.push(k);
      seen.add(k);
    }
  }
  const visible = allKeys.filter((k) => isVisible(k));
  return { order, visible };
}

/**
 * 표시된 칸끼리만 이웃 자리 교환(숨은 칸은 슬롯 유지). dir=-1 위로, 1 아래로.
 * key 가 표시집합에 없거나 이동할 표시 이웃이 없으면 변화 없음. 원본 불변.
 */
export function moveVisibleInOrder(
  order: string[],
  visible: string[],
  key: string,
  dir: -1 | 1,
): string[] {
  const visSet = new Set(visible);
  const visInOrder = order.filter((k) => visSet.has(k));
  const vi = visInOrder.indexOf(key);
  if (vi < 0) return order.slice();
  const targetVi = vi + dir;
  if (targetVi < 0 || targetVi >= visInOrder.length) return order.slice();
  const targetKey = visInOrder[targetVi];
  const next = order.slice();
  const i = next.indexOf(key);
  const j = next.indexOf(targetKey);
  if (i < 0 || j < 0) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * 창이 열린 동안 칸이 추가/삭제되면 초안을 부모 현재값에 맞춰 재동기화.
 * - 삭제된 칸: order·visible 에서 제거.
 * - 새 칸: order 뒤에 붙이고, 부모 isVisible 이 참이면 표시집합에도 추가.
 * - 기존 칸: 진행 중 초안 토글을 그대로 보존(부모값으로 덮지 않음).
 */
export function reconcileDraft(
  prev: ColumnDraft,
  allKeys: string[],
  isVisible: (key: string) => boolean,
): ColumnDraft {
  const allSet = new Set(allKeys);
  const order = prev.order.filter((k) => allSet.has(k));
  const visible = prev.visible.filter((k) => allSet.has(k));
  const known = new Set(order);
  for (const k of allKeys) {
    if (!known.has(k)) {
      order.push(k);
      known.add(k);
      if (isVisible(k)) visible.push(k);
    }
  }
  return { order, visible };
}

/** 저장 시 부모에 넘길 페이로드 — visibleKeys 는 order 순서, order 는 전체(숨은 칸 포함). */
export function commitPayload(draft: ColumnDraft): { visibleKeys: string[]; order: string[] } {
  const visSet = new Set(draft.visible);
  return {
    visibleKeys: draft.order.filter((k) => visSet.has(k)),
    order: draft.order.slice(),
  };
}
