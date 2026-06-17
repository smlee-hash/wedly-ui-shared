// 화면 전용 진입로 — 차수↔컬럼 연결 설정 화면(클라이언트 컴포넌트)만 내보낸다.
// 이 부품은 detail-modal-shared(화면 부품)를 쓰므로 메인 배럴에 두지 않고 여기서 따로 제공한다.
// 클라이언트 컴포넌트만 이 진입로를 import 한다(서버 코드는 ./tier-link 순수 진입로 사용).
export { default as ColumnTierLinksManager } from "../components/ColumnTierLinksManager";
export type { TierLinkAdapter, TierFieldDef } from "../components/ColumnTierLinksManager";
