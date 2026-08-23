"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * 체크박스 (2026-08-23 신설) — 화면마다 따로 만들던 것을 표준 하나로.
 * 브라우저 기본 사각에 브랜드 색만 입힌다(키보드·읽기 도우미 호환을 그대로 얻는다).
 */
interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={cn("inline-flex cursor-pointer items-center gap-2", props.disabled && "cursor-not-allowed opacity-50", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-wedly-bd"
        style={{ accentColor: "var(--wedly-accent)" }}
        {...props}
      />
      {label && <span className="text-wedly-sub text-wedly-t1 break-keep">{label}</span>}
    </label>
  );
}
