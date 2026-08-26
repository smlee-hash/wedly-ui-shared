import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

/**
 * 상태 박스 v3 「아이콘 타일형」 (2026-08-25 사장님 확정 — 재공모 시안 E) —
 * 흰 카드(테두리 + 층 그림자) + 의미색 아이콘 타일(h-9 w-9 rounded-lg) + 제목 t1 + 본문 t2.
 * v2(워시 배경 + 색 테두리 + 원형 아이콘)는 「입체적이지 못하다」 지적으로 폐기.
 * 색은 아이콘 타일이 전담하고 판정은 아이콘 모양 + 글자로 전달한다(색만으로 전달 금지 계약 유지).
 * 경고만 타일 안 심볼이 남색 — 금색 위 흰 글리프는 대비 2.13:1 미달 실측(v2에서 승계).
 * 값의 정본: 전역 디자인 시스템 정본 스킬(wedly design system) §상태 박스 v3.
 */
const TONES = {
  success: { tile: "bg-wedly-green", glyph: "text-white", Icon: CheckCircle2 },
  warning: { tile: "bg-wedly-gold", glyph: "text-wedly-navy", Icon: AlertTriangle },
  error: { tile: "bg-wedly-red", glyph: "text-white", Icon: XCircle },
  info: { tile: "bg-wedly-accent", glyph: "text-white", Icon: Info },
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
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border border-wedly-bd bg-white p-4 shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]",
        className
      )}
    >
      <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm", t.tile)}>
        <t.Icon className={cn("h-5 w-5", t.glyph)} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-wedly-sub font-semibold text-wedly-t1 break-keep">{title}</p>
        {children && <p className="mt-0.5 text-wedly-hint text-wedly-t2 break-keep">{children}</p>}
      </div>
    </div>
  );
}
