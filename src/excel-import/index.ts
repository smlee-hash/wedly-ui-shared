// 순수 로직만 — React/xlsx import 금지(서버 안전 서브경로).
export type TargetFieldType =
  | "text" | "number" | "date" | "datetime" | "email" | "phone" | "select" | "person";
export type TargetField = {
  key: string;
  label: string;
  required?: boolean;
  role?: "dedupKey";
  type?: TargetFieldType;     // 없으면 text 취급
  options?: string[];         // select/person일 때 선택지
  fixedDisabled?: boolean;    // 고정값 대상에서 제외(읽기전용·자동 칸)
  group?: string;             // 드롭다운 묶음 머리글(없으면 단일 목록)
};
export type ColumnMapping = Record<string, string>; // 원본 헤더 -> 대상 항목 key('' = 사용 안 함)
export type FixedValues = Record<string, string>; // 앱 칸 key -> 고정 문자열 값

const SEP = "␟";
export function computeHeaderSignature(headers: string[]): string {
  return headers.map((h) => (h ?? "").trim()).filter(Boolean).sort().join(SEP);
}

export function autoMatchMapping(headers: string[], fields: TargetField[]): ColumnMapping {
  const byName = new Map<string, string>();
  for (const f of fields) {
    byName.set(f.label.trim(), f.key);
    byName.set(f.key.trim(), f.key);
  }
  const out: ColumnMapping = {};
  for (const h of headers) out[h] = byName.get((h ?? "").trim()) ?? "";
  return out;
}

export function validateRequiredMapping(mapping: ColumnMapping, fields: TargetField[]): string[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  return fields.filter((f) => f.required && !mapped.has(f.key)).map((f) => f.label);
}

export function applyMapping<T extends Record<string, unknown>>(
  rows: T[], mapping: ColumnMapping,
): Record<string, unknown>[] {
  const pairs = Object.entries(mapping).filter(([, tgt]) => tgt);
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [src, tgt] of pairs) if (r[src] !== undefined) out[tgt] = r[src];
    return out;
  });
}

// 고정값으로 고를 수 있는 칸: 비활성 아님 ∧ 엑셀 열에 매핑 안 됨 ∧ 아직 고정 안 됨 (상호배타)
export function availableFixedFields(
  fields: TargetField[], mapping: ColumnMapping, fixedValues: FixedValues,
): TargetField[] {
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  return fields.filter(
    (f) => !f.fixedDisabled && !mappedKeys.has(f.key) && !(f.key in fixedValues),
  );
}

// 매핑 드롭다운이 제시할 칸: 고정값이 지정된 칸 제외 (상호배타)
export function mappingTargetsExcludingFixed(
  fields: TargetField[], fixedValues: FixedValues,
): TargetField[] {
  return fields.filter((f) => !(f.key in fixedValues));
}

// 각 행에 고정값 병합(빈 문자열은 무시 — 기존 값 보호). 서버 apply-mapping.ts와 동일 동작.
export function applyFixedValues<T extends Record<string, unknown>>(
  rows: T[], fixedValues: FixedValues,
): Record<string, unknown>[] {
  const pairs = Object.entries(fixedValues).filter(([, v]) => v != null && String(v).trim() !== "");
  if (pairs.length === 0) return rows.map((r) => ({ ...r }));
  return rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    for (const [k, v] of pairs) out[k] = v;
    return out;
  });
}
