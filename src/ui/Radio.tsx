"use client";

import { useId } from "react";
import { cn } from "./cn";

/**
 * 라디오 단추 묶음 (2026-08-23 신설) — 기본은 카드형 선택지(tile).
 * 줄줄이 나열은 variant="plain". 브라우저 기본 라디오 + 브랜드 색.
 */
export function RadioGroup({
  options,
  value,
  onChange,
  name,
  direction = "row",
  variant = "tile",
  className,
}: {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  direction?: "row" | "col";
  variant?: "tile" | "plain";
  className?: string;
}) {
  const autoName = useId();
  const groupName = name ?? autoName;
  return (
    <div role="radiogroup" className={cn("flex gap-x-4 gap-y-2", direction === "col" && "flex-col", className)}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <label
            key={opt.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2",
              variant === "tile" &&
                (selected
                  ? "rounded-xl border-2 border-wedly-accent bg-wedly-bg-blue/50 px-3 py-2 text-wedly-sub font-medium text-wedly-t1"
                  : "rounded-xl border border-wedly-bd bg-white px-3 py-2 text-wedly-sub text-wedly-t2"),
              opt.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={groupName}
              checked={selected}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className="h-4 w-4 shrink-0 cursor-pointer"
              style={{ accentColor: "var(--wedly-accent)" }}
            />
            <span className={cn("break-keep", variant === "plain" && "text-wedly-sub text-wedly-t1")}>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}
