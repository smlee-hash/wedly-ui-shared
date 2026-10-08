// src/tiered/formula-block.test.ts
// 조건별 수식의 "모든 조건 보기"(conditional.match = "all") — 우선순위 없이 맞는 조건을 모두 보고,
// 결과가 다르거나 날짜 칸이 비어 결과를 가릴 수 없으면 그 칸을 계산하지 않는다(이아영 10/8 11:54 답).
// 플래그가 없는 옛 정의는 지금처럼 위에서부터 처음 맞는 조건을 쓴다.
import { describe, it, expect } from "vitest";
import {
  evalFormulaForTier,
  evalFormulaForTierDetailed,
  formulaBlockMessage,
  FORMULA_BLOCK_TAG,
  overrideKeyOf,
  TIER_MANAGED_PREFIX,
  type ConditionalRule,
  type FieldDef,
  type FormulaBlock,
  type FormulaTerm,
  type TierData,
} from "./index";
import { deriveRefundFields } from "./refund-follow";

const col = (k: string, op: FormulaTerm["op"] = "+"): FormulaTerm => ({ op, unit: "column", columnKey: k });
const pct = (v: number, op: FormulaTerm["op"] = "*"): FormulaTerm => ({ op, unit: "percent", value: v });
const tier = (v: Record<string, string | number | null>): TierData => ({ id: "t1", label: "1차 계약", ...v });

// 8/1 기준: 착수일이 8/1 이후이거나(착수일 기준) 계약일이 8/1 이후면(착수일은 계약일보다 늦으므로) 20%.
const AUG_RULE: ConditionalRule = {
  clauses: [
    { leftKey: "착수일", op: "gte", right: { kind: "text", value: "2026-08-01" } },
    { leftKey: "계약일", op: "gte", right: { kind: "text", value: "2026-08-01" } },
  ],
  combine: "or",
  formula: [col("계약금"), pct(20)],
};

function contractFields(opts: { match?: "first" | "all"; rules?: ConditionalRule[] } = {}): FieldDef[] {
  const conditional = {
    rules: opts.rules ?? [AUG_RULE],
    ...(opts.match ? { match: opts.match } : {}),
  } as FieldDef["conditional"];
  return [
    { key: "계약금", label: "계약금", type: "number" },
    { key: "계약일", label: "계약일", type: "date" },
    { key: "착수일", label: "착수일", type: "date" },
    { key: "컨설팅담당", label: "컨설팅 담당", type: "text" },
    {
      key: "컨설턴트", label: "[컨설턴트] 계약금 수수료", type: "formula",
      formula: [col("계약금"), pct(30)],
      conditional,
    },
    { key: "하이브", label: "[하이브] 계약금 수수료", type: "formula", formula: [col("계약금"), pct(60)] },
    {
      key: "위들리", label: "[위들리] 계약금 수수료", type: "formula",
      formula: [col("계약금"), col("컨설턴트", "-"), col("하이브", "-")],
    },
  ];
}
const byKey = (fs: FieldDef[], k: string) => fs.find((f) => f.key === k)!;

describe("플래그 없는 옛 정의 — 지금과 같다(위에서 처음 맞는 조건)", () => {
  const rules: ConditionalRule[] = [
    { leftKey: "컨설팅담당", op: "eq", right: { kind: "text", value: "하이브" }, formula: [col("계약금"), pct(10)] },
    AUG_RULE,
  ];
  it("두 조건이 모두 맞아도 위 조건의 식을 쓴다", () => {
    const fs = contractFields({ rules });
    const t = tier({ 계약금: 1_000_000, 계약일: "2026-08-03", 착수일: "2026-08-03", 컨설팅담당: "하이브" });
    expect(evalFormulaForTier(byKey(fs, "컨설턴트"), t, fs)).toBeCloseTo(100_000);
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), t, fs);
    expect(d.value).toBeCloseTo(100_000);
    expect(d.blocked).toBeUndefined();
    expect(d.ruleIdx).toEqual([0]);
  });
  it("match: \"first\" 도 옛 동작과 같다", () => {
    const fs = contractFields({ rules, match: "first" });
    const t = tier({ 계약금: 1_000_000, 계약일: "2026-08-03", 착수일: "2026-08-03", 컨설팅담당: "하이브" });
    expect(evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), t, fs).value).toBeCloseTo(100_000);
  });
  it("착수일이 비고 계약일이 8/1 전이면 기본식(30%) — 막지 않는다", () => {
    const fs = contractFields();
    const t = tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "" });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), t, fs);
    expect(d.value).toBeCloseTo(300_000);
    expect(d.blocked).toBeUndefined();
    expect(d.ruleIdx).toEqual([]);
  });
});

