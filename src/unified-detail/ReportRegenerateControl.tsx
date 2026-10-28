"use client";

// 기본정보 「리포트」 칸 아래의 「리포트 최신 버전으로 재생성」 단추 (노션 NO.611).
// 상태 읽기·시작은 앱이 준 adapter.reportRegenerate 로만 한다 — 이 부품은 화면과 폴링만 맡는다.
// ERP·하이브 공용: 앱 이름은 기록 줄에 그대로 보여 주기만 하고, 호출 경로는 모른다.
//
// 동작 요약
//  - 처음 그릴 때 load(row) 로 상태를 읽는다(읽는 동안 단추 잠금).
//  - 진행 중(running)이면 단추를 잠그고 5초마다 load 를 다시 불러 끝났는지 본다(겹치는 요청은 건너뜀).
//  - 진행 중 → 끝남으로 바뀌는 순간 onSaved 를 한 번 부른다(리포트 칸 파일 목록을 다시 읽도록).

import { useCallback, useEffect, useRef, useState } from "react";
import type { UnifiedDetailAdapter } from "./adapter-types";

export type ReportRegenStatus = {
  limit: number;
  used: number;
  remaining: number;
  running: null | { id: string; phase: string; phaseLabel: string; startedAt: string; app: "erp" | "hive"; actorName: string };
  last: null | { id: string; status: "success" | "failed"; reason: string | null; finishedAt: string | null };
  /** 최근 10건, 최신 먼저 */
  logs: Array<{
    id: string;
    createdAt: string;
    finishedAt: string | null;
    app: "erp" | "hive";
    actorName: string;
    status: "running" | "success" | "failed";
    reason: string | null;
  }>;
  disabledReason: string | null;
};

type ReportRegenerateAdapter = NonNullable<UnifiedDetailAdapter["reportRegenerate"]>;

/** 진행 중일 때 상태를 다시 읽는 간격(밀리초). */
const POLL_INTERVAL_MS = 5000;

const LOAD_FAILED_MESSAGE = "남은 횟수를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const START_FAILED_MESSAGE = "다시 만들기를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 기본정보 칸이 「리포트」 칸인지 — 칸 이름 또는 키가 정확히 「리포트」일 때. (택스봇 자동 리포트 칸 등 다른 파일 칸은 아님) */
export function isReportRegenerateColumn(col: { key: string; label: string }): boolean {
  return col.label === "리포트" || col.key === "리포트";
}

const APP_LABEL: Record<"erp" | "hive", string> = { erp: "ERP", hive: "하이브" };

