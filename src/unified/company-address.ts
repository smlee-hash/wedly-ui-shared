// 회사 공통 주소 정본과 같은 회사의 분야 후보만 비교하는 순수 함수.
export const COMPANY_ADDRESS_KEYS = [
  "52사업장주소지", "27주소지", "사업장주소지", "사업장 주소지", "주소지", "주소",
] as const;

export type CompanyAddressKey = typeof COMPANY_ADDRESS_KEYS[number];
export type CompanyAddressStatus = "canonical" | "unique" | "missing" | "conflict" | "invalid";
export type CompanyAddressResolution = {
  status: CompanyAddressStatus;
  value: string | null;
  candidates: string[];
};
export type ResolveCompanyAddressInput = {
  bizno: unknown;
  commonStore?: unknown;
  rows: unknown;
};
export type CompanyAddressFields = Record<CompanyAddressKey, string | null>;

const BUSINESS_NUMBER_KEYS = ["15사업자번호", "04사업자번호", "사업자번호"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function businessDigits(value: unknown): string | null {
  if (typeof value !== "string" &&
      !(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) return null;
  const raw = String(value);
  if (!/^[\d\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/[-\s]/g, "");
  return /^\d{8,13}$/.test(digits) ? digits : null;
}

function result(
  status: CompanyAddressStatus,
  value: string | null = null,
  candidates: string[] = [],
): CompanyAddressResolution {
  return { status, value, candidates };
}

/** 정본의 존재·명시 지움을 먼저 판정한다. 정본이 없을 때만 분야 후보를 비교한다. */
export function resolveCompanyAddress(input: ResolveCompanyAddressInput): CompanyAddressResolution;
export function resolveCompanyAddress(input: unknown): CompanyAddressResolution;
export function resolveCompanyAddress(input: unknown): CompanyAddressResolution {
  if (!isRecord(input) || !hasOwn(input, "bizno")) return result("invalid");
  const bizno = businessDigits(input.bizno);
  if (!bizno) return result("invalid");

  const commonStore = hasOwn(input, "commonStore") ? input.commonStore : undefined;
  if (commonStore !== undefined && commonStore !== null) {
    if (!isRecord(commonStore) || !hasOwn(commonStore, "key") ||
        typeof commonStore.key !== "string") return result("invalid");
    if (commonStore.key !== `secstore:${bizno}:basic`) return result("invalid");

    if (!hasOwn(commonStore, "value") || !isRecord(commonStore.value)) return result("invalid");
    const storeValue = commonStore.value;
    if (!hasOwn(storeValue, "fields") || !isRecord(storeValue.fields)) return result("invalid");
    const fields = storeValue.fields;
    if (hasOwn(fields, "사업장주소지")) {
      const field = fields["사업장주소지"];
      if (!isRecord(field) || !hasOwn(field, "value")) return result("invalid");
      if (field.value === null) return result("canonical", "");
      if (typeof field.value !== "string") return result("invalid");
      return result("canonical", field.value);
    }
  }

  if (!hasOwn(input, "rows") || !Array.isArray(input.rows)) return result("invalid");
  const addresses = new Set<string>();
  let invalidIdentity = false;
  for (const row of input.rows) {
    if (!isRecord(row)) continue;
    if ((hasOwn(row, "_deletedAt") && row._deletedAt) ||
        (hasOwn(row, "_mergedInto") && row._mergedInto)) continue;

    const identities = new Set<string>();
    let malformedIdentity = false;
    for (const key of BUSINESS_NUMBER_KEYS) {
      if (!hasOwn(row, key)) continue;
      const raw = row[key];
      if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) continue;
      const digits = businessDigits(raw);
      if (digits) identities.add(digits);
      else malformedIdentity = true;
    }
    // 다른 회사·번호 없는 행은 주소 후보나 현재 회사의 충돌 판정에 섞지 않는다.
    if (!identities.has(bizno)) continue;
    if (malformedIdentity || identities.size !== 1) {
      invalidIdentity = true;
      continue;
    }

    for (const key of COMPANY_ADDRESS_KEYS) {
      if (!hasOwn(row, key)) continue;
      const raw = row[key];
      if (typeof raw !== "string") continue;
      const address = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
      if (address) addresses.add(address);
    }
  }

  const candidates = [...addresses].sort();
  if (invalidIdentity) return result("invalid", null, candidates);
  if (candidates.length === 0) return result("missing");
  if (candidates.length > 1) return result("conflict", null, candidates);
  return result("unique", candidates[0]!, candidates);
}

/** 원본을 보존하고 여섯 주소 별칭을 함께 맞춘다. 판정 사유는 resolution으로 별도 전달한다. */
export function applyCompanyAddress<T extends Record<string, unknown>>(
  row: T,
  resolution: CompanyAddressResolution,
): Omit<T, CompanyAddressKey> & CompanyAddressFields;
export function applyCompanyAddress(
  row: unknown,
  resolution: unknown,
): Record<string, unknown> & CompanyAddressFields;
export function applyCompanyAddress(
  row: unknown,
  resolution: unknown,
): Record<string, unknown> & CompanyAddressFields {
  const next: Record<string, unknown> = isRecord(row) ? { ...row } : {};
  const value = isRecord(resolution) && hasOwn(resolution, "status") && hasOwn(resolution, "value") &&
    (resolution.status === "canonical" || resolution.status === "unique") && typeof resolution.value === "string"
    ? resolution.value : null;
  for (const key of COMPANY_ADDRESS_KEYS) next[key] = value;
  return next as Record<string, unknown> & CompanyAddressFields;
}
