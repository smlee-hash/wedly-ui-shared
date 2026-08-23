import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * 경로 표시 (2026-08-23 신설) — 꺾쇠 구분, 현재 위치는 링크 아닌 진한 글자(KRDS·USWDS식).
 * 마지막 항목이 현재 위치다.
 */
export function Breadcrumb({ items, className }: { items: Array<{ label: string; href?: string }>; className?: string }) {
  return (
    <nav aria-label="현재 위치" className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-wedly-muted" aria-hidden="true" />}
            {last || !item.href ? (
              <span aria-current={last ? "page" : undefined} className={cn("text-wedly-hint break-keep", last ? "font-medium text-wedly-t1" : "text-wedly-t2")}>
                {item.label}
              </span>
            ) : (
              <Link href={item.href} className="text-wedly-hint text-wedly-t2 hover:text-wedly-t1">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
