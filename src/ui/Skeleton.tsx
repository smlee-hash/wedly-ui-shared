import { cn } from "./cn";

/**
 * 뼈대 로딩 (2026-08-23 신설) — 실제 배치 자리에 회색 도형(맥박형, 업계 다수파).
 * variant: line(글줄)·circle(아바타 자리)·block(카드 자리).
 */
export function Skeleton({
  variant = "line",
  className,
}: {
  variant?: "line" | "circle" | "block";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse bg-wedly-bg-sidebar",
        variant === "line" && "h-4 w-full rounded",
        variant === "circle" && "h-8 w-8 rounded-full",
        variant === "block" && "h-20 w-full rounded-xl",
        className,
      )}
    />
  );
}
