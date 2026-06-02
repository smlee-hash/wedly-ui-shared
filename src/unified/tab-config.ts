// 통합 보기 탭(섹션) 순서·이름 설정 — 순수 함수만(서버·클라이언트 공용, prisma 의존 없음).
//
// 저장 형태: JsonCache["detail-tab-config:{scope}"]
//   {
//     topOrder:  string[],               // 윗줄 영역 그룹 key 표시 순서(기본정보 제외)
//     topLabels: { [groupKey]: string }, // 윗줄 영역 그룹 이름 덮어쓰기
//     subOrder:  string[],               // 아랫줄 하위 탭 id 표시 순서(파일 제외)
//     subLabels: { [subTabId]: string }, // 아랫줄 하위 탭 이름 덮어쓰기(히스토리 포함)
//   }
//
// 라벨이 빈 문자열/공백이면 덮어쓰기 해제(기본 이름 복귀).
// 순서는 표시만 바꾼다 — 도메인 키·편집권한·저장 위치는 절대 바뀌지 않는다.

export type TabConfig = {
  topOrder: string[];
  topLabels: Record<string, string>;
  subOrder: string[];
  subLabels: Record<string, string>;
};

export const EMPTY_TAB_CONFIG: TabConfig = {
  topOrder: [],
  topLabels: {},
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
 * - order 에 있으나 실제로 없는(삭제된) 키는 무시.
 * - pinLast 키는 순서와 무관하게 항상 맨 뒤(예: '파일' 탭).
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
  return {
    topOrder: arr(v.topOrder),
    topLabels: rec(v.topLabels),
    subOrder: arr(v.subOrder),
    subLabels: rec(v.subLabels),
  };
}
