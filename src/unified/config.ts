// 통합 보기 — "앱마다 다른 부분"을 담는 설정 틀.
// 순수 타입만(런타임 로직 없음). 실제 소비는 2단계(ERP 페이지)부터 시작한다.
// 편집 가능 영역 판단은 "위치"가 아니라 primaryDomain "키"로 한다 → 탭 순서를 바꿔도 안전.

// 윗줄 "영역 그룹" 한 개. domains 는 customer-360/ERP 의 실제 도메인 키 목록
// (여러 영역을 한 그룹으로 합쳐 보일 수 있음 — 예: 정책자금·정부지원금·무상지원금 → "정부지원금").
export type DomainGroup = {
  key: string;
  label: string;
  domains: string[];
};

// 한 앱의 통합 보기 설정.
export type UnifiedViewConfig = {
  // 이 앱이 "메인으로 편집·관리"하는 영역 키 (하이브 "tax-amendment", 일루아 "government-subsidy")
  primaryDomain: string;
  // 묶음 배치·순서·이름을 저장/조회하는 범위 이름 (보통 primaryDomain 과 같게 둔다)
  configScope: string;
  // 윗줄 영역 그룹 목록 (기본정보 제외, 표시 순서의 기준)
  domainGroups: DomainGroup[];
};