describe("match: \"all\" — 착수일 기준(8/1)", () => {
  const fs = contractFields({ match: "all" });
  const consultant = byKey(fs, "컨설턴트");
  it("착수일이 8/1 이후면 20%", () => {
    const d = evalFormulaForTierDetailed(consultant, tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "2026-08-03" }), fs);
    expect(d.value).toBeCloseTo(200_000);
    expect(d.blocked).toBeUndefined();
    expect(d.ruleIdx).toEqual([0]);
  });
  it("착수일이 8/1 전이면 기본식 30%", () => {
    const d = evalFormulaForTierDetailed(consultant, tier({ 계약금: 1_000_000, 계약일: "2026-07-20", 착수일: "2026-07-25" }), fs);
    expect(d.value).toBeCloseTo(300_000);
    expect(d.blocked).toBeUndefined();
    expect(d.ruleIdx).toEqual([]);
  });
  it("착수일이 비어도 계약일이 8/1 이후면 20% — 결과가 하나로 정해져 막지 않는다", () => {
    const d = evalFormulaForTierDetailed(consultant, tier({ 계약금: 1_000_000, 계약일: "2026-08-03", 착수일: "" }), fs);
    expect(d.value).toBeCloseTo(200_000);
    expect(d.blocked).toBeUndefined();
  });
  it("계약일이 8/1 전인데 착수일이 비면 계산하지 않는다(착수일 없음)", () => {
    const t = tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "" });
    const d = evalFormulaForTierDetailed(consultant, t, fs);
    expect(d.value).toBeNull();
    expect(d.blocked).toEqual({ kind: "missing", keys: ["착수일"], from: "컨설턴트" });
    expect(evalFormulaForTier(consultant, t, fs)).toBeNull();
  });
  it("계약일·착수일이 모두 비면 두 칸을 함께 알린다", () => {
    const d = evalFormulaForTierDetailed(consultant, tier({ 계약금: 1_000_000, 계약일: "", 착수일: "" }), fs);
    expect(d.value).toBeNull();
    expect(d.blocked?.kind).toBe("missing");
    expect(d.blocked && d.blocked.kind === "missing" ? [...d.blocked.keys].sort() : []).toEqual(["계약일", "착수일"]);
  });
  it("계약금이 비어 어느 식도 값이 없으면 지금처럼 빈 값, 안내 없음", () => {
    const d = evalFormulaForTierDetailed(consultant, tier({ 계약금: null, 계약일: "2026-07-28", 착수일: "" }), fs);
    expect(d.value).toBeNull();
    expect(d.blocked).toBeUndefined();
  });
  it("착수일 칸이 차수에 없고 기본정보(conditionValues)에만 있어도 같은 기준으로 판정한다", () => {
    const t = tier({ 계약금: 1_000_000 });
    expect(evalFormulaForTierDetailed(consultant, t, fs, undefined, { 계약일: "2026-07-28", 착수일: "2026-08-05" }).value).toBeCloseTo(200_000);
    const d = evalFormulaForTierDetailed(consultant, t, fs, undefined, { 계약일: "2026-07-28" });
    expect(d.blocked).toEqual({ kind: "missing", keys: ["착수일"], from: "컨설턴트" });
  });
  it("비교 값 쪽이 다른 칸이고 그 칸이 비어도 모름으로 본다", () => {
    const rules: ConditionalRule[] = [{
      clauses: [{ leftKey: "착수일", op: "gte", right: { kind: "field", key: "계약일" } }],
      formula: [col("계약금"), pct(20)],
    }];
    const f2 = contractFields({ match: "all", rules });
    const d = evalFormulaForTierDetailed(byKey(f2, "컨설턴트"), tier({ 계약금: 1_000_000, 계약일: "", 착수일: "2026-08-03" }), f2);
    expect(d.blocked).toEqual({ kind: "missing", keys: ["계약일"], from: "컨설턴트" });
  });
});

