"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "./cn";

/**
 * 복사 단추 (2026-08-23 신설) — 계좌번호·주소 등 한 번에 복사. 누르면 2초간 체크로 바뀐다.
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flash = (next: "ok" | "fail") => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button
      type="button"
      aria-label={state === "ok" ? "복사됨" : state === "fail" ? "복사 실패" : "복사"}
      onClick={() => {
        // 접혀 들어간 화면(iframe)·http 에서는 복사 권한이 없을 수 있다 — 조용한 실패 금지(적대적 리뷰)
        if (!navigator.clipboard?.writeText) {
          flash("fail");
          return;
        }
        navigator.clipboard.writeText(text).then(
          () => flash("ok"),
          () => flash("fail"),
        );
      }}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1",
        state === "ok" && "text-wedly-green hover:text-wedly-green",
        state === "fail" && "text-wedly-red hover:text-wedly-red",
        className,
      )}
    >
      {state === "ok" ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : state === "fail" ? (
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
