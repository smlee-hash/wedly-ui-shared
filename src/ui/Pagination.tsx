"use client";

import { cn } from "./cn";

/**
 * 쪽수 이동 (2026-08-23 신설) — 번호는 글자, 현재 쪽만 채움(깃허브·클라우드플레어식).
 * 쪽이 많으면 현재 주변만 보여 준다.
 */
export function Pagination({
  page,
  totalPages,
  onChange,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  // Infinity(쪽당 0 나눗셈)·소수 totalPages 방어 — 무한 반복·고아 생략점 방지(적대적 리뷰 실측)
  const total = Number.isFinite(totalPages) ? Math.max(1, Math.floor(totalPages)) : 1;
  if (total <= 1) return null;
  const pages: Array<number | "…"> = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav aria-label="쪽수 이동" className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-2 py-1 text-wedly-sub text-wedly-t2 disabled:opacity-40"
      >
        ‹ 이전
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-wedly-sub text-wedly-muted">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "min-w-7 rounded-md px-2 py-1 text-wedly-sub tabular-nums",
              p === page ? "bg-wedly-accent font-semibold text-white" : "text-wedly-t2 hover:bg-wedly-bg-gray",
            )}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= total}
        className="px-2 py-1 text-wedly-sub text-wedly-t2 disabled:opacity-40"
      >
        다음 ›
      </button>
    </nav>
  );
}