describe("match: \"all\" — 맞는 조건이 둘 이상", () => {
  const hiveRule: ConditionalRule = {
    leftKey: "컨설팅담당", op: "eq", right: { kind: "text", value: "하이브" }, formula: [col("계약금"), pct(10)],
  };
  it("결과가 다르면 계산하지 않는다(조건 결과가 다름)", () => {
    const fs = contractFields({ match: "all", rules: [hiveRule, AUG_RULE] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"),
      tier({ 계약금: 1_000_000, 계약일: "2026-08-03", 착수일: "2026-08-03", 컨설팅담당: "하이브" }), fs);
    expect(d.value).toBeNull();
    expect(d.blocked).toEqual({ kind: "conflict", ruleIdx: [0, 1], from: "컨설턴트" });
    expect(d.ruleIdx).toEqual([0, 1]);
  });
  it("결과가 같으면 그 값을 쓴다", () => {
    const same: ConditionalRule = { ...hiveRule, formula: [col("계약금"), pct(20)] };
    const fs = contractFields({ match: "all", rules: [same, AUG_RULE] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"),
      tier({ 계약금: 1_000_000, 계약일: "2026-08-03", 착수일: "2026-08-03", 컨설팅담당: "하이브" }), fs);
    expect(d.value).toBeCloseTo(200_000);
    expect(d.blocked).toBeUndefined();
    expect(d.ruleIdx).toEqual([0, 1]);
  });
  it("소수 계산 오차만큼의 차이는 같은 결과로 본다", () => {
    const a: ConditionalRule = { ...hiveRule, formula: [col("계약금"), pct(70)] };
    // 700,000 × 70% = 489,999.99999999994, 700,000 × 7 ÷ 10 = 490,000 — 같은 금액이다.
    const b: ConditionalRule = {
      ...AUG_RULE,
      formula: [col("계약금"), { op: "*", unit: "number", value: 7 }, { op: "/", unit: "number", value: 10 }],
    };
    const fs = contractFields({ match: "all", rules: [a, b] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"),
      tier({ 계약금: 700_000, 계약일: "2026-08-03", 착수일: "2026-08-03", 컨설팅담당: "하이브" }), fs);
    expect(d.blocked).toBeUndefined();
    expect(d.value).toBeCloseTo(490_000);
  });
  it("모르는 조건의 결과가 정해진 결과와 다르면 막는다(맞는 조건 하나 + 착수일 없음)", () => {
    const fs = contractFields({ match: "all", rules: [hiveRule, AUG_RULE] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"),
      tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "", 컨설팅담당: "하이브" }), fs);
    expect(d.value).toBeNull();
    expect(d.blocked).toEqual({ kind: "missing", keys: ["착수일"], from: "컨설턴트" });
    expect(d.ruleIdx).toEqual([0]);
  });
  it("모르는 조건의 결과가 정해진 결과와 같으면 막지 않는다", () => {
    const same: ConditionalRule = { ...hiveRule, formula: [col("계약금"), pct(20)] };
    const fs = contractFields({ match: "all", rules: [same, AUG_RULE] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"),
      tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "", 컨설팅담당: "하이브" }), fs);
    expect(d.value).toBeCloseTo(200_000);
    expect(d.blocked).toBeUndefined();
  });
  it("글자 조건(같음)의 빈 값은 지금처럼 '맞지 않음' — 막지 않는다", () => {
    const fs = contractFields({ match: "all", rules: [hiveRule] });
    const d = evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), tier({ 계약금: 1_000_000, 컨설팅담당: "" }), fs);
    expect(d.value).toBeCloseTo(300_000);
    expect(d.blocked).toBeUndefined();
  });
});

