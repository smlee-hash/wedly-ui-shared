"use client";

/**
 * PC 데스크톱 표 — 헤더(체크박스 + 컬럼 드래그·정렬·이름수정·삭제·리사이즈) + 가상화 본문
 * (SubsidyClient.tsx 모듈화 B 2단계, 2026-05-25)
 *
 * 모바일에서도 "표 모드" 선택 시 노출. 행 그리기는 render-prop 으로 부모가 처리.
 */

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject, MutableRefObject, ReactNode } from "react";
import { cn } from "../lib/cn";
import type { ColumnDef } from "../types/columns";

type RowData = Record<string, string | number | boolean | null>;

type SortConfig = { key: string; direction: "asc" | "desc" } | null;

type Props = {
  mobileViewMode: "card" | "table";
  pagedData: RowData[];
  sortedDataLength: number;
  activeColumns: ColumnDef[];
  colWidths: Record<string, number>;
  stickyOffsets: Record<string, number>;

  // 헤더 체크박스
  checkedIds: Set<string>;
  toggleAllChecks: () => void;

  // 정렬
  sortConfig: SortConfig;
  handleSort: (key: string) => void;

  // 컬럼 헤더 메뉴 (이름 수정 / 정렬 / 숨기기)
  colMenuKey: string | null;
  setColMenuKey: (key: string | null) => void;
  colMenuRef: RefObject<HTMLDivElement | null>;
  renamingColKey: string | null;
  setRenamingColKey: (key: string | null) => void;
  renameValue: string;
  setRenameValue: (v: string) => void;
  saveColLabel: (key: string, label: string) => void;
  removeColFromTab: (key: string) => void;

  // 컬럼 드래그
  dragColKey: string | null;
  setDragColKey: (key: string | null) => void;
  dragOverColKey: string | null;
  setDragOverColKey: (key: string | null) => void;
  resizingRef: MutableRefObject<unknown>;
  reorderColumn: (from: string, to: string) => void;
  // false 면 표 머리글 끌어서 순서 바꾸기를 잠근다(끌기 자체 비활성 + grab 커서 제거).
  // 미지정(기본 true)이면 기존과 100% 동일. NO.95 저장 방식에서 "순서는 컬럼 설정 창에서만" 적용용.
  canReorderColumns?: boolean;
  // false 면 머리글 메뉴에서 "이름 수정"·"컬럼 숨기기"를 감춘다(정렬은 그대로 — 본인 화면 정렬은 누구나).
  // 미지정(기본 true)이면 기존과 100% 동일. NO.128 "칸 구성은 관리자만" 용.
  canEditColumns?: boolean;

  // 컬럼 리사이즈 (포인터 이벤트 — 마우스·터치·펜 통합, NO.76)
  onResizeStart: (e: React.PointerEvent, colKey: string) => void;
  onResizeDoubleClick: (colKey: string) => void;

  // 라벨·강조
  getColLabel: (col: ColumnDef) => string;
  getColAccent: (col: ColumnDef) => { dotClass: string; headerTint: string } | null;

  // 빈 상태
  error: string | null;
  searchQuery: string;
  refreshData: () => void;

  // 행 그리기 — render-prop (TableRow 부품을 부모에서 전달)
  renderRow: (row: RowData, virtualIndex: number) => ReactNode;
};

