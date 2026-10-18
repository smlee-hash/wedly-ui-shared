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

// 복구 비교 전용: 앱의 formatKoreanPhone이 국내형으로 저장하는 번호만 맞춘다.
function recoveryPhoneDigits(phone: unknown): string {
  const raw = String(phone ?? "").trim();
  const digits = raw.replace(/[^0-9]/g, "");
  if ((typeof phone !== "string" && typeof phone !== "number") || !/^[\d\s()+.-]+$/.test(raw)) return digits;
  const rest = digits.startsWith("0082") ? digits.slice(4) : digits.startsWith("82") ? digits.slice(2) : null;
  if (rest === null) return digits;
  const domestic = rest.startsWith("0") ? rest : `0${rest}`;
  if (!/^0\d{8,10}$/.test(domestic)) return digits;
  // 앱이 원본을 유지하는 길이(02 11자리·일반 9자리·050 10자리 등)는 합치지 않는다.
  if (/^050\d/.test(domestic)) return domestic.length === 11 ? domestic : digits;
  if (domestic.startsWith("02")) return domestic.length === 9 || domestic.length === 10 ? domestic : digits;
  return domestic.length === 10 || domestic.length === 11 ? domestic : digits;
}

/** 표 원본과 공유 상세가 같은 고객의 진행 중 복원 객체를 식별한다. */
export function basicRecoveryIdentity(row: Record<string, unknown>, ownDomain = "tax-amendment"): string {
  const normalized = ownDomain === "government-subsidy" ? { ...row,
    "15사업자번호": row["15사업자번호"] ?? row["04사업자번호"],
    "04연락처": row["04연락처"] ?? row["03대표연락처"],
  } : row;
  const recoveryRow = { ...normalized, "04연락처": recoveryPhoneDigits(normalized["04연락처"]) };
  return JSON.stringify([ownDomain, customerKeyFromTaxRow(recoveryRow as RowData, ownDomain)]);
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
