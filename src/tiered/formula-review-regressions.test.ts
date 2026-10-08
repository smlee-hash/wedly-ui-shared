import { describe, expect, it } from "vitest";
import { evalFormulaForTierDetailed, type FieldDef, type FormulaTerm, type TierData } from "./index";
import { applyColumnTierSync, computeLinkedValue } from "../tier-link/sync";
import type { ColumnTierLink } from "../tier-link/config";

const num = (value: number): FormulaTerm[] => [{ op: "+", unit: "number", value }];
const amount = (key: string): FormulaTerm[] => [{ op: "+", unit: "column", columnKey: key }];
const row = (extra: Record<string, string | number | null> = {}): TierData => ({ id: "t", label: "시험 차수", ...extra });
const state: FieldDef = { key: "state", label: "조건 상태", type: "text" };
const conflicted = (): FieldDef => ({
  key: "child", label: "하위 수수료", type: "formula", formula: num(100_000),
  conditional: { match: "all", rules: [100_000, 200_000].map(value => ({
    leftKey: "state", right: { kind: "text", value: "conflict" }, formula: num(value),
  })) },
});

describe("총괄 판정의 저장·우선순위·금액 경계", () => {
  const link: ColumnTierLink = { columnKey: "표금액", section: "government-subsidy", area: "contract", tierFieldKey: "child", mode: "sum" };
  const date: FieldDef = { key: "date", label: "착수일", type: "date" };
  const missing = (): FieldDef => ({ key: "child", label: "수수료", type: "formula", formula: num(100_000), conditional: {
    match: "all", rules: [{ leftKey: "date", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(200_000) }],
  } });
  it.each(["conflict", "missing"])("저장 연결의 %s은 이전 자동값을 null로 지운다", kind => {
    const fields = kind === "conflict" ? [state, conflicted()] : [date, missing()];
    const tiers = kind === "conflict"
      ? [row({ state: "normal" }), { ...row({ state: "conflict" }), id: "b" }]
      : [row({ date: "2026-07-31" }), { ...row({ date: "" }), id: "b" }];
    const data = { 계약정보_차수: tiers, 표금액: 900_000 };
    const outcome = applyColumnTierSync(data, "계약정보_차수", tiers, [link], "government-subsidy", fields);
    expect(outcome).toEqual({ synced: { 표금액: null } });
    if ("synced" in outcome) Object.assign(data, outcome.synced);
    expect(data.표금액).toBeNull();
  });
  it.each([
    [[100_000, 200_000], 300_000], [[null, 100_000], 100_000], [[null, null], null],
    [[0, null], 0], [[100_000, -30_000], 70_000],
  ] as const)("일반 값 %j의 합계 호환은 보존한다", (values, expected) => {
    const fields: FieldDef[] = [{ key: "child", label: "입력 금액", type: "number" }];
    expect(computeLinkedValue(values.map(child => row({ child })), link, { fields })).toBe(expected);
  });
  it("전부 차단된 합계도 null이다", () => {
    expect(computeLinkedValue([row({ state: "conflict" }), row({ state: "conflict" })], link, { fields: [state, conflicted()] })).toBeNull();
  });
  it("최신 수식 차단은 이전 금액으로 되돌아가지 않는다", () => {
    expect(computeLinkedValue([row({ state: "normal" }), row({ state: "conflict" })], { ...link, mode: "latest" }, { fields: [state, conflicted()] })).toBeNull();
  });
  it.each(["_ovr_child", "_cf_child"])("합계에서도 승인된 %s 우선순위를 보존한다", key => {
    const saved = key === "_cf_child" ? { _cf_child: "rev-1", child: 40_000 } : { _ovr_child: 40_000 };
    expect(computeLinkedValue([row({ state: "normal" }), row({ state: "conflict", ...saved })], link, { fields: [state, conflicted()] })).toBe(140_000);
  });
  it.each([undefined, "first"] as const)("첫 일치 %s는 무관한 차단을 전파하지 않는다", match => {
    const child = conflicted();
    const blockedClause = { leftKey: "child", op: "gte" as const, right: { kind: "text" as const, value: "1" } };
    const trueClause = { leftKey: "state", right: { kind: "text" as const, value: "conflict" } };
    const falseClause = { leftKey: "state", right: { kind: "text" as const, value: "never" } };
    const rules = [
      { clauses: [blockedClause, falseClause], combine: "and" as const, formula: num(1) },
      { clauses: [blockedClause, trueClause], combine: "or" as const, formula: num(2) },
      { ...blockedClause, formula: num(3) },
    ];
    const parent: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(9), conditional: { match, rules } };
    expect(evalFormulaForTierDetailed(parent, row({ state: "conflict" }), [state, child, parent])).toMatchObject({ value: 2, ruleIdx: [1] });
    parent.conditional!.rules = [{ ...trueClause, formula: num(4) }, { ...blockedClause, formula: num(3) }];
    expect(evalFormulaForTierDetailed(parent, row({ state: "conflict" }), [state, child, parent]).value).toBe(4);
  });
  it.each([undefined, "first"] as const)("첫 일치 %s도 실제 영향을 주는 missing을 보존한다", match => {
    const child = missing();
    const parent: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match, rules: [
      { leftKey: "child", op: "gte", right: { kind: "text", value: "150000" }, formula: num(500_000) },
    ] } };
    expect(evalFormulaForTierDetailed(parent, row({ date: "" }), [date, child, parent])).toMatchObject({ value: null, blocked: { kind: "missing", keys: ["date"] } });
  });
  it.each(["eq", "neq", "contains", "notContains", "gte", "lte"] as const)("첫 일치의 빈 직접값 %s도 차단을 전파하지 않는다", op => {
    const parent: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { rules: [
      { leftKey: "child", op, right: { kind: "text", value: "   " }, formula: num(500_000) },
    ] } };
    const result = evalFormulaForTierDetailed(parent, row({ state: "conflict" }), [state, conflicted(), parent]);
    expect(result.value).toBe(300_000);
    expect(result.blocked).toBeUndefined();
  });
  it.each([
    [-1_000_000, -999_999], [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
    [0.3, 0.30000001], [1_000_000_000.1, 1_000_000_000.2],
  ])("서로 다른 금액 %s/%s는 충돌이다", (a, b) => {
    const field = conflicted();
    field.conditional!.rules[0].formula = num(a);
    field.conditional!.rules[1].formula = num(b);
    expect(evalFormulaForTierDetailed(field, row({ state: "conflict" }), [state, field])).toMatchObject({ value: null, blocked: { kind: "conflict" } });
  });
  it("70% 계산에서 생긴 부동소수점 잡음만 허용한다", () => {
    const field = conflicted();
    field.conditional!.rules[0].formula = [...num(700_000), { op: "*", unit: "percent", value: 70 }];
    field.conditional!.rules[1].formula = num(490_000);
    const result = evalFormulaForTierDetailed(field, row({ state: "conflict" }), [state, field]);
    expect(result.value).toBeCloseTo(490_000, 7);
    expect(result.blocked).toBeUndefined();
  });
  it("확정 참 조건들의 null/숫자도 다른 결과다", () => {
    const other: FieldDef = { key: "other", label: "빈 금액", type: "number" };
    const field = conflicted();
    field.conditional!.rules[0].formula = amount("other");
    const result = evalFormulaForTierDetailed(field, row({ state: "conflict", other: null }), [state, other, field]);
    expect(result).toMatchObject({ value: null, blocked: { kind: "conflict", ruleIdx: [0, 1] } });
  });
  it("미정 후보와 기본식이 모두 null이면 새로운 차단을 만들지 않는다", () => {
    const other: FieldDef = { key: "other", label: "빈 금액", type: "number" };
    const field = missing();
    field.formula = amount("other");
    field.conditional!.rules[0].formula = amount("other");
    const result = evalFormulaForTierDetailed(field, row({ date: "", other: null }), [date, other, field]);
    expect(result.value).toBeNull();
    expect(result.blocked).toBeUndefined();
  });
  it("날짜를 넣기 전 missing, 이후 실제 숫자/null 선택을 대조한다", () => {
    const other: FieldDef = { key: "other", label: "빈 금액", type: "number" };
    const field = missing();
    field.conditional!.rules[0].formula = amount("other");
    const evaluate = (value: string) => evalFormulaForTierDetailed(field, row({ date: value, other: null }), [date, other, field]);
    expect(evaluate("")).toMatchObject({ value: null, blocked: { kind: "missing" } });
    expect(evaluate("2026-07-31")).toMatchObject({ value: 100_000 });
    expect(evaluate("2026-08-01").value).toBeNull();
    expect(evaluate("2026-08-01").blocked).toBeUndefined();
  });
});

