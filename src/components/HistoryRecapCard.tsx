// 공용 히스토리 — AI 가 정리한 「정리본 카드」.
// 원본은 지우지 않는다. 접어 두었다가 눌러서 펼친다(사장님 결정 2026-08-28: 정리본 기본 + 원본 펼침).
//
// 디자인 계약(전역 [UI-CRAFT]):
//  ① 굵기 600 인 줄은 headline 하나뿐 — 눈이 먼저 갈 자리를 하나만 둔다
//  ② 종류마다 뜻이 있는 아이콘 타일(상태 박스 v3 문법의 축소판)
//  ③ 사실은 라벨-값 격자로 회색 층 위에 — 세로로 쌓기만 하면 위계가 없다
//  ④ 원본 토글 앞에 구분선
"use client";

import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  FileCheck2,
  FileText,
  Phone,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { safeRecapKind, safeRecapLines, type CommentRecap, type RecapKind } from "../unified/history-core";

type KindStyle = { label: string; tile: string; symbol: string; icon: LucideIcon };

const KIND: Record<RecapKind, KindStyle> = {
  call:     { label: "통화",      tile: "bg-wedly-accent", symbol: "text-white",       icon: Phone },
  contract: { label: "계약 진행", tile: "bg-wedly-green",  symbol: "text-white",       icon: FileCheck2 },
  document: { label: "서류",      tile: "bg-wedly-purple", symbol: "text-white",       icon: FileText },
  schedule: { label: "일정",      tile: "bg-wedly-navy",   symbol: "text-white",       icon: CalendarClock },
  // ★경고 타일만 남색 심볼 — 금색 위 흰 글리프는 대비 2.1 로 미달이다(디자인 시스템 상태박스 v3).
  issue:    { label: "확인 필요", tile: "bg-wedly-gold",   symbol: "text-wedly-navy",  icon: AlertTriangle },
  note:     { label: "기록",      tile: "bg-wedly-navy",   symbol: "text-white",       icon: StickyNote },
};

export function HistoryRecapCard({
  recap,
  children,
}: {
  recap: CommentRecap;
  /** 원본 본문 — 펼쳤을 때 그대로 보여 준다(이미지 줄 포함). */
  children: ReactNode;
}) {
  const [openOriginal, setOpenOriginal] = useState(false);
  const k = KIND[safeRecapKind(recap.kind)];
  const Icon = k.icon;
  const { facts, nextSteps } = safeRecapLines(recap);

  return (
    <div className="ml-7 overflow-hidden rounded-xl border border-wedly-bd bg-white shadow-[0_1px_2px_rgba(10,34,68,0.05),0_6px_18px_rgba(10,34,68,0.08)]">
      <div className="flex items-start gap-2.5 px-3 pb-2 pt-3">
        <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg", k.tile)}>
          <Icon className={cn("h-5 w-5", k.symbol)} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium leading-tight text-wedly-muted">{k.label}</p>
          {/* ★이 카드에서 굵기 600 은 이 줄 하나뿐이다. 다른 줄에 같은 굵기를 더하지 말 것. */}
          <p className="break-keep text-[13px] font-semibold leading-snug text-wedly-t1">{recap.headline}</p>
        </div>
      </div>

      {facts.length > 0 && (
        <dl className="mx-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-wedly-bg-gray px-3 py-2">
          {facts.map((f, i) => (
            <div key={i} className="contents">
              <dt className="whitespace-nowrap pt-px text-[11px] text-wedly-muted">{f.label}</dt>
              <dd className="min-w-0 break-keep text-[12px] text-wedly-t1">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {nextSteps.length > 0 && (
        <ul className="mx-3 mt-2 space-y-1">
          {nextSteps.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[12px] text-wedly-t1">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-wedly-accent-ink" strokeWidth={2.2} aria-hidden />
              <span className="min-w-0 break-keep">{s}</span>
            </li>
          ))}
        </ul>
      )}

      {/* 원본 서랍 — WEDLY 집안 접기/펼치기 문법 그대로다(RoleRatesAdvancedConfig·TemplateHub 실측):
          둥근 하위 카드 + 오른쪽 아래화살표(열리면 180° 회전) + 구분선으로 본문 분리.
          ★세로줄 인용 블록으로 그리지 마라 — 디자인 시스템에 없는 모양이다(2026-08-28 사장님 반려).
          ★머리줄만 회색 층이고 원문 본문은 흰 바탕이다(이중 베젤 — 회색 셸 + 흰 속지).
          회색 위 회색으로 두면 원문 글자가 묻힌다(2026-08-28 사장님 반려 2차). */}
      <div className="mx-3 mb-3 mt-2 overflow-hidden rounded-xl border border-wedly-bd/60 bg-wedly-bg-gray">
        <button
          type="button"
          onClick={() => setOpenOriginal((v) => !v)}
          aria-expanded={openOriginal}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-wedly-bd/25"
        >
          <span className="min-w-0 break-keep text-[12px] font-medium text-wedly-t2">
            원본 메모
            <span className="ml-1.5 text-[11px] font-normal text-wedly-muted">직원이 적은 그대로</span>
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 text-wedly-muted transition-transform", openOriginal && "rotate-180")}
            strokeWidth={2.2}
            aria-hidden
          />
        </button>
        {openOriginal && (
          <div className="whitespace-pre-wrap break-keep border-t border-wedly-bd/60 bg-white px-3 py-2.5 text-[12px] leading-relaxed text-wedly-t2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
