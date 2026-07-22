import { describe, it, expect } from "vitest";
import { evalFormulaForTier, type FieldDef, type TierData } from "./index";

describe("negateOnRead — 계산할 때만 부호 뒤집기", () => {
  const 기준: FieldDef = { key: "환불금액", label: "환불 금액", type: "number", negateOnRead: true };
  const 수수료: FieldDef = {
    key: "수수료", label: "수수료", type: "formula",
    formula: [{ op: "+", unit: "column", columnKey: "환불금액" }, { op: "*", unit: "percent", value: 30 }],
  };
  const tier: TierData = { id: "t1", label: "1차 정산", 환불금액: 1_000_000, 수수료: null };

  it("표시가 붙은 칸을 참조하면 결과가 마이너스", () => {
    expect(evalFormulaForTier(수수료, tier, [기준, 수수료])).toBe(-300_000);
  });

  it("표시가 없으면 지금까지처럼 플러스", () => {
    const 그냥: FieldDef = { ...기준, negateOnRead: undefined };
    expect(evalFormulaForTier(수수료, tier, [그냥, 수수료])).toBe(300_000);
  });

  it("저장값 자체는 건드리지 않는다", () => {
    evalFormulaForTier(수수료, tier, [기준, 수수료]);
    expect(tier["환불금액"]).toBe(1_000_000);
  });

  it("퍼센트 칸도 뒤집힌 뒤 100으로 나뉜다", () => {
    const 율: FieldDef = { key: "율", label: "율", type: "percent", negateOnRead: true };
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: [{ op: "+", unit: "column", columnKey: "율" }] };
    const t: TierData = { id: "t", label: "1차 정산", 율: 30, f: null };
    expect(evalFormulaForTier(f, t, [율, f])).toBe(-0.3);
  });
});