describe("독립 리뷰의 실제 계산 회귀", () => {
  it("부분 금액을 전체 합계로 저장하지 않는다", () => {
    const fields = [state, conflicted()];
    expect(computeLinkedValue([row({ state: "normal" }), row({ state: "conflict" })], {
      columnKey: "표금액", section: "government-subsidy", area: "contract", tierFieldKey: "child", mode: "sum",
    }, { fields })).toBeNull();
  });
  it.each([undefined, "first"] as const)("첫 일치(%s) 조건이 하위 수식의 차단을 버리지 않는다", match => {
    const child = conflicted();
    const parent: FieldDef = { key: "parent", label: "상위 수수료", type: "formula", formula: num(300_000), conditional: {
      match, rules: [{ leftKey: "child", op: "gte", right: { kind: "text", value: "150000" }, formula: num(500_000) }],
    } };
    const result = evalFormulaForTierDetailed(parent, row({ state: "conflict" }), [state, child, parent]);
    expect(result.value).toBeNull();
    expect(result.blocked?.kind).toBe("conflict");
  });
  it.each([1_000_000, 1_000_000_000])("%i원의 실제 1원 차이를 부동소수점 오차로 넘기지 않는다", value => {
    const field = conflicted();
    field.conditional!.rules[0].formula = num(value);
    field.conditional!.rules[1].formula = num(value + 1);
    const result = evalFormulaForTierDetailed(field, row({ state: "conflict" }), [state, field]);
    expect(result.value).toBeNull();
    expect(result.blocked?.kind).toBe("conflict");
  });
  it("미정 날짜가 금액과 null을 가르면 누락을 알린다", () => {
    const other: FieldDef = { key: "other", label: "다른 금액", type: "number" };
    const field: FieldDef = { key: "fee", label: "수수료", type: "formula", formula: num(300_000), conditional: {
      match: "all", rules: [{ leftKey: "date", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: amount("other") }],
    } };
    const result = evalFormulaForTierDetailed(field, row({ date: "", other: null }), [other, field]);
    expect(result.value).toBeNull();
    expect(result.blocked).toMatchObject({ kind: "missing", keys: ["date"] });
  });
  it.each(["eq", "neq", "contains", "notContains"] as const)("빈 직접값 %s은 하위 차단과 무관하게 거짓이다", op => {
    const child = conflicted();
    const parent: FieldDef = { key: "parent", label: "상위 수수료", type: "formula", formula: num(300_000), conditional: {
      match: "all", rules: [{ leftKey: "child", op, right: { kind: "text", value: "" }, formula: num(500_000) }],
    } };
    const result = evalFormulaForTierDetailed(parent, row({ state: "conflict" }), [state, child, parent]);
    expect(result.value).toBe(300_000);
    expect(result.blocked).toBeUndefined();
  });
});
