"use client";

import { cn } from "./cn";

/**
 * 슬라이더 (2026-08-23 신설) — 가는 트랙 + 원형 손잡이(카본·앤트 실측 계열).
 * 브라우저 기본 range 입력에 브랜드 색만 입힌 실동작 부품 — 기본 모양을 살려야 값 채움이 보인다(적대적 리뷰 실측).
 */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn("h-1 w-full cursor-pointer", className)}
      style={{ accentColor: "var(--wedly-accent)" }}
    />
  );
}
