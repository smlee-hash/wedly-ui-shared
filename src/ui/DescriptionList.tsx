import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 라벨-값 목록 (2026-08-23 신설) — 기본은 라벨 위·값 아래 쌓기.
 * 옛 왼쪽 라벨 그리드는 layout="grid". 값이 없으면 「자료에 없음」.
 */
export function DescriptionList({
  items,
  columns = 1,
  layout = "stack",
  className,
}: {
  items: Array<{ label: string; value: ReactNode }>;
  columns?: 1 | 2;
  layout?: "stack" | "grid";
  className?: string;
}) {
  const isGrid = layout === "grid";
  return (
    <dl
      className={cn(
        isGrid
          ? cn("grid gap-x-8 gap-y-2", columns === 2 && "sm:grid-cols-2")
          : cn("flex flex-col gap-2", columns === 2 && "sm:grid sm:grid-cols-2"),
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={isGrid ? "grid min-w-0 grid-cols-[7rem_1fr] items-baseline gap-2" : "min-w-0"}
        >
          <dt className={isGrid ? "text-wedly-hint text-wedly-muted break-keep" : "text-wedly-label text-wedly-muted break-keep"}>
            {item.label}
          </dt>
          <dd className="min-w-0 text-wedly-sub text-wedly-t1 break-keep">
            {item.value == null || item.value === "" ? <span className="text-wedly-muted">자료에 없음</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
