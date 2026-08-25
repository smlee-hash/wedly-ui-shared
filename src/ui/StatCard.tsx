import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "./cn";

/**
 * 핵심 숫자 카드 (2026-08-23 부품화) — 평면 카드 + 좌측 색 아이콘 타일.
 * icon 이 없으면 타일을 생략한다.
 */
export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  delta?: { text: string; direction: "up" | "down" };
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-wedly-bd bg-white p-3 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wedly-bg-blue text-wedly-accent-ink">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0">
          <p className="text-wedly-label text-wedly-muted break-keep">{label}</p>
          <p className="text-wedly-value font-bold tabular-nums text-wedly-t1">{value}</p>
          {delta && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-wedly-hint font-medium tabular-nums",
                delta.direction === "up" ? "text-wedly-green" : "text-wedly-red",
              )}
            >
              {delta.direction === "up" ? (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              )}
              {delta.text}
            </p>
          )}
        </span>
      </div>
    </div>
  );
}
