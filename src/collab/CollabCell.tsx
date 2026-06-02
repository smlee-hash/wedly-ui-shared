"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "../types/columns";
import { cn } from "../lib/cn";
import { cellChips, type CellColorMaps } from "./collab-cell";
import type { CellValue, RowData } from "./collab-table-core";

// 딱지(둥근 알약) 모양 — ERP·하이브 본화면 표와 동일.
const CHIP_CLASS =
  "inline-block px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap";

/** 색깔 딱지 셀(읽기 전용). select/status/multi_select 면 색 딱지, 아니면 기본 글자. */
export function ColoredCell({
  col,
  value,
  maps,
}: {
  col: ColumnDef;
  value: CellValue;
  maps: CellColorMaps;
}) {
  const content = cellChips(col, value, maps);
  if (content.kind === "text") {
    return <span>{content.text}</span>;
  }
  if (content.chips.length === 1) {
    const c = content.chips[0];
    return <span className={cn(CHIP_CLASS, c.className)}>{c.label}</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {content.chips.map((c, i) => (
        <span key={`${c.label}-${i}`} className={cn(CHIP_CLASS, c.className)}>
          {c.label}
        </span>
      ))}
    </span>
  );
}

/**
 * CollabTable 의 renderFieldValue 로 넘길 표준 "색깔 딱지" 렌더러를 만든다.
 * 색상 규칙(statusColors/badgeColors)은 각 앱이 주입 — 보관함은 모양만 책임.
 */
export function createColoredFieldRenderer(maps: CellColorMaps) {
  return function renderFieldValue(col: ColumnDef, value: CellValue, _row: RowData): ReactNode {
    return <ColoredCell col={col} value={value} maps={maps} />;
  };
}
