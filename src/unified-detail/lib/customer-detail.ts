import type { RowData } from "../../collab/collab-table-core";

// 경정청구 행의 사업자번호로 고객 키 생성 (customer-360 customerKeyOf 규칙과 동일: b:<숫자>).
export function customerKeyFromTaxRow(row: RowData): string {
  const bizno = String(row["15사업자번호"] ?? "").replace(/[^0-9]/g, "");
  if (bizno) return `b:${bizno}`;
  const phone = String(row["04연락처"] ?? "").replace(/[^0-9]/g, "");
  if (phone) return `p:${phone}`;
  return `i:tax-amendment:${String(row["_id"] ?? "")}`;
}

export type DomainRowLite = {
  domain: string;
  domainLabel: string;
  entryId: string;
  status?: string;   // 진행상태 — API 응답 CustomerDomainRow.status 매핑
  partner?: string;  // 담당 파트너 — API 응답 CustomerDomainRow.partner 매핑
  row: Record<string, unknown>;
};

export type CustomerDetailLite = {
  key: string;
  bizno: string;
  company: string;
  ceo: string;
  phone: string;
  domainRows: DomainRowLite[];
};

export async function fetchCustomerDetail(key: string): Promise<CustomerDetailLite | null> {
  const res = await fetch(`/api/customer-360/detail?key=${encodeURIComponent(key)}`, {
    cache: "no-store",
  });
  const j = await res.json();
  if (!res.ok || !j?.success) return null;
  return j.data as CustomerDetailLite;
}

// ─────────────────────────────────────────────────────────────────────────────
// 기본정보(회사 신원) 칸 값을 "정규 출처"에서 읽는다.
//
// 상세창은 "목록에서 클릭한 줄"(row)을 기준으로 열린다. 그런데 회사 신원 칸
// (대표자명·사업장주소지·사업자유형·환급금여부 등)은 경정청구(tax-amendment) 행에만 들어 있다.
// ERP·하이브는 목록이 경정청구 표라 row 에 그 칸이 있어 정상이지만,
// 일루아는 목록이 정부지원금(policy-fund) 표라 row 에 그 칸 자체가 없어(undefined) 빈칸이 됐다.
// → row 에 해당 키가 있으면(빈 문자열 포함) 그대로 쓰고, "키 자체가 없을 때만"
//    detail.domainRows 의 경정청구 행을 우선으로 폴백한다(다른 앱과 같은 값으로 채움).
//
// 키가 빈 문자열("")인 경우는 폴백하지 않는다 → 사용자가 비운 값을 옛 값으로 되살리지 않기 위함.
// 표시(읽기) 전용 보강이며 저장/편집 경로는 건드리지 않는다.
function isMissingKey(v: unknown): boolean {
  return v === null || v === undefined;
}

export function resolveBasicFieldValue(
  row: Record<string, unknown> | null | undefined,
  detail: CustomerDetailLite | null | undefined,
  key: string,
): unknown {
  const fromRow = row?.[key];
  if (!isMissingKey(fromRow)) return fromRow; // 키 보유(빈 문자열 포함) → 그대로
  const rows = detail?.domainRows;
  if (!Array.isArray(rows) || rows.length === 0) return fromRow ?? null;
  // 회사 신원 칸 소유 = 경정청구 행 → 우선 조회
  const tax = rows.find((r) => r?.domain === "tax-amendment");
  const taxVal = tax?.row?.[key];
  if (!isMissingKey(taxVal)) return taxVal;
  // 그 외 행에서 첫 비어있지 않은(키 보유) 값
  for (const r of rows) {
    const v = r?.row?.[key];
    if (!isMissingKey(v)) return v;
  }
  return fromRow ?? null;
}
