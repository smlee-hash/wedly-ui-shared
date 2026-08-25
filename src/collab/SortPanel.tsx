"use client";

/**
 * 정렬 기준 패널 — "정렬" 버튼 + 다중 기준(AND) 드롭다운.
 *
 * ERP CollabTable 안에 있던 정렬 패널을 공용 부품으로 추출(2026-06-14, 2단계).
 * ERP·하이브·일루아 첫 화면이 같은 부품을 써서 100% 동일한 정렬 UI 를 갖는다.
 *
 * - 관리자 게이팅은 호출측에서(이 부품을 isAdmin 일 때만 렌더).
 * - 정렬 계산(sortRows 또는 앱별 다중정렬)은 호출측. 이 부품은 sort 상태를 보여주고 바꾸기만.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { normalizeSort, type SortConfig, type SortRule } from "./collab-table-core";

type Props = {
  /** 현재 정렬 상태(단일/배열/null 모두 허용 — 내부에서 정규화). */
  sort: SortConfig;
  /** 정렬 규칙 배열로 변경 통지(빈 배열 = 정렬 해제). */
  onSortChange: (rules: SortRule[]) => void;
  /** 정렬 기준으로 고를 수 있는 컬럼 목록(표시 라벨 포함). */
  columns: { key: string; label: string }[];
};

export function SortPanel({ sort, onSortChange, columns }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const rules = normalizeSort(sort);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="정렬 기준 설정"
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
          rules.length > 0
            ? "border-wedly-accent bg-wedly-bg-blue text-wedly-accent-ink"
            : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray",
        )}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M4 8h8M7 12h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        정렬
        {rules.length > 0 && (
          <span className="ml-0.5 rounded-full bg-wedly-accent px-1 py-0 text-[10px] text-white leading-4">
            {rules.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 rounded-2xl border border-wedly-bd bg-white shadow-[0_8px_24px_-4px_rgba(10,34,68,0.14)] z-50">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <span className="text-[12px] font-semibold text-wedly-navy">정렬 기준</span>
            {rules.length > 0 && (
              <button
                type="button"
                onClick={() => onSortChange([])}
                className="text-[11px] text-wedly-muted hover:text-wedly-red transition-colors"
              >
                전체 해제
              </button>
            )}
          </div>

          {/* 현재 정렬 기준 목록 */}
          {rules.map((rule, idx) => (
            <div key={`${rule.key}-${idx}`} className="flex items-center gap-1.5 px-3 py-1.5">
              <span className="text-[11px] text-wedly-muted w-5 text-center">{idx + 1}</span>
              <select
                value={rule.key}
                onChange={(e) => {
                  const next = rules.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r));
                  onSortChange(next);
                }}
                className="flex-1 rounded-lg border border-wedly-bd bg-white px-2 py-1 text-[12px] text-wedly-navy focus:border-wedly-accent focus:outline-none"
              >
                {columns.map((col) => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const next = rules.map((r, i) =>
                    i === idx ? { ...r, direction: (r.direction === "asc" ? "desc" : "asc") as "asc" | "desc" } : r,
                  );
                  onSortChange(next);
                }}
                className="rounded-lg border border-wedly-bd px-2 py-1 text-[11px] text-wedly-t2 hover:bg-wedly-bg-gray transition-colors w-12 text-center"
              >
                {rule.direction === "asc" ? "오름" : "내림"}
              </button>
              <button
                type="button"
                onClick={() => onSortChange(rules.filter((_, i) => i !== idx))}
                className="rounded-lg border border-wedly-bd px-1.5 py-1 text-[12px] text-wedly-t2 hover:bg-wedly-bg-red hover:text-wedly-red-ink transition-colors"
                title="이 기준 삭제"
              >
                ✕
              </button>
            </div>
          ))}

          {/* 기준 추가 버튼 */}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const existing = new Set(rules.map((r) => r.key));
                const next = columns.find((c) => !existing.has(c.key));
                if (!next) return;
                onSortChange([...rules, { key: next.key, direction: "asc" }]);
              }}
              className="w-full rounded-lg border border-wedly-bd-blue bg-wedly-bg-blue px-3 py-1.5 text-[12px] text-wedly-accent-ink hover:bg-wedly-bg-blue/70 transition-colors text-left"
            >
              + 기준 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
