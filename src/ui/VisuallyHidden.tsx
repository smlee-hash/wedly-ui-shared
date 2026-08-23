import type { ReactNode } from "react";

/** 화면엔 안 보이고 읽기 도우미에만 읽히는 글 (2026-08-23 신설) — 접근성 도우미. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
