"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { DesktopTable } from "../components/DesktopTable";
import { MobileCardList } from "../components/MobileCardList";
import { TopControls } from "../components/TopControls";
import { ColumnToggleModal } from "../components/ColumnToggleModal";
import type { SettingsMenuItem, SettingsCustomItem } from "../components/SettingsDropdown";
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
import { FilterTabs, type FilterTabsAdmin } from "./FilterTabs";
import { TextEditor, NumberEditor, DateEditor } from "../components/Editors";
import { SelectDropdownBody } from "@wedly/detail-modal-shared";

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
  /** 관리자 탭 편집 훅(생략 시 표시 전용). isAdmin=true 이고 이게 주어지면 탭 편집(끌어옮기기·＋추가·더블클릭 편집)이 켜진다. */
  tabAdmin?: FilterTabsAdmin;
  /**
   * 관리자 도구모음(새 업체·관리 도구 메뉴·일괄 작업). isAdmin=true 이고 이게 주어질 때만 켜진다.
   * 생략 시 기존과 100% 동일(읽기 전용 도구모음 + 우측 "컬럼 설정" 버튼).
   * "컬럼 표시 설정" 메뉴 항목(기본 id "column-toggle")의 onClick 은 표 내부 컬럼 모달로 자동 연결된다.
   * 일괄 콜백은 현재 선택된 행 배열을 인자로 받는다. onBulkAlimtalk 을 안 주면 알림톡 버튼은 숨겨진다.
   */
  adminToolbar?: {
    onCreateNew: () => void;
    settingsBaseMenus: SettingsMenuItem[];
    cfActiveCount?: number;
    settingsMenuOrder?: string[];
    persistSettingsMenuOrder?: (next: string[]) => void;
    settingsMenuLabelOverrides?: Record<string, string>;
    persistSettingsMenuLabel?: (id: string, label: string) => void;
    settingsMenuHidden?: string[];
    persistSettingsMenuHidden?: (next: string[]) => void;
    settingsMenuCustom?: SettingsCustomItem[];
    persistSettingsMenuCustom?: (
      updater: SettingsCustomItem[] | ((prev: SettingsCustomItem[]) => SettingsCustomItem[]),
    ) => void;
    isSafeMenuUrl?: (url: string) => boolean;
    onToast?: (msg: { message: string; type: "success" | "error" }) => void;
    onBulkEdit?: (rows: RowData[]) => void;
    onBulkDelete?: (rows: RowData[]) => void;
    onBulkAlimtalk?: (rows: RowData[]) => void;
    deleting?: boolean;
    /** "컬럼 표시 설정" 메뉴 항목 id(기본 "column-toggle"). */
    columnSettingsMenuId?: string;
  };
  /** 이 값이 바뀌면 선택(체크)을 모두 해제한다(일괄 작업 완료 후 부모가 1 증가시킴). */
  selectionResetKey?: number;
  /** 표에서 칸을 클릭해 바로 고치는 콜백. 관리자이고 이게 주어질 때만 켜진다(생략 시 기존과 동일한 읽기 전용). */
  onCellEdit?: (row: RowData, columnKey: string, value: string | number | boolean | null) => void;
  /** 표 안에서 칸을 클릭해 바로 수정할 때 쓰는 설정(선택/상태 칸의 선택지·색 등). onCellEdit 와 함께 줄 때만 편집이 켜진다. */
  editConfig?: {
    /** 이 칸을 편집 허용할지(생략 시 종류 기준 기본 규칙). */
    isEditable?: (col: ColumnDef) => boolean;
    /** 선택/상태 칸 선택지 목록 */
    getOptions?: (columnKey: string) => string[];
    /** 선택/상태 배지 색 클래스 */
    getColorClass?: (columnKey: string, option: string) => string;
    /** 선택지 추가/삭제/색칠(선택) */
    onAddOption?: (columnKey: string, option: string) => void;
    onDeleteOption?: (columnKey: string, option: string) => void;
    onSetColor?: (columnKey: string, option: string, color: string) => void;
    colorFamilies?: { name: string; classes: string }[];
    allowDelete?: boolean;
  };
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

