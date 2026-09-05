"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "./cn";
import { clampNumberInput, commitWhileTyping } from "./number-input-core";

/**
 * 숫자 입력칸 (2026-08-23 신설) — 양옆 빼기/더하기 단추(앤트·카본·맨틴 공통형).
 * min/max 를 넘지 않게 잘라서 보낸다.
 */
export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  label,
  id,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  // 입력 중엔 친 글자를 그대로 두고(음수 부호·비운 칸 허용) 떠날 때 자른다 — 적대적 리뷰
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => clampNumberInput(n, min, max);
  const btn = "inline-flex h-9 w-9 shrink-0 items-center justify-center text-wedly-t2 hover:bg-wedly-bg-gray disabled:opacity-40 disabled:hover:bg-transparent";
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <div className="inline-flex w-fit items-stretch overflow-hidden rounded-lg border border-wedly-bd bg-white focus-within:ring-2 focus-within:ring-wedly-accent">
        <button type="button" aria-label="줄이기" onClick={() => onChange(clamp(value - step))} disabled={value <= min} className={btn}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          id={inputId}
          type="number"
          value={draft ?? (Number.isFinite(value) ? value : "")}
          min={Number.isFinite(min) ? min : undefined}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          onChange={(e) => {
            const raw = e.target.value;
            setDraft(raw);
            // ★친 값이 **범위 안의 온전한 숫자**면 칸을 떠나기 전에도 바로 넘긴다.
            //  예전에는 떠날 때만 넘겨서, 20 을 지우고 25 를 친 뒤 곧장 「저장」을 누르면
            //  옛 값이 저장되고 칸에는 25 가 남았다(독립 화면 검사 2026-09-05).
            //  범위 밖·빈 값·부호만은 지금처럼 글자로만 두었다가 떠날 때 잘라 넘긴다.
            const now = commitWhileTyping(raw, min, max);
            if (now !== null) onChange(now);
          }}
          onBlur={() => {
            if (draft !== null) onChange(clamp(Number(draft === "" ? NaN : draft)));
            setDraft(null);
          }}
          className="w-20 border-x border-wedly-bd bg-white text-center text-wedly-sub tabular-nums text-wedly-t1 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" aria-label="늘리기" onClick={() => onChange(clamp(value + step))} disabled={value >= max} className={btn}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
