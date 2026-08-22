"use client";

// 통합 상세창 "읽기전용 표시" 공용 부품 — 하이브 상세창과 100% 동일한 시각.
//
//  - renderUnifiedFieldValue: 값 1개를 하이브와 동일한 모양으로 그림(날짜/통화/배지/파일/사람칩/기본).
//  - UnifiedFieldDisplayRow: 라벨+값 한 줄(하이브 EditableFieldRow 읽기 레이아웃).
//  - UnifiedDisplaySection: 섹션 카드(박스+헤더+칸들) — 하이브 통합보기 섹션 틀.
//
// 편집 입력기는 포함하지 않는다(운영자 편집모드는 별도). 분기·포맷은 unified/field-display-core 의 순수 로직 사용.

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { getOptionColorClass } from "../lib/options";
import type { ColumnLite, UnifiedSection } from "../unified/sections";
import { selfHostedFileUrl } from "../lib/self-hosted-file-url";
import {
  classifyUnifiedFieldValue,
  fileHref,
  fileLabel,
  personChipClasses,
  type FieldDisplayOptions,
} from "../unified/field-display-core";

/** 값 1개를 하이브 상세창과 동일하게 표시(읽기전용). */
export function renderUnifiedFieldValue(
  field: ColumnLite,
  value: unknown,
  opts: FieldDisplayOptions = {},
): ReactNode {
  const d = classifyUnifiedFieldValue(field, value, opts);

  switch (d.kind) {
    case "empty":
      return <span className="text-wedly-muted">{d.text}</span>;

    case "person-chip": {
      const cc = personChipClasses(d.isLeader ? "leader" : "member");
      const chipBg = cc.bg;
      const chipText = cc.text;
      const dotColor = cc.dot;
      return (
        <span className="inline-flex flex-wrap gap-1">
          {(d.names ?? []).map((n, i) => (
            <span
              key={`${n}-${i}`}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] sm:text-[11px] font-semibold whitespace-nowrap",
                chipBg,
                chipText,
              )}
            >
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dotColor)} aria-hidden="true" />
              {n}
            </span>
          ))}
        </span>
      );
    }

    case "file":
      return (
        <span className="flex flex-col gap-1.5 min-w-0">
          {(d.files ?? []).map((f, i) => {
            const href = selfHostedFileUrl(fileHref(f) || "");
            const label = fileLabel(f);
            const base =
              "flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 text-[14px] sm:text-[13px] text-wedly-t1 max-w-full";
            const inner = (
              <>
                <span aria-hidden="true">📎</span>
                <span className="truncate">{label}</span>
              </>
            );
            return href ? (
              <a
                key={`${label}-${i}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(base, "hover:text-wedly-accent transition-colors")}
              >
                {inner}
              </a>
            ) : (
              <span key={`${label}-${i}`} className={base}>
                {inner}
              </span>
            );
          })}
        </span>
      );

    case "datetime":
      return <span className="text-[15px] sm:text-[13px] text-wedly-muted">{d.text}</span>;

    case "select":
      return (
        <span
          className={cn(
            "inline-block rounded-md px-2.5 py-0.5 text-[13px] sm:text-[12px] font-medium",
            getOptionColorClass(d.text ?? "", opts.statusColors, opts.badgeColors),
          )}
        >
          {d.text}
        </span>
      );

    case "currency":
      return (
        <span className="text-[15px] sm:text-[13px] tabular-nums font-medium text-wedly-navy">{d.text}</span>
      );

    case "date":
      return <span className="text-[15px] sm:text-[13px] text-wedly-navy">{d.text}</span>;

    case "text":
    default:
      return <span className="text-[15px] sm:text-[13px] font-medium text-wedly-navy">{d.text}</span>;
  }
}

/** 라벨+값 한 줄 — 하이브 EditableFieldRow 읽기 레이아웃과 동일. */
export function UnifiedFieldDisplayRow({
  field,
  value,
  options,
}: {
  field: ColumnLite;
  value: unknown;
  options?: FieldDisplayOptions;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-3 sm:py-2 px-1 sm:min-h-[36px]">
      <div className="w-full sm:w-[160px] sm:flex-shrink-0 text-[13px] sm:text-[13px] font-medium sm:font-normal text-wedly-muted leading-tight sm:truncate">
        {field.label}
      </div>
      <div className="flex-1 text-[15px] sm:text-[13px] text-wedly-t1 min-w-0">
        <div className="px-2 sm:px-1 py-1.5 sm:py-0.5 -mx-1 min-h-[40px] sm:min-h-[26px] flex items-center">
          <div className="flex-1 min-w-0">{renderUnifiedFieldValue(field, value, options)}</div>
        </div>
      </div>
    </div>
  );
}

/** 섹션 카드(박스 + 헤더 + 칸들) — 하이브 통합보기 섹션과 동일한 틀. */
export function UnifiedDisplaySection({
  section,
  row,
  options,
}: {
  section: UnifiedSection;
  row: Record<string, unknown> | null | undefined;
  options?: FieldDisplayOptions;
}) {
  return (
    <div className="rounded-xl border border-wedly-bd bg-white overflow-hidden">
      <div className="px-4 py-2.5 bg-wedly-bg-gray/50 border-b border-wedly-bd/60">
        <div className="text-[12px] font-semibold text-wedly-t2">{section.label}</div>
      </div>
      <div className="px-3 py-1 divide-y divide-slate-50">
        {section.fields.map((f) => (
          <UnifiedFieldDisplayRow key={f.key} field={f} value={row ? row[f.key] : null} options={options} />
        ))}
      </div>
    </div>
  );
}
