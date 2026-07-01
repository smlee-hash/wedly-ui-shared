// 노션식 필터 바가 쓰는 항목 타입·순수 헬퍼(카테고리·연산자 목록·시드·초기화·변환).
// DOM·React 없음 → 단위 시험 가능.
import type { ColumnDef } from "../types/columns";
import type { FilterOperator, FilterCondition } from "./collab-filters";

export type FilterCategory = "date" | "select" | "text";

/** 컬럼 타입 → 필터 카테고리. file 등 제외 타입은 호출 전에 걸러 전달한다. */
export function filterCategory(type: ColumnDef["type"] | string): FilterCategory {
  if (type === "date" || type === "datetime" || type === "last_edited_time") return "date";
  if (type === "select" || type === "multi_select" || type === "status" || type === "checkbox") return "select";
  return "text";
}

export type OperatorOption = { op: FilterOperator; label: string };

const TEXT_OPS: OperatorOption[] = [
  { op: "contains", label: "포함" },
  { op: "not_contains", label: "포함하지 않음" },
  { op: "equals", label: "값과 동일" },
  { op: "not_equals", label: "값과 다름" },
  { op: "is_empty", label: "비어있음" },
  { op: "is_not_empty", label: "비어있지 않음" },
];
const SELECT_OPS: OperatorOption[] = [
  { op: "in", label: "값과 동일(다중 선택)" },
  { op: "not_in", label: "값과 다름(다중 선택)" },
  { op: "is_empty", label: "비어있음" },
  { op: "is_not_empty", label: "비어있지 않음" },
];
const DATE_OPS: OperatorOption[] = [
  { op: "date_today", label: "오늘" },
  { op: "date_yesterday", label: "어제" },
  { op: "date_this_week", label: "이번 주" },
  { op: "date_this_month", label: "이번 달" },
  { op: "date_last_month", label: "지난 달" },
  { op: "on_or_after", label: "이 날짜 이후" },
  { op: "on_or_before", label: "이 날짜 이전" },
  { op: "date_between", label: "기간 선택" },
  { op: "is_empty", label: "비어있음" },
  { op: "is_not_empty", label: "비어있지 않음" },
];

export function operatorsFor(cat: FilterCategory): OperatorOption[] {
  return cat === "date" ? DATE_OPS : cat === "select" ? SELECT_OPS : TEXT_OPS;
}
export function defaultOperator(cat: FilterCategory): FilterOperator {
  return operatorsFor(cat)[0].op;
}

const NO_VALUE_OPS = new Set<FilterOperator>([
  "is_empty", "is_not_empty",
  "date_today", "date_yesterday", "date_this_week", "date_this_month", "date_last_month",
]);
/** 이 연산자가 값 입력이 필요한가(값 없는 연산자는 false). */
export function isValueNeeded(op: FilterOperator): boolean {
  return !NO_VALUE_OPS.has(op);
}

export type FilterItem = {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: string | string[];
  /** true = 관리자 기본 필터(사용자 삭제 불가, 값만 변경). */
  pinned?: boolean;
};

let _seq = 0;
export function genItemId(): string {
  _seq += 1;
  return `f${_seq}`;
}

/** 관리자 기본 필터(조건 배열) → pinned 필터 항목(값 유지). */
export function seedItemsFromDefaults(defaults: FilterCondition[]): FilterItem[] {
  return defaults.map((d) => ({ id: genItemId(), field: d.field, operator: d.operator, value: d.value, pinned: true }));
}

/** 조건 식별 키(field+operator). 같은 칸·같은 조건이면 동일 기본필터로 본다. */
function condKey(field: string, operator: FilterOperator): string {
  return `${field} ${operator}`;
}

/** 초기화: 모든 항목 유지. pinned(기본)은 기본값으로 복원, 사용자 항목은 값만 비움. */
export function resetItems(items: FilterItem[], defaults: FilterCondition[] = []): FilterItem[] {
  const defByKey = new Map<string, FilterCondition>();
  for (const d of defaults) {
    const k = condKey(d.field, d.operator);
    if (!defByKey.has(k)) defByKey.set(k, d);
  }
  return items.map((it) => {
    if (it.pinned) {
      const d = defByKey.get(condKey(it.field, it.operator));
      return { ...it, value: d ? d.value : undefined };
    }
    return { ...it, value: undefined };
  });
}

/**
 * 로드 시 관리자 기본 필터(서버)를 항상 바탕에 두고 세션(개인) 항목을 얹는다.
 * - saved 비었으면 → 기본 필터로 시드.
 * - 세션 pinned 항목: 현재 defaults에 있으면 유지(개인 변경값 보존), 없으면 제거(관리자가 지움).
 * - 사용자 추가(비pinned) 항목: 그대로 유지.
 * - defaults 중 세션에 없던 항목: 뒤에 추가(관리자 신규 기본필터 전파).
 */
export function reconcileItemsWithDefaults(
  saved: FilterItem[] | null | undefined,
  defaults: FilterCondition[],
): FilterItem[] {
  if (!saved || saved.length === 0) return seedItemsFromDefaults(defaults);
  const defByKey = new Map<string, FilterCondition>();
  for (const d of defaults) {
    const k = condKey(d.field, d.operator);
    if (!defByKey.has(k)) defByKey.set(k, d);
  }
  const covered = new Set<string>();
  const out: FilterItem[] = [];
  for (const it of saved) {
    if (it.pinned) {
      const k = condKey(it.field, it.operator);
      if (!defByKey.has(k)) continue; // 관리자가 지운 기본필터 → 제거
      if (covered.has(k)) continue;   // 중복 방지
      covered.add(k);
      out.push(it);                    // 개인 변경값 보존
    } else {
      out.push(it);                    // 사용자 추가 항목 유지
    }
  }
  for (const d of defaults) {
    const k = condKey(d.field, d.operator);
    if (covered.has(k)) continue;
    covered.add(k);
    out.push({ id: genItemId(), field: d.field, operator: d.operator, value: d.value, pinned: true });
  }
  return out;
}

/** 표시 항목 → 조건 배열(엔진 입력). */
export function itemsToConditions(items: FilterItem[]): FilterCondition[] {
  return items.map((it) => ({ field: it.field, operator: it.operator, ...(it.value !== undefined ? { value: it.value } : {}) }));
}

/** 필터 항목 순서 변경(드래그). from 항목을 to 위치로 이동. 경계 밖/동일이면 원본 그대로 반환. */
export function reorderItems<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
