// 통합 보기 탭(섹션) 순서·이름 설정 — 순수 함수(서버·클라이언트 공용).
//
// 하이브 src/lib/unified-tab-config.ts 를 그대로 포팅.
// 로직·타입 변경 없음. Phase 4(운영자 편집) 전까지는 저장된 설정 없이 기본 순서로 동작.

export type TabConfig = {
  topOrder: string[];
  topLabels: Record<string, string>;
  topHidden: string[];
  // 관리자가 만든 "새 분야" 탭 목록(id + 처음 이름). 순서·이름변경·숨김은 topOrder/topLabels/topHidden 으로 기존 분야와 동일하게 처리.
  topCustom: Array<{ id: string; label: string }>;
  subOrder: string[];
  subLabels: Record<string, string>;
};

export const EMPTY_TAB_CONFIG: TabConfig = {
  topOrder: [],
  topLabels: {},
  topHidden: [],
  topCustom: [],
  subOrder: [],
  subLabels: {},
};

export interface LabeledItem {
  key: string;
  label: string;
}

/**
 * 저장된 순서·라벨을 항목 목록에 적용한다.
 * - order 에 있는 키 순서대로 먼저 배치, order 에 없는 항목은 원래 순서로 뒤에 붙임.
 * - order 에 있으나 실제로 없는 키는 무시.
 * - pinLast 키는 순서와 무관하게 항상 맨 뒤.
 * - labels[key] 가 비지 않은 문자열이면 label 을 덮어씀.
 * - 입력 배열·항목은 변형하지 않는다(새 배열/객체 반환).
 */
export function applyTabConfig<T extends LabeledItem>(
  items: T[],
  order: string[],
  labels: Record<string, string>,
  pinLast: string[] = [],
): T[] {
  const pin = new Set(pinLast);
  const relabel = (it: T): T => {
    const ov = labels?.[it.key];
    return ov && ov.trim() ? { ...it, label: ov } : it;
  };

  const movable = items.filter((it) => !pin.has(it.key));
  const pinned = items.filter((it) => pin.has(it.key));

  const byKey = new Map(movable.map((it) => [it.key, it]));
  const used = new Set<string>();
  const ordered: T[] = [];
  for (const k of order) {
    const it = byKey.get(k);
    if (it && !used.has(k)) {
      ordered.push(it);
      used.add(k);
    }
  }
  for (const it of movable) {
    if (!used.has(it.key)) ordered.push(it);
  }

  return [...ordered, ...pinned].map(relabel);
}

/** 서버/클라이언트에서 받은 임의 값 → 안전한 TabConfig 로 정규화. */
export function normalizeTabConfig(value: unknown): TabConfig {
  const v = (value && typeof value === "object" && !Array.isArray(value)) ? (value as Record<string, unknown>) : {};
  const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((k): k is string => typeof k === "string") : []);
  const rec = (x: unknown): Record<string, string> => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(x as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  };
  const customArr = (x: unknown): Array<{ id: string; label: string }> => {
    if (!Array.isArray(x)) return [];
    const out: Array<{ id: string; label: string }> = [];
    for (const item of x) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const id = (item as Record<string, unknown>).id;
        const label = (item as Record<string, unknown>).label;
        if (typeof id === "string" && id && typeof label === "string") out.push({ id, label });
      }
    }
    return out;
  };
  return {
    topOrder: arr(v.topOrder),
    topLabels: rec(v.topLabels),
    topHidden: arr(v.topHidden),
    topCustom: customArr(v.topCustom),
    subOrder: arr(v.subOrder),
    subLabels: rec(v.subLabels),
  };
}
