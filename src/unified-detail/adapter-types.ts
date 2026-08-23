// 통합 상세창 앱 어댑터 인터페이스 — Phase 1A 키스톤.
// 각 앱(ERP·하이브·일루아)이 이 인터페이스를 구현해 UnifiedDetailView에 주입한다.
// 앱마다 달라지는 API 경로/형태를 어댑터로 격리하고, 공용 UI는 어댑터 메서드만 호출한다.

import type React from "react";
import type { CustomerDetailLite, DomainRowLite } from "./lib/customer-detail";
import type { ColumnDef } from "../types/columns";
import type { UnifiedComment } from "../unified/history-core";
import type { SelectDropdownColorFamily } from "@wedly/detail-modal-shared";

// ── FileFieldDef — 파일 탭 칸 정의 (erp-files-adapter.ts 에서 원본 가져와 로컬 정의) ──
// 원본: src/app/(erp)/_shared/erp-files-adapter.ts
export type FileFieldDef = { key: string; label: string };

/** 기본정보 통합 파일 칸(2개+더보기)이 쓰는 경량 파일 표현 — 앱별 getAllFiles 가 반환 */
// at = 첨부(업로드) 시각 ISO. 있으면 "가장 최근 첨부"를 미리보기 앞에 보이게 정렬하는 데 쓴다(옛 파일엔 없음).
export type FileMetaLite = { name: string; url: string; category?: string; at?: string };

// ── FieldOptionsBundle — editors.tsx 가 ERP 옵션/색 모듈에서 쓰던 심볼 모음 ──
// editors.tsx 는 이 번들을 FieldOptionsContext(React Context)를 통해 주입받고,
// ERP 직접 import 없이 fo.getFieldOptions(...) 같은 형식으로 사용한다.
export type FieldOptionsBundle = {
  /** 편집 불가능한 타입 집합 (Set<string>) */
  READONLY_TYPES: Set<string>;
  /** 칸 키 기준 기본+커스텀 옵션 목록 반환 */
  getFieldOptions: (fieldKey: string) => string[];
  /** 커스텀 옵션 추가 */
  addCustomOption: (fieldKey: string, optionName: string) => void;
  /** 커스텀 옵션 삭제 */
  removeCustomOption: (fieldKey: string, optionName: string) => void;
  /** 옵션 색상 설정 */
  setOptionColor: (optionName: string, color: { bg: string; text: string }) => void;
  /** 옵션 최종 색상 클래스 반환 */
  getOptionColorClass: (optionName: string, statusColors?: Record<string, string>, badgeColors?: Record<string, string>) => string;
  /** 옵션 색칠용 톤별 팔레트 */
  OPTION_COLOR_FAMILIES: SelectDropdownColorFamily[];
  /** 사전 정의된 색상 팔레트 */
  OPTION_COLOR_PALETTE: Array<{ name: string; bg: string; text: string; hex: string }>;
  /** 상태/진행상태별 배지 색상 */
  STATUS_COLORS: Record<string, string>;
  /** 선택형 칸 옵션 배지 색상 */
  SELECT_BADGE_COLORS: Record<string, string>;
  /** person 타입 칸의 읽기전용 여부 판정 */
  isReadonlyPerson: (col: Pick<ColumnDef, "type" | "key">) => boolean;
};

// ── BasicRecord — 기본정보 공용 보관함 레코드 타입 (basic-store-cache.ts 에서 올린 것과 동일 구조) ──
// 컴포넌트가 basic-store-cache 를 직접 import 하지 않고 어댑터 타입에서 받게 한다.
export type BasicRecord = {
  fields: Record<string, {
    value: unknown;
    updatedAt: string;
    updatedByApp: string;
    updatedByUser: string;
  }>;
  log: Array<{
    fieldId: string;
    from: unknown;
    to: unknown;
    app: string;
    user: string;
    at: string;
  }>;
};

export interface UnifiedDetailApi {
  // ── 앱마다 경로/형태가 다른 것 (반드시 주입) ──

  /** 분야 현황 행 목록 로드 — ERP: GET /api/customer-360/detail */
  loadDomainRows(key: string): Promise<CustomerDetailLite | null>;

