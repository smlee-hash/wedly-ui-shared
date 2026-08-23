"use client";

import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * 말풍선 도움말 (2026-08-23 신설) — 반투명 남색·라운드 8·여백 8×12 (모모샵·와디즈·머티리얼 기본형 계열).
 * 올리거나 키보드 초점이 오면 아래에 뜬다.
 * ★사용 제한: 포털이 없어 표·overflow 스크롤 상자 안에서는 잘린다 — 그 안에서는 쓰지 말고
 * 보이는 안내(FilterChipNote 등)를 쓴다(적대적 리뷰 2026-08-23 명문화).
 */
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  // 트리거(자식)에 설명 연결 — 읽기 도우미가 「이 단추의 설명」으로 읽게 한다.
  const trigger = isValidElement(children)
    ? cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })
    : children;
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {trigger}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-wedly-navy/90 px-3 py-1.5 text-wedly-hint text-white opacity-0 transition-opacity group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
