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

// 칸 추가/수정 시 고를 수 있는 타입 — 드롭다운은 단일 선택/다중 선택으로 구분.
export const DEFAULT_COLUMN_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "text", label: "글자" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "select", label: "단일 선택" },
  { value: "multi_select", label: "다중 선택" },
  { value: "checkbox", label: "체크박스" },
];

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
  // (선택) 모든 칸 제목·타입 수정. 제공하면 해당 칸에 연필이 뜨고, 편집창에서 제목+타입을 바꾼다.
  // renameColumn 이 저장 콜백 역할 — 소비 앱은 editColLabel(제목)과 editColType(타입)을 함께 저장한다.
  editColType?: string;
  setEditColType?: (type: string) => void;
  canEditColumn?: (col: TCol) => boolean; // 연필 표시 여부 (기본: custom_ 칸만)
  canChangeType?: (col: TCol) => boolean; // 편집창에 타입 선택칸 표시 (기본: 안 보임)
  typeOptions?: { value: string; label: string }[]; // 추가/편집 타입 선택지 (기본: DEFAULT_COLUMN_TYPE_OPTIONS)
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
  editColType,
  setEditColType,
  canEditColumn,
  canChangeType,
  typeOptions,
}: Props<TCol>) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const q = search.trim().toLowerCase();
  const visibleCols = q
    ? allColumns.filter((c) => getColLabel(c).toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
    : allColumns;
  const TYPE_OPTS = typeOptions ?? DEFAULT_COLUMN_TYPE_OPTIONS;
  const canEdit = (col: TCol) => (canEditColumn ? canEditColumn(col) : col.key.startsWith("custom_"));
  const canType = (col: TCol) => (canChangeType ? canChangeType(col) : false);
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wedly-bd animate-modal-in max-h-[80vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-wedly-navy">컬럼 설정</h3>
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
            const editable = canEdit(col);
            if (editingCol === col.key) {
              return (
                <div key={col.key} className="px-2 py-2 my-1 rounded-lg bg-slate-50 space-y-2">
                  <input
                    value={editColLabel}
                    onChange={(e) => setEditColLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && renameColumn(col.key)}
                    placeholder="컬럼 이름"
                    className="w-full px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent transition-colors"
                    autoFocus
                  />
                  {canType(col) && setEditColType && (
                    <CustomSelect
                      value={(editColType ?? col.type) as string}
                      onChange={(v) => setEditColType(v)}
                      options={TYPE_OPTS}
                    />
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => renameColumn(col.key)} className="flex-1 py-1.5 text-[12px] font-medium text-white bg-wedly-accent rounded-lg">
                      저장
                    </button>
                    <button onClick={() => setEditingCol(null)} className="flex-1 py-1.5 text-[12px] text-wedly-muted border border-wedly-bd rounded-lg">
                      취소
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 group">
                <input
                  type="checkbox"
                  checked={isColumnVisible(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded border-wedly-bd text-wedly-accent focus:ring-wedly-accent/20"
                />
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
                {(editable || isCustom) && (
                  <div className="hidden group-hover:flex items-center gap-1">
                    {editable && (
                      <button
                        onClick={() => {
                          setEditingCol(col.key);
                          setEditColLabel(col.label);
                          setEditColType?.(col.type);
                        }}
                        className="text-wedly-muted hover:text-wedly-accent"
                        title="제목·타입 수정"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                      </button>
                    )}
                    {isCustom && (
                      <button
                        onClick={() => deleteColumn(col.key)}
                        className="text-wedly-muted hover:text-wedly-red"
                        title="삭제"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
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
                  options={TYPE_OPTS}
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