// 선택(select/status) 칸 인라인 편집기 — portal 방식으로 뷰포트 안에 안전하게 띄움.
function CellSelectEditor({ value, options, columnKey, onSave, onClose, cfg }: {
  value: string;
  options: string[];
  columnKey: string;
  onSave: (v: string) => void;
  onClose: () => void;
  cfg?: CollabTableProps["editConfig"];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      // 칸(td) 전체 위치 기준으로 띄운다 — h-0 기준점만 재면 칸 위쪽에 떠서 가려진다.
      const el = anchorRef.current.parentElement ?? anchorRef.current;
      const rect = el.getBoundingClientRect();
      const dropH = 320;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= dropH
        ? rect.bottom + 4
        : rect.top - Math.min(dropH, rect.top - 8) - 4;
      setPos({ top, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!pos) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, pos]);

  return (
    <>
      <div ref={anchorRef} className="h-0" />
      {pos && typeof document !== "undefined" && createPortal(
        <div
          ref={ref}
          className="fixed w-64 max-h-[320px] overflow-y-auto rounded-2xl border border-wedly-bd bg-white shadow-[0_10px_30px_-6px_rgba(10,34,68,0.18)]"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <SelectDropdownBody
            value={value}
            options={options}
            onSave={onSave}
            onClose={onClose}
            onAddOption={cfg?.onAddOption ? (opt) => cfg.onAddOption!(columnKey, opt) : undefined}
            onDeleteOption={cfg?.onDeleteOption ? (opt) => cfg.onDeleteOption!(columnKey, opt) : undefined}
            onSetColor={cfg?.onSetColor
              ? (opt, color) => cfg.onSetColor!(columnKey, opt, color as unknown as string)
              : undefined}
            getColorClass={cfg?.getColorClass ? (opt) => cfg.getColorClass!(columnKey, opt) : undefined}
            colorFamilies={cfg?.colorFamilies as never}
            allowDelete={cfg?.allowDelete}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export function CollabTable({
  storagePrefix,
  columns,
  rows,
  rowIdKey = "_id",
  loading,
  error = null,
  isAdmin,
  onOpenRow,
  onRefresh,
  mobile,
  renderFieldValue,
  getColAccent: getColAccentProp,
  tabs,
  tabAdmin,
  adminToolbar,
  selectionResetKey,
  defaultVisibleColumns,
  defaultColumnOrder,
  onCellEdit,
  editConfig,
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

  // 인라인 셀 수정 상태
  const [editingCell, setEditingCell] = useState<{ id: string; key: string } | null>(null);

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

  // 관리자 도구모음 활성 여부 — isAdmin 이고 adminToolbar 가 주어질 때만.
  const adminEnabled = isAdmin && !!adminToolbar;

  // 편집 가능 종류(기본) — formula·last_edited_time·last_edited_by·auto_increment_id·file·multi_select·person 은 편집 안 함.
  const DEFAULT_EDITABLE_TYPES = useMemo(() => new Set<ColumnDef["type"]>([
    "text", "title", "email", "phone_number", "number", "date", "select", "status", "checkbox",
  ]), []);

  const isCellEditable = useCallback((col: ColumnDef) => {
    if (!(adminEnabled && onCellEdit)) return false;
    if (editConfig?.isEditable) return editConfig.isEditable(col);
    return DEFAULT_EDITABLE_TYPES.has(col.type);
  }, [adminEnabled, onCellEdit, editConfig, DEFAULT_EDITABLE_TYPES]);

  // 선택된 행들(관리자 일괄 작업 콜백에 넘김)
  const checkedRows = useMemo(
    () => (adminEnabled ? sortedRows.filter((r) => checkedIds.has(String(r[rowIdKey]))) : []),
    [adminEnabled, sortedRows, checkedIds, rowIdKey],
  );
  // 관리 도구 메뉴 — "컬럼 표시 설정" 항목의 onClick 을 표 내부 컬럼 모달로 연결(없으면 자동 추가).
  const colSettingsMenuId = adminToolbar?.columnSettingsMenuId ?? "column-toggle";
  const wiredSettingsMenus = useMemo<SettingsMenuItem[]>(() => {
    const base = adminToolbar?.settingsBaseMenus ?? [];
    let hasColItem = false;
    const mapped = base.map((m) => {
      if (m.id === colSettingsMenuId) {
        hasColItem = true;
        return { ...m, onClick: () => setColumnModalOpen(true) };
      }
      return m;
    });
    if (!hasColItem) {
      mapped.push({ id: colSettingsMenuId, label: "컬럼 표시 설정", icon: "👁️", onClick: () => setColumnModalOpen(true) });
    }
    return mapped;
  }, [adminToolbar?.settingsBaseMenus, colSettingsMenuId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize, activeTabId]);

  // 행 목록이 바뀌면 사라진 행(예: 삭제됨)의 선택을 자동 해제 — 유령 선택·유령 개수 방지.
  useEffect(() => {
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(rows.map((r) => String(r[rowIdKey])));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows, rowIdKey]);

  // 부모가 selectionResetKey 를 올리면(일괄 작업 완료) 선택을 전부 해제.
  useEffect(() => {
    if (selectionResetKey === undefined) return;
    setCheckedIds(new Set());
  }, [selectionResetKey]);

  const getColLabel = useCallback((col: ColumnDef) => colLabelOverrides[col.key] || col.label || col.key, [colLabelOverrides]);
  const getColAccent = useCallback((col: ColumnDef) => (getColAccentProp ? getColAccentProp(col) : null), [getColAccentProp]);
  const handleSort = useCallback((key: string) => setSortConfig((p) => nextSortConfig(p, key)), []);
  const selectTab = useCallback((id: string) => {
    setActiveTabId(id);
    try { localStorage.setItem(ACTIVE_TAB_KEY, id); } catch {}
  }, [ACTIVE_TAB_KEY]);

  // 탭 목록이 바뀌어 현재 활성 탭이 사라지면 첫 탭으로(편집·삭제 후 안전).
  useEffect(() => {
    if (tabs && tabs.length && !tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

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

  // 행 그리기 — 하이브 표 행과 동일 스타일(글자 13px·여백 px-4·한 줄 말줄임·hover 파란빛).
  // 제목 칸 = 밑줄 링크 + ↗아이콘 + 댓글수 버튼, 편집 가능 칸은 클릭 시 인라인 편집기 열림.
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
          const editable = isCellEditable(col);
          const isEditingThis = editingCell?.id === id && editingCell?.key === col.key;
          return (
            <td
              key={col.key}
              data-col={col.key}
              className={cn(
                "py-2 px-4 text-[13px] whitespace-nowrap text-ellipsis overflow-hidden",
                isSticky && "sticky z-10 bg-white",
                col.type === "title" && "font-medium text-wedly-navy",
                editable && col.type !== "checkbox" && !isEditingThis && "cursor-pointer hover:bg-wedly-bg-gray/40",
              )}
              style={{ minWidth: 40, ...(isSticky ? { left: (stickyOffsets[col.key] ?? 0) + 40 } : {}) }}
              onClick={editable && col.type !== "checkbox" && !isEditingThis
                ? () => setEditingCell({ id, key: col.key })
                : undefined}
            >
              {col.type === "title" ? (
                isEditingThis ? (
                  <TextEditor
                    value={v != null && v !== "" ? String(v) : ""}
                    onSave={(nv) => {
                      const cur = v != null && v !== "" ? String(v) : "";
                      setEditingCell(null);
                      if (nv !== cur) onCellEdit?.(row, col.key, nv);
                    }}
                  />
                ) : (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="cursor-pointer text-wedly-accent underline decoration-wedly-accent/30 underline-offset-2 hover:decoration-wedly-accent transition-colors inline-flex items-center gap-1"
                    onClick={(e) => { e.stopPropagation(); onOpenRow(row); }}
                    title={editable ? "글자=상세 열기 · 빈곳=이름 수정" : undefined}
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
                )
              ) : col.type === "checkbox" ? (
                <button
                  type="button"
                  onClick={editable ? (e) => { e.stopPropagation(); onCellEdit?.(row, col.key, !v); } : undefined}
                  className={editable ? "cursor-pointer" : undefined}
                >
                  {renderFieldValue ? renderFieldValue(col, v, row) : <span>{defaultFormatCellValue(col, v)}</span>}
                </button>
              ) : isEditingThis ? (
                col.type === "text" || col.type === "email" || col.type === "phone_number" ? (
                  <TextEditor
                    value={String(v ?? "")}
                    onSave={(nv) => { setEditingCell(null); onCellEdit?.(row, col.key, nv); }}
                  />
                ) : col.type === "number" ? (
                  <NumberEditor
                    value={v != null && v !== "" ? Number(v) : null}
                    onSave={(nv) => { setEditingCell(null); onCellEdit?.(row, col.key, nv); }}
                  />
                ) : col.type === "date" ? (
                  <DateEditor
                    value={String(v ?? "")}
                    onClose={() => setEditingCell(null)}
                    onSave={(nv) => { setEditingCell(null); onCellEdit?.(row, col.key, nv); }}
                  />
                ) : col.type === "select" || col.type === "status" ? (
                  <CellSelectEditor
                    value={String(v ?? "")}
                    options={editConfig?.getOptions?.(col.key) ?? []}
                    columnKey={col.key}
                    cfg={editConfig}
                    onSave={(nv) => { setEditingCell(null); onCellEdit?.(row, col.key, nv || null); }}
                    onClose={() => setEditingCell(null)}
                  />
                ) : (
                  renderFieldValue ? renderFieldValue(col, v, row) : <span>{defaultFormatCellValue(col, v)}</span>
                )
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
  }, [activeColumns, checkedIds, toggleCheck, stickyOffsets, rowIdKey, onOpenRow, renderFieldValue, editingCell, isCellEditable, onCellEdit, editConfig]);

  return (
    <div>
      {tabs && tabs.length > 0 && (
        <FilterTabs tabs={tabs} activeId={activeTabId} onSelect={selectTab} admin={isAdmin && tabAdmin ? tabAdmin : undefined} />
      )}
      <TopControls
        isAdmin={adminEnabled}
        onCreateNew={adminToolbar?.onCreateNew ?? (() => {})}
        settingsBaseMenus={adminEnabled ? wiredSettingsMenus : []}
        cfActiveCount={adminToolbar?.cfActiveCount ?? 0}
        settingsMenuOrder={adminToolbar?.settingsMenuOrder ?? []}
        persistSettingsMenuOrder={adminToolbar?.persistSettingsMenuOrder ?? (() => {})}
        settingsMenuLabelOverrides={adminToolbar?.settingsMenuLabelOverrides ?? {}}
        persistSettingsMenuLabel={adminToolbar?.persistSettingsMenuLabel ?? (() => {})}
        settingsMenuHidden={adminToolbar?.settingsMenuHidden ?? []}
        persistSettingsMenuHidden={adminToolbar?.persistSettingsMenuHidden ?? (() => {})}
        settingsMenuCustom={adminToolbar?.settingsMenuCustom ?? []}
        persistSettingsMenuCustom={adminToolbar?.persistSettingsMenuCustom ?? (() => {})}
        isSafeMenuUrl={adminToolbar?.isSafeMenuUrl ?? (() => false)}
        onToast={adminToolbar?.onToast ?? (() => {})}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        checkedCount={adminEnabled ? checkedIds.size : 0}
        onBulkEdit={() => adminToolbar?.onBulkEdit?.(checkedRows)}
        onBulkDelete={() => adminToolbar?.onBulkDelete?.(checkedRows)}
        deleting={adminToolbar?.deleting ?? false}
        onBulkAlimtalk={() => adminToolbar?.onBulkAlimtalk?.(checkedRows)}
        showBulkAlimtalk={!!adminToolbar?.onBulkAlimtalk}
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

      {!adminEnabled && (
        <div className="mb-2 mt-2 flex justify-end">
          <button
            onClick={() => setColumnModalOpen(true)}
            className="rounded-lg border border-wedly-bd px-3 py-1.5 text-sm font-medium text-wedly-t2 hover:bg-wedly-bg-gray"
          >
            컬럼 설정
          </button>
        </div>
      )}

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
