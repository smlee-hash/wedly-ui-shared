import type { RowData } from "../../collab/collab-table-core";

// 회사 행의 사업자번호로 고객 키 생성 (customer-360 customerKeyOf 규칙과 동일: b:<숫자>).
// 사업자번호·연락처가 둘 다 없으면 "i:<자기분야>:<행 id>" 폴백 — 자기분야(ownDomain)는 앱마다 다르다
// (ERP·하이브 = tax-amendment, 일루아 = government-subsidy). 일루아가 tax-amendment 로 굳어 있으면
// 식별값 없는 회사의 자기 행(정부지원금 항목)을 ERP 상세 조회가 영영 못 찾는다(재작업 2026-07-15).
export function customerKeyFromTaxRow(row: RowData, ownDomain: string = "tax-amendment"): string {
  const bizno = String(row["15사업자번호"] ?? "").replace(/[^0-9]/g, "");
  if (bizno) return `b:${bizno}`;
  const phone = String(row["04연락처"] ?? "").replace(/[^0-9]/g, "");
  if (phone) return `p:${phone}`;
  return `i:${ownDomain}:${String(row["_id"] ?? "")}`;
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
