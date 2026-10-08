import { describe, expect, it } from "vitest";
import { evalDateFormulaForTier, evalFormulaForTierDetailed, type ConditionOp, type FieldDef, type FormulaTerm, type TierData } from "./index";
import { computeLinkedValue } from "../tier-link/sync";
const num = (value: number): FormulaTerm[] => [{ op: "+", unit: "number", value }];
const tier = (more: Record<string, string | number | null> = {}): TierData => ({ id: "a", label: "시험", ...more });
const date: FieldDef = { key: "date", label: "날짜", type: "date" };
const state: FieldDef = { key: "state", label: "상태", type: "text" };
const blank: FieldDef = { key: "blank", label: "빈 일반 칸", type: "number" };
const child = (kind: "missing" | "conflict"): FieldDef => ({ key: "child", label: "하위", type: "formula", formula: num(100_000), conditional: {
  match: "all", rules: kind === "missing"
    ? [{ leftKey: "date", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(200_000) }]
    : [100_000, 200_000].map(value => ({ leftKey: "state", right: { kind: "text", value: "yes" }, formula: num(value) })),
} });
const link = { columnKey: "flat", area: "contract" as const, tierFieldKey: "parent", mode: "sum" as const };
describe("재리뷰 실제 선택 영향·날짜·미정 후보 경계", () => {
  for (const match of [undefined, "first", "all"] as const) {
    const ops: ConditionOp[] = match === "all" ? ["eq", "neq", "contains", "notContains"] : ["eq", "neq", "contains", "notContains", "gte", "lte"];
    for (const kind of ["missing", "conflict"] as const) for (const reverse of [false, true]) {
      it.each(ops)(`${match}/${kind}/${reverse} 일반 빈칸과 하위blocked 비교 %s는 선택과 무관하다`, op => {
        const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match, rules: [{ leftKey: reverse ? "child" : "blank", op, right: { kind: "field", key: reverse ? "blank" : "child" }, formula: num(500_000) }] } };
        const fields = [date, state, blank, child(kind), f];
        const t = tier({ state: "yes", date: "", blank: "" });
        expect(evalFormulaForTierDetailed(f, t, fields)).toMatchObject({ value: 300_000 });
        expect(evalFormulaForTierDetailed(f, t, fields).blocked).toBeUndefined();
        expect(computeLinkedValue([t], link, { fields })).toBe(300_000);
      });
    }
  }
  it("날짜 수식으로 계산한 날짜를 조건에서도 그대로 읽는다", () => {
    const computed: FieldDef = { key: "computedDate", label: "계산 날짜", type: "formula", formulaResult: "date", dateFormula: { mode: "offset", baseKey: "date", offsets: [{ amount: 1, unit: "day" }] } };
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "computedDate", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(200_000) }] } };
    const fields = [date, computed, f], t = tier({ date: "2026-08-02" });
    expect(evalDateFormulaForTier(computed, t, fields)).toBe("2026-08-03");
    expect(evalFormulaForTierDetailed(f, t, fields)).toMatchObject({ value: 200_000 });
    expect(computeLinkedValue([t], link, { fields })).toBe(200_000);
  });
  it.each(["gte", "lte"] as const)("비교 불가능한 직접값의 %s는 빈 날짜에도 거짓이다", op => {
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "date", op, right: { kind: "text", value: "하이브" }, formula: num(500_000) }] } };
    expect(evalFormulaForTierDetailed(f, tier({ date: "" }), [date, f])).toMatchObject({ value: 300_000 });
    expect(computeLinkedValue([tier({ date: "" })], link, { fields: [date, f] })).toBe(300_000);
  });
  it("미정 후보는 첫 참 결과뿐 아니라 모든 참 결과와 대조한다", () => {
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(0), conditional: { match: "all", rules: [
      ...[1_000_000, 1_000_000.0000000016].map(value => ({ leftKey: "state", right: { kind: "text" as const, value: "yes" }, formula: num(value) })),
      { leftKey: "date", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(999_999.9999999984) },
    ] } };
    expect(evalFormulaForTierDetailed(f, tier({ state: "yes", date: "" }), [date, state, f])).toMatchObject({ value: null, blocked: { kind: "missing" } });
    expect(evalFormulaForTierDetailed(f, tier({ state: "yes", date: "2026-08-01" }), [date, state, f])).toMatchObject({ value: null, blocked: { kind: "conflict" } });
  });
});

