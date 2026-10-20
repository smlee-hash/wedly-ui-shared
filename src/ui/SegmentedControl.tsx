"use client";

import { cn } from "./cn";

/**
 * 구간 단추 (2026-08-23 신설) — 알약 트랙 안에서 선택된 구간만 흰 알약(앤트·업계 필 트랙형).
 * 값 전환용이다(내용 갈래 전환은 Tabs).
 */
export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex w-fit rounded-full bg-wedly-bg-sidebar p-0.5", className)}>
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt.value)}
            // 키보드 초점은 WEDLY 링으로 보인다. 링은 box-shadow 라 transition 목록에서 빼야
            // 초점이 빠질 때 서서히 사라지며 남지 않는다. 초점 동안 위로 올려 옆 흰 알약이 링을 덮지 않게 한다.
            className={cn(
              "rounded-full px-4 py-1 text-wedly-sub transition-[color,background-color,border-color,outline-color,opacity,filter]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 focus-visible:transition-none focus-visible:relative focus-visible:z-10",
              on ? "bg-white font-semibold text-wedly-t1 shadow-sm" : "text-wedly-t2 hover:text-wedly-t1",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
