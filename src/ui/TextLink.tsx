import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

/**
 * 글자 링크 표준 (2026-08-23 신설) — 기본은 브랜드색 상시 + 꺾쇠(시안 C).
 * variant="quiet" 는 평소 밑줄 없음·올리면 색만 진해짐, "accent" 는 항상 파랑(행동 유도).
 */
export function TextLink({
  href,
  children,
  variant = "arrow",
  className,
}: {
  href: string;
  children: ReactNode;
  /** @default "arrow" — 브랜드색 + 꺾쇠. quiet·accent 는 명시해서 쓴다. */
  variant?: "quiet" | "accent" | "arrow";
  className?: string;
}) {
  const base = "text-wedly-sub transition-colors";
  if (variant === "quiet") {
    return (
      <Link href={href} className={cn(base, "text-wedly-t2 hover:text-wedly-t1", className)}>
        {children}
      </Link>
    );
  }
  return (
    <Link href={href} className={cn(base, "inline-flex items-center gap-0.5 font-medium text-wedly-accent hover:underline hover:underline-offset-2", className)}>
      {children}
      {variant === "arrow" && <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
    </Link>
  );
}
