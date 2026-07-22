// 환불 차수카드 "계약 수식 따라가기" — 짝짓기 파생 (순수 함수).
//
// 분야마다 "환불칸 ← 계약 수식칸" 짝을 지어 두면, 계약 수식을 환불 칸에 복사하면서
// 식 안의 참조만 환불 쪽으로 바꾼다. 칸 이름(key)은 절대 바꾸지 않는다 —
// 평면 거울·알림톡 조건·표 설정·차수 연결이 이름을 글자로 잡아 쓰기 때문(설계서 §3).

import type { FieldDef, FormulaTerm, ConditionalRule, ConditionClause } from "./index";
import { checkRefundSignSafety, type SignCheckCtx } from "./sign-safety";

export interface RefundFollowPair {
  /** 결과가 들어갈 환불 카드 칸 키 */
  refund: string;
  /** 식을 가져올 계약 카드 수식칸 키 */
  contract: string;
}

export interface RefundFollowConfig {
  enabled: boolean;
  /** 기준 금액칸 짝 — 계약금 ↔ 환불금액 */
  baseAmount: { contract: string; refund: string };
  pairs: RefundFollowPair[];
}

export interface RefundDeriveWarning {
  refundKey: string;
  /** 관리자에게 보여줄 한국어 사유 */
  reason: string;
}

export interface RefundDeriveResult {
  fields: FieldDef[];
  warnings: RefundDeriveWarning[];
}

type KeyMap = ReadonlyMap<string, string>;

function substTerms(terms: FormulaTerm[], map: KeyMap): FormulaTerm[] {
  return terms.map((t): FormulaTerm => {
    if (t.unit === "group") {
      return { ...t, terms: substTerms(Array.isArray(t.terms) ? t.terms : [], map) };
    }
    if (t.unit === "column" && t.columnKey) {
      const to = map.get(t.columnKey);
      return to ? { ...t, columnKey: to } : { ...t };
    }
    return { ...t };
  });
}

function substClause(c: ConditionClause, map: KeyMap): ConditionClause {
  return {
    ...c,
    leftKey: map.get(c.leftKey) ?? c.leftKey,
    right: c.right.kind === "field"
      ? { kind: "field", key: map.get(c.right.key) ?? c.right.key }
      : { ...c.right },
  };
}

function substConditional(cond: FieldDef["conditional"], map: KeyMap): FieldDef["conditional"] {
  if (!cond || !Array.isArray(cond.rules)) return undefined;
  const out: NonNullable<FieldDef["conditional"]> = {
    rules: cond.rules.map((r): ConditionalRule => {
      const next: ConditionalRule = {
        ...r,
        formula: substTerms(Array.isArray(r.formula) ? r.formula : [], map),
      };
      if (r.leftKey) next.leftKey = map.get(r.leftKey) ?? r.leftKey;
      if (r.right) {
        next.right = r.right.kind === "field"
          ? { kind: "field", key: map.get(r.right.key) ?? r.right.key }
          : { ...r.right };
      }
      if (Array.isArray(r.clauses)) next.clauses = r.clauses.map((c) => substClause(c, map));
      return next;
    }),
  };
  if (cond.conditionFieldKey) {
    out.conditionFieldKey = map.get(cond.conditionFieldKey) ?? cond.conditionFieldKey;
  }
  return out;
}

function collectColumnKeys(terms: FormulaTerm[], out: Set<string>): void {
  for (const t of terms) {
    if (t.unit === "group") collectColumnKeys(Array.isArray(t.terms) ? t.terms : [], out);
    else if (t.unit === "column" && t.columnKey) out.add(t.columnKey);
  }
}

/**
 * 계약 카드 수식을 환불 카드 칸에 옮겨 싣는다.
 * 설정이 꺼져 있거나 기준금액 짝이 잘못됐으면 원본 배열을 그대로 돌려준다(동작 무변경).
 */
