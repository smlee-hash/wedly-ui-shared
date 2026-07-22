import { describe, it, expect } from "vitest";
import { evalFormulaForTier, formatFormulaResult, type FieldDef, type TierData } from "./index";

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

// 코드리뷰 Finding 3(Minor): index.ts 는 값을 "읽는" 자리(scaled !== 0 가드)에서만 -0 을 막는다.
// 항 사슬(evalTermChain)의 곱셈이 -0 을 다시 만들어낼 수 있다 — 예: 뒤집힌(음수) 기준금액 ×
// 빈(0%) 요율 = 음수 × 0 = -0. 이 -0 이 화면 표시 직전까지 그대로 흘러가면 formatFormulaResult
// 가 "-0원"을 찍는다. 그래서 모든 발생지를 한 번에 막도록 표시 헬퍼 자체에서 방어해야 한다.
describe("formatFormulaResult — 곱셈으로 재생성되는 -0 표시 방지", () => {
  it("음수 기준값 × 빈(0%) 요율로 -0 이 만들어져도 화면엔 '0원'(마이너스 없이) 으로 찍는다", () => {
    const 기준: FieldDef = { key: "환불금액", label: "환불 금액", type: "number", negateOnRead: true };
    const 수수료: FieldDef = {
      key: "수수료", label: "수수료", type: "formula",
      formula: [
        { op: "+", unit: "column", columnKey: "환불금액" },
        { op: "*", unit: "percent", value: 0 },
      ],
    };
    const tier: TierData = { id: "t", label: "1차 정산", 환불금액: 1_000_000, 수수료: null };
    const value = evalFormulaForTier(수수료, tier, [기준, 수수료]);
    // 계산기 자체는 -0 을 그대로 돌려준다(항 사슬 곱셈에서 재생성) — 읽기 가드는 이 케이스를 안 막는다.
    expect(Object.is(value, -0)).toBe(true);
    expect(formatFormulaResult(value, undefined)).toBe("0원");
  });

  it("진짜 마이너스 값은 그대로 마이너스로 표시한다 (회귀 방지)", () => {
    expect(formatFormulaResult(-300_000, undefined)).toBe("-300,000원");
  });

  it("퍼센트 결과 형식에서도 -0 은 마이너스 없이 표시한다", () => {
    expect(formatFormulaResult(-0, "percent")).toBe("0%");
  });
});
