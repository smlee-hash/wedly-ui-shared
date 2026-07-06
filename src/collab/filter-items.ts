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
// 페이지를 새로 열 때마다 _seq가 0으로 초기화되므로, 이전 로드가 브라우저 탭(sessionStorage)에
// 저장해 둔 id(f1,f2…)와 새로 만든 id가 겹칠 수 있다. 로드마다 고유한 소금값을 앞에 붙여
// 서로 다른 로드의 id가 절대 겹치지 않게 한다. (id가 겹치면 두 필터가 같은 항목으로 취급돼
// 한 필터의 드롭다운·값 변경이 다른 필터에도 함께 적용되는 버그가 난다.)
const _idSalt = Math.random().toString(36).slice(2, 8);
export function genItemId(): string {
  _seq += 1;
  return `f${_idSalt}_${_seq}`;
}

/**
 * 항목들의 id가 겹치면(이전 버그 빌드가 sessionStorage에 저장해 둔 중복 id 등) 새 id를 부여해
 * 모두 고유하게 만든다. React key·팝오버 열림·값 수정이 모두 id로 대상을 지목하므로, 중복 id는
 * 서로 다른 필터를 같은 필터로 오인하게 만든다(한쪽 조작이 다른쪽에 함께 적용). 원본은 불변.
 */
export function ensureUniqueIds(items: FilterItem[]): FilterItem[] {
  const seen = new Set<string>();
  let changed = false;
  const out = items.map((it) => {
    if (!it.id || seen.has(it.id)) {
      changed = true;
      const nid = genItemId();
      seen.add(nid);
      return { ...it, id: nid };
    }
    seen.add(it.id);
    return it;
  });
  return changed ? out : items;
}

/**
 * '기본 필터 = 칸(컬럼)만 공유' 모델용 seed 연산자.
 * 갓 시드된 기본 칸이 '빈 값' 상태에서 자동으로 목록을 거르지 않도록, 카테고리별로
 * '값이 필요한' 연산자(값 없으면 isConditionComplete=false)를 고른다.
 * (조건·값은 각 사용자 개인 몫 — 서버가 공유하는 건 '어떤 칸을 보여줄지'뿐.)
 */
export function seedOperatorFor(cat: FilterCategory): FilterOperator {
  if (cat === "date") return "date_between";
  if (cat === "select") return "in";
  return "contains";
}

/**
 * 저장(관리자 '기본 필터로 저장'): 현재 필터 칩들 → 기본 '칸' 목록.
 * 칸(field)만 남기고(중복 제거) 값·개인 조건은 버린다. operator 는 카테고리별 seed 연산자로 정규화
 * (서버엔 '어떤 칸을 모두에게 보여줄지'만 의미 있음). typeOf 로 각 칸의 종류를 얻는다.
 */
export function itemsToDefaultColumns(
  items: FilterItem[],
  typeOf: (field: string) => string | undefined,
): FilterCondition[] {
  const seen = new Set<string>();
  const out: FilterCondition[] = [];
  for (const it of items) {
    if (!it.field || seen.has(it.field)) continue;
    seen.add(it.field);
    out.push({ field: it.field, operator: seedOperatorFor(filterCategory(typeOf(it.field) ?? "text")) });
  }
  return out;
}

/**
 * 로드: 관리자 기본 '칸' 목록을 세션(개인) 칩 위에 정합한다.
 * - 세션의 기본 칸(pinned): 아직 기본에 있으면 개인 조건·값 그대로 유지, 관리자가 뺀 칸이면 제거.
 * - 사용자가 직접 추가한 칩(비pinned): 유지.
 * - 세션에 없던 기본 칸: '빈 값' pinned 로 새로 시드(seed 연산자).
 * 값은 절대 서버에서 오지 않는다(항상 개인 세션). 중복 id 는 치유.
 */
export function reconcileItemsWithDefaultColumns(
  saved: FilterItem[] | null | undefined,
  defaultCols: FilterCondition[],
  typeOf: (field: string) => string | undefined,
): FilterItem[] {
  const defByField = new Map<string, FilterCondition>();
  for (const d of defaultCols) if (d.field && !defByField.has(d.field)) defByField.set(d.field, d);

  const out: FilterItem[] = [];
  const covered = new Set<string>();
  for (const it of saved ?? []) {
    if (it.pinned) {
      if (!defByField.has(it.field)) continue; // 관리자가 뺀 기본 칸 → 제거
      if (covered.has(it.field)) continue;      // 중복 방지
      covered.add(it.field);
      out.push(it);                             // 개인 조건·값 유지
    } else {
      out.push(it);                             // 사용자 추가 칩 유지
    }
  }
  for (const d of defaultCols) {
    if (covered.has(d.field)) continue;
    covered.add(d.field);
    out.push({
      id: genItemId(),
      field: d.field,
      operator: seedOperatorFor(filterCategory(typeOf(d.field) ?? "text")),
      value: undefined,
      pinned: true,
    });
  }
  // 복원된 세션 항목이 (이전 버그 빌드 탓에) 중복 id를 갖고 있으면 로드 시점에 치유한다.
  return ensureUniqueIds(out);
}

/** 초기화(↻): 모든 칩(칸·조건) 유지, 고른 값만 비운다. */
export function resetItemValues(items: FilterItem[]): FilterItem[] {
  return items.map((it) => ({ ...it, value: undefined }));
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
