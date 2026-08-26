import type { RowData } from "../../collab/collab-table-core";
import { checkApiResult, makePersistError, failureReason } from "../../lib/persist-failure";

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

/**
 * 고객 상세를 읽어 온다.
 *
 * ★"못 찾음"과 "못 불러옴"을 가른다(2026-08-26). 전에는 둘 다 null 이라,
 *   권한 없음·서버 오류·연결 끊김이 "이 회사는 분야 기록이 하나도 없다"로 보였다.
 *   그 상태에서 정부지원금 첫 메모 입력칸이 열리면, 거기 저장할 때 **새 계약 줄이 생긴다**.
 *   - 못 찾음(정상): null 을 돌려준다 — 부르는 쪽 동작 그대로.
 *   - 못 불러옴: 오류를 **던진다** — 부르는 쪽이 실패로 다룬다.
 */
export async function fetchCustomerDetail(key: string): Promise<CustomerDetailLite | null> {
  let res: Response;
  try {
    res = await fetch(`/api/customer-360/detail?key=${encodeURIComponent(key)}`, {
      cache: "no-store",
    });
  } catch {
    throw makePersistError("network", failureReason("network"));
  }
  const j = await res.json().catch(() => null);
  const bad = checkApiResult(res, j);
  if (bad !== "none") throw makePersistError(bad, failureReason(bad));
  const data = (j as { data?: unknown } | null)?.data;
  if (!data) return null; // 못 찾음 — 실패가 아니다
  return data as CustomerDetailLite;
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
// ★후보 키(candidateKeys)가 핵심: 기본정보 칸 키는 앱마다 다르게 정해진다.
// 같은 "대표자명"이라도 경정청구 칸은 `03대표자명`, 정부지원금 칸은 다른 키일 수 있어
// (BASIC_FIELD_SPECS.keys = ["03대표자명","02대표자명","대표자명"] 처럼 후보가 여럿).
// → row 의 고른 키만 보지 말고 후보 키 전부로, row → 경정청구 행 → 나머지 행 순으로 첫 비어있지 않은 값.
// 표시(읽기) 전용 보강이며 저장/편집 경로는 건드리지 않는다.
function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function resolveBasicFieldValue(
  row: Record<string, unknown> | null | undefined,
  detail: CustomerDetailLite | null | undefined,
  key: string,
  candidateKeys?: string[],
): unknown {
  // 후보 키 = 고른 키 + 사양 후보 키(중복 제거, 고른 키 우선)
  const keys = candidateKeys && candidateKeys.length
    ? Array.from(new Set([key, ...candidateKeys]))
    : [key];
  // 1) 현재 줄(row)에서 후보 키로 첫 비어있지 않은 값(편집·기존값 보존)
  for (const k of keys) {
    const v = row?.[k];
    if (isNonEmpty(v)) return v;
  }
  // 2) detail.domainRows — 회사 신원 칸 소유 = 경정청구(tax-amendment) 행 우선, 그다음 나머지
  const rows = Array.isArray(detail?.domainRows) ? detail!.domainRows : [];
  const ordered = [...rows].sort(
    (a, b) => (a?.domain === "tax-amendment" ? -1 : 0) - (b?.domain === "tax-amendment" ? -1 : 0),
  );
  for (const r of ordered) {
    for (const k of keys) {
      const v = r?.row?.[k];
      if (isNonEmpty(v)) return v;
    }
  }
  // 3) 어디에도 없으면 row 의 고른 키 값(빈 문자열/없으면 null) 그대로
  return row?.[key] ?? null;
}
