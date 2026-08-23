import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * 단추 묶음 (2026-08-23 신설) — 기본은 간격 나열. attached 면 붙임형(모서리만 둥글게).
 * 안에 Button(secondary 권장)을 나란히 넣는다.
 */
export function ButtonGroup({
  children,
  className,
  attached,
}: {
  children: ReactNode;
  className?: string;
  attached?: boolean;
}) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex w-fit",
        attached
          ? "[&>button]:rounded-none [&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button+button]:-ml-px"
          : "gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
