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

/** 밑줄(_)로 시작하는 내부 키는 제외하고, 나머지 값들을 이어붙여 대소문자 무시 부분일치 검색 */
export function filterRowsBySearch(rows: RowData[], query: string): RowData[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const parts: string[] = [];
    for (const k in row) {
      if (k.startsWith("_")) continue;
      const v = row[k];
      if (v == null || v === "") continue;
      parts.push(String(v).toLowerCase());
    }
    return parts.join(" ").includes(q);
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
