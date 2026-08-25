import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "./cn";

/**
 * 상태 박스 (2026-08-23 부품화 — 그동안 규격 문서로만 있던 v2를 부품으로) —
 * 워시 배경 + 색 테두리 + 원형 아이콘(의미색 채움) + **제목 진한 글자(t1)** + 본문 t2 + shadow-sm.
 * 경고만 원 안 글리프가 남색(금색 위 흰색 대비 미달 실측 2.13:1).
 *
 * ★2026-08-25 사장님 결정 — **제목을 의미색에서 진한 글자로 바꿨다.**
 *  배경 워시가 깊어지면서(깊이 v3) 워시 위 의미색 제목 대비가 4.07 → 3.63 으로 떨어졌다.
 *  기준(4.5)은 바꾸기 전에도 못 넘던 자리였고, 되살리려면 의미색을 낮춰야 하는데
 *  정보색 #006AFF 는 로고에서 뽑은 브랜드색이라 못 낮춘다 → 구조로 푼다.
 *  이제 **색은 아이콘 원과 테두리가 맡고, 글자는 읽히는 것이 일이다**(t1 = 14.5:1).
 *  판정을 색만으로 전달하지 않는다는 부품 상태 계약과도 맞는다(아이콘 모양 + 글자).
 */
const TONES = {
  success: { box: "bg-wedly-bg-green border-wedly-bd-green", circle: "bg-wedly-green", glyph: "text-white", title: "text-wedly-t1", Icon: CheckCircle2 },
  warning: { box: "bg-wedly-bg-yellow border-[var(--wedly-gold)]/40", circle: "bg-wedly-gold", glyph: "text-wedly-navy", title: "text-wedly-t1", Icon: AlertTriangle },
  error: { box: "bg-wedly-bg-red border-wedly-bd-red", circle: "bg-wedly-red", glyph: "text-white", title: "text-wedly-t1", Icon: XCircle },
  info: { box: "bg-wedly-bg-blue border-wedly-bd-blue", circle: "bg-wedly-accent", glyph: "text-white", title: "text-wedly-t1", Icon: Info },
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
