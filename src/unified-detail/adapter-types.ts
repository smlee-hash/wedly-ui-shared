// 통합 상세창 앱 어댑터 인터페이스 — Phase 1A 키스톤.
// 각 앱(ERP·하이브·일루아)이 이 인터페이스를 구현해 UnifiedDetailView에 주입한다.
// 앱마다 달라지는 API 경로/형태를 어댑터로 격리하고, 공용 UI는 어댑터 메서드만 호출한다.

import type React from "react";
import type { CustomerDetailLite } from "./lib/customer-detail";
import type { ColumnDef } from "../types/columns";
import type { UnifiedComment } from "../unified/history-core";
import type { SelectDropdownColorFamily } from "@wedly/detail-modal-shared";

// ── FileFieldDef — 파일 탭 칸 정의 (erp-files-adapter.ts 에서 원본 가져와 로컬 정의) ──
// 원본: src/app/(erp)/_shared/erp-files-adapter.ts
export type FileFieldDef = { key: string; label: string };

/** 기본정보 통합 파일 칸(2개+더보기)이 쓰는 경량 파일 표현 — 앱별 getAllFiles 가 반환 */
export type FileMetaLite = { name: string; url: string; category?: string };

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

  /** 현재 로그인 사용자 정보 — GET /api/auth/me */
  currentUser(): Promise<{ name: string; email?: string; role?: string } | null>;

  /** 이미지/파일 업로드 — POST /api/upload */
  uploadImage(file: File): Promise<{ url: string }>;
}

export interface UnifiedDetailAdapter {
  appName: "ERP" | "HIVE" | "ILLUA";
  ownDomain: string;    // ERP: "tax-amendment"
  /** 자기 주력 분야 칸 정의 목록 — ERP: COLUMNS(tax-amendment). 기본정보 칸 구성·키 충돌검사에 사용. */
  ownColumns: ColumnDef[];
  configScope: string;  // ERP: "unified-collab" (탭/칸 설정 scope)
  domains: ColumnDef[] | unknown[]; // 보여줄 분야 탭 목록 — Phase 1A는 기존 DOMAIN_GROUPS 그대로
  api: UnifiedDetailApi;

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
}
