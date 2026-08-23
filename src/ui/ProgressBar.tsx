import { cn } from "./cn";

/** 진행 막대 (2026-08-23 신설) — 각진 얇은 트랙 + 채움. value 는 0~100. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  // 0으로 나눈 NaN 이 오면 무효 CSS 로 폭이 부모 100%가 되던 것 방지(적대적 리뷰 실측)
  const v = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1 w-full overflow-hidden bg-wedly-bg-sidebar", className)}
    >
      <div className="h-full bg-wedly-accent transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}
