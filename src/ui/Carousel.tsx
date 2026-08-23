"use client";

import { useState, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * 회전 목마 (2026-08-23 신설) — 원형 화살표 + 점 표시(활성 점 확장, 업계 실측 형태).
 * 한 장씩 넘긴다.
 */
export function Carousel({ slides, className }: { slides: ReactNode[]; className?: string }) {
  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;
  // 장 수가 줄어도 빈 화면이 안 되게 렌더마다 범위 안으로(적대적 리뷰)
  const safe = Math.min(index, slides.length - 1);
  const go = (next: number) => setIndex((next + slides.length) % slides.length);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="이전 장"
          onClick={() => go(safe - 1)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-wedly-bd bg-white text-wedly-t2 shadow-sm hover:bg-wedly-bg-gray"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1">{slides[safe]}</div>
        <button
          type="button"
          aria-label="다음 장"
          onClick={() => go(safe + 1)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-wedly-bd bg-white text-wedly-t2 shadow-sm hover:bg-wedly-bg-gray"
        >
          ›
        </button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}번째 장으로`}
            aria-current={i === safe}
            onClick={() => setIndex(i)}
            className={cn("h-1.5 rounded-full transition-all", i === safe ? "w-6 bg-wedly-accent" : "w-1.5 bg-wedly-bd hover:bg-wedly-muted")}
          />
        ))}
      </div>
    </div>
  );
}
