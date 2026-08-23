"use client";

import type { ReactNode } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

/**
 * 범용 토스트 — 짧은 결과 안내 한 줄 (2026-08-23 디자인 시스템 부품 신설).
 * 업계 다수파(밝은 카드형)를 기본으로, 어두운 캡슐(variant="dark")을 함께 제공.
 * 자리는 쓰는 쪽이 정한다(보통 화면 아래 가운데 고정) — 이 부품은 캡슐만 그린다.
 */
export type ToastTone = "success" | "error" | "info";

const TONE_ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE_CIRCLE = {
  success: "bg-wedly-green",
  error: "bg-wedly-red",
  info: "bg-wedly-accent",
} as const;

export function Toast({
  tone = "info",
  variant = "light",
  children,
  className,
}: {
  tone?: ToastTone;
  variant?: "light" | "dark";
  children: ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];
  if (variant === "dark") {
    return (
      <div role="status" className={cn("inline-flex items-center gap-2 rounded-xl bg-wedly-navy px-4 py-2 shadow-lg", className)}>
        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
        <span className="text-wedly-sub text-white break-keep">{children}</span>
      </div>
    );
  }
  return (
    <div
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-wedly-bd bg-white px-4 py-2 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]",
        className,
      )}
    >
      <span className={cn("inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white", TONE_CIRCLE[tone])}>
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="text-wedly-sub text-wedly-t1 break-keep">{children}</span>
    </div>
  );
}
