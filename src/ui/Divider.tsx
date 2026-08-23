import { cn } from "./cn";

/** 구분선 (2026-08-23 신설) — 반투명 남색 10% 1px 가는 선. */
export function Divider({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-wedly-navy/10", className)} />;
}
