import type { ColumnDef } from "../types/columns";
import { formatCurrency, formatDate, formatPercent } from "../lib/utils";

export type CellValue = string | number | boolean | null;
export type RowData = Record<string, CellValue>;
/** 정렬 규칙 하나 (다중 AND 정렬의 단위) */
export type SortRule = { key: string; direction: "asc" | "desc" };
/** 단일 정렬(하위호환) 또는 다중 정렬 배열 또는 null(정렬 없음) */
export type SortConfig = SortRule[] | { key: string; direction: "asc" | "desc" } | null;

/** SortConfig 를 항상 SortRule[] 로 정규화. null→[], 단일 객체→[그것], 배열→그대로. */
export function normalizeSort(s: SortConfig): SortRule[] {
  if (s == null) return [];
  if (Array.isArray(s)) return s;
  return [s];
}

/** 밑줄(_)로 시작하는 내부 키는 제외하고, 나머지 값들을 이어붙여 대소문자 무시 부분일치 검색.
 *  NO.82 — 검색어가 '번호형'(숫자·공백·괄호·+·.·- 만)이고 숫자가 7자리 이상(전화·사업자번호 길이)이면,
 *  각 칸 값의 '숫자만' 부분일치도 함께 본다 → 전화/사업자번호를 하이픈·저장형식과 무관하게 검색.
 *  7자리 문턱: 짧은 숫자(2~6자리)로 금액('12,340,000')·퍼센트('3.5%')·날짜 칸이 딸려오는 오탐 방지.
 *  6자리 이하 숫자는 종전 글자검색으로만 판정(원래 동작) — 하이픈 한 그룹 안의 4자리 등은 글자로 이미 잡힘.
 *  덧붙이기(additive) 방식: 기존 글자 부분일치는 그대로 먼저 판정(OR)하므로, 지금 잡히던
 *  결과가 사라지지 않고(비회귀), 숫자 매칭은 번호형 검색어에서만 켜져 글자 검색엔 영향 없음.
 *
 *  extraSearchText — '화면에만 보이는 값'을 검색에 함께 태우는 통로(생략하면 종전과 100% 동일).
 *  저장값이 비어 다른 곳에서 채워 그리는 칸(일루아 대표자명 = 회사별 공용 이름, NO.130)은
 *  저장값만 훑으면 "화면엔 이름이 보이는데 그 이름으로 찾으면 0건"이 된다(2026-07-29 배포본 실측).
 *  원본 행은 절대 건드리지 않는다 — 셀 편집·저장은 종전 저장값 그대로여야 하므로 사본 주입은 쓰지 않는다. */
