// @wedly/ui-shared — WEDLY 공용 화면 부품 보관함 (하이브·일루아·ERP 공유)
//
// 사용 앱은 자체 위들리 디자인 토큰(bg-wedly-accent 등)을 globals.css 에 정의해야 합니다.
//
// 도메인 분리 원칙:
//   - 보관함은 타입(ColumnDef, FormulaSpec)과 도구 함수(formatDate, getOptionColorClass 등)만 보유
//   - 도메인 데이터(STATUS_COLORS, COLUMNS, FIELD_OPTIONS 등)는 각 앱 _components/에 정의
//   - 부품은 도메인 데이터를 props 로 받음 (statusKey, getStatusClass, titleKey 등)

// 도우미
export { cn } from "./lib/cn";
export * from "./lib/utils";
export * from "./lib/options";
export { pickCommonColumns } from "./lib/column-common-classify";
export { selfHostedFileUrl, selfHostedFileUrlFrom } from "./lib/self-hosted-file-url";

// M2: 공통/앱별 칸 전역 설정 읽기·쓰기 도우미 (관리자 설정 화면 → 각 앱 /api/common-fields 로 연결)
export {
  getCachedCommonOverride,
  fetchCommonFieldsOverride,
  refreshCommonFieldsOverride,
  saveCommonFieldsOverride,
} from "./lib/common-fields-store";

// 앱별 칸 숨김(관리자 설정) 읽기·쓰기 도우미 (각 앱 /api/column-visibility 로 연결)
// subscribeHiddenBasicColumns: 설정 변경을 구독 → 표·상세창이 새로고침 없이 즉시 반영
export {
  getCachedHiddenBasicColumns,
  fetchHiddenBasicColumns,
  refreshHiddenBasicColumns,
  saveHiddenBasicColumns,
  subscribeHiddenBasicColumns,
} from "./lib/column-visibility-store";

// 타입
export type { ColumnDef, FormulaSpec } from "./types/columns";

// 차수 카드(계약·정산·환불) 공용 로직 — 타입·계산기·파서 (모듈화 단계 13)
// DEFAULT_FIELDS / DEFAULT_SCORECARDS 같은 도메인 기본값은 각 앱 _components/ 에 유지.
export * from "./tiered";

// 부품 — 메인 페이지 영역
export { ColumnToggleModal, DEFAULT_COLUMN_TYPE_OPTIONS } from "./components/ColumnToggleModal";
export type { ColumnToggleColumn } from "./components/ColumnToggleModal";

export { SettingsDropdown } from "./components/SettingsDropdown";
export type { SettingsMenuItem, SettingsCustomItem } from "./components/SettingsDropdown";

export { MobileCardList } from "./components/MobileCardList";

export { DesktopTable } from "./components/DesktopTable";

export { TopControls } from "./components/TopControls";

export { MaximizableSection } from "./components/MaximizableSection";
export type { MaximizableApi } from "./components/MaximizableSection";
export { MaximizeButton } from "./components/MaximizeButton";

// 글자·숫자·날짜 입력기 — 표 셀과 상세 모달 양쪽이 같은 부품 사용
// (AGENTS.md §5-4 cell-detail-parity — 두 화면 100% 동일).
// 날짜 입력기는 onClose 가 있으면 표 셀용(portal), 없으면 상세 모달용(인라인).
// CellTextEditor/CellNumberEditor/CellDateEditor 는 같은 부품의 별칭.
export {
  TextEditor,
  NumberEditor,
  DateEditor,
  CellTextEditor,
  CellNumberEditor,
  CellDateEditor,
} from "./components/Editors";

// 공통 모달 — 일괄 수정, 자동 입력 규칙
export { default as BulkEditModal } from "./components/BulkEditModal";
export { default as AutoFillRulesModal } from "./components/AutoFillRulesModal";

// 상세 모달 안 어드민 메뉴 — 행 3점 메뉴, 섹션 ⚙️ 메뉴
export { FieldRowAdminMenu, SectionAdminMenu } from "./components/AdminMenus";

