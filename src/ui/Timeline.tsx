import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 시간순 이력 (2026-08-23 신설) — 세로 선 + 점. 이력·처리 내역 표시용(프라이머·앤트·맨틴 보유 유형).
 */
const DOT = {
  default: "bg-wedly-bd",
  accent: "bg-wedly-accent",
  green: "bg-wedly-green",
  red: "bg-wedly-red",
} as const;

export function Timeline({
  items,
  className,
}: {
  items: Array<{ title: string; time?: string; description?: ReactNode; tone?: keyof typeof DOT }>;
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-4 border-l border-wedly-bd pl-5", className)}>
      {items.map((item, i) => (
        <li key={`${item.title}-${i}`} className="relative min-w-0">
          <span className={cn("absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", DOT[item.tone ?? "default"])} aria-hidden="true" />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{item.title}</p>
            {item.time && <time className="text-wedly-label tabular-nums text-wedly-muted">{item.time}</time>}
          </div>
          {item.description && <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{item.description}</p>}
        </li>
      ))}
    </ol>
  );
}