  /** 분야 현황 동기 캐시 읽기 — 즉시표시용(없으면 null). ERP: customer-detail-cache.getCachedCustomerDetail */
  getCachedDomainRows(key: string): CustomerDetailLite | null;

  /** 자기 분야 칸 1개 저장 — ERP: PATCH /api/tax-amendment/{id} */
  saveOwnField(entryId: string, key: string, value: string | number | boolean | null): Promise<void>;

  /** 신규 행 등록 — ERP: POST /api/tax-amendment */
  createEntry(payload: Record<string, unknown>): Promise<{ id: string }>;

  /** 칸 설정 읽기 — ERP: GET /api/tax-amendment/config */
  loadColumnConfig(): Promise<unknown>;

  /** 칸 설정 저장 — ERP: PUT /api/tax-amendment/config */
  saveColumnConfig(cfg: unknown): Promise<void>;

  /** 차수 필드 목록 읽기 — ERP: GET /api/tax-amendment/tiered-fields/{kind} */
  loadTieredFields(kind: "contract" | "refund"): Promise<unknown>;

  /** 코멘트(히스토리) 목록 읽기 — ERP: GET /api/tax-amendment/{id}/comments */
  loadComments(entryId: string): Promise<UnifiedComment[]>;

  /** 코멘트 추가/수정/삭제 — POST 후 응답의 최신 목록 반환(1요청, 원본 동일) */
  addComment(entryId: string, body: unknown): Promise<UnifiedComment[]>;

  /** 담당자 목록 읽기 — ERP: GET /api/unified-collab/managers */
  loadManagers(): Promise<{ id: string; name: string }[]>;

  /** 탭 설정 읽기 — ERP: GET /api/detail-tab-config/{scope} */
  loadTabConfig(): Promise<unknown>;

  /** 탭 설정 저장 — ERP: PUT /api/detail-tab-config/{scope} */
  saveTabConfig(cfg: unknown): Promise<void>;

  /** 정산 필드 목록 읽기 — ERP: GET /api/unified-collab/section-settlement/{section}/fields */
  loadSettlementFields(section: string): Promise<unknown>;

  /** 정산 저장 — ERP: PUT via SectionSettlementTab → settlementApiBase */
  saveSettlement(section: string, payload: unknown): Promise<void>;

  // ── 3앱 공용(동일 경로) — 어댑터에 기본 구현 제공 ──

  /** 기본정보 보관함 읽기 — GET /api/basic-store/{bizno} */
  loadBasicStore(bizno: string): Promise<BasicRecord | null>;

  /** 기본정보 칸 1개 저장 — PUT /api/basic-store/{bizno} */
  saveBasicField(bizno: string, app: string, fieldId: string, value: unknown): Promise<BasicRecord | null>;

  /** 섹션 보관함 읽기 — GET /api/section-store/{bizno}/{section}?kind= */
  loadSectionStore(bizno: string, section: string, kind: string): Promise<unknown>;

  /** 섹션 보관함 저장 — PUT /api/section-store/{bizno}/{section}?kind= */
  saveSectionStore(bizno: string, section: string, kind: string, data: unknown): Promise<void>;

  /** 3앱 공용 기본정보 추가 칸(공통+그 분야 커스텀) 읽기 — ERP: GET /api/basic-fields/{domain}.
   *  공통 칸은 전역(분야 무관)이라 어느 분야로 읽어도 같이 오고, 커스텀은 그 분야만 온다.
   *  미구현 앱(하이브·일루아 초기)은 미제공/빈 배열이면 옵셔널 체이닝으로 무시.
   *  options: 드롭다운 칸의 선택지(셀 편집기에 전달). */
  loadCommonBasicFields?(domain?: string): Promise<Array<{ key: string; label: string; type: string; options?: string[] }>>;

  /** 기본정보 추가 칸 정의 전체(공통+커스텀, 범위·선택지 포함) 읽기 — "공통 컬럼 관리" 화면용.
   *  ERP: GET /api/basic-fields/{domain}. 미구현 앱은 미제공. */
  loadBasicFieldDefs?(
    domain: string,
  ): Promise<Array<{ key: string; label: string; type: string; scope?: "common" | "custom"; options?: string[] }>>;