const SEOUL_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** 한국 시간 기준 MM/DD HH:mm. 읽을 수 없는 값은 그대로 돌려준다. */
export function formatSeoulMinute(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const parts: Record<string, string> = {};
  for (const p of SEOUL_PARTS.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function logLine(log: ReportRegenStatus["logs"][number]): string {
  const result =
    log.status === "success" ? "성공"
      : log.status === "failed" ? (log.reason ? `실패 — ${log.reason}` : "실패")
        : "진행 중";
  return [formatSeoulMinute(log.createdAt), APP_LABEL[log.app] ?? log.app, log.actorName, result]
    .filter((part) => part !== "")
    .join(" · ");
}

type Result = { kind: "success" } | { kind: "failed"; reason: string | null };

export default function ReportRegenerateControl({
  row,
  adapter,
  onSaved,
}: {
  row: Record<string, unknown>;
  adapter: ReportRegenerateAdapter;
  onSaved?: () => void;
}) {
  const rowKey = String(row["_id"] ?? "");
  const [status, setStatus] = useState<ReportRegenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 부모가 매 렌더 새 객체·함수를 줘도 효과가 다시 돌지 않도록 최신 값만 ref 로 들고 있는다.
  const rowRef = useRef(row);
  const adapterRef = useRef(adapter);
  const onSavedRef = useRef(onSaved);
  rowRef.current = row;
  adapterRef.current = adapter;
  onSavedRef.current = onSaved;

  // 세대 번호 — 업체가 바뀌거나 닫힌 뒤 늦게 도착한 응답을 버린다.
  const generationRef = useRef(0);
  // 직전에 반영한 상태가 진행 중이었는지 — 「진행 중 → 끝남」 전환을 한 번만 알아채기 위한 기준.
  const wasRunningRef = useRef(false);
  const startingRef = useRef(false);

  const applyStatus = useCallback((next: ReportRegenStatus) => {
    const wasRunning = wasRunningRef.current;
    const isRunning = next.running != null;
    wasRunningRef.current = isRunning;
    setStatus(next);
    setNowMs(Date.now());
    if (isRunning) {
      setResult(null);
      return;
    }
    if (wasRunning) {
      // 진행 중이던 재생성이 끝났다 — 결과를 알리고 리포트 칸 파일 목록을 다시 읽게 한다(한 번).
      if (next.last?.status === "failed") setResult({ kind: "failed", reason: next.last.reason });
      else if (next.last?.status === "success") setResult({ kind: "success" });
      else setResult(null);
      onSavedRef.current?.();
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const generation = ++generationRef.current;
    wasRunningRef.current = false;
    startingRef.current = false;
    setStatus(null);
    setResult(null);
    setError(null);
    setStarting(false);
    setLoading(true);
    try {
      const next = await adapterRef.current.load(rowRef.current);
      if (generationRef.current !== generation) return;
      applyStatus(next);
    } catch {
      if (generationRef.current !== generation) return;
      setError(LOAD_FAILED_MESSAGE);
    } finally {
      if (generationRef.current === generation) setLoading(false);
    }
  }, [applyStatus]);

  // 처음 그릴 때(그리고 다른 업체로 바뀔 때) 상태를 읽는다.
  useEffect(() => {
    void loadStatus();
    return () => {
      generationRef.current += 1; // 닫히거나 업체가 바뀌면 늦게 오는 응답을 버린다.
    };
  }, [rowKey, loadStatus]);

  // 진행 중이면 5초마다 다시 읽는다. 앞 요청이 끝나기 전에는 새 요청을 내지 않는다.
  const isRunning = status?.running != null;
  useEffect(() => {
    if (!isRunning) return;
    const generation = generationRef.current;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      adapterRef.current
        .load(rowRef.current)
        .then((next) => {
          if (generationRef.current === generation) applyStatus(next);
        })
        .catch(() => {
          // 한 번 못 읽어도 다음 간격에 다시 읽는다.
        })
        .finally(() => {
          inFlight = false;
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isRunning, rowKey, applyStatus]);

  const locked =
    loading || starting || status == null || status.running != null || status.remaining <= 0 || status.disabledReason != null;

  const handleStart = async () => {
    if (locked || startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current;
    setStarting(true);
    setError(null);
    setResult(null);
    try {
      const res = await adapterRef.current.start(rowRef.current);
      if (generationRef.current !== generation) return;
      if (res.ok) {
        applyStatus(res.status);
      } else {
        setError(res.message);
        if (res.status) applyStatus(res.status);
      }
    } catch {
      if (generationRef.current !== generation) return;
      setError(START_FAILED_MESSAGE);
    } finally {
      if (generationRef.current === generation) {
        startingRef.current = false;
        setStarting(false);
      }
    }
  };

  const running = status?.running ?? null;
  let runningText: string | null = null;
  if (running) {
    const startedMs = Date.parse(running.startedAt);
    const minutes = Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 60000)) : null;
    runningText = minutes == null ? running.phaseLabel : `${running.phaseLabel} — ${minutes === 0 ? "방금 시작" : `${minutes}분 지남`}`;
  }
  const limitReached = status != null && status.running == null && status.remaining <= 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={locked}
          aria-busy={loading || starting || running != null}
          className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[13px] text-wedly-accent-ink font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-wedly-accent/40 disabled:hover:bg-transparent"
        >
          리포트 최신 버전으로 재생성
        </button>
        {status ? (
          <span className="text-[12px] text-wedly-muted">오늘 남은 횟수 {status.remaining}/{status.limit}</span>
        ) : loading ? (
          <span className="text-[12px] text-wedly-muted">불러오는 중…</span>
        ) : null}
      </div>

      {runningText && (
        <span role="status" aria-live="polite" className="text-[12px] text-wedly-t2">{runningText}</span>
      )}
      {limitReached && status && (
        <span className="text-[12px] text-wedly-muted">오늘 {status.limit}회 모두 사용 · 내일 다시 가능</span>
      )}
      {status?.disabledReason && (
        <span className="text-[12px] text-wedly-muted">{status.disabledReason}</span>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3 py-2 text-[12px] text-wedly-red-ink">
          <span>{error}</span>
          {status == null && !loading && (
            <button type="button" onClick={() => void loadStatus()} className="ml-2 font-medium underline">다시 읽기</button>
          )}
        </div>
      )}
      {result?.kind === "failed" && (
        <div role="alert" className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3 py-2 text-[12px] text-wedly-red-ink">
          {result.reason ? `다시 만들지 못했습니다 — ${result.reason}` : "다시 만들지 못했습니다"}
        </div>
      )}
      {result?.kind === "success" && (
        <div role="status" className="rounded-xl border border-wedly-bd-green bg-wedly-bg-green px-3 py-2 text-[12px] text-wedly-green-ink">
          최신 리포트를 붙였습니다
        </div>
      )}

      {status && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            aria-expanded={showLogs}
            className="w-fit text-[12px] text-wedly-accent-ink font-medium hover:underline"
          >
            기록 보기
          </button>
          {showLogs && (
            status.logs.length === 0 ? (
              <span className="text-[12px] text-wedly-muted">아직 기록이 없습니다</span>
            ) : (
              <ul className="flex flex-col gap-0.5 rounded-lg border border-wedly-bd/60 bg-wedly-bg-gray/30 px-3 py-2">
                {status.logs.map((log) => (
                  <li
                    key={log.id}
                    className={`text-[12px] ${log.status === "failed" ? "text-wedly-red-ink" : "text-wedly-t2"}`}
                  >
                    {logLine(log)}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}