// 상세 모달 — 드래그로 컬럼 순서 바꾸는 섹션 본문 (renderRow 슬롯으로 본문 위임)
export { DraggableFieldsSection } from "./components/DraggableFieldsSection";
export type { OrderableField, DraggableFieldsSectionProps } from "./components/DraggableFieldsSection";

// 상세 모달 — 하위 섹션 추가/삭제 모달
export { SectionEditorAddModal, SectionEditorDeleteConfirm } from "./components/SectionEditorModal";
export type { SectionKind, SectionEditorAddPayload } from "./components/SectionEditorModal";

// 상세 모달 — 상위 패널 추가 모달 + 통합 관리 모달
export { PanelEditorAddModal, PanelManagerModal } from "./components/PanelEditorModal";
export type { PanelKind, PanelEditorAddPayload, CustomPanelItem } from "./components/PanelEditorModal";

// 통합 상세창 — 읽기전용 표시 부품 (값·행·섹션) — 하이브 상세창과 100% 동일한 시각
export {
  renderUnifiedFieldValue,
  UnifiedFieldDisplayRow,
  UnifiedDisplaySection,
} from "./components/UnifiedFieldDisplay";

// 통합 보기 공용 로직 — 묶음·탭 계산, 탭 순서·이름 적용, 앱별 설정 틀 (순수 함수/타입)
export * from "./unified";

export { CollabTable } from "./collab/CollabTable";
export type { CollabTableProps } from "./collab/CollabTable";
// 정렬 기준 패널(다중 AND 정렬) — ERP·하이브·일루아 첫 화면 공용
export { SortPanel } from "./collab/SortPanel";
export {
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
} from "./collab/collab-table-core";
export type { RowData, CellValue, SortConfig, SortRule } from "./collab/collab-table-core";
// 칸 폭 조절(리사이즈) 공용 부품 — 가이드선 방식(드래그 중 재렌더 0, 손 뗄 때 1회 확정)
export { startColumnResize, computeResizedWidth, computeGuideX } from "./collab/column-resize";
export type { StartColumnResizeOptions } from "./collab/column-resize";

// 상태별 필터 탭 — 순수 로직 + 표시 부품
export { matchesFilter, matchesTab, filterRowsByTab, passesTabFilters, isTabConditionActive, isExcludeTabCondition } from "./collab/collab-filters";
export type { FilterOperator, FilterCondition, ViewTab, TabFilterMatch, TabConditionLike } from "./collab/collab-filters";
export { FilterTabs } from "./collab/FilterTabs";
export type { FilterTabsProps, FilterTabsAdmin } from "./collab/FilterTabs";
// 노션식 다조건 필터 — 순수 엔진 + 필터 바 부품 + 항목 헬퍼
export { filterRowsByConditions, isConditionComplete, resolveDateWindow } from "./collab/collab-filters";
export type { DateWindow } from "./collab/collab-filters";
export { FilterBar } from "./collab/FilterBar";
export type { FilterBarProps, FilterField } from "./collab/FilterBar";
export {
  filterCategory, operatorsFor, defaultOperator, isValueNeeded,
  seedOperatorFor, itemsToDefaultColumns, resetItemValues, itemsToConditions, genItemId,
  reconcileItemsWithDefaultColumns, reorderItems,
} from "./collab/filter-items";
export type { FilterItem, FilterCategory, OperatorOption } from "./collab/filter-items";
// 공용 탭 편집창 — 이름 + 표시형식(표/캘린더) + 거르기 조건. 하이브 편집창과 같은 방식.
export { default as TabEditorModal } from "./collab/TabEditorModal";

// 색깔 딱지 셀 — 순수 판정(cellChips) + 표시 부품/렌더러(상태·분류 색상)
export { cellChips } from "./collab/collab-cell";
export type { CellColorMaps, CellChip, CellContent } from "./collab/collab-cell";
export { ColoredCell, createColoredFieldRenderer } from "./collab/CollabCell";