  /** 기본정보 칸 정의 저장(공통/커스텀 분리는 서버가 scope 로 처리) — "공통 컬럼 관리" 화면용.
   *  ERP: PUT /api/basic-fields/{domain}. 저장 성공/실패를 정직하게 반환(조용한 실패 금지). */
  saveBasicFieldDefs?(
    domain: string,
    fields: Array<Record<string, unknown>>,
  ): Promise<{ ok: boolean; error?: string }>;

  /** 현재 로그인 사용자 정보 — GET /api/auth/me */
  currentUser(): Promise<{ name: string; email?: string; role?: string } | null>;

  /** 이미지/파일 업로드 — POST /api/upload */
  uploadImage(file: File): Promise<{ url: string }>;
}


/**
 * 저장 실패를 앱의 '저장 실패 보관함'에 넘기는 통로(선택).
 *
 * 왜 필요한가: 이 공용 상세창은 저장이 실패하면 사용자가 방금 친 값을 화면에서 지우고
 * 경고창 하나를 띄웠다. 배포로 서버가 잠깐 끊긴 순간엔 그 값이 통째로 사라진다
 * (배포 중 입력 유실, 2026-08-06 요청). 앱이 이 통로를 넘겨 주면 값을 지우지 않고
 * 앱의 저장 실패 막대에 담아 '다시 저장'할 수 있게 한다.
 *
 * 안 넘기는 앱은 예전 그대로 동작한다(되돌리기 + 경고창).
 */
export type UnsavedBridge = {
  /** 이 화면의 이름 — 앱의 표와 같은 글자여야 같은 칸의 실패가 한 항목으로 묶인다. */
  scope: string;
  makeId: (scope: string, rowId: string, fieldKey: string) => string;
  report: (entry: {
    id: string;
    scope: string;
    rowId: string;
    fieldKey: string;
    rowLabel: string;
    fieldLabel: string;
    value: string | number | boolean | null;
    error: string;
    kind: string;
    retry: () => Promise<boolean>;
    revert?: () => void;
  }) => void;
  resolve: (id: string) => void;
};

/** 저장이 실패한 이유의 종류 — 앱 어댑터가 던지는 오류에 실어 보낸다. */
export function saveFailureKindOf(e: unknown): string {
  const k = (e as { saveFailureKind?: unknown })?.saveFailureKind;
  return typeof k === "string" ? k : "permanent";
}

export interface UnifiedDetailAdapter {
  appName: "ERP" | "HIVE" | "ILLUA";
  ownDomain: string;    // ERP: "tax-amendment"
  /** 자기 주력 분야 칸 정의 목록 — ERP: COLUMNS(tax-amendment). 기본정보 칸 구성·키 충돌검사에 사용. */
  ownColumns: ColumnDef[];
  /** 조건별 수식(차수카드) UI 켜기 — ERP만 true. 미설정(하이브·일루아)이면 조건 UI 안 보임. */
  enableConditionalFormula?: boolean;
  /** 조건부 수식 기준 칸(기본정보, 색 enrich)을 칸 "정의"에서 만든다. ERP만 제공. 미제공이면 행 기반 폴백. */
  conditionFieldOptionsFor?: (
    defs: Array<{ key: string; label: string; type?: string; scope?: "common" | "custom"; options?: string[] }>,
  ) => Array<{ key: string; label: string; options?: Array<{ value: string; badgeClass?: string }> }>;
  configScope: string;  // ERP: "unified-collab" (탭/칸 설정 scope)
  domains: ColumnDef[] | unknown[]; // 보여줄 분야 탭 목록 — Phase 1A는 기존 DOMAIN_GROUPS 그대로
  api: UnifiedDetailApi;

  /** 저장 실패를 앱 보관함에 넘기는 통로(선택) — 없으면 예전처럼 되돌리기+경고창. */
  unsaved?: UnsavedBridge;

  // ── ERP 전용 경로 — Phase 1B-1 이전 대상 ──

  /** 차수 필드 경로 생성 — ERP: /api/tax-amendment/tiered-fields/{kind} */
  ownTieredFieldsPath: (kind: "contract" | "refund") => string;

  /** 분야 정산 API 기본 경로 — ERP: /api/unified-collab/section-settlement */
  sectionSettlementBase: string;

  // ── Phase 1B-1c: 필드 옵션 번들 ──

  /** editors.tsx 가 필요한 옵션/색/헬퍼 번들 — FieldOptionsContext 에 주입됨 */
  fieldOptions: FieldOptionsBundle;

