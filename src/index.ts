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

// 타입
export type { ColumnDef, FormulaSpec } from "./types/columns";

// 차수 카드(계약·정산·환불) 공용 로직 — 타입·계산기·파서 (모듈화 단계 13)
// DEFAULT_FIELDS / DEFAULT_SCORECARDS 같은 도메인 기본값은 각 앱 _components/ 에 유지.
export * from "./tiered";

// 부품 — 메인 페이지 영역
export { ColumnToggleModal } from "./components/ColumnToggleModal";
export type { ColumnToggleColumn } from "./components/ColumnToggleModal";

export { SettingsDropdown } from "./components/SettingsDropdown";
export type { SettingsMenuItem, SettingsCustomItem } from "./components/SettingsDropdown";

export { MobileCardList } from "./components/MobileCardList";

export { DesktopTable } from "./components/DesktopTable";

export { TopControls } from "./components/TopControls";

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

// 통합 보기 공용 로직 — 묶음·탭 계산, 탭 순서·이름 적용, 앱별 설정 틀 (순수 함수/타입)
export * from "./unified";

export const __MODULE_VERSION__ = "0.19.0";
