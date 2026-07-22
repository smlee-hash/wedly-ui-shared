// 통합 협업 — 상태별 필터 탭 순수 로직.
// 하이브 SubsidyClient.tsx 의 matchesFilter 동작을 글자 그대로 옮김(동작 동일성 보장).
// DOM·React 없음 → 단위 시험 가능. 타입은 B1 범위로 단순화(columns/isPreset/viewMode 제외).
import type { RowData } from "./collab-table-core";

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "contains"
  | "not_contains"
  | "on_or_before"
  | "on_or_after"
  | "date_between"
  | "date_today"
  | "date_yesterday"
  | "date_this_week"
  | "date_this_month"
  | "date_last_month";

export type FilterCondition = {
  field: string;
  operator: FilterOperator;
  value?: string | string[];
};

/** 탭의 거르기 조건을 묶는 방식 — "all"=모든 조건 만족(그리고), "any"=하나라도 만족(또는). */
export type TabFilterMatch = "all" | "any";

/**
 * 조건 하나의 최소 모양. 3앱이 각자 좁은 연산자 목록으로 자기 FilterCondition 을 따로 선언해 두었기에
 * (예: 하이브는 not_equals 가 없음) 공용 판정 도우미는 이 구조만 요구한다 — 타입이 서로 안 맞아
 * 앱 쪽 판정기를 못 넘기는 일이 없게.
 */
export type TabConditionLike = { field: string; operator: string; value?: string | string[] };

export type ViewTab = {
  id: string;
  label: string;
  filters: FilterCondition[];
  /** 표시 형식(예: "table" | "calendar"). 생략 시 표 보기. 캘린더 탭 지원용(거르기 로직은 사용 안 함). */
  viewMode?: string;
  /** 조건 결합 방식. 생략 = "all"(그리고) — 기존 탭은 전부 예전과 똑같이 동작한다. */
  filterMatch?: TabFilterMatch;
};

/**
 * 값 목록에서 "값이 비어 있는(미입력) 항목"을 골라 거르기 위한 특수 선택지.
 * 거르기 값(equals/in)에 이 문자열이 들어오면 빈 값(미입력)에 매칭한다.
 * 표시용 토큰 — 실제 상태값과 충돌할 가능성이 사실상 없는 라벨을 쓴다.
 */
export const EMPTY_OPTION_VALUE = "(미입력)";

/** 값 없이도 성립하는 연산자(비어 있음·오늘·이번 달 등). 조건이 "채워졌는지" 판정에 쓴다. */
const NO_VALUE_OPERATORS = new Set<FilterOperator>([
  "is_empty", "is_not_empty",
  "date_today", "date_yesterday", "date_this_week", "date_this_month", "date_last_month",
]);

/** 한 행이 한 조건에 맞는지 판정(하이브와 동일). 상대 날짜 연산자는 todayISO(기준일) 필요. */
export function matchesFilter(row: RowData, filter: FilterCondition, todayISO?: string): boolean {
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
      // '(미입력)' 을 고른 경우 = 빈 값(미입력) 항목에 매칭.
      if (target === EMPTY_OPTION_VALUE) return isEmpty;
      return strVal === target || (parts ? parts.includes(target) : false);
    }
    case "in": {
      const fv = filter.value;
      if (!Array.isArray(fv)) return false;
      // 빈 값(미입력) 항목은 목록에 '(미입력)' 이 포함됐을 때만 매칭.
      if (isEmpty) return fv.includes(EMPTY_OPTION_VALUE);
      return fv.includes(strVal) || (parts ? parts.some((p) => fv.includes(p)) : false);
    }
    case "not_in": {
      // 다중 선택(제외): 고른 값들만 빼고 나머지 전부 표시 — "in" 의 정확한 반대.
      const fv = filter.value;
      if (!Array.isArray(fv) || fv.length === 0) return true; // 아무것도 안 빼면 전부 통과
      // 빈 값(미입력)은 '(미입력)' 을 제외 목록에 넣었을 때만 숨긴다.
      if (isEmpty) return !fv.includes(EMPTY_OPTION_VALUE);
      // 다중값(여러 개 고른 행)은 그중 하나라도 제외 대상이면 숨긴다.
      if (parts) return !parts.some((p) => fv.includes(p));
      return !fv.includes(strVal);
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
    case "not_equals": {
      const target = String(filter.value || "");
      // '(미입력)' 을 고른 경우 = 빈 값이 아닌 항목에 매칭(값 다름 = 미입력 아님).
      if (target === EMPTY_OPTION_VALUE) return !isEmpty;
      return !(strVal === target || (parts ? parts.includes(target) : false));
    }
    case "not_contains":
      if (Array.isArray(filter.value)) return !filter.value.some((v) => strVal.includes(v));
      return !strVal.includes(String(filter.value || ""));
    case "on_or_after":
    case "date_between":
    case "date_today":
    case "date_yesterday":
    case "date_this_week":
    case "date_this_month":
    case "date_last_month": {
      if (isEmpty) return false;
      const day = strVal.split("T")[0];
      const win = resolveDateWindow(filter, todayISO || day);
      if (win.from === undefined && win.to === undefined) return false;
      if (win.from !== undefined && day < win.from) return false;
      if (win.to !== undefined && day > win.to) return false;
      return true;
    }
    default:
      return true;
  }
}

/**
 * 탭 조건 하나가 "실제로 걸려 있는지"(값이 채워졌는지). 항목만 고르고 값을 안 채운 조건은
 * 연산자에 따라 모든 행을 통과시키므로(예: not_in 빈 목록), '또는'에서 그 하나 때문에
 * 전체가 다 보이게 된다 → '또는' 판정에서만 이런 조건을 빼기 위한 판별기.
 * (필터바 전용 isConditionComplete 와 의도적으로 분리 — 그쪽 규칙을 바꾸면 다른 기능이 흔들린다.)
 */