describe("match: \"all\" — 그리고/또는 의 모름 조합", () => {
  const andRule: ConditionalRule = {
    clauses: [
      { leftKey: "컨설팅담당", op: "eq", right: { kind: "text", value: "하이브" } },
      { leftKey: "착수일", op: "gte", right: { kind: "text", value: "2026-08-01" } },
    ],
    combine: "and",
    formula: [col("계약금"), pct(20)],
  };
  const fs = contractFields({ match: "all", rules: [andRule] });
  const c = byKey(fs, "컨설턴트");
  it("그리고: 다른 절이 거짓이면 모름이 있어도 거짓 → 기본식", () => {
    const d = evalFormulaForTierDetailed(c, tier({ 계약금: 1_000_000, 컨설팅담당: "위들리", 착수일: "" }), fs);
    expect(d.value).toBeCloseTo(300_000);
    expect(d.blocked).toBeUndefined();
  });
  it("그리고: 다른 절이 참이고 날짜가 비면 모름 → 막음", () => {
    const d = evalFormulaForTierDetailed(c, tier({ 계약금: 1_000_000, 컨설팅담당: "하이브", 착수일: "" }), fs);
    expect(d.blocked).toEqual({ kind: "missing", keys: ["착수일"], from: "컨설턴트" });
  });
  it("또는: 다른 절이 참이면 모름이 있어도 참", () => {
    const orRule: ConditionalRule = { ...andRule, combine: "or" };
    const f2 = contractFields({ match: "all", rules: [orRule] });
    const d = evalFormulaForTierDetailed(byKey(f2, "컨설턴트"), tier({ 계약금: 1_000_000, 컨설팅담당: "하이브", 착수일: "" }), f2);
    expect(d.value).toBeCloseTo(200_000);
    expect(d.blocked).toBeUndefined();
  });
});

describe("막힘은 참조로 번진다", () => {
  const fs = contractFields({ match: "all" });
  const t = tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "" });
  it("막힌 칸을 빼는 위들리 수수료도 같은 이유로 막힌다(0 으로 빼서 틀린 금액을 만들지 않는다)", () => {
    const d = evalFormulaForTierDetailed(byKey(fs, "위들리"), t, fs);
    expect(d.value).toBeNull();
    expect(d.blocked).toEqual({ kind: "missing", keys: ["착수일"], from: "컨설턴트" });
    expect(evalFormulaForTier(byKey(fs, "위들리"), t, fs)).toBeNull();
  });
  it("막힌 칸과 상관없는 칸은 그대로 계산된다", () => {
    expect(evalFormulaForTierDetailed(byKey(fs, "하이브"), t, fs)).toEqual({ value: 600_000, ruleIdx: [] });
  });
  it("막히지 않으면 참조하는 칸도 정상 계산", () => {
    const ok = tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "2026-08-03" });
    expect(evalFormulaForTier(byKey(fs, "위들리"), ok, fs)).toBeCloseTo(200_000);
  });
  it("값이 없는(입력이 없는) 참조는 지금처럼 빼지 않고 계산한다", () => {
    const empty = tier({ 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "2026-08-03" });
    const f2: FieldDef[] = [...fs, { key: "추가", label: "추가", type: "number" },
      { key: "합", label: "합", type: "formula", formula: [col("계약금"), col("추가")] }];
    expect(evalFormulaForTier(byKey(f2, "합"), empty, f2)).toBe(1_000_000);
  });
  it("막힌 칸을 조건으로 보는 칸: 모든 조건 보기면 모름으로 보고 결과가 갈리면 막는다", () => {
    const f2: FieldDef[] = [...fs, {
      key: "보너스", label: "보너스", type: "formula", formula: [{ op: "+", unit: "number", value: 0 }],
      conditional: {
        match: "all",
        rules: [{ leftKey: "컨설턴트", op: "gte", right: { kind: "text", value: "250000" }, formula: [{ op: "+", unit: "number", value: 1 }] }],
      },
    } as FieldDef];
    const d = evalFormulaForTierDetailed(byKey(f2, "보너스"), t, f2);
    expect(d.value).toBeNull();
    expect(d.blocked?.kind).toBe("missing");
  });
});

describe("직접 입력·관리 값은 지금처럼 먼저 쓴다", () => {
  const fs = contractFields({ match: "all" });
  const base = { 계약금: 1_000_000, 계약일: "2026-07-28", 착수일: "" };
  it("막힌 칸도 관리자가 직접 넣은 값이 있으면 그 값", () => {
    const t = tier({ ...base, [overrideKeyOf("컨설턴트")]: 250_000 });
    expect(evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), t, fs)).toEqual({ value: 250_000 });
    // 직접 넣은 값을 참조하는 위들리는 막히지 않는다.
    expect(evalFormulaForTierDetailed(byKey(fs, "위들리"), t, fs).value).toBeCloseTo(150_000);
  });
  it("승인된 관리 값(_cf_)도 먼저 쓴다", () => {
    const t = tier({ ...base, 컨설턴트: 220_000, [TIER_MANAGED_PREFIX + "컨설턴트"]: "rev-1" });
    expect(evalFormulaForTierDetailed(byKey(fs, "컨설턴트"), t, fs)).toEqual({ value: 220_000 });
  });
});

