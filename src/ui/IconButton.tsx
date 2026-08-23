"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * 아이콘 단추 (2026-08-23 신설) — 글 없는 원형 단추. 이름표(aria-label)가 필수라 props 로 강제한다.
 */
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  variant?: "ghost" | "outline";
  size?: "sm" | "md";
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "md", className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-wedly-t2 transition-colors hover:bg-wedly-bg-gray hover:text-wedly-t1 disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        variant === "outline" &&
          "border border-wedly-bd bg-white shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = "IconButton";
