import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 알림 숫자 배지 (2026-08-23 신설) — 아이콘·단추 모서리에 붙는 빨간 숫자(99 넘으면 99+) 또는 점.
 */
export function NotificationBadge({
  count,
  dot = false,
  children,
  className,
}: {
  count?: number;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const show = dot || (typeof count === "number" && count > 0);
  const text = typeof count === "number" && count > 99 ? "99+" : String(count ?? "");
  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      {show && (
        <span
          aria-label={dot ? "새 알림 있음" : `알림 ${text}건`}
          className={cn(
            "absolute -right-1 -top-1 rounded-full bg-wedly-red ring-2 ring-white",
            dot ? "h-2.5 w-2.5" : "flex h-4 min-w-4 items-center justify-center px-1 text-wedly-label font-semibold leading-none text-white tabular-nums",
          )}
        >
          {!dot && text}
        </span>
      )}
    </span>
  );
}
