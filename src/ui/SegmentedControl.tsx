"use client";

import { cn } from "./cn";

/**
 * 구간 단추 (2026-08-23 신설) — 알약 트랙 안에서 선택된 구간만 흰 알약(앤트·업계 필 트랙형).
 * 값 전환용이다(내용 갈래 전환은 Tabs).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex w-fit rounded-full bg-wedly-bg-sidebar p-0.5", className)}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full px-4 py-1 text-wedly-sub transition",
              on ? "bg-white font-semibold text-wedly-t1 shadow-sm" : "text-wedly-t2 hover:text-wedly-t1",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
