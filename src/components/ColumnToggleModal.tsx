"use client";

/**
 * 컬럼 표시 설정 모달 — 위들리 모달 (공용 부품)
 *
 * 표시 컬럼 켜기/끄기, 사용자 정의 컬럼 추가/이름 수정/삭제.
 * 닫기는 백드롭 클릭, 우측 상단 X, ESC 키(부모에서 처리).
 *
 * generic 타입 인자로 컬럼 형식 받음 — 양쪽 앱에서 자기 ColumnDef 그대로 사용 가능.
 */

import { useState } from "react";
import { CustomSelect } from "@wedly/detail-modal-shared";
import { cn } from "../lib/cn";

// 모달이 다루는 컬럼의 최소 형식 — 호출 앱의 ColumnDef 가 이 형식을 만족하면 통과
export type ColumnToggleColumn = {
  key: string;
  label: string;
  type: string;
};

type Props<TCol extends ColumnToggleColumn> = {
  open: boolean;
  onClose: () => void;
  allColumns: TCol[];
  isColumnVisible: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  getColLabel: (col: TCol) => string;
  getColAccent: (col: TCol) => { dotClass: string; headerTint: string } | null;
  // 이름 수정 (사용자 정의 컬럼)
  editingCol: string | null;
  setEditingCol: (key: string | null) => void;
  editColLabel: string;
  setEditColLabel: (label: string) => void;
  renameColumn: (key: string) => void;
  deleteColumn: (key: string) => void;
  // 새 컬럼 추가
  showAddColumn: boolean;
  setShowAddColumn: (show: boolean) => void;
  newColLabel: string;
  setNewColLabel: (label: string) => void;
  newColType: TCol["type"];
  setNewColType: (type: TCol["type"]) => void;
  addColumn: () => void;
};

export function ColumnToggleModal<TCol extends ColumnToggleColumn>({
  open,
  onClose,
  allColumns,
  isColumnVisible,
  toggleColumn,
  getColLabel,
  getColAccent,
  editingCol,
  setEditingCol,
  editColLabel,
  setEditColLabel,
  renameColumn,
  deleteColumn,
  showAddColumn,
  setShowAddColumn,
  newColLabel,
  setNewColLabel,
  newColType,
  setNewColType,
  addColumn,
}: Props<TCol>) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const q = search.trim().toLowerCase();
  const visibleCols = q
    ? allColumns.filter((c) => getColLabel(c).toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
    : allColumns;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wedly-bd animate-modal-in max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-wedly-navy">컬럼 표시 설정</h3>
          <button
            onClick={onClose}
            className="text-wedly-muted hover:text-wedly-t1 w-7 h-7 flex items-center justify-center rounded hover:bg-wedly-bg-gray"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          <div className="text-[11px] font-medium text-wedly-muted uppercase tracking-wider mb-2">표시할 컬럼 선택</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="컬럼 이름 검색"
            className="w-full mb-2 px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent hover:border-wedly-accent/50 transition-colors"
          />
          {visibleCols.length === 0 && (
            <div className="px-2 py-3 text-[12px] text-wedly-muted">검색 결과가 없습니다.</div>
          )}
          {visibleCols.map((col) => {
            const isCustom = col.key.startsWith("custom_");
            const accent = getColAccent(col);
            return (
              <div key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 group">
                <input
                  type="checkbox"
                  checked={isColumnVisible(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded border-wedly-bd text-wedly-accent focus:ring-wedly-accent/20"
                />
                {editingCol === col.key ? (
                  <input
                    value={editColLabel}
                    onChange={(e) => setEditColLabel(e.target.value)}
                    onBlur={() => renameColumn(col.key)}
                    onKeyDown={(e) => e.key === "Enter" && renameColumn(col.key)}
                    className="flex-1 text-[13px] px-1 border-b border-wedly-accent outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className={cn(
                      "flex-1 text-[13px] inline-flex items-center gap-1.5",
                      isColumnVisible(col.key) ? (accent?.headerTint || "text-wedly-t1") : "text-wedly-muted",
                    )}
                  >
                    {accent && isColumnVisible(col.key) && (
                      <span
                        className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", accent.dotClass)}
                        aria-hidden="true"
                      />
                    )}
                    {getColLabel(col)}
                  </span>
                )}
                {isCustom && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingCol(col.key);
                        setEditColLabel(col.label);
                      }}
                      className="text-wedly-muted hover:text-wedly-accent"
                      title="이름 수정"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteColumn(col.key)}
                      className="text-wedly-muted hover:text-wedly-red"
                      title="삭제"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div className="border-t border-wedly-bd/50 mt-3 pt-3">
            {showAddColumn ? (
              <div className="space-y-2 px-2">
                <input
                  value={newColLabel}
                  onChange={(e) => setNewColLabel(e.target.value)}
                  placeholder="컬럼 이름"
                  className="w-full px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent hover:border-wedly-accent/50 transition-colors"
                  autoFocus
                />
                <CustomSelect
                  value={newColType}
                  onChange={(v) => setNewColType(v as TCol["type"])}
                  options={[
                    { value: "text", label: "텍스트" },
                    { value: "number", label: "숫자" },
                    { value: "date", label: "날짜" },
                    { value: "select", label: "선택" },
                    { value: "checkbox", label: "체크박스" },
                  ]}
                />
                <div className="flex gap-2">
                  <button onClick={addColumn} className="flex-1 py-1.5 text-[12px] font-medium text-white bg-wedly-accent rounded-lg">
                    추가
                  </button>
                  <button
                    onClick={() => setShowAddColumn(false)}
                    className="flex-1 py-1.5 text-[12px] text-wedly-muted border border-wedly-bd rounded-lg"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddColumn(true)}
                className="w-full px-2 py-1.5 text-[13px] text-wedly-accent hover:bg-wedly-bg-blue rounded-lg transition-colors text-left flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                새 컬럼 추가
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
