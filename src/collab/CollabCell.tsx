"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "../types/columns";
import { cn } from "../lib/cn";
import { selfHostedFileUrl } from "../lib/self-hosted-file-url";
import { cellChips, type CellChip, type CellColorMaps } from "./collab-cell";
import type { CellValue, RowData } from "./collab-table-core";

// 딱지(둥근 알약) 모양 — ERP·하이브 본화면 표와 동일. (display 는 점 유무에 따라 분기)
const CHIP_BASE = "px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap";

// 색 딱지 1개. 팀장/팀원 사람 칩은 점(dot)+알약, 그 외는 일반 딱지.
// cn 에 tailwind-merge 가 없어 inline-block/inline-flex 를 동시에 주지 않도록 한쪽만 내보낸다.
function Chip({ chip }: { chip: CellChip }) {
  return (
    <span className={cn(chip.dot ? "inline-flex items-center gap-1" : "inline-block", CHIP_BASE, chip.className)}>
      {chip.dot ? (
        <span className={cn("inline-block w-1.5 h-1.5 rounded-full", chip.dot)} aria-hidden="true" />
      ) : null}
      {chip.label}
    </span>
  );
}

/** 하이브 표 셀과 동일한 표시(읽기 전용): 색 딱지 / 통화 / 글자. */
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

  if (content.kind === "currency") {
    return <span className="tabular-nums">{content.text}</span>;
  }
  if (content.kind === "text") {
    return <span>{content.text}</span>;
  }
  if (content.kind === "files") {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {content.files.map((f, i) =>
          f.url ? (
            <a
              key={`${f.name}-${i}`}
              href={selfHostedFileUrl(f.url)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-wedly-accent hover:underline truncate max-w-[140px]"
            >
              <span aria-hidden>📎</span>
              <span className="truncate">{f.name}</span>
            </a>
          ) : (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-wedly-muted truncate max-w-[140px]">
              <span aria-hidden>📎</span>
              <span className="truncate">{f.name}</span>
            </span>
          ),
        )}
      </span>
    );
  }
  // chips (select/status/multi_select 색 딱지 + 팀장/팀원 점 알약)
  if (content.chips.length === 1) {
    return <Chip chip={content.chips[0]} />;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {content.chips.map((c, i) => (
        <Chip key={`${c.label}-${i}`} chip={c} />
      ))}
    </span>
  );
}

/**
 * CollabTable 의 renderFieldValue 로 넘길 표준 "하이브식" 셀 렌더러를 만든다.
 * 색상 규칙(statusColors/badgeColors)은 각 앱이 주입 — 보관함은 모양만 책임(3앱 동일).
 */
export function createColoredFieldRenderer(maps: CellColorMaps) {
  return function renderFieldValue(col: ColumnDef, value: CellValue, _row: RowData): ReactNode {
    return <ColoredCell col={col} value={value} maps={maps} />;
  };
}