describe("총괄 추가 회귀", () => {
  it.each([false, true])("같은 미정 조건의 두 후보 사이 충돌도 missing이다 (T존재=%s)", hasTrue => {
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(1_000_000), conditional: { match: "all", rules: [
      ...(hasTrue ? [{ leftKey: "state", right: { kind: "text" as const, value: "yes" }, formula: num(1_000_000) }] : []),
      ...[1_000_000.0000000016, 999_999.9999999984].map(value => ({ leftKey: "date", op: "gte" as const, right: { kind: "text" as const, value: "2026-08-01" }, formula: num(value) })),
    ] } };
    expect(evalFormulaForTierDetailed(f, tier({ state: "yes", date: "" }), [date, state, f])).toMatchObject({ value: null, blocked: { kind: "missing" } });
    expect(computeLinkedValue([tier({ state: "yes", date: "" })], link, { fields: [date, state, f] })).toBeNull();
    expect(evalFormulaForTierDetailed(f, tier({ state: "yes", date: "2026-08-03" }), [date, state, f])).toMatchObject({ value: null, blocked: { kind: "conflict" } });
  });
  it("오른쪽 계산 날짜와 conditionValues도 날짜 평가기로 읽는다", () => {
    const computed: FieldDef = { key: "computedDate", label: "계산 날짜", type: "formula", formulaResult: "date", dateFormula: { mode: "offset", baseKey: "contextDate", offsets: [{ amount: 1, unit: "day" }] } };
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "date", op: "gte", right: { kind: "field", key: "computedDate" }, formula: num(200_000) }] } };
    expect(evalFormulaForTierDetailed(f, tier({ date: "2026-08-03" }), [date, computed, f], undefined, { contextDate: "2026-08-02" })).toMatchObject({ value: 200_000 });
  });
  it.each(["missing", "cycle"])("계산 날짜의 %s는 유한한 missing으로 반환한다", kind => {
    const computed: FieldDef = { key: "computedDate", label: "계산 날짜", type: "formula", formulaResult: "date", dateFormula: { mode: "offset", baseKey: kind === "cycle" ? "computedDate" : "date", offsets: [{ amount: 1, unit: "day" }] } };
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "computedDate", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(200_000) }] } };
    expect(evalFormulaForTierDetailed(f, tier(), [date, computed, f])).toMatchObject({ value: null, blocked: { kind: "missing", keys: ["computedDate"] } });
  });
  it.each(["   ", []])("공백/빈 배열 %j은 ordinary empty다", value => {
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "blank", op: "neq", right: { kind: "field", key: "child" }, formula: num(200_000) }] } };
    expect(evalFormulaForTierDetailed(f, { ...tier({ state: "yes" }), blank: value } as TierData, [state, blank, child("conflict"), f])).toMatchObject({ value: 300_000 });
  });
  it("0은 일반 빈칸이 아니어서 실제 하위 차단을 보존한다", () => {
    const f: FieldDef = { key: "parent", label: "상위", type: "formula", formula: num(300_000), conditional: { match: "all", rules: [{ leftKey: "blank", op: "eq", right: { kind: "field", key: "child" }, formula: num(200_000) }] } };
    expect(evalFormulaForTierDetailed(f, tier({ state: "yes", blank: 0 }), [state, blank, child("conflict"), f])).toMatchObject({ value: null, blocked: { kind: "conflict" } });
  });
});
