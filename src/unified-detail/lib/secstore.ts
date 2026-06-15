// 분야(섹션) 정보 3앱 공용 보관함 — 키 규칙·검증의 단일 원본은 @wedly/ui-shared/section-store.
// ERP 내부의 기존 import 경로(@/app/(erp)/unified-collab/lib/secstore)를 유지하기 위해 그대로 재노출한다.
// (Stage 2b: 공용 패키지로 단일 원본화. 라우트·마이그레이션 도구는 이 경로를 계속 import.)
export * from "../../section-store";
