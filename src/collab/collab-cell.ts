import type { ColumnDef } from "../types/columns";
import { getOptionColorClass } from "../lib/options";
import { formatCurrency, formatDate, formatPercent } from "../lib/utils";
import { cleanPersonName, detectPersonChipRole, personChipClasses } from "../unified/field-display-core";
import type { CellValue } from "./collab-table-core";

// 앱이 주입하는 색상 규칙(도메인 데이터). 보관함은 데이터를 갖지 않고 인자로만 받는다.
export type CellColorMaps = {
  statusColors?: Record<string, string>;
  badgeColors?: Record<string, string>;
};

export type CellChip = { label: string; className: string; dot?: string };

// 셀을 어떻게 그릴지에 대한 순수 판정 결과 — 하이브 표 셀 표시(renderDisplay)와 동일 규칙.
export type CellContent =
  | { kind: "text"; text: string }
  | { kind: "currency"; text: string }
  | { kind: "chips"; chips: CellChip[] }
  | { kind: "files"; files: { name: string; url?: string }[] };

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

  if (col.type === "file") {
    let list: { name: string; url?: string }[] = [];
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) {
        list = parsed
          .map((f) => ({ name: String(f?.name ?? f?.fileName ?? ""), url: f?.url }))
          .filter((f) => f.name);
      }
    } catch {
      list = [];
    }
    if (list.length === 0) return { kind: "text", text: "-" };
    return { kind: "files", files: list };
  }

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

  if (col.type === "percent") {
    // 퍼센트도 숫자 표시 → currency kind(tabular-nums) 재사용. CollabCell 무수정.
    return { kind: "currency", text: formatPercent(value) };
  }

  if (col.format === "currency" || (col.type === "formula" && typeof value === "number")) {
    const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
    return { kind: "currency", text: Number.isFinite(n) ? formatCurrency(n) : String(value) };
  }

  if (col.type === "date" || col.type === "datetime" || col.type === "last_edited_time") {
    return { kind: "text", text: formatDate(String(value)) };
  }

  if (col.type === "checkbox") {
    return { kind: "text", text: value === true || value === "true" ? "✓" : "-" };
  }

  if (col.type === "person") {
    // 팀장/팀원 라벨 → 색 칩(상세창과 동일 규칙). 그 외 person 칸은 글자 그대로.
    const role = detectPersonChipRole(col.label);
    if (role) {
      const names = String(value)
        .split(/[,;]/)
        .map((s) => cleanPersonName(s.trim()))
        .filter(Boolean);
      if (names.length === 0) return { kind: "text", text: "-" };
      const c = personChipClasses(role);
      return {
        kind: "chips",
        chips: names.map((label) => ({ label, className: `${c.bg} ${c.text}`, dot: c.dot })),
      };
    }
    return { kind: "text", text: personDisplayName(String(value)) };
  }

  return { kind: "text", text: String(value) };
}
