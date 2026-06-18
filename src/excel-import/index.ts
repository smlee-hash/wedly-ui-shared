// 순수 로직만 — React/xlsx import 금지(서버 안전 서브경로).
export type TargetField = { key: string; label: string; required?: boolean; role?: "dedupKey" };
export type ColumnMapping = Record<string, string>; // 원본 헤더 -> 대상 항목 key('' = 사용 안 함)

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