export function filterRowsBySearch(
  rows: RowData[],
  query: string,
  extraSearchText?: (row: RowData) => string,
): RowData[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  // 번호형(숫자 7자리+) 검색어일 때만 '숫자만' 비교를 준비(전화/사업자번호 하이픈 무시). 그 외엔 종전과 동일.
  const qDigits = /^[0-9\s()+.\-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const useDigits = qDigits.length >= 7;
  // 띄어쓰기 무시 비교 — 저장은 "태권도장 아토"인데 담당자는 "태권도장아토"로 검색해 0건이 떴고
  // "업체가 목록에 없다"로 오해됐다(2026-08-13 이충훈 제보 실측). 반대("예성기업"↔"예성 기업")도 같다.
  // 값마다 공백 제거본을 따로 대조한다 — 여러 칸을 이어 붙인 문자열에서 공백을 지우면
  // 칸 경계가 사라져 서로 다른 칸의 글자가 이어져 잘못 맞는 것을 막는다.
  // ★숫자 모양 검색어(공백·구분자 포함 숫자만)에는 쓰지 않는다 — "010 1"의 공백 제거본 "0101"이
  //   모든 010 번호·날짜·금액에 번지면, 번호 검색의 7자리 문턱(위 useDigits — 짧은 숫자 오탐 방지)을
  //   우회하게 된다(2026-08-13 적대적 리뷰 지적). 번호 검색은 종전 규칙 그대로.
  const qCompact = /^[0-9\s()+.\-]+$/.test(q) ? "" : q.replace(/\s+/g, "");
  return rows.filter((row) => {
    const parts: string[] = [];
    let digitHit = false;
    let compactHit = false;
    const add = (v: unknown) => {
      if (v == null || v === "") return;
      const sv = String(v).toLowerCase();
      parts.push(sv);
      if (useDigits && !digitHit && sv.replace(/\D/g, "").includes(qDigits)) digitHit = true;
      if (qCompact && !compactHit && sv.replace(/\s+/g, "").includes(qCompact)) compactHit = true;
    };
    for (const k in row) {
      if (k.startsWith("_")) continue;
      add(row[k]);
    }
    if (extraSearchText) add(extraSearchText(row));
    return parts.join(" ").includes(q) || digitHit || compactHit;
  });
}

/** 한국어 정렬. 빈 값은 방향과 무관하게 항상 뒤로.
 *  다중 AND 정렬 지원: 1순위 기준이 같을 때만 2순위 기준으로 비교.
 *  단일 { key, direction } 또는 배열 SortRule[] 모두 처리(하위호환). */
export function sortRows(rows: RowData[], sortConfig: SortConfig): RowData[] {
  const rules = normalizeSort(sortConfig);
  if (rules.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { key, direction } of rules) {
      const av = a[key];
      const bv = b[key];
      if ((av == null || av === "") && (bv == null || bv === "")) continue;
      if (av == null || av === "") return 1;
      if (bv == null || bv === "") return -1;
      const cmp = direction === "asc"
        ? String(av).localeCompare(String(bv), "ko")
        : String(bv).localeCompare(String(av), "ko");
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/** 정렬 토글: 다른 키 클릭→오름, 같은 키 오름→내림, 내림→해제(null).
 *  헤더 클릭(1순위 단일 토글) 전용. 반환은 단일 SortRule 또는 null — 하위호환 유지.
 *  prev 가 배열이면 첫 번째 규칙을 기준으로 토글한다. */
export function nextSortConfig(prev: SortConfig, key: string): SortConfig {
  const rules = normalizeSort(prev);
  const first = rules[0];
  if (first?.key === key) {
    return first.direction === "asc" ? { key, direction: "desc" } : null;
  }
  return { key, direction: "asc" };
}

/** 저장된 순서대로 정렬하고, 순서에 없는 컬럼은 원래 순서로 뒤에 붙인다. */
export function orderColumns(allColumns: ColumnDef[], colOrder: string[]): ColumnDef[] {
  if (colOrder.length === 0) return allColumns;
  const byKey = new Map(allColumns.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const out: ColumnDef[] = [];
  for (const k of colOrder) {
    const c = byKey.get(k);
    if (c) { out.push(c); seen.add(k); }
  }
  for (const c of allColumns) if (!seen.has(c.key)) out.push(c);
  return out;
}

/** 고정(sticky) 컬럼의 왼쪽 누적 오프셋(px). */
export function computeStickyOffsets(activeColumns: ColumnDef[], colWidths: Record<string, number>): Record<string, number> {
  const m: Record<string, number> = {};
  let acc = 0;
  for (const c of activeColumns) {
    if (c.sticky) {
      m[c.key] = acc;
      acc += colWidths[c.key] || c.width || 120;
    }
  }
  return m;
}

/**
 * 공용(관리자) 칸 너비 묶음의 "내용 지문" (NO.139).
 *
 * 왜 필요한가: 화면은 관리자가 정한 공용 너비를 받아 칸 폭에 적용하는데,
 * 이 적용을 화면이 다시 그려질 때마다 반복하면 사용자가 방금 끌어서 넓힌 칸이
 * 곧바로 옛 너비로 되돌아간다(NO.139 신고 증상). 그래서 "받은 내용이 정말
 * 달라졌을 때만" 적용하도록, 묶음을 비교 가능한 문자열 하나로 줄인다.
 *
 * 키 순서에 좌우되지 않고(정렬), 값이 하나라도 다르거나 칸이 늘고 줄면 달라진다.
 * 빈 묶음·없음은 빈 문자열 — "아직 관리자 값이 없음"과 같은 뜻으로 쓴다.
 */
export function colWidthsSignature(widths?: Record<string, number> | null): string {
  if (!widths) return "";
  const keys = Object.keys(widths).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}:${widths[k]}`).join("|");
}

export function paginate<T>(rows: T[], currentPage: number, pageSize: number): T[] {
  // "전체"(pageSize=Infinity)·비정상값이면 모든 행 반환.
  // 가드 없으면 (currentPage-1)*Infinity = 0*Infinity = NaN → slice(NaN,NaN) = [] (빈 표 버그).
  if (!Number.isFinite(pageSize) || pageSize <= 0) return rows;
  const start = (currentPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function totalPageCount(totalRows: number, pageSize: number): number {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1; // 전체 보기는 1페이지
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

/**
 * 표 한 화면의 칸 순서를 처음 정할 때의 우선순위 — 관리자가 서버에 저장한 공용 순서를
 * 개인(브라우저) 순서·앱 기본 순서보다 우선한다.
 * (3앱 통일 — "관리자가 배치한대로 모두에게 적용". 관리자가 순서를 안 정한 화면은 서버값이
 *  비어 있어 개인 순서가, 그것도 없으면 앱 기본 순서가 유지된다.)
 * @param serverOrder 서버(관리자 전용) 저장 순서 — 비어있지 않은 배열일 때만 채택
 * @param localOrder  개인(브라우저) 저장 순서 — 서버값이 없을 때의 1차 대체
 * @param defaultOrder 앱이 지정한 기본 순서 — 둘 다 없을 때의 최종 대체
 */
export function resolveInitialColumnOrder(
  serverOrder: unknown,
  localOrder: unknown,
  defaultOrder: unknown,
): string[] {
  if (Array.isArray(serverOrder) && serverOrder.length > 0) return serverOrder as string[];
  if (Array.isArray(localOrder) && localOrder.length > 0) return localOrder as string[];
  if (Array.isArray(defaultOrder) && defaultOrder.length > 0) return defaultOrder as string[];
  return [];
}

/** from 키를 빼서 to 키 위치에 끼워넣은 새 배열을 반환(원본 불변). */
export function reorderList(order: string[], fromKey: string, toKey: string): string[] {
  if (fromKey === toKey) return order;
  const cur = order.slice();
  const fromIdx = cur.indexOf(fromKey);
  const toIdx = cur.indexOf(toKey);
  if (fromIdx === -1 || toIdx === -1) return order;
  cur.splice(fromIdx, 1);
  cur.splice(toIdx, 0, fromKey);
  return cur;
}

/** 컬럼 종류에 맞춘 기본 표시 문자열(읽기 전용). 앱이 renderFieldValue로 덮어쓸 수 있다. */
export function defaultFormatCellValue(col: ColumnDef, value: CellValue): string {
  if (value == null || value === "") return "—";
  if (col.type === "checkbox") return value === true || value === "true" ? "✓" : "—";
  if (col.type === "percent") return formatPercent(value);
  if (col.type === "number" || col.type === "formula") {
    if (col.format === "currency") {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? formatCurrency(n) : String(value);
    }
    return String(value);
  }
  if (col.type === "date" || col.type === "datetime" || col.type === "last_edited_time") {
    return formatDate(String(value));
  }
  return String(value);
}

/**
 * 표 한 줄(<tr>)의 색 클래스를 조합한다. (3앱 표 통일 — 하이브·일루아가 줄에 쓰던 조건부 색칠을 공용 표로 옮김)
 *
 * 우선순위(하이브·일루아와 동일): 체크된 줄의 파란 강조 > 조건부 색칠 > 기본(테두리+hover).
 * - `conditionalClass`(예: "bg-wedly-bg-red text-wedly-red-ink")는 그 줄이 **체크 안 됐을 때만** 적용한다.
 *   체크하면 체크 강조(`checkedClass`)가 이기고 조건부 색은 빠진다.
 * - `conditionalClass`가 null/undefined/빈문자열이면 무시(빈 토큰을 만들지 않는다).
 *   → 공용 표 소비자가 색 함수를 안 넘기면(ERP) 항상 빈값이라 기존 동작과 100% 동일(무영향).
 */
export function composeRowClassName(
  base: string,
  isChecked: boolean,
  checkedClass: string,
  conditionalClass: string | null | undefined,
): string {
  return [
    base,
    !isChecked && conditionalClass ? conditionalClass : "",
    isChecked ? checkedClass : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface GroupedArrangement {
  pagedRows: RowData[];
  totalUnits: number;
  totalPages: number;
  continuationKeys: Set<string>;
}

/** 펼친 줄을 groupKey(회사)로 묶어 회사 단위 정렬·페이지·건수·연속줄키를 낸다. 순수.
 *  - 정렬은 각 회사의 대표(첫 줄)로 sortRows 를 돌려 회사를 재배열(차수 줄은 붙여 둔다).
 *  - 페이지·건수는 회사(그룹) 단위. continuationKeys = 각 회사의 2번째 이후 줄 _rowKey. */
export function arrangeGroupedRows(
  rows: RowData[],
  opts: { groupKey: string; sortConfig: SortConfig; currentPage: number; pageSize: number; rowKeyField?: string },
): GroupedArrangement {
  const { groupKey, sortConfig, currentPage, pageSize, rowKeyField = "_rowKey" } = opts;
  const map = new Map<string, RowData[]>();
  const order: string[] = [];
  for (const r of rows) {
    const k = String((r as Record<string, unknown>)[groupKey] ?? "");
    let g = map.get(k);
    if (!g) { g = []; map.set(k, g); order.push(k); }
    g.push(r);
  }
  let groups = order.map((k) => map.get(k)!);
  const rules = normalizeSort(sortConfig);
  if (rules.length) {
    const reps = groups.map((g, i) => ({ ...(g[0] as Record<string, unknown>), __gidx: i }) as RowData);
    const sortedReps = sortRows(reps, rules);
    groups = sortedReps.map((r) => groups[(r as Record<string, unknown>).__gidx as number]);
  }
  const totalUnits = groups.length;
  const totalPages = totalPageCount(totalUnits, pageSize);
  const pageGroups = paginate(groups, currentPage, pageSize);
  const pagedRows: RowData[] = [];
  const continuationKeys = new Set<string>();
  for (const g of pageGroups) {
    g.forEach((r, idx) => {
      pagedRows.push(r);
      if (idx > 0) continuationKeys.add(String((r as Record<string, unknown>)[rowKeyField] ?? ""));
    });
  }
  return { pagedRows, totalUnits, totalPages, continuationKeys };
}
