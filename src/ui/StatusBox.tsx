import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

/**
 * 상태 박스 (2026-08-23 부품화 — 그동안 규격 문서로만 있던 v2를 부품으로) —
 * 워시 배경 + 색 테두리 + 원형 아이콘(의미색 채움) + 제목 의미색 + 본문 t2 + shadow-sm.
 * 경고만 원 안 글리프가 남색(금색 위 흰색 대비 미달 실측 2.13:1).
 */
const TONES = {
  success: { box: "bg-wedly-bg-green border-wedly-bd-green", circle: "bg-wedly-green", glyph: "text-white", title: "text-wedly-green", Icon: CheckCircle2 },
  warning: { box: "bg-wedly-bg-yellow border-[var(--wedly-gold)]/40", circle: "bg-wedly-gold", glyph: "text-wedly-navy", title: "text-wedly-gold", Icon: AlertTriangle },
  error: { box: "bg-wedly-bg-red border-wedly-bd-red", circle: "bg-wedly-red", glyph: "text-white", title: "text-wedly-red", Icon: XCircle },
  info: { box: "bg-wedly-bg-blue border-wedly-bd-blue", circle: "bg-wedly-accent", glyph: "text-white", title: "text-wedly-navy", Icon: Info },
} as const;

export function StatusBox({
  tone,
  title,
  children,
  className,
}: {
  tone: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border p-4 shadow-sm", t.box, className)}>
      <span className={cn("mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full", t.circle)}>
        <t.Icon className={cn("h-3.5 w-3.5", t.glyph)} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={cn("text-wedly-sub font-semibold break-keep", t.title)}>{title}</p>
        {children && <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{children}</p>}
      </div>
    </div>
  );
}
