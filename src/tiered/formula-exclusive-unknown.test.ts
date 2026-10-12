import { describe, expect, it } from "vitest";
import { evalFormulaForTierDetailed, type FieldDef, type FormulaTerm } from "./index";
import { computeLinkedValue } from "../tier-link/sync";
const num = (value: number): FormulaTerm[] => [{ op: "+", unit: "number", value }];
const date: FieldDef = { key: "date", label: "날짜", type: "date" };
const state: FieldDef = { key: "state", label: "상태", type: "text" };
const fee: FieldDef = { key: "fee", label: "금액", type: "formula", formula: num(1_000_000), conditional: { match: "all", rules: [
  { leftKey: "state", right: { kind: "text", value: "yes" }, formula: num(1_000_000) },
  { leftKey: "date", op: "gte", right: { kind: "text", value: "2026-08-01" }, formula: num(1_000_000.0000000016) },
  { leftKey: "date", op: "lte", right: { kind: "text", value: "2026-07-31" }, formula: num(999_999.9999999984) },
] } };
describe("서로 배타적인 미정 날짜의 실제 도달 결과", () => {
  it.each(["", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"])("날짜 %s를 확정해도 모든 결과는 같은 값이다", value => {
    const tier = { id: "c1", label: "시험", state: "yes", date: value };
    const fields = [date, state, fee];
    expect(evalFormulaForTierDetailed(fee, tier, fields)).toMatchObject({ value: 1_000_000 });
    expect(evalFormulaForTierDetailed(fee, tier, fields).blocked).toBeUndefined();
    expect(computeLinkedValue([tier], { columnKey: "flat", area: "contract", tierFieldKey: "fee", mode: "sum" }, { fields })).toBe(1_000_000);
  });
});

const both = (lower: string, upper: string, extra: { reverse?: boolean; numeric?: boolean; noTrue?: boolean; otherKey?: boolean; rightField?: boolean; multiOr?: boolean; changedValue?: boolean; nullValue?: boolean } = {}) => {
  const left = extra.numeric ? { ...date, type: "number" as const } : date;
  const defs: FieldDef[] = [left, state, { ...left, key: "other" }, { ...left, key: "bound" }];
  const low = { leftKey: "date", op: "gte" as const, right: { kind: "text" as const, value: lower }, formula: num(extra.changedValue ? 2_000_000 : 1_000_000.0000000016) };
  const high = { leftKey: extra.otherKey ? "other" : "date", op: "lte" as const,
    right: extra.rightField ? { kind: "field" as const, key: "bound" } : { kind: "text" as const, value: upper },
    formula: extra.nullValue ? [] : num(999_999.9999999984) };
  const lo = extra.multiOr ? { clauses: [low, { leftKey: "other", op: "gte" as const, right: { kind: "text" as const, value: lower } }], combine: "or" as const, formula: low.formula } : low;
  const pair = extra.reverse ? [high, lo] : [lo, high];
  const f: FieldDef = { ...fee, conditional: { match: "all", rules: [
    ...(extra.noTrue ? [] : [{ leftKey: "state", right: { kind: "text" as const, value: "yes" }, formula: num(1_000_000) }]), ...pair,
  ] } };
  return evalFormulaForTierDetailed(f, { id: "c", label: "시험", date: "", state: "yes", other: "", bound: upper }, [...defs, f]);
};
describe("총괄이 한정한 배타성 증명 경계", () => {
 it.each([false,true])("날짜 범위가 엄격 분리되면 양순서에서 계산 (역순=%s)", reverse => expect(both("2026-08-01","2026-07-31",{reverse})).toMatchObject({value:1_000_000}));
 it.each([false,true])("숫자 범위도 같은 비교 의미를 사용 (역순=%s)", reverse => expect(both("2","1",{reverse,numeric:true})).toMatchObject({value:1_000_000}));
 it("T가 없어도 기본값 대비 결과가 같은 배타적 후보를 막지 않는다", () => expect(both("2026-08-01","2026-07-31",{noTrue:true})).toMatchObject({value:1_000_000}));
 it.each([{lo:"2026-08-01",hi:"2026-08-01"},{lo:"2026-07-31",hi:"2026-08-01"},{lo:"1",hi:"1"},{lo:"1",hi:"2"}])("같거나 겹친 경계 $lo/$hi는 비교한다", ({lo,hi}) => expect(both(lo,hi)).toMatchObject({value:null,blocked:{kind:"missing"}}));
 it.each([{otherKey:true},{rightField:true},{multiOr:true},{changedValue:true},{nullValue:true}])("증명 밖이거나 결과가 실제 달라지는 경우 %j는 막는다", options => expect(both("2026-08-01","2026-07-31",options)).toMatchObject({value:null,blocked:{kind:"missing"}}));
 it("다른 비교 kind를 배타적이라고 추정하지 않는다", () => expect(both("2026-08-01","1")).toMatchObject({value:null,blocked:{kind:"missing"}}));
});
