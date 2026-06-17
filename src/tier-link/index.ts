// 서버 안전 진입로 — 차수↔컬럼 연결의 순수 로직(설정 해석·동기화 계산)만 모아 내보낸다.
// 메인 배럴(@wedly/ui-shared)은 화면 전용 부품(클라이언트 컴포넌트)을 포함하므로,
// API 라우트 등 서버 코드는 이 진입로(@wedly/ui-shared/tier-link)로 가져온다(Turbopack 서버/클라이언트 경계 보호).
export * from "./config";
export * from "./sync";
