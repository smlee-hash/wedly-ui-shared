import type { ColumnDef } from "../types/columns";
import { getOptionColorClass } from "../lib/options";
import { formatCurrency, formatDate } from "../lib/utils";
import type { CellValue } from "./collab-table-core";

// 앱이 주입하는 색상 규칙(도메인 데이터). 보관함은 데이터를 갖지 않고 인자로만 받는다.
export type CellColorMaps = {
  statusColors?: Record<string, string>;
  badgeColors?: Record<string, string>;
};

export type CellChip = { label: string; className: string };

// 셀을 어떻게 그릴지에 대한 순수 판정 결과 — 하이브 표 셀 표시(renderDisplay)와 동일 규칙.
export type CellContent =
  | { kind: "text"; text: string }
  | { kind: "currency"; text: string }
  | { kind: "chips"; chips: CellChip[] };

// 색깔 딱지로 그리는 컬럼 종류 — select/status/multi_select.
const CHIP_TYPES = new Set<ColumnDef["type"]>(["select", "status", "multi_select"]);

/** "이름 <이메일>" → 이름만 (하이브 personDisplayName 과 동일 규칙). */
function personDisplayName(v: string): string {
  return v.replace(/\s*<[^>]*>\s*/g, "").trim() || v;
}

/**
 * 컬럼 종류·값·색상 규칙으로 셀 표시 형태를 판정(순수) — 하이브 표와 100% 동일 규칙.
 * - 빈 값: "-"
 * - select/status: 딱지 1개 / multi_select: 콤마로 쪼갠 딱지 여러 개
 * - currency 또는 formula(숫자): 통화 형식(천단위) — 표시는 tabular-nums
 * - date/last_edited_time: 날짜 형식
 * - checkbox: ✓ / -
 * - person: "이름"만
 * - 그 외: 문자열 그대로
 */
export function cellChips(col: ColumnDef, value: CellValue, maps: CellColorMaps = {}): CellContent {
  if (value == null || value === "") return { kind: "text", text: "-" };

  if (CHIP_TYPES.has(col.type)) {
    const raw = String(value);
    const labels =
      col.type === "multi_select"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : [raw];
    if (labels.length === 0) return { kind: "text", text: "-" };
    return {
      kind: "chips",
      chips: labels.map((label) => ({
        label,
        className: getOptionColorClass(label, maps.statusColors, maps.badgeColors),
      })),
    };
  }

  if (col.format === "currency" || (col.type === "formula" && typeof value === "number")) {
    const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
    return { kind: "currency", text: Number.isFinite(n) ? formatCurrency(n) : String(value) };
  }

  if (col.type === "date" || col.type === "last_edited_time") {
    return { kind: "text", text: formatDate(String(value)) };
  }

  if (col.type === "checkbox") {
    return { kind: "text", text: value === true || value === "true" ? "✓" : "-" };
  }

  if (col.type === "person") {
    return { kind: "text", text: personDisplayName(String(value)) };
  }

  return { kind: "text", text: String(value) };
}
