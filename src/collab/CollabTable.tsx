"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn";
import { DesktopTable } from "../components/DesktopTable";
import { MobileCardList } from "../components/MobileCardList";
import { TopControls } from "../components/TopControls";
import { MaximizeButton } from "../components/MaximizeButton";
import { SortPanel } from "./SortPanel";
import { ColumnToggleModal } from "../components/ColumnToggleModal";
import type { SettingsMenuItem, SettingsCustomItem } from "../components/SettingsDropdown";
import type { ColumnDef } from "../types/columns";
import {
  filterRowsBySearch,
  sortRows,
  nextSortConfig,
  normalizeSort,
  orderColumns,
  computeStickyOffsets,
  paginate,
  totalPageCount,
  reorderList,
  defaultFormatCellValue,
  type RowData,
  type CellValue,
  type SortConfig,
  type SortRule,
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
  /** 비관리자도 새 업체 생성 가능한 화면이면 true(기본 false — 하이브·일루아 무영향). 서버가 로그인 사용자 생성을 허용할 때만 켠다. */
  canCreate?: boolean;
  /** 새 업체 생성 핸들러(비관리자 경로). 관리자는 adminToolbar.onCreateNew 를 쓴다. */
  onCreateNew?: () => void;
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
  /** 줄 전체 색칠(조건부 서식). 그 줄 데이터로 색 클래스(예 "bg-wedly-bg-red")를 돌려주면 그 줄에 칠한다. null이면 색 없음(기존과 동일). */
  getRowColorClass?: (row: RowData) => string | null | undefined;
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
  /** 최대화 모드에서 표 위에 함께 표시할 헤더(예: 탭 메뉴). 미지정 시 최대화해도 헤더 영역 없음. */
  headerSlot?: ReactNode;
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
  /**
   * 컬럼 표시 설정 모달에 공통/그외 구분, 승격, 삭제, 복원 기능을 전달하는 묶음.
   * 생략 시 기존과 100% 동일(공통/그외 구분 없음, 삭제 복원 없음).
   *
   * onDeleteColumn: isDeletable=true인 칸을 모달에서 삭제(✕)할 때 호출되는 soft-delete 콜백.
   *   제공하면 isDeletable+이 콜백으로 삭제를 처리(columnAdmin.deleteColumn 와 별도).
   *   미제공 시 columnAdmin.deleteColumn 을 그대로 사용.
   */
  columnGrouping?: {
    commonColumnKeys?: string[];
    onPromoteToCommon?: (key: string) => void;
    onDemoteFromCommon?: (key: string) => void;
    canDemoteFromCommon?: (key: string) => boolean;
    deletedColumns?: string[];
    onRestoreColumn?: (key: string) => void;
    isDeletable?: (col: ColumnDef) => boolean;
    onDeleteColumn?: (key: string) => void;
    // 칸 표시 토글 시 호출(소비 앱이 상세창 공용설정 등과 연동할 때 사용). 미지정 시 무동작.
    onToggleColumn?: (key: string, nextVisible: boolean) => void;
  };
  /**
   * 칸 관리(추가/제목·타입 수정/삭제)를 소비 앱이 제공할 때 주는 묶음. 컬럼 설정 모달로 전달된다.
   * 생략 시 컬럼 설정 모달은 보기/검색만(기존과 100% 동일). 제공 시 편집 기능이 켜진다.
   * renameColumn 은 "저장" 콜백 — 소비 앱이 editColLabel(제목)·editColType(타입)을 함께 저장한다.
   */
  columnAdmin?: {
    editingCol: string | null;
    setEditingCol: (key: string | null) => void;
    editColLabel: string;
    setEditColLabel: (label: string) => void;
    editColType?: string;
    setEditColType?: (type: string) => void;
    renameColumn: (key: string) => void;
    deleteColumn: (key: string) => void;
    showAddColumn: boolean;
    setShowAddColumn: (show: boolean) => void;
    newColLabel: string;
    setNewColLabel: (label: string) => void;
    newColType: string;
    setNewColType: (type: string) => void;
    addColumn: () => void;
    canEditColumn?: (col: ColumnDef) => boolean;
    canChangeType?: (col: ColumnDef) => boolean;
    typeOptions?: { value: string; label: string }[];
  };
  /** 이 키 목록이 바뀌면 해당 칸을 강제로 '보임'으로 켠다(새로 추가한 칸을 표에 바로 보이게). */
  ensureVisibleKeys?: string[];
  /**
   * 제어형 다중 정렬. 주어지면 내부 sortConfig 대신 이 값을 사용하고,
   * 변경 시 onSortChange 를 호출한다. 생략 시 기존 내부 상태로 동작.
   */
  sort?: SortConfig;
  /** sort prop 변경 콜백(제어형 사용 시). 관리자 정렬 패널에서도 이 콜백으로 통지. */
  onSortChange?: (s: SortRule[]) => void;
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

// 다중 선택(multi_select) 칸 인라인 편집기 — CellSelectEditor 와 동일한 포털·위치·바깥클릭 구조.
function CellMultiSelectEditor({ value, options, columnKey, onSave, onClose, cfg }: {
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
  const [addingNew, setAddingNew] = useState(false);
  const [newOptInput, setNewOptInput] = useState("");
  const newOptRef = useRef<HTMLInputElement>(null);

  // 현재 선택된 값 집합 (콤마+공백 구분)
  const [selected, setSelected] = useState<Set<string>>(() => {
    return new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
  });

  useEffect(() => {
    if (anchorRef.current) {
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // 바깥 클릭 시 현재 선택 상태로 저장 후 닫기
        const joined = Array.from(selected).join(", ");
        onSave(joined);
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, onSave, pos, selected]);

  useEffect(() => {
    if (addingNew) newOptRef.current?.focus();
  }, [addingNew]);

  const toggle = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt); else next.add(opt);
      return next;
    });
  };

  const handleAddNew = () => {
    const name = newOptInput.trim();
    if (!name) return;
    cfg?.onAddOption?.(columnKey, name);
    setSelected((prev) => new Set([...prev, name]));
    setNewOptInput("");
    setAddingNew(false);
  };

  // 옵션 목록: cfg.getOptions 로 최신 상태 반영
  const liveOptions = cfg?.getOptions?.(columnKey) ?? options;

  return (
    <>
      <div ref={anchorRef} className="h-0" />
      {pos && typeof document !== "undefined" && createPortal(
        <div
          ref={ref}
          className="fixed w-64 max-h-[320px] overflow-y-auto rounded-2xl border border-wedly-bd bg-white shadow-[0_10px_30px_-6px_rgba(10,34,68,0.18)]"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <div className="py-1">
            {liveOptions.map((opt) => {
              const isOn = selected.has(opt);
              const colorClass = cfg?.getColorClass?.(columnKey, opt) ?? "bg-wedly-bg-gray text-wedly-t2";
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-wedly-bg-blue/40 transition-colors"
                >
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors",
                    isOn ? "border-wedly-accent bg-wedly-accent text-white" : "border-wedly-bd bg-white",
                  )}>
                    {isOn && "✓"}
                  </span>
                  <span className={cn("inline-block rounded-full px-2 py-0.5 text-[12px] font-medium", colorClass)}>
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 새 옵션 추가 */}
          {cfg?.onAddOption && (
            <div className="border-t border-wedly-bd px-3 py-2">
              {addingNew ? (
                <div className="flex gap-1">
                  <input
                    ref={newOptRef}
                    value={newOptInput}
                    onChange={(e) => setNewOptInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddNew(); if (e.key === "Escape") setAddingNew(false); }}
                    placeholder="새 옵션"
                    className="flex-1 rounded-lg border border-wedly-bd px-2 py-1 text-[12px] focus:border-wedly-accent focus:outline-none"
                  />
                  <button type="button" onClick={handleAddNew} className="rounded-lg bg-wedly-accent px-2 py-1 text-[11px] text-white">추가</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingNew(true)}
                  className="w-full rounded-lg border border-wedly-bd-blue bg-wedly-bg-blue px-2 py-1 text-[12px] text-wedly-accent hover:bg-wedly-bg-blue/70 transition-colors text-left"
                >
                  + 새 옵션
                </button>
              )}
            </div>
          )}

          {/* 저장 버튼 */}
          <div className="border-t border-wedly-bd px-3 py-2">
            <button
              type="button"
              onClick={() => { onSave(Array.from(selected).join(", ")); onClose(); }}
              className="w-full rounded-lg bg-wedly-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-wedly-navy transition-colors"
            >
              저장
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
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
  canCreate = false,
  onCreateNew: onCreateNewProp,
  mobile,
  renderFieldValue,
  getRowColorClass,
  getColAccent: getColAccentProp,
  tabs,
  tabAdmin,
  adminToolbar,
  selectionResetKey,
  defaultVisibleColumns,
  defaultColumnOrder,
  onCellEdit,
  editConfig,
  columnAdmin,
  columnGrouping,
  ensureVisibleKeys,
  headerSlot,
  sort: sortProp,
  onSortChange,
}: CollabTableProps) {
  const VISIBLE_COLS_KEY = `${storagePrefix}:visible-cols`;
  const COL_WIDTHS_KEY = `${storagePrefix}:col-widths`;
  const COL_ORDER_KEY = `${storagePrefix}:col-order`;
  const COL_LABELS_KEY = `${storagePrefix}:col-labels`;
  const ACTIVE_TAB_KEY = `${storagePrefix}:active-tab`;

  // 표 상태
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // 내부 정렬 상태(비제어형). sortProp 이 주어지면 덮어쓰임.
  const [sortConfigInternal, setSortConfigInternal] = useState<SortConfig>(null);
  // 제어형 우선: sortProp 이 주어지면 그 값, 아니면 내부 상태
  const sortConfig: SortConfig = sortProp !== undefined ? sortProp : sortConfigInternal;
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

  // 새로 추가한 칸을 표에 바로 보이게 — 부모가 ensureVisibleKeys 로 알려준 키만 보임 처리(기존 숨김 설정은 건드리지 않음).
  useEffect(() => {
    if (!ensureVisibleKeys || ensureVisibleKeys.length === 0) return;
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      ensureVisibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [ensureVisibleKeys]);

  // 헤더 메뉴 / 드래그 / 리사이즈
  const [colMenuKey, setColMenuKey] = useState<string | null>(null);
  const [renamingColKey, setRenamingColKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const colMenuRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<unknown>(null);

  const [columnModalOpen, setColumnModalOpen] = useState(false);

  // F2: 표 최대화 — 사이드바·상단 메뉴를 덮는 전체화면. 탭(headerSlot)은 위에 유지, 페이지 이동줄도 유지.
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMaximized(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);

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

  // 편집 가능 종류(기본) — formula·last_edited_time·last_edited_by·auto_increment_id·file·person 은 편집 안 함.
  const DEFAULT_EDITABLE_TYPES = useMemo(() => new Set<ColumnDef["type"]>([
    "text", "title", "email", "phone_number", "number", "date", "datetime", "select", "status", "checkbox", "multi_select",
  ]), []);

  const isCellEditable = useCallback((col: ColumnDef) => {
    // 셀 값 편집 = 저장 핸들러(onCellEdit)가 연결된 앱에서 허용 — 관리자 전용 아님.
    // 서버 정책이 "행을 볼 수 있으면 값 수정 가능"이라, 보이는 행의 값은 일반 사용자도 고칠 수 있다.
    // (옵션 추가/삭제·색상 등 구조 편집은 그대로 editConfig=관리자에서만 제공)
    if (!onCellEdit) return false;
    if (editConfig?.isEditable) return editConfig.isEditable(col);
    return DEFAULT_EDITABLE_TYPES.has(col.type);
  }, [onCellEdit, editConfig, DEFAULT_EDITABLE_TYPES]);

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

  // 정렬 변경 공통 헬퍼 — 제어형이면 onSortChange, 비제어형이면 내부 setSortConfigInternal
  const applySortChange = useCallback((next: SortConfig) => {
    if (sortProp !== undefined) {
      onSortChange?.(normalizeSort(next));
    } else {
      setSortConfigInternal(next);
    }
  }, [sortProp, onSortChange]);

  // 헤더 클릭 → 1순위 단일 토글 (기존 동작 유지)
  const handleSort = useCallback((key: string) => {
    applySortChange(nextSortConfig(sortConfig, key));
  }, [applySortChange, sortConfig]);
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
    const nextVisible = !visibleColumns.has(key);
    setVisibleColumns((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      persistVisible(n);
      return n;
    });
    columnGrouping?.onToggleColumn?.(key, nextVisible);
  }, [visibleColumns, persistVisible, columnGrouping]);
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
    // 화면에 실제로 보이는 전체 순서를 기준으로 옮긴다.
    // 저장된 순서(colOrder)에 아직 없던 칸(나중에 추가됐거나 기본 숨김이라 뒤에 붙은 칸,
    // 예: "DB 담당")도 끌 수 있도록 orderColumns 로 합친 전체 순서를 기준으로 삼는다.
    // (이전엔 base=colOrder 라, 저장된 순서에 없는 칸은 reorderList 가 무시해 드래그가 먹지 않았음.)
    const base = orderColumns(columns, colOrder).map((c) => c.key);
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
    // 줄 전체 색칠(조건부 서식) — 앱이 준 색이 있으면 그 줄에 칠하고, 파란 hover/선택색보다 우선한다.
    const rowColor = getRowColorClass?.(row);
    return (
      <tr
        key={id || virtualIndex}
        className={cn(
          "border-t border-wedly-bd/60",
          rowColor ? rowColor : "hover:bg-wedly-bg-blue/30",
          !rowColor && checkedIds.has(id) && "bg-wedly-bg-blue/30",
        )}
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
                  {editable && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingCell({ id, key: col.key }); }}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-wedly-muted hover:text-wedly-accent hover:bg-wedly-bg-blue transition-colors"
                      title="상호명 수정"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
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
                ) : col.type === "datetime" ? (
                  <DateEditor
                    value={String(v ?? "")}
                    withTime
                    onClose={() => setEditingCell(null)}
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
                ) : col.type === "multi_select" ? (
                  <CellMultiSelectEditor
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
    <div className={maximized ? "fixed inset-0 z-[70] bg-white overflow-y-auto p-3 sm:p-4" : undefined}>
      {maximized && headerSlot && (
        <div className="mb-2">{headerSlot}</div>
      )}
      {tabs && tabs.length > 0 && (
        <FilterTabs tabs={tabs} activeId={activeTabId} onSelect={selectTab} admin={isAdmin && tabAdmin ? tabAdmin : undefined} />
      )}
      <TopControls
        isAdmin={adminEnabled}
        canCreate={canCreate}
        onCreateNew={adminToolbar?.onCreateNew ?? onCreateNewProp ?? (() => {})}
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
        trailingControls={
          <>
            {isAdmin && (
              <SortPanel
                sort={sortConfig}
                onSortChange={applySortChange}
                columns={activeColumns.map((c) => ({ key: c.key, label: getColLabel(c) }))}
              />
            )}
            <MaximizeButton maximized={maximized} onToggle={() => setMaximized((m) => !m)} />
          </>
        }
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

      {/* 표·카드 영역 — 위 컨트롤 줄들과 같은 간격(8px)을 줘서 붙어 보이지 않게 */}
      <div className="mt-2">
      <MobileCardList
        mobileViewMode={mobileViewMode}
        pagedData={pagedData}
        sortedDataLength={sortedRows.length}
        mobileCardFields={mobile?.cardFields ?? []}
        allColumns={columns}
        openRow={(row) => onOpenRow(row)}
        getConditionalFormatClass={(row) => getRowColorClass?.(row) ?? null}
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
        sortConfig={(() => { const r = normalizeSort(sortConfig); return r.length > 0 ? r[0] : null; })()}
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
      </div>

      <ColumnToggleModal
        open={columnModalOpen}
        onClose={() => setColumnModalOpen(false)}
        allColumns={columns}
        isColumnVisible={isColumnVisible}
        toggleColumn={toggleColumn}
        getColLabel={getColLabel}
        getColAccent={getColAccent}
        editingCol={columnAdmin?.editingCol ?? null}
        setEditingCol={columnAdmin?.setEditingCol ?? (() => {})}
        editColLabel={columnAdmin?.editColLabel ?? ""}
        setEditColLabel={columnAdmin?.setEditColLabel ?? (() => {})}
        renameColumn={columnAdmin?.renameColumn ?? (() => {})}
        deleteColumn={
          // columnGrouping.onDeleteColumn 이 있으면 그것을 사용(soft-delete). 없으면 columnAdmin.deleteColumn(기존 hard-delete).
          columnGrouping?.onDeleteColumn ?? columnAdmin?.deleteColumn ?? (() => {})
        }
        showAddColumn={columnAdmin?.showAddColumn ?? false}
        setShowAddColumn={columnAdmin?.setShowAddColumn ?? (() => {})}
        newColLabel={columnAdmin?.newColLabel ?? ""}
        setNewColLabel={columnAdmin?.setNewColLabel ?? (() => {})}
        newColType={(columnAdmin?.newColType ?? "text") as ColumnDef["type"]}
        setNewColType={columnAdmin?.setNewColType ?? (() => {})}
        addColumn={columnAdmin?.addColumn ?? (() => {})}
        canAddColumn={isAdmin && !!columnAdmin}
        editColType={columnAdmin?.editColType}
        setEditColType={columnAdmin?.setEditColType}
        canEditColumn={columnAdmin?.canEditColumn}
        canChangeType={columnAdmin?.canChangeType}
        typeOptions={columnAdmin?.typeOptions}
        commonColumnKeys={columnGrouping?.commonColumnKeys}
        onPromoteToCommon={columnGrouping?.onPromoteToCommon}
        onDemoteFromCommon={columnGrouping?.onDemoteFromCommon}
        canDemoteFromCommon={columnGrouping?.canDemoteFromCommon}
        deletedColumns={columnGrouping?.deletedColumns}
        onRestoreColumn={columnGrouping?.onRestoreColumn}
        isDeletable={columnGrouping?.isDeletable}
      />
    </div>
  );
}
