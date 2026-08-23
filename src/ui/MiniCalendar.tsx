"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * 작은 달력 (2026-08-23 신설) — 월 보기 + 날짜 선택. 값은 "YYYY-MM-DD".
 * 폼의 날짜 칸은 공용 DateEditor 가 표준이고, 화면에 달력을 상시 펼쳐 둘 때 이 부품을 쓴다.
 */
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function MiniCalendar({
  value,
  onChange,
  className,
}: {
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const today = new Date();
  // 잘못된 날짜 글자(예: 2026-02-30)는 오늘로 폴백 — NaN 달력 방지(적대적 리뷰)
  const parsed = value ? new Date(`${value}T00:00:00`) : today;
  const initial = Number.isNaN(parsed.getTime()) ? today : parsed;
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  useEffect(() => {
    // 값이 나중에 오거나 바뀌면 보이는 달을 따라가게 — 선택 표시 유실 방지(적대적 리뷰)
    if (!value) return;
    const next = new Date(`${value}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }, [value]);
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
  const move = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };
  return (
    <div className={cn("w-64 rounded-xl border border-wedly-bd bg-white p-3 shadow-sm", className)}>
      <div className="flex items-center justify-between px-1">
        <button type="button" aria-label="이전 달" onClick={() => move(-1)} className="rounded-md p-1 text-wedly-t2 hover:bg-wedly-bg-gray">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-wedly-sub font-semibold tabular-nums text-wedly-t1">
          {year}. {month + 1}
        </p>
        <button type="button" aria-label="다음 달" onClick={() => move(1)} className="rounded-md p-1 text-wedly-t2 hover:bg-wedly-bg-gray">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-0.5 text-wedly-label text-wedly-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: firstDay }, (_, i) => (
          <span key={`b${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const key = toKey(year, month, d);
          const selected = value === key;
          const isToday = todayKey === key;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange?.(key)}
              className={cn(
                "rounded-md py-1 text-wedly-hint tabular-nums",
                selected ? "bg-wedly-accent font-semibold text-white" : "text-wedly-t1 hover:bg-wedly-bg-gray",
                isToday && !selected && "font-semibold text-wedly-accent",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
