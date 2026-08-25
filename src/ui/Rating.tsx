"use client";

import { Star } from "lucide-react";
import { cn } from "./cn";

/**
 * 별점 (2026-08-23 신설) — 금색 채움 별 5개. onChange 를 주면 눌러서 매길 수 있고, 없으면 표시 전용.
 */
export function Rating({
  value,
  onChange,
  max = 5,
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  className?: string;
}) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
  // 별은 정수 단위라 소수 평점은 반올림해 채운다(표시와 읽기 라벨을 함께 반올림 명시)
  const filledCount = Math.round(v);
  return (
    <div
      role={onChange ? "group" : "img"}
      aria-label={`별점 ${v} / ${max}${Number.isInteger(v) ? "" : " (별 표시는 반올림)"}`}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {Array.from({ length: max }, (_, i) => {
        const filled = i < filledCount;
        const star = (
          <Star
            className={cn("h-5 w-5", filled ? "fill-[var(--wedly-gold-ink)] text-[var(--wedly-gold-ink)]" : "text-wedly-bd")}
            aria-hidden="true"
          />
        );
        if (!onChange) return <span key={i}>{star}</span>;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={filledCount === i + 1}
            aria-label={`${i + 1}점으로 매기기`}
            onClick={() => onChange(i + 1)}
            className="rounded transition-transform hover:scale-110"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