export function DesktopTable({
  mobileViewMode,
  pagedData,
  sortedDataLength,
  activeColumns,
  colWidths,
  stickyOffsets,
  checkedIds,
  toggleAllChecks,
  sortConfig,
  handleSort,
  colMenuKey,
  setColMenuKey,
  colMenuRef,
  renamingColKey,
  setRenamingColKey,
  renameValue,
  setRenameValue,
  saveColLabel,
  removeColFromTab,
  dragColKey,
  setDragColKey,
  dragOverColKey,
  setDragOverColKey,
  resizingRef,
  reorderColumn,
  canReorderColumns = true,
  canEditColumns = true,
  onResizeStart,
  onResizeDoubleClick,
  getColLabel,
  getColAccent,
  error,
  searchQuery,
  refreshData,
  renderRow,
}: Props) {
  // 가상화 — 부품 안에서 자체 관리. 스크롤 요소도 부품 안 ref.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: pagedData.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 37,
    overscan: 15,
  });

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-wedly-bd shadow-sm overflow-hidden",
        // 카드 모드면 표 박스 자체를 숨김(PC 포함). 표 모드면 표시 — 안쪽 스크롤 영역이 폭별 표시를 관장.
        mobileViewMode === "card" && "hidden",
      )}
    >
      <div
        ref={tableScrollRef}
        className={cn(
          "touch-manipulation overflow-x-scroll overflow-y-auto [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-wedly-bg-gray [&::-webkit-scrollbar-thumb]:bg-wedly-bd-blue [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-wedly-accent",
          "[&_.sticky]:max-md:!static [&_.sticky]:max-md:!left-auto",
          mobileViewMode === "table" ? "block" : "hidden md:block",
        )}
        style={{ maxHeight: "calc(100vh - 320px)", scrollbarWidth: "thin", scrollbarColor: "#74B0FF #F8F9FA" }}
      >
        <table className="text-sm" style={{ tableLayout: "fixed", width: 40 + activeColumns.reduce((sum, c) => sum + (colWidths[c.key] || 100), 0), minWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 40 }} />
            {activeColumns.map((col) => (
              <col key={col.key} style={{ width: colWidths[col.key] || 100 }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr className="bg-wedly-bg-gray">
              {/* Checkbox header */}
              <th className="py-2.5 px-3 w-10 text-center sticky left-0 z-30 bg-wedly-bg-gray">
                <input
                  type="checkbox"
                  checked={
                    // 차수별로 펼친 줄은 같은 회사(_id)가 여러 줄이므로 "줄 수"가 아니라 "회사 수"로 견준다.
                    // (줄 수로 견주면 전체선택을 눌러도 머리글만 계속 꺼져 보이고, 다시 누르면 선택이 통째로 풀린다.)
                    checkedIds.size > 0 &&
                    checkedIds.size === new Set(pagedData.map((r) => String(r._id ?? ""))).size &&
                    pagedData.every((r) => checkedIds.has(String(r._id)))
                  }
                  onChange={toggleAllChecks}
                  className="rounded border-wedly-bd text-wedly-accent focus:ring-wedly-accent/20"
                />
              </th>
              {/* Column headers */}
              {activeColumns.map((col) => {
                const isSticky = col.sticky;
                const isSorted = sortConfig?.key === col.key;
                const isMenuOpen = colMenuKey === col.key;
                const isRenaming = renamingColKey === col.key;
                return (
                  <th
                    key={col.key}
                    draggable={canReorderColumns && !isRenaming}
                    onDragStart={(e) => {
                      if (resizingRef.current) {
                        e.preventDefault();
                        return;
                      }
                      setDragColKey(col.key);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverColKey(col.key);
                    }}
                    onDragLeave={() => {
                      if (dragOverColKey === col.key) setDragOverColKey(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragColKey && dragColKey !== col.key) reorderColumn(dragColKey, col.key);
                      setDragColKey(null);
                      setDragOverColKey(null);
                    }}
                    onDragEnd={() => {
                      setDragColKey(null);
                      setDragOverColKey(null);
                    }}
                    className={cn(
                      "py-2.5 px-4 text-left text-[11px] font-semibold text-wedly-muted uppercase tracking-wider whitespace-nowrap select-none relative group",
                      isSticky && "sticky z-10 bg-wedly-bg-gray",
                      dragOverColKey === col.key && dragColKey !== col.key && "bg-wedly-bg-blue border-l-2 border-l-wedly-accent",
                    )}
                    style={{
                      minWidth: 40,
                      ...(isSticky ? { left: (stickyOffsets[col.key] ?? 0) + 40 } : {}),
                      cursor: isRenaming || !canReorderColumns ? undefined : "grab",
                    }}
                  >
                    <span className="inline-flex items-center gap-1 w-full">
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              saveColLabel(col.key, renameValue.trim() || col.label);
                              setRenamingColKey(null);
                            }
                            if (e.key === "Escape") setRenamingColKey(null);
                          }}
                          onBlur={() => {
                            saveColLabel(col.key, renameValue.trim() || col.label);
                            setRenamingColKey(null);
                          }}
                          className="text-[11px] font-semibold text-wedly-t1 bg-white border border-wedly-accent rounded px-1 py-0.5 w-full outline-none"
                        />
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 cursor-pointer hover:text-wedly-t2 transition-colors flex-1 min-w-0",
                            getColAccent(col)?.headerTint,
                          )}
                          onClick={() => handleSort(col.key)}
                        >
                          {getColAccent(col) && (
                            <span
                              className={cn("inline-block w-1.5 h-1.5 rounded-full flex-shrink-0", getColAccent(col)?.dotClass)}
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate min-w-0">{getColLabel(col)}</span>
                          {isSorted && (
                            <span className="text-wedly-accent">{sortConfig?.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </span>
                      )}
                      {!isRenaming && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setColMenuKey(isMenuOpen ? null : col.key);
                          }}
                          className="opacity-0 group-hover:opacity-100 ml-auto text-wedly-muted hover:text-wedly-t1 transition-all shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="3" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="8" cy="13" r="1.5" />
                          </svg>
                        </button>
                      )}
                    </span>
                    {isMenuOpen && (
                      <div
                        ref={colMenuRef}
                        className="absolute top-full left-0 mt-1 bg-white border border-wedly-bd rounded-lg shadow-lg z-50 py-1 min-w-[140px]"
                      >
                        {canEditColumns && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameValue(getColLabel(col));
                            setRenamingColKey(col.key);
                            setColMenuKey(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-wedly-t2 hover:bg-wedly-bg-gray flex items-center gap-2"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          이름 수정
                        </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSort(col.key);
                            setColMenuKey(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-wedly-t2 hover:bg-wedly-bg-gray flex items-center gap-2"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          정렬
                        </button>
                        {canEditColumns && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeColFromTab(col.key);
                            setColMenuKey(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-wedly-red hover:bg-wedly-bg-red flex items-center gap-2"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          컬럼 숨기기
                        </button>
                        )}
                      </div>
                    )}
                    <div
                      draggable={false}
                      onPointerDown={(e) => onResizeStart(e, col.key)}
                      onDoubleClick={() => onResizeDoubleClick(col.key)}
                      style={{ touchAction: "none" }}
                      className="absolute right-[-3px] top-0 bottom-0 w-[11px] cursor-col-resize z-20 group/resize touch-none"
                    >
                      <div className="absolute inset-y-1 left-1/2 -translate-x-1/2 w-[2px] bg-wedly-bd group-hover/resize:bg-wedly-accent group-active/resize:bg-wedly-accent rounded-full" />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedDataLength === 0 ? (
              <tr>
                <td colSpan={activeColumns.length + 1} className="py-20 text-center">
                  <span className="text-sm text-wedly-muted">
                    {error || (searchQuery ? "검색 결과가 없습니다" : "데이터가 없습니다")}
                  </span>
                  {error && (
                    <button
                      onClick={refreshData}
                      className="block mx-auto mt-2 px-3 py-1.5 text-xs text-wedly-accent border border-wedly-accent/30 rounded-lg"
                    >
                      다시 시도
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr style={{ height: rowVirtualizer.getVirtualItems()[0].start }} />
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = pagedData[virtualRow.index];
                  return renderRow(row, virtualRow.index);
                })}
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr
                    style={{
                      height:
                        rowVirtualizer.getTotalSize() -
                        (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                    }}
                  />
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

