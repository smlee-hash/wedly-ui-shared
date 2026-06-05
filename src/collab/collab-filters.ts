// 통합 협업 — 상태별 필터 탭 순수 로직.
// 하이브 SubsidyClient.tsx 의 matchesFilter 동작을 글자 그대로 옮김(동작 동일성 보장).
// DOM·React 없음 → 단위 시험 가능. 타입은 B1 범위로 단순화(columns/isPreset/viewMode 제외).
import type { RowData } from "./collab-table-core";

export type FilterOperator =
  | "equals"
  | "in"
  | "is_empty"
  | "is_not_empty"
  | "contains"
  | "on_or_before";

export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value?: string | string[];
};

export type ViewTab = {
  id: string;
  label: string;
  filters: FilterCondition[];
  /** 표시 형식(예: "table" | "calendar"). 생략 시 표 보기. 캘린더 탭 지원용(거르기 로직은 사용 안 함). */
  viewMode?: string;
};

/** 한 행이 한 조건에 맞는지 판정(하이브와 동일). */
export function matchesFilter(row: RowData, filter: FilterCondition): boolean {
  const rawVal = row[filter.field];
  const strVal = rawVal != null ? String(rawVal) : "";
  const isEmpty = rawVal === null || rawVal === undefined || rawVal === "";
  // multi_select 값("값1, 값2")은 각 값 단위로도 비교 — 여러 개 고른 행이
  // equals/in 필터(상단 탭)에서 누락되지 않도록. 단일값(", " 없음)은 기존과 동일.
  const parts = strVal.includes(", ")
    ? strVal.split(", ").map((s) => s.trim()).filter(Boolean)
    : null;
  switch (filter.operator) {
    case "equals": {
      const target = String(filter.value || "");
      return strVal === target || (parts ? parts.includes(target) : false);
    }
    case "in": {
      const fv = filter.value;
      if (!Array.isArray(fv)) return false;
      return fv.includes(strVal) || (parts ? parts.some((p) => fv.includes(p)) : false);
    }
    case "is_empty":
      return isEmpty;
    case "is_not_empty":
      return !isEmpty;
    case "contains":
      if (Array.isArray(filter.value)) return filter.value.some((v) => strVal.includes(v));
      return strVal.includes(String(filter.value || ""));
    case "on_or_before":
      if (isEmpty || !filter.value) return false;
      return strVal.split("T")[0] <= String(filter.value);
    default:
      return true;
  }
}

/** 한 행이 한 탭(조건 여러 개의 AND)에 맞는지. 조건 없으면 true = 전체. */
export function matchesTab(row: RowData, tab: ViewTab): boolean {
  return tab.filters.every((f) => matchesFilter(row, f));
}

/** 탭으로 행 거르기. tab 이 null 이면 전체 반환. */
export function filterRowsByTab(rows: RowData[], tab: ViewTab | null): RowData[] {
  if (!tab) return rows;
  return rows.filter((r) => matchesTab(r, tab));
}
