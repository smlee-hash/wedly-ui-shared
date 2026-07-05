// 협업 상세창 분야(영역) 그룹 정의 — 3앱 공통.
// 윗줄 탭은 고정 5개 그룹. "정부지원금" 그룹은 정책자금·정부지원금·무상지원금 3개를 하나로 합친
// 가상 영역(데이터를 구분 없이 나란히 나열). domains 값은 customer-360 의 실제 도메인 키 문자열.
// cert(기업인증)·patent(특허)는 2026-07-05 자체 저장소(CertEntry/PatentEntry, ERP) 개설로 연결(결정11).
export type DomainGroup = { key: string; label: string; domains: string[] };

export const DOMAIN_GROUPS: DomainGroup[] = [
  { key: "tax-amendment", label: "경정청구", domains: ["tax-amendment"] },
  {
    key: "government-subsidy",
    label: "정부지원금",
    domains: ["policy-fund", "government-subsidy", "free-subsidy"],
  },
  { key: "labor-subsidy", label: "노무", domains: ["labor-subsidy"] },
  { key: "cert", label: "기업인증", domains: ["cert"] },
  { key: "patent", label: "특허", domains: ["patent"] },
];

// 자기영역 하위 탭 표시 순서: 미팅 → 차수계약 → 정산 → 차수환불 → 그 외.
// 히스토리(맨앞)·파일(맨뒤)은 빌더에서 붙임.
export const OWN_KIND_ORDER: Record<string, number> = {
  meetings: 1,
  "tiered-contract": 2,
  contract: 2,
  settlement: 3,
  "tiered-refund": 4,
  refund: 4,
};
