import type { ColumnDef } from "../types/columns";
import type { RowData } from "./collab-table-core";

// ─────────────────────────────────────────────────────────────
// 통합 협업 — 경정청구 뷰 프리셋 (공용)
// 하이브와 동일한 표를 ERP·하이브·일루아 3개 앱이 공유하기 위한 한 곳의 정의.
// (도메인 데이터지만 "3앱 공통 경정청구 뷰" 라는 공유 목적이 명확해 보관함에 둔다.)
// ─────────────────────────────────────────────────────────────

// 하이브 전용 맞춤 컬럼을 공용 컬럼으로 승격.
//  - 환급금여부: 총환급금에서 파생(있음/없음).
//  - 정부지원금리포트: 다른 앱(정부지원금) 데이터 → 경정청구엔 값 없음(빈 자리, 추후 연결).
export const TAX_AMENDMENT_EXTRA_COLUMNS: ColumnDef[] = [
  { key: "환급금여부", label: "환급금 여부", type: "select", defaultVisible: false, width: 90 },
  { key: "정부지원금리포트", label: "정부지원금 리포트", type: "select", defaultVisible: false, width: 120 },
];

// 하이브 '전체' 탭의 보이는 컬럼·순서 (팀장·팀원 제외).
export const TAX_AMENDMENT_COLLAB_VISIBLE: string[] = [
  "_createdTime",        // 등록일시
  "54DB분류",            // DB분류
  "02상호명",            // 상호명
  "환급금여부",          // 환급금 여부 (파생)
  "정부지원금리포트",    // 정부지원금 리포트 (빈 자리)
  "05경정계약진행상태",  // 진행상태
  "03대표자명",          // 대표자명
  "04연락처",            // 연락처
];

// 새 컬럼 값의 색 — 하이브식 배지.
export const TAX_AMENDMENT_COLLAB_COLORS: Record<string, string> = {
  "있음": "bg-wedly-bg-green text-wedly-green",
  "없음": "bg-wedly-bg-red text-wedly-red",
  "생성완료": "bg-wedly-bg-blue text-wedly-accent",
  "미생성": "bg-wedly-bg-gray text-wedly-muted",
};

const REFUND_TOTAL_KEY = "10총환급금";

/** 총환급금이 있으면 "있음", 없으면 "없음" (하이브 환급금여부 근사 — 추후 정확 규칙으로 맞춤). */
export function deriveRefundFlag(row: RowData): "있음" | "없음" {
  const raw = row[REFUND_TOTAL_KEY];
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? "있음" : "없음";
}