  // ── Phase 1B-1c: 콘텐츠 패널 컴포넌트 ──

  /** ERP 전용 패널 컴포넌트 모음 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SettlementInfoTab: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MeetingsTab: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ErpFilesPanel: React.ComponentType<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SectionSettlementTab: React.ComponentType<any>;
    /** 분야 그룹별 커스텀 편집기. 키 = DomainGroup.key. 제공 시 기본 SectionDetailPanel 대신 렌더. 미제공이면 기존 동작(하이브·일루아 불변). */
    sectionPanels?: Record<string, React.ComponentType<SectionPanelProps>>;
    /** 분야 그룹별 "패널 위에 얹는 머리 조각" — 제공 시 그 그룹 패널(기본·커스텀 모두) 위에 렌더.
     *  미제공이면 기존 동작(하이브·일루아 불변). props 는 sectionPanels 와 동일(SectionPanelProps). */
    sectionPanelHeaders?: Record<string, React.ComponentType<SectionPanelProps>>;
    /** 분야 그룹별 "3분할 오른쪽 히스토리" — wide 에서 그 그룹이 활성일 때 오른쪽 패널에 렌더.
     *  커스텀 패널(sectionPanels)을 쓰는 그룹은 히스토리 저장소가 앱 고유라 껍데기가 못 그린다 —
     *  앱이 같은 저장소를 그리는 조각을 여기로 준다. 미제공이면 기존 동작(안내문). */
    sectionHistoryPanels?: Record<string, React.ComponentType<SectionPanelProps>>;
    /** ERP 전용: 기본정보 탭 "택스봇 자동 리포트" 칸 컨트롤. 제공 시 기본정보에 그 칸이 나타남(미제공이면 칸 없음 — 하이브·일루아 불변). props: { row, entryId, onSaved? }. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TaxbotReportControl?: React.ComponentType<any>;
  };

  /** 자기 도메인(경정청구) 파일 탭 칸 정의 목록 */
  ownFileFields: FileFieldDef[];

  /** 자기 도메인 파일 탭 기본 카테고리 키 */
  ownFileCategoryKey: string;

  /**
   * 회사 전체 파일을 모아 반환 — 기본정보 "파일" 칸(2개 미리보기 + 더보기 팝업)이 사용.
   * 앱별 저장 방식 흡수: 하이브·일루아 = row["_files"] 묶음, ERP = ownFileFields 칸별 파일 합치기.
   */
  getAllFiles: (row: Record<string, unknown>) => FileMetaLite[];

  /**
   * NO.104 재작업: 기본정보 파일 칸 인라인 다운로드 통로 (선택 — 미주입 시 버튼 없음).
   * apiPath    개별 다운로드 GET (?name=&url=&entryId=&fileName=) → 파일을 "저장"으로 반환
   * allApiPath 전체 다운로드 POST { label, files:[{fileName,url,entryId}] } → ZIP 반환
   * zipLabel   ZIP 파일명(업체명). 없거나 빈값이면 "첨부파일".
   */
  fileDownload?: {
    apiPath: string;
    allApiPath: string;
    zipLabel?: (row: Record<string, unknown>) => string;
  };
}

/** 어댑터가 분야 그룹별로 주입하는 커스텀 편집기 패널의 props (components.sectionPanels 값). */
export type SectionPanelProps = {
  /** 이 그룹에 속한 분야 행들(정책·정부·무상 등). 각 행에 domain·entryId·row 가 있다. */
  rows: DomainRowLite[];
  /** 경정청구(앵커) 행 전체 — 새 계약 생성 시 고객 식별값 prefill 용. */
  primaryRow: Record<string, unknown>;
  isAdmin: boolean;
  onSaved?: () => void;
  adapter: UnifiedDetailAdapter;
  /** 조건부 수식 기준 칸(기본정보). 미설정이면 패널이 자체 계산. */
  conditionFieldOptions?: Array<{ key: string; label: string; options?: Array<{ value: string; badgeClass?: string }> }>;
  /** wide(3분할)에서 숨길 하위 탭 키 — 히스토리를 오른쪽 패널로 옮길 때 등. 미전달이면 불변. */
  hiddenSubTabs?: string[];
};
