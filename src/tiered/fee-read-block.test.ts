import { expect, it } from "vitest";
import { evalFormulaForTierDetailed, type FieldDef, type FormulaBlock, type TierData } from "./index";
const fee: FieldDef = { key: "fee", label: "fee", type: "number" };
const base: FieldDef = { key: "base", label: "base", type: "number" };
const blocked: FormulaBlock = { kind: "missing", from: "fee", keys: ["fee"] };
const blocker = (field: FieldDef) => field.key === "fee" ? blocked : undefined;
const evaluate = evalFormulaForTierDetailed;
const term = (value: number) => ({ op: "+" as const, unit: "number" as const, value });
const formula = (key: string): FieldDef => ({ key, label: key, type: "formula", formula: [{ op: "+", unit: "column", columnKey: "fee" }] });
const tier: TierData = { id: "one", label: "one", fee: 999, base: 500000 };
it("does not turn an unresolved direct number into a stale amount", () => {
 expect(evaluate(formula("result"), tier, [fee], undefined, undefined, blocker)).toMatchObject({ value: null, blocked });
});
it("carries read blocks through formula references and honors ordinary manual overrides", () => {
 const middle = formula("middle"), result: FieldDef = { ...formula("result"), formula: [{ op: "+", unit: "column", columnKey: "middle" }] };
 expect(evaluate(result, tier, [fee, middle], undefined, undefined, blocker)).toMatchObject({ value: null, blocked });
 expect(evaluate(result, { ...tier, _ovr_middle: 25 }, [fee, middle], undefined, undefined, blocker).value).toBe(25);
});
it.each([undefined, "all"] as const)("skips unselected blocked formulas but blocks the selected formula (%s)", match => {
 const dependent: FieldDef = { key: "result", label: "result", type: "formula", formula: [term(7)], conditional: { ...(match ? { match } : {}), rules: [{ clauses: [{ leftKey: "base", op: "gte", right: { kind: "text", value: "1000000" } }], formula: [{ op: "+", unit: "column", columnKey: "fee" }] }] } };
 expect(evaluate(dependent, tier, [fee, base], undefined, undefined, blocker)).toMatchObject({ value: 7 });
 expect(evaluate(dependent, { ...tier, base: 2000000 }, [fee, base], undefined, undefined, blocker)).toMatchObject({ value: null, blocked });
});
it.each([undefined, "all"] as const)("keeps native decisive AND/OR conditions with an unavailable input (%s)", match => {
 const clauses = [{ leftKey: "fee", op: "gte" as const, right: { kind: "text" as const, value: "1" } }, { leftKey: "base", op: "gte" as const, right: { kind: "text" as const, value: "1000000" } }];
 const field: FieldDef = { key: "result", label: "result", type: "formula", formula: [term(7)], conditional: { ...(match ? { match } : {}), rules: [{ clauses, combine: "and", formula: [term(99)] }] } };
 expect(evaluate(field, tier, [fee, base], undefined, undefined, blocker).value).toBe(7);
 expect(evaluate(field, { ...tier, base: 2000000 }, [fee, base], undefined, undefined, blocker).blocked).toBeDefined();
 const orField: FieldDef = { ...field, conditional: { ...field.conditional!, rules: [{ clauses, combine: "or", formula: [term(99)] }] } };
 expect(evaluate(orField, { ...tier, base: 2000000 }, [fee, base], undefined, undefined, blocker).value).toBe(99);
});
