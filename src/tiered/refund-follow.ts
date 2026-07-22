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

// 코드리뷰 Finding 2(Important): "환불 카드에 없는 칸" 검사가 지금까지 식(formula) 안의 컬럼
// 참조만 봤다 — 조건(conditional) 의 기준 칸은 안 봤다. 계약 카드에만 있는 칸(예: select 칸)을
// 조건 기준으로 삼은 계약 수식은 환불 카드에 그 칸이 없어 조건이 절대 매칭되지 않고 기본(그 외)
// 식으로 조용히 빠진다 — 계약과 다른 요율이 적용돼도 경고가 없다. 그래서 치환 전(원본 계약 칸
// 기준) 조건 키를 모아 별도로 검사한다. (평면 기본정보 칸은 계약 카드 필드가 아니므로 여기서
// 걸러지지 않고 그대로 통과 — 서울·경기·인천 조건이 그 예.)
function collectConditionKeys(cond: FieldDef["conditional"], out: Set<string>): void {
  if (!cond || !Array.isArray(cond.rules)) return;
  if (cond.conditionFieldKey) out.add(cond.conditionFieldKey);
  for (const r of cond.rules) {
    if (!r) continue;
    if (r.leftKey) out.add(r.leftKey);
    if (r.right && r.right.kind === "field") out.add(r.right.key);
    if (Array.isArray(r.clauses)) {
      for (const c of r.clauses) {
        if (!c) continue;
        if (c.leftKey) out.add(c.leftKey);
        if (c.right && c.right.kind === "field") out.add(c.right.key);
      }
    }
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

  // 코드리뷰 Finding 1(Important): 짝(pairs) 목록을 그대로 맵으로 만들면(마지막 쓰기 우선) refund
  // 키 중복을 못 잡는다. 두 짝의 refund 키가 같으면, 치환 후 그 칸이 자기 자신을 참조하는 수식이
  // 된다 — 부호검사는 자기 키가 unitKeys 에 있어 1차로 셈해 통과하고, 계산기의 순환참조 가드가
  // 조용히 0으로 읽어 그럴듯하지만 틀린 금액이 나온다(경고도 없음). refund 키가 기준금액칸
  // (baseAmount.refund) 과 같으면 기준금액칸 자체가 자기참조 수식이 되어 negateOnRead 를 못
  // 붙이고 모든 파생 수수료가 0이 된다(원래 형식 가드는 원본 기준칸의 type만 보므로 이 경우를
  // 놓친다). 그래서 파생 전에 refund 키가 injective(1:1) 가 되도록 먼저 걸러낸다(첫 짝이 우선,
  // 나중 중복 짝은 버려짐).
  const seenRefundTargets = new Set<string>();
  const pairs: RefundFollowPair[] = [];
  for (const p of follow.pairs ?? []) {
    if (p?.refund) {
      if (p.refund === base.refund) {
        warnings.push({
          refundKey: p.refund,
          reason: `계약 칸 '${p.contract}' 짝의 환불 키가 기준 금액 칸('${p.refund}')과 같아 기준 금액 칸이 자기참조 수식이 되므로 이 짝은 적용하지 않았습니다`,
        });
        continue;
      }
      if (seenRefundTargets.has(p.refund)) {
        warnings.push({
          refundKey: p.refund,
          reason: `계약 칸 '${p.contract}' 짝이 다른 짝과 같은 환불 칸('${p.refund}')을 가리켜 자기참조 수식이 되므로 이 짝은 적용하지 않았습니다`,
        });
        continue;
      }
      seenRefundTargets.add(p.refund);
    }
    pairs.push(p);
  }

  const map = new Map<string, string>([[base.contract, base.refund]]);
  for (const p of pairs) {
    if (p?.contract && p?.refund) map.set(p.contract, p.refund);
  }

  // ── 1단계: 짝마다 식을 옮기고 참조 가능 여부 확인 ──
  const candidates: FieldDef[] = [];
  for (const p of pairs) {
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

    // Finding 2: 조건 기준 칸(치환 전, 원본 계약 칸 기준)이 "계약 카드 칸"인데 치환된(또는 그대로의)
    // 키가 환불 카드에 없으면, 환불 카드에서 그 조건은 절대 매칭될 수 없다 — 조용히 기본식으로
    // 빠져 계약과 다른 요율이 적용된다. 평면 기본정보 칸(계약 카드 필드가 아닌 키)은 대상 아님.
    const condKeys = new Set<string>();
    collectConditionKeys(cf.conditional, condKeys);
    let missingCondKey: string | undefined;
    for (const k of condKeys) {
      if (!cByKey.has(k)) continue; // 계약 카드 칸이 아니면(=평면 기본정보 칸) 통과
      const mapped = map.get(k) ?? k;
      if (!rByKey.has(mapped)) { missingCondKey = k; break; }
    }
    if (missingCondKey) {
      warnings.push({
        refundKey: p.refund,
        reason: `조건이 계약 카드에만 있는 칸('${missingCondKey}')을 기준으로 삼아 환불 카드에서는 판정할 수 없어 적용하지 않았습니다`,
      });
      continue;
    }

    // Finding 4: tableExposed 는 계약 칸에서 "복사하지 않는다"가 원칙이지 환불 칸 자체 값을
    // 지우는 게 아니다. next 는 rf(환불 칸 원본)를 스프레드해 만들므로 애초에 계약 값이 섞이지
    // 않는다 — 여기서 delete 하지 않는 것만으로 환불 칸이 원래 갖고 있던 값이 그대로 유지된다.
    const next: FieldDef = { ...rf, type: "formula", derivedFromContract: cf.key };
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
