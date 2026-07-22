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

  it("저장값이 0이면 결과는 -0원이 아니라 0원이다", () => {
    const t0: TierData = { id: "t2", label: "1차 정산", 환불금액: 0, 수수료: null };
    const result = evalFormulaForTier(수수료, t0, [기준, 수수료]);
    expect(result).toBe(0);
    // -0 === 0 은 true 라 toBe(0) 만으로는 안 잡힌다 — Object.is 로 음수 0이 아님을 확인.
    expect(Object.is(result, -0)).toBe(false);
  });

  it("조건 매칭은 원시 저장값(양수)으로, 계산은 뒤집힌 값(음수)으로 한다", () => {
    const 조건부수수료: FieldDef = {
      key: "조건부수수료", label: "조건부수수료", type: "formula",
      // 조건이 안 맞으면 이 기본식(구분하기 쉬운 더미 값)으로 빠진다 — 매칭 성공 여부를 결과로 알 수 있게.
      formula: [{ op: "+", unit: "number", value: 999_999 }],
      conditional: {
        rules: [
          {
            leftKey: "환불금액",
            right: { kind: "text", value: "1000000" },
            op: "eq",
            formula: [{ op: "+", unit: "column", columnKey: "환불금액" }, { op: "*", unit: "percent", value: 30 }],
          },
        ],
      },
    };
    // tier.환불금액 원시 저장값은 양수 1,000,000 — 조건 판정이 뒤집힌(음수) 값을 쓰면 "1000000" 과 매칭 실패해
    // 기본식(999999)으로 빠진다. 매칭이 원시값 그대로 이뤄져야 아래 조건식이 골라지고, 계산만 음수로 나온다.
    expect(evalFormulaForTier(조건부수수료, tier, [기준, 조건부수수료])).toBe(-300_000);
  });
});