describe("안내 문구", () => {
  const labels: Record<string, string> = {
    착수일: "착수일", 계약일: "계약일", 주소: "사업장 주소", db: "DB", 컨설턴트: "[컨설턴트] 계약금 수수료",
  };
  const labelOf = (k: string) => labels[k];
  it("짧은 표시는 「계산 안 함」", () => {
    expect(FORMULA_BLOCK_TAG).toBe("계산 안 함");
  });
  it("빈 칸 이름과 조사(이/가)를 붙인다", () => {
    expect(formulaBlockMessage({ kind: "missing", keys: ["착수일"], from: "컨설턴트" }, labelOf))
      .toBe("착수일이 입력되지 않아 수수료 계산이 불가능합니다");
    expect(formulaBlockMessage({ kind: "missing", keys: ["주소"], from: "컨설턴트" }, labelOf))
      .toBe("사업장 주소가 입력되지 않아 수수료 계산이 불가능합니다");
    expect(formulaBlockMessage({ kind: "missing", keys: ["계약일", "착수일"], from: "컨설턴트" }, labelOf))
      .toBe("계약일·착수일이 입력되지 않아 수수료 계산이 불가능합니다");
    expect(formulaBlockMessage({ kind: "missing", keys: ["db"], from: "컨설턴트" }, labelOf))
      .toBe("DB이(가) 입력되지 않아 수수료 계산이 불가능합니다");
  });
  it("이름표가 없으면 칸 키를 그대로 쓴다", () => {
    expect(formulaBlockMessage({ kind: "missing", keys: ["모르는칸"], from: "x" }, () => undefined))
      .toBe("모르는칸이 입력되지 않아 수수료 계산이 불가능합니다");
  });
  it("조건 결과가 다름", () => {
    const b: FormulaBlock = { kind: "conflict", ruleIdx: [0, 1], from: "컨설턴트" };
    expect(formulaBlockMessage(b, labelOf)).toBe("맞는 조건이 둘 이상인데 결과가 달라 수수료를 자동 계산하지 않았습니다");
    expect(formulaBlockMessage(b, labelOf, "컨설턴트")).toBe("맞는 조건이 둘 이상인데 결과가 달라 수수료를 자동 계산하지 않았습니다");
  });
  it("다른 칸에서 번진 「결과가 다름」은 원래 칸 이름을 알린다", () => {
    const b: FormulaBlock = { kind: "conflict", ruleIdx: [0, 1], from: "컨설턴트" };
    expect(formulaBlockMessage(b, labelOf, "위들리"))
      .toBe("[컨설턴트] 계약금 수수료의 조건 결과가 달라 함께 계산하지 않았습니다");
  });
});

describe("환불 카드 계약 수식 따라가기 — 모든 조건 보기 표시를 함께 옮긴다", () => {
  it("계약 칸의 conditional.match 가 환불 칸에도 남는다", () => {
    const contract: FieldDef[] = [
      { key: "계약금", label: "계약금", type: "number" },
      {
        key: "수수료", label: "수수료", type: "formula", formula: [col("계약금"), pct(30)],
        conditional: { match: "all", rules: [{ leftKey: "구분", op: "eq", right: { kind: "text", value: "A" }, formula: [col("계약금"), pct(20)] }] },
      } as FieldDef,
    ];
    const refund: FieldDef[] = [
      { key: "환불금액", label: "환불 금액", type: "number" },
      { key: "환불수수료", label: "환불 수수료", type: "number" },
    ];
    const r = deriveRefundFields(contract, refund, {
      enabled: true, baseAmount: { contract: "계약금", refund: "환불금액" }, pairs: [{ refund: "환불수수료", contract: "수수료" }],
    });
    const f = r.fields.find((x) => x.key === "환불수수료")!;
    expect(f.conditional?.match).toBe("all");
  });
});
