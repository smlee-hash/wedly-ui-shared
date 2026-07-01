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

/** 초기화: 사용자 항목 제거 + pinned 항목 값 비움. */
export function resetItems(items: FilterItem[]): FilterItem[] {
  return items.filter((it) => it.pinned).map((it) => ({ ...it, value: undefined }));
}

/** 표시 항목 → 조건 배열(엔진 입력). */
export function itemsToConditions(items: FilterItem[]): FilterCondition[] {
  return items.map((it) => ({ field: it.field, operator: it.operator, ...(it.value !== undefined ? { value: it.value } : {}) }));
}
