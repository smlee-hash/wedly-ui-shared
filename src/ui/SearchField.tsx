"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import { cn } from "./cn";

/**
 * 검색 입력칸 (2026-08-23 신설) — 돋보기 + 지우기 단추. 조작줄 전용(ToolbarSearchInput)과 달리 어디서나 쓰는 범용.
 */
export function SearchField({
  value,
  onChange,
  placeholder = "검색",
  label,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wedly-muted" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-lg border border-wedly-bd bg-white pl-9 pr-8 text-wedly-sub text-wedly-t1 placeholder:text-wedly-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-wedly-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-wedly-muted hover:text-wedly-t1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
