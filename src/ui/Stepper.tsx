import { Check } from "lucide-react";
import { cn } from "./cn";

/**
 * 진행 단계 표시 (2026-08-23 신설) — 완료=초록 체크·현재=파랑 채움·남음=회색 (정부 KRDS·앤트식 상태).
 * current 는 1부터 센다.
 */
export function Stepper({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <ol className={cn("flex flex-wrap items-center gap-2", className)}>
      {steps.map((label, i) => {
        const no = i + 1;
        const done = no < current;
        const active = no === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className={cn("h-0.5 w-6", done || active ? "bg-wedly-accent/50" : "bg-wedly-bd")} />}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-wedly-label font-semibold",
                  done && "bg-wedly-green text-white",
                  active && "bg-wedly-accent text-white",
                  !done && !active && "bg-wedly-bg-sidebar text-wedly-muted",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : no}
              </span>
              <span className={cn("text-wedly-hint break-keep", active ? "font-semibold text-wedly-t1" : "text-wedly-muted")}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
