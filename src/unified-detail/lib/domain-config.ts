// ERP 통합 협업 상세창 — 도메인(영역) 설정.
// 분야 그룹(DOMAIN_GROUPS)·하위탭 순서(OWN_KIND_ORDER)의 단일 원본은 @wedly/ui-shared/section-store.
// ERP·하이브·일루아가 같은 정의를 공유한다(secstore 키 desync 방지). ERP 전용 값만 여기서 정의.
//
// Note: DomainKey(ERP 전용 타입)는 공용 패키지에 의존할 수 없으므로 string 기반 형태로 대체.

import {
  DOMAIN_GROUPS as SHARED_DOMAIN_GROUPS,
  OWN_KIND_ORDER as SHARED_OWN_KIND_ORDER,
} from "../../section-store";

// ── 자기영역(ERP가 편집권한을 갖는 영역) ── 경정청구가 ERP 의 메인 영역.
export const PRIMARY_DOMAIN: string = "tax-amendment";

// 컬럼·탭 설정 저장 scope — 하이브 표/편집창 공유 키와 동일하게 맞춘다.
export const CONFIG_SCOPE: string = PRIMARY_DOMAIN;

export type DomainGroup = { key: string; label: string; domains: string[] };

// 값은 3앱 공용 단일 원본(section-store)에서 가져오고 재노출.
export const DOMAIN_GROUPS = SHARED_DOMAIN_GROUPS as DomainGroup[];
export const OWN_KIND_ORDER = SHARED_OWN_KIND_ORDER;
