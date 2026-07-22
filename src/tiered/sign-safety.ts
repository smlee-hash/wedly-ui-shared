// 환불 차수카드 "계약 수식 따라가기" — 부호 대칭 검사기.
//
// 기준금액(환불금액)만 음수로 읽어 계약 수식을 재사용하는 방식은, 식이 기준금액을
// "정확히 한 번" 쓸 때만 부호가 깔끔히 뒤집힌다. 그렇지 않은 식은 적용하지 않고 사유를 돌려준다.
//
// 세는 방법(= 계산기 evalTermChain 과 같은 왼→오 순서):
//   상수·무관한 칸 = 0차, 기준금액칸·짝지어진 환불칸 = 1차, 괄호는 안쪽을 재귀로.
//   +·- 는 양쪽 차수가 같아야 하고(다르면 판정 불가), × 는 차수를 더하고, ÷ 는 뺀다.

import type { FieldDef, FormulaTerm, ConditionClause, ConditionalRule } from "./index";

/** 기준금액을 몇 번 썼는지. null = 판정 불가(상수와 금액이 섞임). */
export type Degree = number | null;

export interface SignCheckCtx {
  /** 부호가 1차로 뒤집히는 칸 — 환불 기준금액칸 + 적용 예정인 짝 칸들. */
  unitKeys: ReadonlySet<string>;
  /** 환불 카드의 칸 정의(참조 칸이 수식칸이면 그 안까지 세기 위해). */
  byKey: ReadonlyMap<string, FieldDef>;
}

export interface SignVerdict {
  ok: boolean;
  /** ok=false 일 때 관리자에게 보여줄 한국어 사유. */
  reason?: string;
}

function degreeOfTerm(t: FormulaTerm, ctx: SignCheckCtx, seen: ReadonlySet<string>): Degree {
  if (t.unit === "group") return degreeOfTerms(Array.isArray(t.terms) ? t.terms : [], ctx, seen);
  if (t.unit !== "column") return 0;
  const key = t.columnKey;
  if (!key) return 0;
  if (ctx.unitKeys.has(key)) return 1;
  if (seen.has(key)) return null; // 순환 참조 → 판정 불가
  const ref = ctx.byKey.get(key);
  if (ref && ref.type === "formula" && Array.isArray(ref.formula) && ref.formula.length > 0) {
    const next = new Set(seen);
    next.add(key);
    return degreeOfTerms(ref.formula, ctx, next);
  }
  return 0;
}

export function degreeOfTerms(
  terms: FormulaTerm[],
  ctx: SignCheckCtx,
  seen: ReadonlySet<string> = new Set<string>(),
): Degree {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  let cur = degreeOfTerm(terms[0], ctx, seen);
  for (let i = 1; i < terms.length; i++) {
    const d = degreeOfTerm(terms[i], ctx, seen);
    if (cur === null || d === null) return null;
    const op = terms[i].op;
    if (op === "+" || op === "-") {
      if (cur !== d) return null;
    } else if (op === "*") {
      cur = cur + d;
    } else if (op === "/") {
      cur = cur - d;
    }
  }
  return cur;
}

/** 한 규칙의 조건 절 목록(새 형식 clauses 우선, 없으면 옛 단일 조건). */
function clausesOf(rule: ConditionalRule, legacyKey?: string): ConditionClause[] {
  if (Array.isArray(rule.clauses) && rule.clauses.length > 0) {
    return rule.clauses.filter((c) => c && !!c.leftKey);
  }
  const leftKey = rule.leftKey ?? legacyKey;
  if (!leftKey) return [];
  const right = rule.right ?? { kind: "text" as const, value: rule.whenValue ?? "" };
  return [{ leftKey, right, op: rule.op ?? "eq" }];
}

export function checkRefundSignSafety(field: FieldDef, ctx: SignCheckCtx): SignVerdict {
  const chains: FormulaTerm[][] = [];
  if (Array.isArray(field.formula) && field.formula.length > 0) chains.push(field.formula);
  const rules = field.conditional?.rules ?? [];
  for (const r of rules) {
    if (r && Array.isArray(r.formula) && r.formula.length > 0) chains.push(r.formula);
  }
  if (chains.length === 0) return { ok: false, reason: "계약 칸에 계산식이 없습니다" };

  // 조건 기준칸이 "부호가 뒤집힌 자동계산 칸"이면 계약과 다른 규칙이 골라진다.
  for (const r of rules) {
    if (!r) continue;
    for (const c of clausesOf(r, field.conditional?.conditionFieldKey)) {
      const refs = [c.leftKey, c.right?.kind === "field" ? c.right.key : ""].filter((k): k is string => !!k);
      for (const k of refs) {
        const ref = ctx.byKey.get(k);
        if (ref && ref.type === "formula" && ctx.unitKeys.has(k)) {
          return { ok: false, reason: `조건이 자동계산 칸(${k})을 기준으로 삼아 환불에서 다른 규칙이 골라집니다` };
        }
      }
    }
  }

  let common: Degree | undefined;
  for (const chain of chains) {
    const d = degreeOfTerms(chain, ctx);
    if (d === null) return { ok: false, reason: "식에 금액과 상수가 섞여 있어 환불 부호가 어긋납니다" };
    if (common === undefined) common = d;
    else if (common !== d) return { ok: false, reason: "조건별 식마다 환불금액 사용 횟수가 달라 부호가 어긋납니다" };
  }
  if (common !== 1) {
    return { ok: false, reason: "환불금액이 식에 없거나 여러 번 쓰여 마이너스로 뒤집히지 않습니다" };
  }
  return { ok: true };
}
