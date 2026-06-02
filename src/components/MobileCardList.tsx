"use client";

/**
 * 모바일 카드 리스트 — md:hidden 영역
 * (SubsidyClient.tsx 모듈화 B 1단계, 2026-05-25)
 *
 * 모바일에서 행 데이터를 카드 형식으로 표시. 카드 표시 항목 설정 4개까지 노출.
 * 빈 상태, 검색 결과 없음, 오류 상태 처리 포함.
 */

import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { ColumnDef } from "../types/columns";
import { formatDate } from "../lib/utils";

// SubsidyClient.tsx 내부 타입과 동일하게 유지
type RowData = Record<string, string | number | boolean | null>;

type Props = {
  // 표시 모드 — 표 모드일 때 카드 숨김
  mobileViewMode: "card" | "table";
  // 데이터
  pagedData: RowData[];
  sortedDataLength: number; // 빈 상태 체크
  // 표시할 컬럼 키 (사용자 선택, 최대 4개)
  mobileCardFields: string[];
  allColumns: ColumnDef[];
  // 행 클릭 (상세 모달 또는 히스토리)
  openRow: (row: RowData, panel?: "history") => void;
  // 조건부 서식 — 행마다 클래스 반환
  getConditionalFormatClass: (row: RowData) => string | null;
  // 컬럼 라벨
  getColLabel: (col: ColumnDef) => string;
  // 도메인 — 상태 컬럼 키 + 상태값 색상 클래스 함수 (앱이 직접 전달)
  statusKey: string;
  getStatusClass: (status: string) => string;
  // 도메인 — 카드 머리/꼬리 칸에 표시할 컬럼 키 (회사명·대표자명·연락처 등 어떤 키가 들어갈지)
  titleKey: string;
  subtitleLeftKey: string;
  subtitleRightKey: string;
  // 빈/오류 상태 메시지
  error: string | null;
  searchQuery: string;
  // (선택) 셀 값 렌더러 — 앱이 표 셀과 동일한 형식·색으로 그려 넘기면 카드도 100% 같게 표시.
  // 없으면 기존 텍스트 방식으로 표시(렌더러를 안 넘기는 다른 앱 호환).
  renderFieldValue?: (col: ColumnDef, value: string | number | boolean | null, row: RowData) => ReactNode;
};