export function deriveRefundFields(
  contractFields: FieldDef[],
  refundFields: FieldDef[],
  follow: RefundFollowConfig,
): RefundDeriveResult {
  const warnings: RefundDeriveWarning[] = [];
  if (!follow || follow.enabled !== true) return { fields: refundFields, warnings };

  const cByKey = new Map(contractFields.map((f) => [f.key, f]));
  const rByKey = new Map(refundFields.map((f) => [f.key, f]));
  const base = follow.baseAmount;
  if (!base?.contract || !base?.refund || !cByKey.has(base.contract) || !rByKey.has(base.refund)) {
    return {
      fields: refundFields,
      warnings: [{ refundKey: base?.refund ?? "", reason: "기준 금액 칸 짝이 비었거나 그런 칸이 없습니다" }],
    };
  }

  // 코드리뷰(Task 2) 지적사항: 기준금액(환불) 칸이 이미 자동계산(수식) 칸이면, 아래에서
  // 붙이는 negateOnRead 표시를 계산기(evalFormulaForTier)가 조용히 무시한다 — formula 분기는
  // 재귀 호출로 먼저 반환되어 negateOnRead 를 보는 줄까지 가지 않는다. 관리자가 기준금액을
  // 자동계산 칸으로 잘못 지정해도 에러 없이 통과되면, 파생되는 모든 환불 수수료가 부호 없이
  // (플러스로) 계산돼 돈이 틀어지는데 아무 신호도 없다 — 그래서 여기서 미리 막는다.
  const baseRefundField = rByKey.get(base.refund)!;
  if (baseRefundField.type === "formula") {
    return {
      fields: refundFields,
      warnings: [{
        refundKey: base.refund,
        reason: "기준 금액 칸이 자동 계산(수식) 칸입니다 — 사람이 직접 입력하는 칸을 지정해야 부호 뒤집기가 적용됩니다",
      }],
    };
  }

  const map = new Map<string, string>([[base.contract, base.refund]]);
  for (const p of follow.pairs ?? []) {
    if (p?.contract && p?.refund) map.set(p.contract, p.refund);
  }

  // ── 1단계: 짝마다 식을 옮기고 참조 가능 여부 확인 ──
  const candidates: FieldDef[] = [];
  for (const p of follow.pairs ?? []) {
    const cf = p?.contract ? cByKey.get(p.contract) : undefined;
    const rf = p?.refund ? rByKey.get(p.refund) : undefined;
    if (!cf) {
      warnings.push({ refundKey: p?.refund ?? "", reason: `계약 카드에 '${p?.contract}' 칸이 없습니다` });
      continue;
    }
    if (!rf) {
      warnings.push({ refundKey: p?.refund ?? "", reason: `환불 카드에 '${p?.refund}' 칸이 없습니다` });
      continue;
    }
    const formula = Array.isArray(cf.formula) && cf.formula.length > 0 ? substTerms(cf.formula, map) : undefined;
    const conditional = substConditional(cf.conditional, map);

    const used = new Set<string>();
    if (formula) collectColumnKeys(formula, used);
    for (const r of conditional?.rules ?? []) {
      collectColumnKeys(Array.isArray(r.formula) ? r.formula : [], used);
    }
    const missing = [...used].filter((k) => !rByKey.has(k));
    if (missing.length > 0) {
      warnings.push({
        refundKey: p.refund,
        reason: `환불 카드에 없는 칸(${missing.join(", ")})을 참조해 적용하지 않았습니다`,
      });
      continue;
    }

    const next: FieldDef = { ...rf, type: "formula", derivedFromContract: cf.key };
    delete next.tableExposed;   // 표 노출은 파생하지 않는다(설계서 §2 비목표)
    delete next.formula;
    delete next.conditional;
    delete next.formulaResult;
    delete next.dateFormula;
    if (formula) next.formula = formula;
    if (conditional) next.conditional = conditional;
    if (cf.formulaResult) next.formulaResult = cf.formulaResult;
    if (cf.dateFormula) next.dateFormula = cf.dateFormula;
    candidates.push(next);
  }

  // ── 2단계: 부호 대칭 검사. 탈락한 칸을 참조하는 짝은 연쇄 탈락(더 이상 탈락이 없을 때까지) ──
  const alive = new Set(candidates.map((f) => f.key));
  for (let round = 0; round <= candidates.length; round++) {
    const unitKeys = new Set<string>([base.refund, ...alive]);
    const byKey = new Map<string, FieldDef>(refundFields.map((f) => [f.key, f]));
    for (const f of candidates) if (alive.has(f.key)) byKey.set(f.key, f);
    const ctx: SignCheckCtx = { unitKeys, byKey };

    const dropped: RefundDeriveWarning[] = [];
    for (const f of candidates) {
      if (!alive.has(f.key)) continue;
      const v = checkRefundSignSafety(f, ctx);
      if (!v.ok) dropped.push({ refundKey: f.key, reason: v.reason ?? "부호 검사에 걸렸습니다" });
    }
    if (dropped.length === 0) break;
    for (const d of dropped) {
      alive.delete(d.refundKey);
      warnings.push(d);
    }
  }

  // ── 3단계: 결과 조립 (원래 칸 순서 유지) ──
  const applied = new Map(candidates.filter((f) => alive.has(f.key)).map((f) => [f.key, f]));
  const fields = refundFields.map((f) => {
    const d = applied.get(f.key);
    if (d) return d;
    if (f.key === base.refund && applied.size > 0) return { ...f, negateOnRead: true };
    return f;
  });
  return { fields, warnings };
}