// 통합 협업 — 경정청구 뷰 프리셋(공용): 새 공용 컬럼 2개 + 하이브식 배치 + 배지색
export {
  TAX_AMENDMENT_EXTRA_COLUMNS,
  TAX_AMENDMENT_COLLAB_VISIBLE,
  TAX_AMENDMENT_COLLAB_COLORS,
} from "./collab/tax-amendment-collab-view";

// 공용 히스토리(상담기록) 패널 — 하이브·ERP·일루아 공유
export { HistoryPanel } from "./components/HistoryPanel";
export type { HistoryAdapter, HistoryFetchResult } from "./components/HistoryPanel";

// 분야(섹션)별 히스토리 래퍼 — 공용 보관함(secstore) 저장. 앱별 출처/작성자/업로드경로 주입.
export { default as SectionHistoryPanel } from "./components/SectionHistoryPanel";

// 업체 상세창 "맨 위 상호명" 공용 편집 부품 — 하이브·ERP·일루아 모든 상세 모달 공유 (클릭 → 그 자리 수정)
export { EditableTitle } from "./components/EditableTitle";

// M2: 관리자용 공통/앱별 칸 설정 화면 부품
export { CommonFieldsAdmin } from "./unified/CommonFieldsAdmin";

// 틀(레이아웃) — 사이드바 접힘 폭 변화 + 새로고침 유지 (ERP·하이브·일루아 공용)
export { resolveStoredCollapsed } from "./layout/sidebar-collapse-core";
export { useSidebarCollapse } from "./layout/useSidebarCollapse";
export type { SidebarCollapseState } from "./layout/useSidebarCollapse";
export { CollapsibleShell } from "./layout/CollapsibleShell";
export type { MainVariant, CollapsibleShellProps } from "./layout/CollapsibleShell";

// 기능요청·제안 패널 — 별도 앱(wedly-dev-request) 임베드 (ERP·하이브·일루아 공용).
// "요청 페이지" 링크는 고정 주소가 아니라 살아있는 현재 주소를 사용(로그인 창 문제 차단).
export { DevRequestPanel } from "./components/DevRequestPanel";
export type { DevRequestPanelProps } from "./components/DevRequestPanel";
export { buildDevRequestUrl } from "./components/dev-request-url";
export type { DevRequestUrlParams } from "./components/dev-request-url";

// ─── Phase 1B-2: ERP 통합상세창 공용화 ───────────────────────────────────────
// UnifiedDetailView + 어댑터 타입 + 유틸 — ERP 어댑터 주입 방식으로 앱 중립화
export { default as UnifiedDetailView } from "./unified-detail/UnifiedDetailView";
export type {
  UnifiedDetailAdapter,
  UnifiedDetailApi,
  SectionPanelProps,
  FieldOptionsBundle,
  BasicRecord,
  FileFieldDef,
  FileMetaLite,
  UnsavedBridge,
} from "./unified-detail/adapter-types";
export { saveFailureKindOf } from "./unified-detail/adapter-types";
export { FieldOptionsProvider, useFieldOptions } from "./unified-detail/field-options-context";
export type { CustomerDetailLite, DomainRowLite } from "./unified-detail/lib/customer-detail";
export type { DomainGroup } from "./unified-detail/lib/domain-config";
export { DOMAIN_GROUPS } from "./unified-detail/lib/domain-config";
export { useFieldOrder } from "./unified-detail/lib/use-field-order";
// 분야별 정산 차수 탭 래퍼(공용 부품에 ERP 경로 주입) — erp-adapter 가 adapter.components 로 주입.
export { default as SectionSettlementTab } from "./unified-detail/SectionSettlementTab";

export const __MODULE_VERSION__ = "0.41.0";
export * from "./tier-link/config";
export * from "./tier-link/sync";
export { default as ColumnTierLinksManager } from "./components/ColumnTierLinksManager";
export type { TierLinkAdapter, TierFieldDef } from "./components/ColumnTierLinksManager";
export { ExcelImportWizard } from "./components/ExcelImportWizard";
export type { ExcelImportWizardProps, MappingPreset, ImportResult } from "./components/ExcelImportWizard";
