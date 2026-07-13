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

// 필수 칸이 매핑됐는지 검사. 고정값(비어있지 않은)으로 채운 칸도 충족으로 인정한다
// — 안내문의 "고정값으로 지정" 경로가 실제로 통하도록(fixedValues 무시 시 막다른 길).
export function validateRequiredMapping(
  mapping: ColumnMapping, fields: TargetField[], fixedValues: FixedValues = {},
): string[] {
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  return fields
    .filter((f) => {
      if (!f.required) return false;
      if (mapped.has(f.key)) return false;
      const fx = fixedValues[f.key];
      if (fx != null && String(fx).trim() !== "") return false; // 고정값으로 충족
      return true;
    })
    .map((f) => f.label);
}

// 필수 칸의 "값"이 빈 줄 집계 — 매핑은 됐지만 셀이 빈 경우를 잡는다(매핑 누락은 validateRequiredMapping 담당).
// exampleRows는 엑셀 파일 기준 행 번호(1=제목줄, 데이터는 2부터)로 최대 3개.
export type RequiredValueIssue = { label: string; count: number; exampleRows: number[] };
export function validateRequiredValues(
  rows: Record<string, unknown>[], mapping: ColumnMapping, fixedValues: FixedValues, fields: TargetField[],
): RequiredValueIssue[] {
  const issues: RequiredValueIssue[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    const fixed = fixedValues[f.key];
    if (fixed != null && String(fixed).trim() !== "") continue; // 고정값이 모든 줄을 채움
    const headers = Object.entries(mapping).filter(([, tgt]) => tgt === f.key).map(([src]) => src);
    if (headers.length === 0) continue; // 매핑 자체가 없으면 여기서 다루지 않음
    const blankRows: number[] = [];
    rows.forEach((r, i) => {
      const filled = headers.some((h) => String(r[h] ?? "").trim() !== "");
      if (!filled) blankRows.push(i + 2);
    });
    if (blankRows.length > 0) issues.push({ label: f.label, count: blankRows.length, exampleRows: blankRows.slice(0, 3) });
  }
  return issues;
}

export function applyMapping<T extends Record<string, unknown>>(
  rows: T[], mapping: ColumnMapping,
): Record<string, unknown>[] {
  const pairs = Object.entries(mapping).filter(([, tgt]) => tgt);
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    // 같은 칸에 여러 열이 매핑되면 빈 값이 채워진 값을 덮어쓰지 않게 한다(값 보존).
    // 채워진 값끼리는 뒤 열이 이김. 서버 renameRowsByMapping과 동일 규칙(게이트 기준 일치).
    for (const [src, tgt] of pairs) {
      if (r[src] === undefined) continue;
      const incomingBlank = String(r[src] ?? "").trim() === "";
      const existingBlank = out[tgt] === undefined || String(out[tgt] ?? "").trim() === "";
      if (!incomingBlank || existingBlank) out[tgt] = r[src];
    }
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
