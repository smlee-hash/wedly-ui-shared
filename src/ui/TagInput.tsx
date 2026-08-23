"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "./cn";

/**
 * 여러 값 입력칸 (2026-08-23 신설) — 엔터로만 알약을 추가(떠나면 치다 만 글자는 칸에 남음), 지우개/백스페이스로 제거, Escape 로 버림.
 * 중복은 조용히 무시한다.
 */
export function TagInput({
  values,
  onChange,
  placeholder = "입력 후 Enter",
  label,
  id,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-wedly-bd bg-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-wedly-accent">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-wedly-bg-blue px-2.5 py-0.5 text-wedly-hint font-medium text-wedly-navy">
            {v}
            <button
              type="button"
              aria-label={`${v} 지우기`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-wedly-navy/60 hover:text-wedly-red"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          placeholder={values.length === 0 ? placeholder : ""}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && values.length > 0) {
              onChange(values.slice(0, -1));
            } else if (e.key === "Escape" && draft) {
              // 치다 만 글자 버리기 — 겉 창은 안 닫히게
              e.stopPropagation();
              setDraft("");
            }
          }}
          className="min-w-24 flex-1 bg-transparent text-wedly-sub text-wedly-t1 placeholder:text-wedly-muted focus:outline-none"
        />
      </div>
    </div>
  );
}
