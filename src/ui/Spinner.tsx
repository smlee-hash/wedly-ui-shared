import { cn } from "./cn";

/**
 * 로딩 표시.
 * - inline (기본): 버튼·칸 안 원형. 자리가 달라 기본은 원형을 유지한다.
 * - bar: 화면 전체가 바뀌는 로딩의 표준 — 위쪽 얇은 진행 바.
 */
export function Spinner({
  size = "md",
  variant = "inline",
  className,
}: {
  size?: "sm" | "md";
  variant?: "inline" | "bar";
  className?: string;
}) {
  if (variant === "bar") {
    return (
      <span
        role="progressbar"
        aria-label="불러오는 중"
        className={cn("block h-0.5 w-full overflow-hidden bg-wedly-bg-sidebar", className)}
      >
        <span className="block h-full w-1/2 animate-pulse bg-wedly-accent" />
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label="불러오는 중"
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-wedly-bd border-t-wedly-accent",
        size === "sm" ? "h-4 w-4" : "h-5 w-5",
        className,
      )}
    />
  );
}
