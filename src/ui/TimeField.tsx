"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "./cn";

/**
 * 시간 입력칸 (2026-08-23 신설) — 브라우저 기본 시간 선택에 Input 문법을 입힌다. 값은 "HH:MM".
 * 시·분을 반쯤 친 동안 브라우저는 빈 값("")을 알리는데, 그 빈 값을 곧바로 칸에 되쓰면
 * 치던 글자가 매번 지워진다(독립 검사 실측) — 그래서 칸은 스스로 값을 들고 있게 두고,
 * 완성된 값만 밖으로 알리며, 바깥 값이 바뀌면 편집 중이 아닐 때만 칸을 맞춘다.
 */
export function TimeField({
  value,
  onChange,
  label,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el && el.value !== value) el.value = value;
  }, [value]);
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="time"
        defaultValue={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        onBlur={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-wedly-bd bg-white px-3 text-wedly-sub tabular-nums text-wedly-t1 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-wedly-accent"
      />
    </div>
  );
}
