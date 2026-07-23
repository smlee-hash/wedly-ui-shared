"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
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
  resolveInitialColumnOrder,
  defaultFormatCellValue,
  composeRowClassName,
  arrangeGroupedRows,
  type RowData,
  type CellValue,
  type SortConfig,
  type SortRule,
  type GroupedArrangement,
} from "./collab-table-core";
import { startColumnResize } from "./column-resize";
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
  /** 제목 칸 클릭 시 호출(상세 열기 훅). panel="history"면 말풍선(히스토리) 버튼 클릭 — 부모가 히스토리를 연다(NO.80). */
  onOpenRow: (row: RowData, panel?: "history") => void;
  /** 줄에 마우스가 닿을 때 호출(상세 미리받기 등 — 선택). 안 주면 아무 동작 없음(기존 화면 무영향). */
  onRowHover?: (row: RowData) => void;
  /** 비관리자도 새 업체 생성 가능한 화면이면 true(기본 false — 하이브·일루아 무영향). 서버가 로그인 사용자 생성을 허용할 때만 켠다. */
  canCreate?: boolean;
  /** 새 업체 생성 핸들러(비관리자 경로). 관리자는 adminToolbar.onCreateNew 를 쓴다. */
  onCreateNew?: () => void;
  /**
   * 전 직원용 '관리 도구' 축약 메뉴(2026-07-23) — 비관리자에게도 열어줄 항목만 담는다.
   * 넘기면 비관리자 화면에도 관리 도구 버튼이 뜨고 이 항목들만 보인다(꾸미기 없음).
   * 관리자는 기존대로 adminToolbar.settingsBaseMenus 전체를 보므로, 같은 항목을 양쪽에 넣어도 중복 표시되지 않는다.
   */
  menusForAll?: SettingsMenuItem[];
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
  /**
   * 줄 전체 색칠(조건부 서식). 그 줄의 데이터로 색 클래스(예: "bg-wedly-bg-red text-wedly-red")를 돌려주면
   * 그 줄에 칠한다. 생략하거나 null을 돌려주면 색 없음 — 기존과 100% 동일(ERP 무영향).
   * 체크된 줄은 파란 강조가 이겨 이 색은 빠진다(하이브·일루아와 동일 규칙).
   */
  getRowColorClass?: (row: RowData) => string | null | undefined;
  /** 컬럼 강조(점·머리색). 생략 시 없음 */
  getColAccent?: (col: ColumnDef) => { dotClass: string; headerTint: string } | null;
  /** 상태별 필터 탭(생략 시 탭 없음 — 기존과 100% 동일). 각 앱이 자기 목록을 넣어준다. */
  tabs?: ViewTab[];
  /** 저장값이 없을 때 처음 보일 컬럼 키들(앱이 하이브식 배치 지정). 생략 시 columns.defaultVisible */
  defaultVisibleColumns?: string[];
  /** 저장값이 없을 때 컬럼 순서(앱이 하이브식 배치 지정). 생략 시 columns 원래 순서 */
  defaultColumnOrder?: string[];
  /**
   * 서버(관리자 전용) 칸 순서. 주어지면(=undefined 아님) "관리자가 정한 순서 = 모두가 보는 순서" 모드.
   * 비어있지 않은 배열이면 개인(브라우저) 순서를 덮어쓴다(관리자 배치가 모든 사용자에게 적용).
   * 미지정(undefined) 시 기존과 100% 동일(개인 브라우저 순서). 비관리자는 이 모드에서 칸 순서를 못 바꾼다.
   */
  serverColumnOrder?: string[];
  /**
   * 관리자가 칸 순서를 바꿨을 때 호출(부모가 서버에 저장). 제공 시 "서버 순서 모드"가 켜진다.
   * 부모는 isAdmin 일 때만 실제 서버 저장(PUT)하면 된다 — 비관리자 reorder 는 표 내부에서 이미 막힌다.
   */
  onColumnOrderChange?: (order: string[]) => void;
  /**
   * 관리자가 정한 "공용 칸 너비"(NO.128). 이 값이 도착하면 개인 브라우저 값 대신 이 값이 정본이 된다.
   * onColWidthsChange 를 함께 넘길 때만 공용 너비 모드가 켜진다(미지정 = 기존과 100% 동일).
   */
  serverColWidths?: Record<string, number>;
  /**
   * 관리자가 너비를 바꿨을 때 앱이 공용 보관함에 저장하도록 알린다(관리자일 때만 호출된다).
   * 넘어오는 값은 **방금 바뀐 칸만** 담긴 묶음이다 — 낡은 화면이 다른 칸을 옛 값으로 되돌리지 않게.
   */
  onColWidthsChange?: (changedWidths: Record<string, number>) => void;
  /**
   * true면 칸 배치(순서·보임/숨김)를 "공용·관리자 전용 + 탭별 독립"으로 취급한다.
   * - 보임/숨김: 비관리자에겐 '컬럼 설정' 버튼·머리 '컬럼 숨기기'를 숨긴다(관리자만 변경).
   * - 순서: 개인(브라우저) 순서를 무시한다 — 탭마다 serverColumnOrder(없으면 앱 기본)만 따른다(탭 간 누수 방지).
   * 미지정(undefined) 시 기존과 100% 동일.
   */
  columnArrangeShared?: boolean;
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
    /** "엑셀 다운로드"를 눌렀을 때 현재 체크한 행을 받는다(일괄수정·삭제와 동일). 없으면 다운로드는 기존대로 부모 onClick 을 그대로 실행. */
    onBulkDownload?: (rows: RowData[]) => void;
    deleting?: boolean;
    /** "컬럼 표시 설정" 메뉴 항목 id(기본 "column-toggle"). */
    columnSettingsMenuId?: string;
    /** "엑셀 다운로드" 메뉴 항목 id(기본 "excel-download"). onBulkDownload 와 함께 줄 때만 선택 반영. */
    excelDownloadMenuId?: string;
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
    commonLabelByKey?: Record<string, string>;
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
  /** 차수 칸 "표 노출" 위계 목록 — 넘길 때만 컬럼 설정 창에 나온다(ERP 통합 DB 관리 전용). */
  tierExpose?: ComponentProps<typeof ColumnToggleModal>["tierExpose"];
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
  /**
   * 사용자별 "숨긴 컬럼" 목록(서버 저장 연동). 소비 앱이 서버에서 불러와 넣어준다.
   * - undefined(기본): 기존 동작(브라우저 localStorage 의 '보일 컬럼' 집합). 하위호환 — 기존 소비처 무손상.
   * - null: 서버에서 불러오는 중(아직 미도착) — 그동안 localStorage 로 즉시 표시(깜빡임 방지).
   * - string[]: 이 사용자가 직접 숨긴 컬럼 키. **보일 컬럼 = 넘어온 columns(=관리자 ON 컬럼) − 이 목록.**
   * 제공되면(=undefined 아님) 표·모달이 "서버 사용자 설정" 모드로 동작한다:
   *   · 관리자가 새로/다시 켠 컬럼은 이 목록에 없으니 기본 표시,
   *   · 사용자가 한번 숨기면 이 목록에 남아 계속 숨김(sticky),
   *   · '컬럼 설정' 버튼이 정렬 버튼 왼쪽에 모든 사용자에게 표시된다.
   */
  hiddenColumns?: string[] | null;
  /** 컬럼 설정 모달/헤더에서 칸을 켜고 끌 때 호출(서버 모드). nextVisible=이제 보일지 여부. 소비 앱이 서버 저장+상태 갱신. */
  onToggleColumnVisibility?: (key: string, nextVisible: boolean) => void;
  // ── 저장 방식(저장 눌러야 반영) — 옵트인 (선택) ──
  // requireSave=true 면 컬럼 설정 창이 "저장 눌러야 반영"으로 동작한다(체크/순서 초안 → 저장 1회 커밋,
  // 취소/닫기 시 원복). 창 안에 표시 순서 ▲▼ 목록이 뜬다.
  // 표 머리글 드래그 순서변경은 별개로 계속 동작한다(드래그=즉시 저장, 창=저장 버튼 — 2026-07-16 사장님 결정).
  //   충돌 없음: 창이 화면 전체를 덮어(백드롭) 열린 동안 머리글 드래그가 불가능 → 초안이 낡아질 틈이 없다.
  // 미지정(기본 false)이면 기존과 100% 동일(체크 즉시 반영).
  requireSave?: boolean;
  // 저장 방식 커밋 콜백(서버 모드). 저장 클릭 시 { visibleKeys(표시·순서대로), order(전체 순서) }를 1회 원자 저장.
  // 서버 모드(hiddenColumns 제공)에서 저장 방식을 쓰려면 반드시 제공(앱이 자기 저장 모델로 원자 커밋).
  // 로컬 모드(hiddenColumns 미제공)면 미제공 시 CollabTable 이 localStorage 로 배치 저장한다.
  onCommitColumns?: (next: { visibleKeys: string[]; order: string[] }) => void;
  /** 주면 "묶음 모드": 이 키(예 "_id")로 줄을 회사로 묶어 건수·페이지·정렬을 회사 단위로 한다. 미지정=현행 동일. */
  rowGroupKey?: string;
  /** 묶음 모드에서 회사의 2번째 이후 줄에 화면상 비울 칸 키들(상호명·대표 등). 미지정이면 안 비움. */
  groupSharedKeys?: string[];
};

