// P2 회귀: 빈 직접 비교값은 성립할 수 없는 조건이다. 칸 누락과 구분한다.
import { describe, expect, it } from "vitest";
import { evalFormulaForTier, evalFormulaForTierDetailed, type FieldDef, type TierData } from "./index";
import { computeLinkedValue } from "../tier-link/sync";

describe("all 조건의 빈 직접 비교값", () => {
  for (const op of ["gte", "lte"] as const) {
    for (const value of ["", "   "]) {
      it(`${op} ${JSON.stringify(value)}는 빈 착수일이 있어도 기본 금액을 막지 않는다`, () => {
        const fields: FieldDef[] = [
          { key: "amount", label: "계약금", type: "number" },
          { key: "start", label: "착수일", type: "date" },
          {
            key: "fee", label: "수수료", type: "formula",
            formula: [{ op: "+", unit: "column", columnKey: "amount" }, { op: "*", unit: "percent", value: 30 }],
            conditional: {
              match: "all",
              rules: [{
                leftKey: "start", op, right: { kind: "text", value },
                formula: [{ op: "+", unit: "column", columnKey: "amount" }, { op: "*", unit: "percent", value: 20 }],
              }],
            },
          },
        ];
        const tier: TierData = { id: "t1", label: "1차", amount: 1_000_000, start: "" };
        const fee = fields[2];
        expect(evalFormulaForTierDetailed(fee, tier, fields)).toEqual({ value: 300_000, ruleIdx: [] });
        expect(evalFormulaForTier(fee, tier, fields)).toBe(300_000);
        expect(computeLinkedValue([tier], {
          mode: "latest", tierFieldKey: "fee", columnKey: "fee-column", area: "contract",
        }, { fields })).toBe(300_000);
      });
    }
  }
});
