"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

/**
 * 아코디언 (2026-08-23 신설) — 항목마다 카드형. 여러 개를 동시에 열 수 있다.
 */
export function Accordion({
  items,
  className,
}: {
  items: Array<{ title: string; content: ReactNode }>;
  className?: string;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {items.map((item, i) => {
        const isOpen = open.has(i);
        return (
          // 열림 상태가 자리 번호 기준이라 key 도 같은 축으로 — 제목 중복·항목 추가 시 어긋남 방지(적대적 리뷰)
          <div key={i} className="flex flex-col gap-2">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(i)}
              className="flex w-full items-center justify-between gap-2 text-left rounded-lg border border-wedly-bd bg-white px-4 py-2 text-wedly-sub font-semibold text-wedly-t1"
            >
              <span className="min-w-0 break-keep">{item.title}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-wedly-muted transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            </button>
            {isOpen && (
              <div className="rounded-lg border border-wedly-bd bg-wedly-bg-gray px-4 py-2 text-wedly-hint text-wedly-t2 break-keep">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
