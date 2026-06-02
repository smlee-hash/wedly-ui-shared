"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { DesktopTable } from "../components/DesktopTable";
import { MobileCardList } from "../components/MobileCardList";
import { TopControls } from "../components/TopControls";
import { ColumnToggleModal } from "../components/ColumnToggleModal";
import type { ColumnDef } from "../types/columns";
import {
  filterRowsBySearch,
  sortRows,
  nextSortConfig,
  orderColumns,
  computeStickyOffsets,
  paginate,
  totalPageCount,
  reorderList,
  defaultFormatCellValue,
  type RowData,
  type CellValue,
  type SortConfig,
} from "./collab-table-core";
import { filterRowsByTab, type ViewTab } from "./collab-filters";
import { FilterTabs } from "./FilterTabs";

export type CollabTableProps = {
  /** 브라우저 저장 키 앞에 붙는 고유 접두어(페이지마다 다르게). 예: "unified-collab:tax-amendment" */
  storagePrefix: string;
  /** 컬럼 정의 전체. defaultVisible로 처음 보이는 컬럼이 정해진다. */
  columns: ColumnDef[];
  /** 표에 그릴 행들. 각 행에 rowIdKey로 식별되는 고유값이 있어야 한다. */
  rows: RowData[];
  /** 행 식별 키(기본 "_id") */
  rowIdKey?: string;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  /** 관리자 여부(다음 단계에서 관리도구·편집에 사용 — A단계는 읽기 전용) */
  isAdmin: boolean;
  /** 제목 칸 클릭 시 호출(상세 열기 훅) */
  onOpenRow: (row: RowData) => void;
  /** 모바일 카드 표시 설정 */
  mobile?: {
    titleKey?: string;
    subtitleLeftKey?: string;
    subtitleRightKey?: string;
    statusKey?: string;
    getStatusClass?: (status: string) => string;
    cardFields?: string[];
  };
  /** 셀 값 렌더러(생략 시 종류별 기본 표시) */
  renderFieldValue?: (col: ColumnDef, value: CellValue, row: RowData) => ReactNode;
  /** 컬럼 강조(점·머리색). 생략 시 없음 */
  getColAccent?: (col: ColumnDef) => { dotClass: string; headerTint: string } | null;
  /** 상태별 필터 탭(생략 시 탭 없음 — 기존과 100% 동일). 각 앱이 자기 목록을 넣어준다. */
  tabs?: ViewTab[];
  /** 저장값이 없을 때 처음 보일 컬럼 키들(앱이 하이브식 배치 지정). 생략 시 columns.defaultVisible */
  defaultVisibleColumns?: string[];
  /** 저장값이 없을 때 컬럼 순서(앱이 하이브식 배치 지정). 생략 시 columns 원래 순서 */
  defaultColumnOrder?: string[];
};

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CollabTable({
  storagePrefix,
  columns,
  rows,
  rowIdKey = "_id",
  loading,
  error = null,
  onOpenRow,
  onRefresh,
  mobile,
  renderFieldValue,
  getColAccent: getColAccentProp,
  tabs,
  defaultVisibleColumns,
  defaultColumnOrder,
}: CollabTableProps) {
  const VISIBLE_COLS_KEY = `${storagePrefix}:visible-cols`;
  const COL_WIDTHS_KEY = `${storagePrefix}:col-widths`;
  const COL_ORDER_KEY = `${storagePrefix}:col-order`;
  const COL_LABELS_KEY = `${storagePrefix}:col-labels`;
  const ACTIVE_TAB_KEY = `${storagePrefix}:active-tab`;

  // 표 상태
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [mobileViewMode, setMobileViewMode] = useState<"card" | "table">("table");
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // 활성 필터 탭(탭이 있을 때만). 브라우저에 기억. 저장값이 현재 탭 목록에 없으면 첫 탭.
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    if (!tabs || tabs.length === 0) return "";
    const saved = loadJson<string | null>(ACTIVE_TAB_KEY, null);
    if (saved && tabs.some((t) => t.id === saved)) return saved;
    return tabs[0].id;
  });

  // 레이아웃(브라우저 저장)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    const saved = loadJson<string[] | null>(VISIBLE_COLS_KEY, null);
    if (Array.isArray(saved)) return new Set(saved);
    if (defaultVisibleColumns && defaultVisibleColumns.length) return new Set(defaultVisibleColumns);
    return new Set(columns.filter((c) => c.defaultVisible).map((c) => c.key));
  });
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    const defaults: Record<string, number> = {};
    columns.forEach((c) => (defaults[c.key] = c.width || 120));
    return { ...defaults, ...loadJson<Record<string, number>>(COL_WIDTHS_KEY, {}) };
  });
  const [colOrder, setColOrder] = useState<string[]>(() => {
    const saved = loadJson<string[]>(COL_ORDER_KEY, []);
    return saved.length ? saved : (defaultColumnOrder ?? []);
  });
  const [colLabelOverrides, setColLabelOverrides] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(COL_LABELS_KEY, {}),
  );

  // 헤더 메뉴 / 드래그 / 리사이즈
  const [colMenuKey, setColMenuKey] = useState<string | null>(null);
  const [renamingColKey, setRenamingColKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const colMenuRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<unknown>(null);

  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // 검색어 디바운스(0.1초)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 100);
    return () => clearTimeout(t);
  }, [searchInput]);

  const orderedColumns = useMemo(() => orderColumns(columns, colOrder), [columns, colOrder]);
  const activeColumns = useMemo(() => orderedColumns.filter((c) => visibleColumns.has(c.key)), [orderedColumns, visibleColumns]);
  const stickyOffsets = useMemo(() => computeStickyOffsets(activeColumns, colWidths), [activeColumns, colWidths]);

  const activeTab = useMemo(
    () => (tabs && tabs.length ? tabs.find((t) => t.id === activeTabId) ?? null : null),
    [tabs, activeTabId],
  );
  const tabbedRows = useMemo(() => filterRowsByTab(rows, activeTab), [rows, activeTab]);
  const searchedRows = useMemo(() => filterRowsBySearch(tabbedRows, debouncedSearch), [tabbedRows, debouncedSearch]);
  const sortedRows = useMemo(() => sortRows(searchedRows, sortConfig), [searchedRows, sortConfig]);
  const totalPages = useMemo(() => totalPageCount(sortedRows.length, pageSize), [sortedRows.length, pageSize]);
  const pagedData = useMemo(() => paginate(sortedRows, currentPage, pageSize), [sortedRows, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize, activeTabId]);

  const getColLabel = useCallback((col: ColumnDef) => colLabelOverrides[col.key] || col.label || col.key, [colLabelOverrides]);
  const getColAccent = useCallback((col: ColumnDef) => (getColAccentProp ? getColAccentProp(col) : null), [getColAccentProp]);
  const handleSort = useCallback((key: string) => setSortConfig((p) => nextSortConfig(p, key)), []);
  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    try { localStorage.setItem(ACTIVE_TAB_KEY, id); } catch {}
  }, [ACTIVE_TAB_KEY]);

  const persistVisible = useCallback((next: Set<string>) => {
    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...next])); } catch {}
  }, [VISIBLE_COLS_KEY]);

  const toggleAllChecks = useCallback(() => {
    setCheckedIds((prev) => (prev.size === pagedData.length ? new Set() : new Set(pagedData.map((r) => String(r[rowIdKey])))));
  }, [pagedData, rowIdKey]);
  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const isColumnVisible = useCallback((key: string) => visibleColumns.has(key), [visibleColumns]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      persistVisible(n);
      return n;
    });
  }, [persistVisible]);
  const removeColFromTab = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const n = new Set(prev);
      n.delete(key);
      persistVisible(n);
      return n;
    });
  }, [persistVisible]);

  const saveColLabel = useCallback((key: string, label: string) => {
    setColLabelOverrides((prev) => {
      const next = { ...prev };
      if (label.trim()) next[key] = label.trim(); else delete next[key];
      try { localStorage.setItem(COL_LABELS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [COL_LABELS_KEY]);

  const reorderColumn = useCallback((fromKey: string, toKey: string) => {
    const base = colOrder.length ? colOrder : columns.map((c) => c.key);
    const next = reorderList(base, fromKey, toKey);
    setColOrder(next);
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next)); } catch {}
  }, [colOrder, columns, COL_ORDER_KEY]);

  const setColWidthsAndStore = useCallback((updater: (p: Record<string, number>) => Record<string, number>) => {
    setColWidths((p) => {
      const next = updater(p);
      try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [COL_WIDTHS_KEY]);
  const onResizeStart = useCallback((e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[colKey] || 120;
    resizingRef.current = { key: colKey, startX, startW };
    const onMove = (ev: MouseEvent) => setColWidthsAndStore((p) => ({ ...p, [colKey]: Math.max(40, startW + (ev.clientX - startX)) }));
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [colWidths, setColWidthsAndStore]);
  const onResizeDoubleClick = useCallback((colKey: string) => setColWidthsAndStore((p) => ({ ...p, [colKey]: 160 })), [setColWidthsAndStore]);

  // 모바일 카드 설정
  const titleCol = useMemo(() => columns.find((c) => c.type === "title"), [columns]);
  const mobileTitleKey = mobile?.titleKey ?? titleCol?.key ?? columns[0]?.key ?? "";
  const mobileStatusClass = mobile?.getStatusClass ?? (() => "bg-wedly-bg-gray text-wedly-t2");

  // 행 그리기(읽기 전용) — 하이브 표 행과 동일 스타일(글자 13px·여백 px-4·한 줄 말줄임·hover 파란빛).
  // 제목 칸 = 밑줄 링크 + ↗아이콘 + 댓글수 버튼, 클릭 시 상세 열기.
  const renderRow = useCallback((row: RowData, virtualIndex: number) => {
    const id = String(row[rowIdKey] ?? "");
    const commentCount = typeof row._commentCount === "number" ? (row._commentCount as number) : 0;
    return (
      <tr
        key={id || virtualIndex}
        className={cn("border-t border-slate-100 hover:bg-blue-50/30", checkedIds.has(id) && "bg-wedly-bg-blue/30")}
      >
        <td className="py-2 px-3 w-10 text-center sticky left-0 z-10 bg-white">
          <input
            type="checkbox"
            checked={checkedIds.has(id)}
            onChange={() => toggleCheck(id)}
            className="rounded border-wedly-bd text-wedly-accent focus:ring-wedly-accent/20"
          />
        </td>
        {activeColumns.map((col) => {
          const isSticky = col.sticky;
          const v = (row[col.key] ?? null) as CellValue;
          return (
            <td
              key={col.key}
              data-col={col.key}
              className={cn(
                "py-2 px-4 text-[13px] whitespace-nowrap text-ellipsis overflow-hidden",
                isSticky && "sticky z-10 bg-white",
                col.type === "title" && "font-medium text-wedly-navy",
              )}
              style={{ minWidth: 40, ...(isSticky ? { left: (stickyOffsets[col.key] ?? 0) + 40 } : {}) }}
            >
              {col.type === "title" ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="cursor-pointer text-wedly-accent underline decoration-wedly-accent/30 underline-offset-2 hover:decoration-wedly-accent transition-colors inline-flex items-center gap-1"
                    onClick={() => onOpenRow(row)}
                  >
                    {v != null && v !== "" ? String(v) : "-"}
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="opacity-40">
                      <path d="M4.5 2.5h5v5M9.5 2.5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenRow(row); }}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-wedly-muted hover:text-wedly-accent hover:bg-wedly-bg-blue transition-colors text-[11px]"
                    title="히스토리"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M2 3h12v8a1 1 0 01-1 1H5l-3 3V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    {commentCount > 0 && <span className="tabular-nums font-medium">{commentCount}</span>}
                  </button>
                </span>
              ) : renderFieldValue ? (
                renderFieldValue(col, v, row)
              ) : (
                <span>{defaultFormatCellValue(col, v)}</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  }, [activeColumns, checkedIds, toggleCheck, stickyOffsets, rowIdKey, onOpenRow, renderFieldValue]);

  return (
    <div>
      {tabs && tabs.length > 0 && (
        <FilterTabs tabs={tabs} activeId={activeTabId} onSelect={selectTab} />
      )}
      <TopControls
        isAdmin={false}
        onCreateNew={() => {}}
        settingsBaseMenus={[]}
        cfActiveCount={0}
        settingsMenuOrder={[]}
        persistSettingsMenuOrder={() => {}}
        settingsMenuLabelOverrides={{}}
        persistSettingsMenuLabel={() => {}}
        settingsMenuHidden={[]}
        persistSettingsMenuHidden={() => {}}
        settingsMenuCustom={[]}
        persistSettingsMenuCustom={() => {}}
        isSafeMenuUrl={() => false}
        onToast={() => {}}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        checkedCount={0}
        onBulkEdit={() => {}}
        onBulkDelete={() => {}}
        deleting={false}
        onBulkAlimtalk={() => {}}
        onRefresh={onRefresh}
        loading={loading}
        mobileViewMode={mobileViewMode}
        setMobileView={setMobileViewMode}
        pageSize={pageSize}
        setPageSizeAndStore={setPageSize}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        totalRows={sortedRows.length}
        showPageBox={true}
      />

      <div className="mb-2 mt-2 flex justify-end">
        <button
          onClick={() => setColumnModalOpen(true)}
          className="rounded-lg border border-wedly-bd px-3 py-1.5 text-sm font-medium text-wedly-t2 hover:bg-wedly-bg-gray"
        >
          컬럼 설정
        </button>
      </div>

      <MobileCardList
        mobileViewMode={mobileViewMode}
        pagedData={pagedData}
        sortedDataLength={sortedRows.length}
        mobileCardFields={mobile?.cardFields ?? []}
        allColumns={columns}
        openRow={(row) => onOpenRow(row)}
        getConditionalFormatClass={() => null}
        getColLabel={getColLabel}
        statusKey={mobile?.statusKey ?? ""}
        getStatusClass={mobileStatusClass}
        titleKey={mobileTitleKey}
        subtitleLeftKey={mobile?.subtitleLeftKey ?? ""}
        subtitleRightKey={mobile?.subtitleRightKey ?? ""}
        error={error}
        searchQuery={debouncedSearch}
        renderFieldValue={renderFieldValue}
      />

      <DesktopTable
        mobileViewMode={mobileViewMode}
        pagedData={pagedData}
        sortedDataLength={sortedRows.length}
        activeColumns={activeColumns}
        colWidths={colWidths}
        stickyOffsets={stickyOffsets}
        checkedIds={checkedIds}
        toggleAllChecks={toggleAllChecks}
        sortConfig={sortConfig}
        handleSort={handleSort}
        colMenuKey={colMenuKey}
        setColMenuKey={setColMenuKey}
        colMenuRef={colMenuRef}
        renamingColKey={renamingColKey}
        setRenamingColKey={setRenamingColKey}
        renameValue={renameValue}
        setRenameValue={setRenameValue}
        saveColLabel={saveColLabel}
        removeColFromTab={removeColFromTab}
        dragColKey={dragColKey}
        setDragColKey={setDragColKey}
        dragOverColKey={dragOverColKey}
        setDragOverColKey={setDragOverColKey}
        resizingRef={resizingRef}
        reorderColumn={reorderColumn}
        onResizeStart={onResizeStart}
        onResizeDoubleClick={onResizeDoubleClick}
        getColLabel={getColLabel}
        getColAccent={getColAccent}
        error={error}
        searchQuery={debouncedSearch}
        refreshData={onRefresh}
        renderRow={renderRow}
      />

      <ColumnToggleModal
        open={columnModalOpen}
        onClose={() => setColumnModalOpen(false)}
        allColumns={columns}
        isColumnVisible={isColumnVisible}
        toggleColumn={toggleColumn}
        getColLabel={getColLabel}
        getColAccent={getColAccent}
        editingCol={null}
        setEditingCol={() => {}}
        editColLabel=""
        setEditColLabel={() => {}}
        renameColumn={() => {}}
        deleteColumn={() => {}}
        showAddColumn={false}
        setShowAddColumn={() => {}}
        newColLabel=""
        setNewColLabel={() => {}}
        newColType={"text" as ColumnDef["type"]}
        setNewColType={() => {}}
        addColumn={() => {}}
      />
    </div>
  );
}