export function MobileCardList({
  mobileViewMode,
  pagedData,
  sortedDataLength,
  mobileCardFields,
  allColumns,
  openRow,
  getConditionalFormatClass,
  getColLabel,
  statusKey,
  getStatusClass,
  titleKey,
  subtitleLeftKey,
  subtitleRightKey,
  error,
  searchQuery,
  renderFieldValue,
}: Props) {
  return (
    <div className={cn("md:hidden space-y-2", mobileViewMode === "table" && "hidden")}>
      {/* 모바일 '카드 표시 항목 설정' 버튼은 관리 도구 드롭다운에서 호출 (2026-05-25) */}
      {sortedDataLength === 0 ? (
        <div className="py-12 text-center text-sm text-wedly-muted">
          {error || (searchQuery ? "검색 결과가 없습니다" : "데이터가 없습니다")}
        </div>
      ) : (
        pagedData.map((row, idx) => {
          const status = typeof row[statusKey] === "string" ? (row[statusKey] as string) : "";
          const statusColor = getStatusClass(status);
          const cfClass = getConditionalFormatClass(row);
          return (
            <div
              key={String(row._id || idx)}
              className={cn(
                "rounded-xl border border-wedly-bd p-3.5 shadow-sm cursor-pointer active:bg-slate-50 transition-colors",
                cfClass ? cfClass : "bg-white",
              )}
              onClick={() => openRow(row)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="font-semibold text-sm text-wedly-t1 truncate">
                    {String(row[titleKey] || "-")}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openRow(row, "history");
                    }}
                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-wedly-muted text-[11px] flex-shrink-0"
                    title="히스토리"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M2 3h12v8a1 1 0 01-1 1H5l-3 3V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    {typeof row._commentCount === "number" && row._commentCount > 0 && (
                      <span className="tabular-nums font-medium">{row._commentCount}</span>
                    )}
                  </button>
                </div>
                {status && (
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ml-2", statusColor)}>
                    {status}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-wedly-muted">
                <span>{typeof row[subtitleLeftKey] === "string" ? (row[subtitleLeftKey] as string) : "-"}</span>
                <span className="text-wedly-t2">
                  {typeof row[subtitleRightKey] === "string" ? (row[subtitleRightKey] as string) : "-"}
                </span>
              </div>
              {mobileCardFields.length > 0 && (() => {
                const visible = mobileCardFields
                  .map((k) => {
                    const col = allColumns.find((c) => c.key === k);
                    // 비어 있고 라벨이 팀장/팀원이면 같은 패턴의 다른 키에서 fallback (표 셀·상세 모달 같은 좁은 규칙)
                    let v: unknown = row[k];
                    if ((v == null || v === "") && col) {
                      const norm = (col.label || "").replace(/\s/g, "").toLowerCase();
                      const isLeader = norm === "팀장" || norm === "담당팀장" || norm === "담당사무장";
                      const isMember = norm === "팀원" || norm === "담당팀원";
                      if (isLeader || isMember) {
                        for (const rowKey of Object.keys(row)) {
                          if (rowKey === k || rowKey.startsWith("_")) continue;
                          const otherVal = row[rowKey];
                          if (otherVal == null || otherVal === "") continue;
                          if (isLeader && (rowKey.startsWith("team_leader_") || rowKey === "team_leader")) {
                            v = otherVal;
                            break;
                          }
                          if (isMember && (rowKey.startsWith("team_member_") || rowKey === "team_member")) {
                            v = otherVal;
                            break;
                          }
                        }
                      }
                    }
                    if (v == null || v === "") return null;
                    if (typeof v === "object" && !Array.isArray(v)) return null;
                    // 라벨
                    let label: string;
                    if (col) {
                      label = getColLabel(col);
                    } else if (k.startsWith("team_member_") || k === "team_member") {
                      label = "팀원";
                    } else if (k.startsWith("team_leader_") || k === "team_leader") {
                      label = "팀장";
                    } else {
                      label = k;
                    }
                    // 표시 문자열(렌더러 미제공 앱용 기존 동작) + 렌더러용 원본값
                    let display: string;
                    let rawValue: string | number | boolean | null;
                    if (Array.isArray(v)) {
                      const items = v.map((x) => (x == null ? "" : String(x))).filter(Boolean);
                      if (items.length === 0) return null;
                      display = items.join(", ");
                      rawValue = display;
                    } else if (col?.type === "number" && !isNaN(Number(v))) {
                      display = Number(v).toLocaleString() + (col.format === "currency" ? "원" : "");
                      rawValue = v as string | number | boolean;
                    } else if ((col?.type === "date" || col?.type === "last_edited_time") && typeof v === "string") {
                      display = formatDate(v);
                      rawValue = v;
                    } else {
                      display = String(v);
                      rawValue = v as string | number | boolean;
                    }
                    // 렌더러용 컬럼 — 매칭 컬럼이 없으면(팀장/팀원 fallback 키) 라벨로 사람 컬럼 합성
                    const effectiveCol: ColumnDef = col ?? ({ key: k, label, type: "person" } as ColumnDef);
                    return { key: k, label, display, col: effectiveCol, rawValue };
                  })
                  .filter(
                    (x): x is { key: string; label: string; display: string; col: ColumnDef; rawValue: string | number | boolean } => !!x,
                  );
                if (visible.length === 0) return null;

                // 새 방식: 앱이 셀 렌더러를 넘기면 표 셀과 100% 같은 형식·색으로, 줄마다 한 항목(세로 목록)으로 표시.
                // 팀원이 1명이든 여러 명이든 줄 구조가 같아 카드가 항상 균일.
                if (renderFieldValue) {
                  return (
                    <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-100">
                      {visible.map((v) => (
                        <div key={v.key} className="flex items-start gap-2 text-xs">
                          <span className="text-wedly-muted/70 flex-shrink-0">{v.label}</span>
                          <span className="min-w-0 flex-1 text-wedly-t2">
                            {renderFieldValue(v.col, v.rawValue, row)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }

                // 기존 방식(렌더러 미제공 앱 — 일루아·ERP 등): 가로 흐름 그대로 유지
                return (
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-wedly-muted mt-1.5 pt-1.5 border-t border-slate-100">
                    {visible.map((v) => {
                      const norm = (v.label || "").replace(/\s/g, "").toLowerCase();
                      const isLeader = norm === "팀장" || norm === "담당팀장" || norm === "담당사무장";
                      const isMember = norm === "팀원" || norm === "담당팀원";
                      if (isLeader || isMember) {
                        const chipBg = isLeader ? "bg-wedly-bg-blue" : "bg-wedly-bg-green";
                        const chipText = isLeader ? "text-wedly-accent" : "text-wedly-green";
                        const dotColor = isLeader ? "bg-wedly-accent" : "bg-wedly-green";
                        const names = String(v.display).split(",").map((s) => s.trim()).filter(Boolean);
                        return (
                          <span key={v.key} className="inline-flex items-center gap-1 flex-wrap">
                            <span className="text-wedly-muted/70">{v.label}</span>
                            {names.map((n) => (
                              <span
                                key={n}
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
                                  chipBg,
                                  chipText,
                                )}
                              >
                                <span className={cn("inline-block w-1.5 h-1.5 rounded-full", dotColor)} aria-hidden="true" />
                                {n}
                              </span>
                            ))}
                          </span>
                        );
                      }
                      return (
                        <span key={v.key}>
                          <span className="text-wedly-muted/70">{v.label}</span>{" "}
                          <span className="text-wedly-t2">{v.display}</span>
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })
      )}
    </div>
  );
}
