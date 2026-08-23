import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 빈 상태 (2026-08-23 신설) — 업계 압도 다수파(129곳): 일러스트 없이 원인 한 줄 + 다음 행동 1개.
 * 우리 완결성 규칙(다음 행동을 함께 적는다)과 일치.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-wedly-bg-gray/60 p-6 text-center", className)}>
      <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</p>
      {description && <p className="mt-1 text-wedly-hint text-wedly-muted break-keep">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
