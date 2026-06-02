import type { ColumnDef } from "../types/columns";
import { getOptionColorClass } from "../lib/options";
import { defaultFormatCellValue, type CellValue } from "./collab-table-core";

// 앱이 주입하는 색상 규칙(도메인 데이터). 보관함은 데이터를 갖지 않고 인자로만 받는다.
export type CellColorMaps = {
  statusColors?: Record<string, string>;
  badgeColors?: Record<string, string>;
};

export type CellChip = { label: string; className: string };

// 셀을 어떻게 그릴지에 대한 순수 판정 결과 — 글자 한 줄이거나, 색깔 딱지 여러 개.
export type CellContent =
  | { kind: "text"; text: string }
  | { kind: "chips"; chips: CellChip[] };

// 색깔 딱지로 그리는 컬럼 종류 — select/status/multi_select. 나머지는 글자.
const CHIP_TYPES = new Set<ColumnDef["type"]>(["select", "status", "multi_select"]);

/**
 * 컬럼 종류·값·색상 규칙으로 "이 셀을 글자로 그릴지, 색깔 딱지로 그릴지" 판정(순수).
 * - 빈 값: 기본 표시("—")와 동일하게 글자.
 * - select/status: 딱지 1개. multi_select: 콤마로 쪼개 딱지 여러 개.
 * - 그 외(number/currency/date/checkbox/text…): 기본 표시 글자(defaultFormatCellValue).
 */
export function cellChips(col: ColumnDef, value: CellValue, maps: CellColorMaps = {}): CellContent {
  if (value == null || value === "") {
    return { kind: "text", text: defaultFormatCellValue(col, value) };
  }
  if (CHIP_TYPES.has(col.type)) {
    const raw = String(value);
    const labels =
      col.type === "multi_select"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : [raw];
    if (labels.length === 0) return { kind: "text", text: "—" };
    return {
      kind: "chips",
      chips: labels.map((label) => ({
        label,
        className: getOptionColorClass(label, maps.statusColors, maps.badgeColors),
      })),
    };
  }
  return { kind: "text", text: defaultFormatCellValue(col, value) };
}
