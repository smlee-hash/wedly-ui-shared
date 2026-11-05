// src/tiered/cond-eval.ts
// 조건 비교 도우미 — 첫 일치(resolveConditionalFormula)·모든 조건 보기·정확히 하나(exactly-one)가
// 같은 판정을 쓰도록 index.ts 밖에 둔다. 동작은 index.ts 에 있을 때와 똑같다(옮기기만 했다).
import type { ConditionClause, ConditionOp, ConditionalRule, FieldDef } from "./index";

export function condValuesOf(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter((s) => s !== "");
  return String(raw).split(/[,\n;]+/).map((x) => x.trim()).filter((s) => s !== "");
}

// 한 값을 글자로 — 배열이면 쉼표로 이어 붙임(부분 포함 비교용).
export function condAsText(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter((s) => s !== "").join(", ");
  return String(raw).trim();
}

// 크기 비교(이후/이전)용 값 환산. 날짜면 YYYY-MM-DD 로 맞춰서, 숫자면 숫자로 본다.
// 둘 다 아니면 null → 매칭 안 함. 글자끼리 크기를 견주면 사람이 예상 못 한 결과가 나오기 때문.
//   날짜 구분자는 - . / 를 모두 받고 한 자리 월·일(2026.8.5)도 채워 넣는다 —
//   대량 업로드·외부 연동으로 들어온 값이 형식 때문에 조용히 조건에서 빠지면 사람이 못 잡는다.
export function condComparable(s: string): { kind: "date" | "number"; v: string | number } | null {
  const d = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(s);
  if (d) {
    const mm = d[2].padStart(2, "0"), dd = d[3].padStart(2, "0");
    return { kind: "date", v: `${d[1]}-${mm}-${dd}` };
  }
  const n = Number(s.replace(/,/g, ""));
  if (s.trim() !== "" && Number.isFinite(n)) return { kind: "number", v: n };
  return null;
}

// op 별 일치 판정. 기준 칸/비교 값 중 하나라도 비면 어떤 op 도 매칭 안 함 → 기본식.
export function condMatches(op: ConditionOp, a: unknown, b: unknown): boolean {
  const A = condValuesOf(a), B = condValuesOf(b);
  if (A.length === 0 || B.length === 0) return false;
  // 크기 비교(이후·이전): 값 전체를 하나의 날짜·숫자로 본다(쉼표로 쪼개면 "1,500,000" 이 1 이 된다).
  if (op === "gte" || op === "lte") {
    const L = condComparable(condAsText(a));
    const R = condComparable(condAsText(b));
    if (!L || !R || L.kind !== R.kind) return false;
    const cmp = L.kind === "date"
      ? String(L.v).localeCompare(String(R.v))
      : Number(L.v) - Number(R.v);
    return op === "gte" ? cmp >= 0 : cmp <= 0;
  }
  const tokenEq = A.some((x) => B.includes(x)); // 토큰(쉼표/줄바꿈) 교집합 = 같음 기준
  if (op === "neq") return !tokenEq;
  // 포함/미포함: 비교값을 토큰으로 나눠(같음과 같은 축) 그 중 하나라도 기준칸 글자에 부분 포함되면 일치.
  //   (비교값이 단일 값이면 "기준칸이 그 글자를 부분 포함" 과 동일. 콤마 다중값이면 OR 로 일관.)
  if (op === "contains") return B.some((t) => condAsText(a).includes(t));
  if (op === "notContains") return !B.some((t) => condAsText(a).includes(t));
  return tokenEq; // "eq" 및 미지정 기본
}

// 한 규칙의 조건 절 목록: 새 형식(clauses) 우선, 없으면 옛 단일 조건 1개로 구성.
export function condClausesOf(
  cond: NonNullable<FieldDef["conditional"]>,
  rule: ConditionalRule,
): ConditionClause[] {
  if (Array.isArray(rule.clauses) && rule.clauses.length > 0) {
    return rule.clauses.filter((c) => c && !!c.leftKey);
  }
  const leftKey = rule.leftKey ?? cond.conditionFieldKey;
  if (!leftKey) return [];
  const right = rule.right ?? { kind: "text" as const, value: rule.whenValue ?? "" };
  return [{ leftKey, right, op: rule.op ?? "eq" }];
}
