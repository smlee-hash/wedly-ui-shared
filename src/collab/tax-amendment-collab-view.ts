import type { ColumnDef } from "../types/columns";

// ─────────────────────────────────────────────────────────────
// 통합 협업 — 경정청구 뷰 프리셋 (공용)
// 하이브와 동일한 표를 ERP·하이브·일루아 3개 앱이 공유하기 위한 한 곳의 정의.
// (도메인 데이터지만 "3앱 공통 경정청구 뷰" 라는 공유 목적이 명확해 보관함에 둔다.)
// ─────────────────────────────────────────────────────────────

// 하이브 전용 맞춤 컬럼을 공용 컬럼으로 승격.
//  - 환급금여부: 하이브 손입력(O/X) 본체.
//  - 정부지원금리포트: 다른 앱(정부지원금) 데이터 → 경정청구엔 값 없음(빈 자리, 추후 연결).
export const TAX_AMENDMENT_EXTRA_COLUMNS: ColumnDef[] = [
  { key: "환급금여부", label: "환급금 여부", type: "select", defaultVisible: false, width: 90 },
  { key: "정부지원금리포트", label: "정부지원금 리포트", type: "file", defaultVisible: false, width: 120 }, // 파일 첨부 칸
];

// 하이브 '전체' 탭의 보이는 컬럼·순서 (팀장·팀원 제외).
export const TAX_AMENDMENT_COLLAB_VISIBLE: string[] = [
  "_createdTime",        // 등록일시
  "54DB분류",            // DB분류
  "02상호명",            // 상호명
  "환급금여부",          // 환급금 여부 (하이브 손입력 O/X)
  "정부지원금리포트",    // 정부지원금 리포트 (빈 자리)
  "05경정계약진행상태",  // 진행상태
  "03대표자명",          // 대표자명
  "04연락처",            // 연락처
];

// 새 컬럼 값의 색 — 하이브식 배지. 환급금여부는 하이브 손입력값 O/X 가 본체.
export const TAX_AMENDMENT_COLLAB_COLORS: Record<string, string> = {
  "O": "bg-wedly-bg-green text-wedly-green",
  "X": "bg-wedly-bg-red text-wedly-red",
  "있음": "bg-wedly-bg-green text-wedly-green",   // 잔여 호환
  "없음": "bg-wedly-bg-red text-wedly-red",       // 잔여 호환
  "생성완료": "bg-wedly-bg-blue text-wedly-accent",
  "미생성": "bg-wedly-bg-gray text-wedly-muted",
};