export function isTabConditionActive(cond: TabConditionLike): boolean {
  if (!cond.field) return false;
  if (NO_VALUE_OPERATORS.has(cond.operator as FilterOperator)) return true;
  if (Array.isArray(cond.value)) return cond.value.length > 0;
  return typeof cond.value === "string" && cond.value.trim() !== "";
}

/**
 * 탭 조건 묶음 판정(공용 규칙) — 앱마다 자기 matchesFilter 를 쓰므로 판정기는 test 로 받는다.
 * · 조건 0개  → 통과(전체 표시). '또는'으로 바꿔도 「전체」 탭이 0건이 되지 않게 하는 가드.
 * · "all"(기본) → 예전 그대로 every. 이 경로는 손대지 않아 기존 동작이 완전히 보존된다.
 * · "any"      → 값이 채워진 조건만 골라 some. 채워진 게 없으면 통과(전체 표시).
 */
export function passesTabFilters<C extends TabConditionLike>(
  filters: C[] | undefined | null,
  filterMatch: TabFilterMatch | undefined,
  test: (cond: C) => boolean,
): boolean {
  const list = filters || [];
  if (list.length === 0) return true;
  if (filterMatch !== "any") return list.every(test);
  const active = list.filter(isTabConditionActive);
  if (active.length === 0) return true;
  return active.some(test);
}

/** 한 행이 한 탭(조건 여러 개)에 맞는지. 조건 없으면 true = 전체. 묶는 방식은 tab.filterMatch. */
export function matchesTab(row: RowData, tab: ViewTab): boolean {
  return passesTabFilters(tab.filters, tab.filterMatch, (f) => matchesFilter(row, f));
}

/** 탭으로 행 거르기. tab 이 null 이면 전체 반환. */
export function filterRowsByTab(rows: RowData[], tab: ViewTab | null): RowData[] {
  if (!tab) return rows;
  return rows.filter((r) => matchesTab(r, tab));
}

/**
 * 탭 편집 저장용 — 원래 탭을 통째 보존하면서 이름·조건만 교체한다.
 * columns / isPreset / viewMode 등 ViewTab 타입에 안 적힌 필드까지 전개로 그대로 유지
 * → 탭 편집 시 숨은 정보(탭별 컬럼·기본탭표시·표/캘린더 형식)가 사라지는 사고 방지.
 */
export function buildTabFromDraft<T extends ViewTab>(tab: T, label: string, filters: FilterCondition[]): T {
  return { ...tab, label, filters };
}

// ── 날짜 필터 계산(순수) ─────────────────────────────────────────
// 기준일(todayISO, "YYYY-MM-DD")을 주입받아 상대/범위 날짜를 [from, to] 구간으로 환산.
// 비교는 값의 날짜부분("YYYY-MM-DD") 사전식 비교(ISO 정렬 성질). Date 파싱 최소화·UTC 고정.
export type DateWindow = { from?: string; to?: string };

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function resolveDateWindow(
  cond: { operator: FilterOperator; value?: string | string[] },
  todayISO: string,
): DateWindow {
  const today = parseYmd(todayISO);
  switch (cond.operator) {
    case "date_today":
      return { from: todayISO, to: todayISO };
    case "date_yesterday": {
      const d = new Date(today); d.setUTCDate(d.getUTCDate() - 1);
      return { from: ymd(d), to: ymd(d) };
    }
    case "date_this_week": {
      // 월요일 시작. getUTCDay(): 0=일..6=토 → 월요일까지 뒤로 (day+6)%7 일.
      const day = today.getUTCDay();
      const back = (day + 6) % 7;
      const mon = new Date(today); mon.setUTCDate(mon.getUTCDate() - back);
      const sun = new Date(mon); sun.setUTCDate(sun.getUTCDate() + 6);
      return { from: ymd(mon), to: ymd(sun) };
    }
    case "date_this_month": {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
      return { from: ymd(first), to: ymd(last) };
    }
    case "date_last_month": {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: ymd(first), to: ymd(last) };
    }
    case "on_or_after":
      return cond.value ? { from: String(cond.value) } : {};
    case "on_or_before":
      return cond.value ? { to: String(cond.value) } : {};
    case "date_between": {
      const v = cond.value;
      if (Array.isArray(v) && v[0] && v[1]) return { from: String(v[0]), to: String(v[1]) };
      return {};
    }
    default:
      return {};
  }
}

// ── 다조건 필터(노션식 필터 바) ─────────────────────────────────

/** 조건이 필터로 적용 가능한 상태인지(값이 필요한 연산자는 값이 채워졌는지). */
export function isConditionComplete(cond: FilterCondition): boolean {
  if (NO_VALUE_OPERATORS.has(cond.operator)) return true;
  if (cond.operator === "in" || cond.operator === "not_in") {
    return Array.isArray(cond.value) && cond.value.length > 0;
  }
  if (cond.operator === "date_between") {
    return Array.isArray(cond.value) && !!cond.value[0] && !!cond.value[1];
  }
  return typeof cond.value === "string" && cond.value.trim() !== "";
}

/** 여러 조건을 AND 로 적용해 행을 거른다. 미완성 조건은 건너뛴다(통과). 완성 0개면 전체 반환. */
export function filterRowsByConditions(
  rows: RowData[],
  conditions: FilterCondition[],
  todayISO: string,
): RowData[] {
  const active = conditions.filter(isConditionComplete);
  if (active.length === 0) return rows;
  return rows.filter((r) => active.every((c) => matchesFilter(r, c, todayISO)));
}