const EMPTY_CONTINUATION: Set<string> = new Set();

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
  // 옵션 구조 편집(색상·삭제) — 단일선택(CellSelectEditor→SelectDropdownBody)과 동일한 콜백·게이팅
  const [colorPickerOpt, setColorPickerOpt] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const [, forceRerender] = useState(0);

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
    // 같은 세션에서 지웠던 이름을 다시 추가하면 목록에 다시 보이게 removed 해제
    setRemoved((prev) => {
      if (!prev.has(name)) return prev;
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setSelected((prev) => new Set([...prev, name]));
    setNewOptInput("");
    setAddingNew(false);
  };

  const canSetColor = !!cfg?.onSetColor && !!cfg?.colorFamilies && cfg.colorFamilies.length > 0;
  const canDelete = !!cfg?.allowDelete && !!cfg?.onDeleteOption;
  // colorFamilies 런타임 실형태는 단일선택(SelectDropdownBody)과 같은 {name, shades[]} —
  // CellSelectEditor 의 캐스트와 동일하게 맞춘다(선언 타입 {name, classes} 는 소비 앱들이 as never 로 전달 중).
  const families = (cfg?.colorFamilies ?? []) as unknown as Array<{
    name: string;
    shades: Array<{ shade: string; bg: string; text: string; bgHex: string }>;
  }>;

  const handleSetColor = (opt: string, color: { bg: string; text: string }) => {
    cfg?.onSetColor?.(columnKey, opt, color as unknown as string);
    // 표시 저장소 동기화는 새로고침 시점 — 편집기 안에서는 로컬 덮어쓰기로 즉시 반영
    setColorOverrides((prev) => ({ ...prev, [opt]: `${color.bg} ${color.text}` }));
    setColorPickerOpt(null);
    forceRerender((n) => n + 1);
  };

  const handleDeleteOption = (opt: string) => {
    cfg?.onDeleteOption?.(columnKey, opt);
    // 목록에서 지우고, 선택돼 있었다면 선택도 해제(저장 시 지운 옵션이 되살아나지 않게)
    setRemoved((prev) => new Set([...prev, opt]));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(opt);
      return next;
    });
    setColorPickerOpt(null);
  };

  // 옵션 목록: cfg.getOptions 로 최신 상태 반영 + 방금 지운 옵션 제외
  const liveOptions = (cfg?.getOptions?.(columnKey) ?? options).filter((o) => !removed.has(o));

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
              const colorClass = colorOverrides[opt] ?? cfg?.getColorClass?.(columnKey, opt) ?? "bg-wedly-bg-gray text-wedly-t2";
              const isPickerOpen = colorPickerOpt === opt;
              return (
                <div key={opt} className="relative">
                  <div className="flex w-full items-center gap-1 px-3 py-1.5 hover:bg-wedly-bg-blue/40 transition-colors">
                    <button
                      type="button"
                      onClick={() => toggle(opt)}
                      className="flex flex-1 items-center gap-2 text-left min-w-0"
                    >
                      <span className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors",
                        isOn ? "border-wedly-accent bg-wedly-accent text-white" : "border-wedly-bd bg-white",
                      )}>
                        {isOn && "✓"}
                      </span>
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[12px] font-medium truncate", colorClass)}>
                        {opt}
                      </span>
                    </button>
                    {canSetColor && (
                      <button
                        type="button"
                        className="w-6 h-6 rounded-md inline-flex items-center justify-center text-wedly-muted hover:bg-wedly-bg-blue/40 hover:text-wedly-accent transition flex-shrink-0"
                        title="색상 변경"
                        onClick={(e) => { e.stopPropagation(); setColorPickerOpt(isPickerOpen ? null : opt); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="5.5" cy="6.5" r="1" fill="currentColor" />
                          <circle cx="10.5" cy="6.5" r="1" fill="currentColor" />
                          <circle cx="8" cy="10.5" r="1" fill="currentColor" />
                        </svg>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className="w-6 h-6 rounded-md inline-flex items-center justify-center text-wedly-muted hover:bg-wedly-bg-red/40 hover:text-wedly-red transition flex-shrink-0"
                        title="옵션 삭제"
                        onClick={(e) => { e.stopPropagation(); handleDeleteOption(opt); }}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {isPickerOpen && canSetColor && (
                    <div className="px-3 pb-2 pt-1.5 bg-wedly-bg-gray/50 border-t border-wedly-bd/40 space-y-1">
                      {families.map((family) => (
                        <div key={family.name} className="flex items-center gap-1.5">
                          <span className="text-[10px] text-wedly-muted w-7 shrink-0">{family.name}</span>
                          <div className="flex gap-1">
                            {family.shades.map((s) => (
                              <button
                                key={s.shade}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleSetColor(opt, { bg: s.bg, text: s.text }); }}
                                className="w-5 h-5 rounded-full border border-wedly-bd hover:scale-110 transition-transform"
                                title={`${family.name} · ${s.shade}`}
                                style={{ backgroundColor: s.bgHex }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
  onRowHover,
  onRefresh,
  canCreate = false,
  onCreateNew: onCreateNewProp,
  menusForAll,
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
  serverColumnOrder,
  onColumnOrderChange,
  serverColWidths,
  onColWidthsChange,
  columnArrangeShared,
  onCellEdit,
  editConfig,
  columnAdmin,
  columnGrouping,
  tierExpose,
  ensureVisibleKeys,
  headerSlot,
  sort: sortProp,
  onSortChange,
  hiddenColumns,
  onToggleColumnVisibility,
  requireSave = false,
  onCommitColumns,
  rowGroupKey,
  groupSharedKeys,
}: CollabTableProps) {
  // 서버 사용자 설정 모드 — hiddenColumns 가 주어지면(=undefined 아님) 켜진다.
  // 보일 컬럼 = columns(관리자 ON) − hiddenColumns. 새 컬럼 기본표시·한번 숨기면 계속 숨김(sticky).
  const serverColMode = hiddenColumns !== undefined;
  const serverHiddenLoaded = serverColMode && hiddenColumns !== null; // 서버값 도착 여부
  const serverHiddenSet = useMemo(() => new Set(hiddenColumns ?? []), [hiddenColumns]);
  const VISIBLE_COLS_KEY = `${storagePrefix}:visible-cols`;
  const COL_WIDTHS_KEY = `${storagePrefix}:col-widths`;
  const COL_ORDER_KEY = `${storagePrefix}:col-order`;
  const COL_LABELS_KEY = `${storagePrefix}:col-labels`;
  const ACTIVE_TAB_KEY = `${storagePrefix}:active-tab`;
  // 검색어는 브라우저 탭(session) 단위로만 유지: 새로고침엔 남고, 탭 종료 시 사라짐.
  const SESSION_SEARCH_KEY = `${storagePrefix}:session-search`;

  // 표 상태
  const [searchInput, setSearchInput] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return sessionStorage.getItem(SESSION_SEARCH_KEY) || ""; } catch { return ""; }
  });
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return (sessionStorage.getItem(SESSION_SEARCH_KEY) || "").trim().toLowerCase(); } catch { return ""; }
  });
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
    // 공용 너비 모드(NO.128): 관리자가 정한 너비가 정본. 아직 도착 전이면 지난번 받아둔 값을 잠깐 쓴다(깜빡임 방지).
    if (onColWidthsChange) {
      const cached = serverColWidths && Object.keys(serverColWidths).length
        ? serverColWidths
        : loadJson<Record<string, number>>(COL_WIDTHS_KEY, {});
      return { ...defaults, ...cached };
    }
    return { ...defaults, ...loadJson<Record<string, number>>(COL_WIDTHS_KEY, {}) };
  });
  const [colOrder, setColOrder] = useState<string[]>(() => {
    const saved = loadJson<string[]>(COL_ORDER_KEY, []);
    // 공용(탭별) 모드: 개인 localStorage 순서 무시 — 탭마다 serverColumnOrder(없으면 앱 기본)만 따른다(탭 간 누수 방지).
    if (columnArrangeShared) {
      return serverColumnOrder && serverColumnOrder.length ? serverColumnOrder : (defaultColumnOrder ?? []);
    }
    // 관리자(서버) 순서 > 개인(브라우저) 순서 > 앱 기본 순서.
    return resolveInitialColumnOrder(serverColumnOrder, saved, defaultColumnOrder);
  });
  // 보임/숨김 변경 권한 — 공용 모드면 관리자만, 아니면 현행(전원).
  const canEditColumnVisibility = !columnArrangeShared || isAdmin;
  const [colLabelOverrides, setColLabelOverrides] = useState<Record<string, string>>(() =>
    loadJson<Record<string, string>>(COL_LABELS_KEY, {}),
  );

  // 서버(관리자) 칸 순서가 나중에 도착/변경되면 그 순서로 맞춘다 — 관리자 배치가 모든 사용자 화면에 적용.
  // 빈 값이면(관리자 미설정) 건드리지 않아 개인/기본 순서가 유지된다. 같은 순서면 재설정하지 않는다(불필요 렌더 방지).
  useEffect(() => {
    if (!Array.isArray(serverColumnOrder) || serverColumnOrder.length === 0) return;
    setColOrder((prev) =>
      prev.length === serverColumnOrder.length && prev.every((k, i) => k === serverColumnOrder[i])
        ? prev
        : serverColumnOrder,
    );
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(serverColumnOrder)); } catch {}
  }, [serverColumnOrder, COL_ORDER_KEY]);

  // 관리자가 정한 공용 너비가 도착/변경되면 그 너비로 맞춘다 (NO.128).
  // 값이 같으면 그대로 두어 불필요한 다시 그리기를 막는다. 빈 값이면(관리자 미설정) 건드리지 않는다.
  useEffect(() => {
    if (!onColWidthsChange) return;
    if (!serverColWidths || Object.keys(serverColWidths).length === 0) return;
    setColWidths((prev) => {
      let same = true;
      for (const [k, v] of Object.entries(serverColWidths)) {
        if (prev[k] !== v) { same = false; break; }
      }
      return same ? prev : { ...prev, ...serverColWidths };
    });
    try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(serverColWidths)); } catch { /* ignore */ }
  }, [serverColWidths, onColWidthsChange, COL_WIDTHS_KEY]);

  // 새로 추가한 칸을 표에 바로 보이게 — 부모가 ensureVisibleKeys 로 알려준 키만 보임 처리(기존 숨김 설정은 건드리지 않음).
  useEffect(() => {
    if (serverColMode) return; // 서버 모드: 새 컬럼은 숨김목록에 없어 이미 기본 표시 — 강제 불필요
    if (!ensureVisibleKeys || ensureVisibleKeys.length === 0) return;
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      ensureVisibleKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [ensureVisibleKeys, serverColMode]);

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

  // 검색어를 브라우저 탭(session)에 기록 → 같은 탭 새로고침 시 유지, 탭 종료 시 삭제.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_SEARCH_KEY, searchInput); } catch {}
  }, [SESSION_SEARCH_KEY, searchInput]);

  const orderedColumns = useMemo(() => orderColumns(columns, colOrder), [columns, colOrder]);
  // 서버 모드(값 도착)면: 보일 컬럼 = 전체 − 숨김목록. 그 외(로딩중·기존 모드)면: 저장된 '보일 컬럼' 집합.
  const activeColumns = useMemo(
    () => serverHiddenLoaded
      ? orderedColumns.filter((c) => !serverHiddenSet.has(c.key))
      : orderedColumns.filter((c) => visibleColumns.has(c.key)),
    [serverHiddenLoaded, serverHiddenSet, orderedColumns, visibleColumns],
  );
  const stickyOffsets = useMemo(() => computeStickyOffsets(activeColumns, colWidths), [activeColumns, colWidths]);

  // 서버 숨김목록이 도착/변경되면 localStorage '보일 컬럼'도 맞춰 둔다(다음 로딩 즉시표시·일관성용).
  useEffect(() => {
    if (!serverHiddenLoaded) return;
    const next = new Set(orderedColumns.filter((c) => !serverHiddenSet.has(c.key)).map((c) => c.key));
    setVisibleColumns(next);
    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify([...next])); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverHiddenLoaded, serverHiddenSet, orderedColumns]);

  const activeTab = useMemo(
    () => (tabs && tabs.length ? tabs.find((t) => t.id === activeTabId) ?? null : null),
    [tabs, activeTabId],
  );
  const tabbedRows = useMemo(() => filterRowsByTab(rows, activeTab), [rows, activeTab]);
  const searchedRows = useMemo(() => filterRowsBySearch(tabbedRows, debouncedSearch), [tabbedRows, debouncedSearch]);
  const sortedRows = useMemo(() => sortRows(searchedRows, sortConfig), [searchedRows, sortConfig]);
  const totalPages = useMemo(() => totalPageCount(sortedRows.length, pageSize), [sortedRows.length, pageSize]);
  const pagedData = useMemo(() => paginate(sortedRows, currentPage, pageSize), [sortedRows, currentPage, pageSize]);

  // 묶음 모드: rowGroupKey 가 오면 회사 단위로 정렬·페이지·건수·연속줄키를 계산(순수 함수). 미전달=현행 동일.
  const grouped = useMemo<GroupedArrangement | null>(
    () => (rowGroupKey
      ? arrangeGroupedRows(searchedRows, { groupKey: rowGroupKey, sortConfig, currentPage, pageSize })
      : null),
    [rowGroupKey, searchedRows, sortConfig, currentPage, pageSize],
  );
  const effTotalPages = grouped ? grouped.totalPages : totalPages;
  const effPagedData = grouped ? grouped.pagedRows : pagedData;
  const effTotalRows = grouped ? grouped.totalUnits : sortedRows.length;
  const continuationKeys = grouped ? grouped.continuationKeys : EMPTY_CONTINUATION;

  // 관리자 도구모음 활성 여부 — isAdmin 이고 adminToolbar 가 주어질 때만.
  const adminEnabled = isAdmin && !!adminToolbar;
  // 전 직원용 축약 메뉴 — 관리자가 아닐 때만 쓴다(관리자는 전체 메뉴에 이미 같은 항목이 들어 있음).
  const publicMenus = useMemo(() => (adminEnabled ? [] : (menusForAll ?? [])), [adminEnabled, menusForAll]);
  const settingsVisible = adminEnabled || publicMenus.length > 0;

  // 편집 가능 종류(기본) — formula·last_edited_time·last_edited_by·auto_increment_id·file·person 은 편집 안 함.
  const DEFAULT_EDITABLE_TYPES = useMemo(() => new Set<ColumnDef["type"]>([
    "text", "title", "email", "phone_number", "number", "percent", "date", "datetime", "select", "status", "checkbox", "multi_select",
  ]), []);

  const isCellEditable = useCallback((col: ColumnDef) => {
    // 셀 값 편집 = 저장 핸들러(onCellEdit)가 연결된 앱에서 허용 — 관리자 전용 아님.
    // 서버 정책이 "행을 볼 수 있으면 값 수정 가능"이라, 보이는 행의 값은 일반 사용자도 고칠 수 있다.
    // (옵션 추가/삭제·색상 등 구조 편집은 그대로 editConfig=관리자에서만 제공)
    if (!onCellEdit) return false;
    if (editConfig?.isEditable) return editConfig.isEditable(col);
    return DEFAULT_EDITABLE_TYPES.has(col.type);
  }, [onCellEdit, editConfig, DEFAULT_EDITABLE_TYPES]);

  // 차수별로 펼친 줄은 같은 회사(_id)가 여러 줄이므로, 일괄 작업·다운로드 대상은 회사당 하나만 남긴다.
  // (안 펼친 표는 _id 가 원래 하나뿐이라 아무 영향 없음.)
  const pickCheckedOnce = useCallback(
    (src: RowData[]) => {
      const seen = new Set<string>();
      const out: RowData[] = [];
      for (const r of src) {
        const rid = String(r[rowIdKey] ?? "");
        if (!checkedIds.has(rid) || seen.has(rid)) continue;
        seen.add(rid);
        out.push(r);
      }
      return out;
    },
    [checkedIds, rowIdKey],
  );
  // 선택된 행들(관리자 일괄 작업 콜백에 넘김)
  const checkedRows = useMemo(
    () => (adminEnabled ? pickCheckedOnce(sortedRows) : []),
    [adminEnabled, sortedRows, pickCheckedOnce],
  );
  // 다운로드용 — 검색으로 화면에서 가려진 선택 행도 포함(체크한 건 전부 내보낸다).
  // rows = 현재 탭 전체(검색 필터 전). checkedIds 는 rows 에 없는 id 를 자동 정리하므로 length === checkedIds.size.
  const checkedRowsForDownload = useMemo(
    () => (adminEnabled ? pickCheckedOnce(rows) : []),
    [adminEnabled, rows, pickCheckedOnce],
  );
  // 관리 도구 메뉴 — "컬럼 표시 설정" 항목의 onClick 을 표 내부 컬럼 모달로 연결(없으면 자동 추가).
  const colSettingsMenuId = adminToolbar?.columnSettingsMenuId ?? "column-toggle";
  const excelDownloadMenuId = adminToolbar?.excelDownloadMenuId ?? "excel-download";
  const onBulkDownload = adminToolbar?.onBulkDownload;
  const wiredSettingsMenus = useMemo<SettingsMenuItem[]>(() => {
    const base = adminToolbar?.settingsBaseMenus ?? [];
    let hasColItem = false;
    const mapped = base.map((m) => {
      if (m.id === colSettingsMenuId) {
        hasColItem = true;
        return { ...m, onClick: () => setColumnModalOpen(true) };
      }
      // "엑셀 다운로드"는 일괄수정·삭제와 똑같이 체크한 행만 넘긴다(선택 없으면 빈 배열 → 부모가 전체로 폴백).
      // 선택이 있으면 라벨에 개수를 붙여 미리 보이게 한다("선택 N건" — 다른 표 페이지의 다운로드 버튼과 같은 취지).
      if (onBulkDownload && m.id === excelDownloadMenuId) {
        const n = checkedRowsForDownload.length;
        return { ...m, label: n > 0 ? `${m.label} (선택 ${n}건)` : m.label, onClick: () => onBulkDownload(checkedRowsForDownload) };
      }
      return m;
    });
    if (!hasColItem) {
      mapped.push({ id: colSettingsMenuId, label: "컬럼 표시 설정", icon: "👁️", onClick: () => setColumnModalOpen(true) });
    }
    return mapped;
  }, [adminToolbar?.settingsBaseMenus, colSettingsMenuId, excelDownloadMenuId, onBulkDownload, checkedRowsForDownload]);

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
    // 차수별로 펼친 줄은 같은 회사(_id)를 공유하므로 "전체 선택된 상태"의 기준을 줄 수가 아니라
    // 서로 다른 회사 수로 잰다(안 그러면 전체선택 해제가 안 눌린다).
    const idsOnPage = new Set(effPagedData.map((r) => String(r[rowIdKey] ?? "")));
    setCheckedIds((prev) => (prev.size === idsOnPage.size ? new Set() : idsOnPage));
  }, [effPagedData, rowIdKey]);
  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const isColumnVisible = useCallback(
    (key: string) => serverHiddenLoaded ? !serverHiddenSet.has(key) : visibleColumns.has(key),
    [serverHiddenLoaded, serverHiddenSet, visibleColumns],
  );
  const toggleColumn = useCallback((key: string) => {
    if (serverColMode) {
      // 서버 모드: 숨김목록에 있으면 이제 보임, 없으면 숨김. 저장은 소비 앱이 서버에.
      const nextVisible = serverHiddenSet.has(key);
      onToggleColumnVisibility?.(key, nextVisible);
      columnGrouping?.onToggleColumn?.(key, nextVisible);
      return;
    }
    const nextVisible = !visibleColumns.has(key);
    setVisibleColumns((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      persistVisible(n);
      return n;
    });
    columnGrouping?.onToggleColumn?.(key, nextVisible);
  }, [serverColMode, serverHiddenSet, onToggleColumnVisibility, visibleColumns, persistVisible, columnGrouping]);
  // 표 머리 메뉴의 '이 칸 숨기기' — 서버 모드면 숨김목록에 추가(서버 저장), 아니면 기존 localStorage.
  const removeColFromTab = useCallback((key: string) => {
    if (serverColMode) {
      onToggleColumnVisibility?.(key, false);
      return;
    }
    setVisibleColumns((prev) => {
      const n = new Set(prev);
      n.delete(key);
      persistVisible(n);
      return n;
    });
  }, [serverColMode, onToggleColumnVisibility, persistVisible]);

  const saveColLabel = useCallback((key: string, label: string) => {
    setColLabelOverrides((prev) => {
      const next = { ...prev };
      if (label.trim()) next[key] = label.trim(); else delete next[key];
      try { localStorage.setItem(COL_LABELS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [COL_LABELS_KEY]);

  const reorderColumn = useCallback((fromKey: string, toKey: string) => {
    // 서버 순서 모드(onColumnOrderChange 제공): 칸 순서는 관리자만 바꾼다(모두에게 적용되는 공용 설정).
    // 비관리자의 드래그는 무시 — 관리자가 정한 순서가 권위.
    if (onColumnOrderChange && !isAdmin) return;
    // 화면에 실제로 보이는 전체 순서를 기준으로 옮긴다.
    // 저장된 순서(colOrder)에 아직 없던 칸(나중에 추가됐거나 기본 숨김이라 뒤에 붙은 칸,
    // 예: "DB 담당")도 끌 수 있도록 orderColumns 로 합친 전체 순서를 기준으로 삼는다.
    // (이전엔 base=colOrder 라, 저장된 순서에 없는 칸은 reorderList 가 무시해 드래그가 먹지 않았음.)
    const base = orderColumns(columns, colOrder).map((c) => c.key);
    const next = reorderList(base, fromKey, toKey);
    setColOrder(next);
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next)); } catch {}
    // 서버 순서 모드면 부모에게 통지 → 부모가 관리자 전용으로 서버 저장(모든 사용자에게 전파).
    onColumnOrderChange?.(next);
  }, [colOrder, columns, COL_ORDER_KEY, onColumnOrderChange, isAdmin]);

  // 저장 방식(requireSave) 커밋 — 창에서 '저장' 클릭 시 표시집합+순서를 1회 반영.
  const handleModalCommit = useCallback((next: { visibleKeys: string[]; order: string[] }) => {
    if (serverColMode) {
      // 서버 모드: 앱이 자기 저장 모델로 원자 커밋(순서·숨김 서버 저장 + 낙관적 상태 갱신).
      onCommitColumns?.(next);
      return;
    }
    // 로컬 모드: localStorage 배치 저장(순서 + 표시집합 한 번에).
    setColOrder(next.order);
    try { localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next.order)); } catch {}
    const vis = new Set(next.visibleKeys);
    setVisibleColumns(vis);
    persistVisible(vis);
  }, [serverColMode, onCommitColumns, COL_ORDER_KEY, persistVisible]);

  const setColWidthsAndStore = useCallback((updater: (p: Record<string, number>) => Record<string, number>, changedKey?: string) => {
    setColWidths((p) => {
      const next = updater(p);
      // 공용 너비 모드(NO.128): 관리자가 바꾼 값만 저장해 전 직원 기준이 된다.
      // 일반 사용자는 화면에만 남는다 — 새로고침·재접속하면 관리자 너비로 돌아온다.
      if (onColWidthsChange && !isAdmin) return next;
      try { localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(next)); } catch {}
      onColWidthsChange?.(changedKey ? { [changedKey]: next[changedKey] } : next);
      return next;
    });
  }, [COL_WIDTHS_KEY, onColWidthsChange, isAdmin]);
  // 가이드선 방식(공용 부품) — 드래그 중 화면 재렌더 0, 손 뗄 때 너비 1회 확정.
  // resizingRef는 드래그 중 칸 순서 끌기를 막는 용도(참/거짓만 본다).
  const onResizeStart = useCallback((e: React.PointerEvent, colKey: string) => {
    resizingRef.current = { key: colKey };
    // 시작폭 = 지금 화면에 보이는 실제 칸 폭(늘어난 값 포함)을 측정 → 드래그가 잡은 만큼 1:1.
    // (고정 120 가정 시, table-layout:fixed+minWidth:100%로 늘어난 실제 폭과 어긋나 확 튐)
    const cell = document.querySelector(`[data-col="${colKey}"]`) as HTMLElement | null;
    const startWidth = (cell ? Math.round(cell.getBoundingClientRect().width) : 0) || colWidths[colKey] || 100;
    startColumnResize({
      event: e,
      startWidth,
      onCommit: (finalW) => {
        resizingRef.current = null;
        setColWidthsAndStore((p) => ({ ...p, [colKey]: finalW }), colKey);
      },
    });
  }, [colWidths, setColWidthsAndStore]);
  // 더블클릭 = 그 칸의 값 중 가장 긴 것에 맞춰 자동 폭(잘려도 scrollWidth로 전체 폭 측정, 여백+32, 최대 500).
  const onResizeDoubleClick = useCallback((colKey: string) => {
    const cells = document.querySelectorAll(`[data-col="${colKey}"]`);
    let maxW = 60;
    cells.forEach((c) => { const w = (c as HTMLElement).scrollWidth + 32; if (w > maxW) maxW = w; });
    setColWidthsAndStore((p) => ({ ...p, [colKey]: Math.min(maxW, 500) }), colKey);
  }, [setColWidthsAndStore]);

  // 모바일 카드 설정
  const titleCol = useMemo(() => columns.find((c) => c.type === "title"), [columns]);
  const mobileTitleKey = mobile?.titleKey ?? titleCol?.key ?? columns[0]?.key ?? "";
  const mobileStatusClass = mobile?.getStatusClass ?? (() => "bg-wedly-bg-gray text-wedly-t2");

  // 행 그리기 — 하이브 표 행과 동일 스타일(글자 13px·여백 px-4·한 줄 말줄임·hover 파란빛).
  // 제목 칸 = 밑줄 링크 + ↗아이콘 + 댓글수 버튼, 편집 가능 칸은 클릭 시 인라인 편집기 열림.
  const renderRow = useCallback((row: RowData, virtualIndex: number) => {
    const id = String(row[rowIdKey] ?? "");
    // 그리기·편집중 판정용 키 — 차수별로 펼친 줄은 _id 를 공유하므로 _rowKey 가 있으면 그것을 쓴다.
    // (없으면 지금과 동일하게 _id. 선택·체크박스는 회사 단위 유지가 맞으므로 계속 id 를 쓴다.)
    const renderKey = String((row as Record<string, unknown>)._rowKey ?? id ?? virtualIndex);
    const commentCount = typeof row._commentCount === "number" ? (row._commentCount as number) : 0;
    return (
      <tr
        key={renderKey || virtualIndex}
        onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
        className={composeRowClassName(
          "border-t border-wedly-bd/60 hover:bg-wedly-bg-blue/30",
          checkedIds.has(id),
          "bg-wedly-bg-blue/30",
          getRowColorClass?.(row),
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
          // 묶음 모드: 회사의 2번째 이후 줄(연속줄)에서 식별칸(상호명·대표 등)은 화면상 비운다.
          const blankShared =
            groupSharedKeys != null &&
            continuationKeys.has(renderKey) &&
            groupSharedKeys.includes(col.key);
          const v = (blankShared ? null : (row[col.key] ?? null)) as CellValue;
          const editable = isCellEditable(col);
          const isEditingThis = editingCell?.id === renderKey && editingCell?.key === col.key;
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
                ? () => setEditingCell({ id: renderKey, key: col.key })
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
                      onClick={(e) => { e.stopPropagation(); setEditingCell({ id: renderKey, key: col.key }); }}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-wedly-muted hover:text-wedly-accent hover:bg-wedly-bg-blue transition-colors"
                      title="상호명 수정"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenRow(row, "history"); }}
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
                ) : col.type === "number" || col.type === "percent" ? (
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
  }, [activeColumns, checkedIds, toggleCheck, stickyOffsets, rowIdKey, onOpenRow, onRowHover, renderFieldValue, getRowColorClass, editingCell, isCellEditable, onCellEdit, editConfig, continuationKeys, groupSharedKeys]);

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
        showSettings={settingsVisible}
        settingsBaseMenus={adminEnabled ? wiredSettingsMenus : publicMenus}
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
        totalPages={effTotalPages}
        totalRows={effTotalRows}
        showPageBox={true}
        trailingControls={
          <>
            {/* 컬럼 설정 — 서버 모드 + 변경 권한 있을 때 정렬 버튼 왼쪽에 표시(공용 모드면 관리자만). */}
            {serverColMode && canEditColumnVisibility && (
              <button
                type="button"
                onClick={() => setColumnModalOpen(true)}
                title="표에 보일 컬럼 선택"
                className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2.5 py-1.5 text-[12px] font-medium text-wedly-t2 hover:bg-wedly-bg-gray transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M2.5 2.5h11v11h-11zM6.5 2.5v11M10 2.5v11" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                컬럼 설정
              </button>
            )}
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

      {/* 서버 모드면 '컬럼 설정' 버튼이 위 컨트롤 줄(정렬 왼쪽)에 모든 사용자에게 떠서, 이 비관리자 전용 버튼은 숨긴다(중복 방지). */}
      {!adminEnabled && !serverColMode && (
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
        pagedData={effPagedData}
        sortedDataLength={sortedRows.length}
        mobileCardFields={mobile?.cardFields ?? []}
        allColumns={columns}
        openRow={(row, panel) => onOpenRow(row, panel)}
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
        pagedData={effPagedData}
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
        canReorderColumns={!(onColumnOrderChange && !isAdmin)}
        canHideColumn={canEditColumnVisibility}
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
        requireSave={requireSave}
        orderedKeys={orderedColumns.map((c) => c.key)}
        onCommit={handleModalCommit}
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
        commonLabelByKey={columnGrouping?.commonLabelByKey}
        onPromoteToCommon={columnGrouping?.onPromoteToCommon}
        onDemoteFromCommon={columnGrouping?.onDemoteFromCommon}
        canDemoteFromCommon={columnGrouping?.canDemoteFromCommon}
        deletedColumns={columnGrouping?.deletedColumns}
        onRestoreColumn={columnGrouping?.onRestoreColumn}
        isDeletable={columnGrouping?.isDeletable}
        tierExpose={tierExpose}
      />
    </div>
  );
}
