"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "../lib/cn";

const BUBBLE_PATH =
  "M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7L5.6 21.3c-.1.3.3.6.5.4l4.6-3c.4 0 .9.1 1.3.1 5.5 0 10-3.6 10-8S17.5 3 12 3z";

const TITLE_ID = "kakao-report-title";

export function KakaoReportDialog({
  open,
  loading,
  text,
  source,
  subtitle,
  onClose,
  onCopy,
}: {
  open: boolean;
  loading: boolean;
  text: string;
  source: "ai" | "fallback" | "none";
  subtitle?: string;
  onClose: () => void;
  onCopy: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ★열릴 때마다 원문으로 되돌린다 — 닫았다 같은 기록을 다시 열면 지난번 고친 글이 남아 있으면 안 된다.
  useEffect(() => {
    if (open) {
      setDraft(text);
      setCopied(false);
    }
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || loading) return;
    textareaRef.current?.focus();
  }, [open, loading]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!open) return null;

  const hint =
    source === "fallback"
      ? {
          Icon: AlertTriangle,
          className: "text-wedly-gold-ink",
          text: "AI 가 다시 쓰지 못해 기록을 그대로 정리했어요. 대표님께 보내기 전에 말투를 다듬어 주세요.",
        }
      : source === "ai"
        ? {
            Icon: Info,
            className: "text-wedly-t2",
            text: "AI 가 대표님 말투로 다시 썼어요. 창 안에서 바로 고친 뒤 복사하세요.",
          }
        : {
            Icon: Info,
            className: "text-wedly-t2",
            text: "기록을 그대로 정리했어요. 대표님께 보내기 전에 말투를 다듬어 주세요.",
          };
  const HintIcon = hint.Icon;
  const empty = !draft.trim();

  const handleCopy = async () => {
    if (loading || empty || copied) return;
    const ok = await onCopy(draft);
    if (!ok) return;
    setCopied(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => onClose(), 900);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
    >
      <div className="absolute inset-0 bg-wedly-navy/45 transition-opacity duration-200 ease-out" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-wedly-bd bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-wedly-gold">
            <svg width="18" height="18" viewBox="0 0 24 24" className="text-wedly-navy" aria-hidden>
              <path d={BUBBLE_PATH} fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={TITLE_ID} className="text-[15px] font-semibold text-wedly-t1">
              대표님께 보낼 카톡 보고문
            </h2>
            {subtitle ? <p className="mt-0.5 text-[12px] text-wedly-t2">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[18px] leading-none text-wedly-t2 transition duration-150 ease-out hover:bg-wedly-bg-gray hover:text-wedly-t1"
          >
            ×
          </button>
        </div>

        <div className="px-5 pb-4">
          {loading ? (
            <div>
              <div className="space-y-2.5" aria-hidden>
                <div className="h-3.5 w-full rounded bg-wedly-bg-gray animate-pulse" />
                <div className="h-3.5 w-[92%] rounded bg-wedly-bg-gray animate-pulse" />
                <div className="h-3.5 w-[88%] rounded bg-wedly-bg-gray animate-pulse" />
                <div className="h-3.5 w-[96%] rounded bg-wedly-bg-gray animate-pulse" />
                <div className="h-3.5 w-[72%] rounded bg-wedly-bg-gray animate-pulse" />
              </div>
              <p className="mt-3 text-[12px] text-wedly-t2">대표님 말투로 다시 쓰는 중…</p>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="보고문"
                className="w-full min-h-[180px] resize-y rounded-xl border border-wedly-bd bg-wedly-bg-gray/40 p-3.5 text-[13.5px] leading-7 text-wedly-t1 transition duration-150 ease-out focus:border-wedly-accent focus:outline-none"
              />
              <p className={cn("mt-2 flex items-start gap-1.5 text-[12px] leading-5", hint.className)}>
                <HintIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.2} aria-hidden />
                <span className="min-w-0 break-keep">{hint.text}</span>
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-wedly-bd bg-wedly-bg-gray/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-wedly-bd bg-white px-3.5 py-2 text-[13px] text-wedly-t1 transition duration-150 ease-out hover:bg-wedly-bg-gray"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={loading || empty || copied}
            className={cn(
              "rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40",
              copied ? "bg-wedly-green-ink" : "bg-wedly-accent hover:bg-wedly-accent-ink",
            )}
          >
            {copied ? "복사됐어요" : "복사하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
