import type { ReactNode } from "react";
import { cn } from "./cn";

/** 키보드 키 표시 (2026-08-23 신설) — 단축키 안내용 작은 키 모양. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-md border border-wedly-bd bg-wedly-bg-gray px-1.5 py-0.5 font-sans text-wedly-label font-medium text-wedly-t2 shadow-[inset_0_-1px_0_rgba(10,34,68,0.12)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
