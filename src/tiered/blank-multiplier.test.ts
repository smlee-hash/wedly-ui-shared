// NO.132 — 곱셈·나눗셈에 빈칸이 끼면 '계산 불가(null)'.
// 배경: 옛 경정청구 업체는 '수수료율' 칸 자체가 없어(옛 노션 DB에 없던 항목)
// 환급액 × 빈칸 = 0 → "수수료 0원"이라는 틀린 사실이 화면에 보였다.
import { describe, it, expect } from "vitest";
import { evalFormulaForTier, type FieldDef } from "./index";

const fields: FieldDef[] = [
  { key: "금액", label: "금액", type: "number" },
  { key: "비율", label: "비율", type: "percent" },
  { key: "곱", label: "곱", type: "formula", formula: [
    { op: "+", unit: "column", value: 0, columnKey: "금액" },
    { op: "*", unit: "column", value: 0, columnKey: "비율" },
  ] },
  { key: "합", label: "합", type: "formula", formula: [
    { op: "+", unit: "column", value: 0, columnKey: "금액" },
    { op: "+", unit: "column", value: 0, columnKey: "비율" },
  ] },
  { key: "정률", label: "정률", type: "formula", formula: [
    { op: "+", unit: "column", value: 0, columnKey: "금액" },
    { op: "*", unit: "percent", value: 50 },
  ] },
];
const F = (key: string) => fields.find((f) => f.key === key)!;

describe("빈칸 곱셈 = 계산 불가(NO.132)", () => {
  it("곱할 상대가 비면 null", () => {
    expect(evalFormulaForTier(F("곱"), { 금액: 4225497 }, fields)).toBeNull();
  });

  it("기준 금액이 비어도 null — 비율만 있다고 0원이 아니다", () => {
    expect(evalFormulaForTier(F("정률"), { 비율: 20 }, fields)).toBeNull();
    expect(evalFormulaForTier(F("곱"), { 비율: 20 }, fields)).toBeNull();
  });

  it("0 을 실제로 입력한 경우는 진짜 0 (빈칸과 구분)", () => {
    expect(evalFormulaForTier(F("곱"), { 금액: 4225497, 비율: 0 }, fields)).toBe(0);
    expect(evalFormulaForTier(F("정률"), { 금액: 0 }, fields)).toBe(0);
  });

  it("둘 다 있으면 종전대로 계산", () => {
    expect(evalFormulaForTier(F("곱"), { 금액: 1000000, 비율: 20 }, fields)).toBe(200000);
    expect(evalFormulaForTier(F("정률"), { 금액: 1000000 }, fields)).toBe(500000);
  });

  it("더하기는 종전대로 — 빈칸은 0 취급(있는 것만 더함)", () => {
    expect(evalFormulaForTier(F("합"), { 금액: 1000000 }, fields)).toBe(1000000);
  });

  it("입력이 하나도 없으면 종전대로 null", () => {
    expect(evalFormulaForTier(F("합"), {}, fields)).toBeNull();
    expect(evalFormulaForTier(F("곱"), {}, fields)).toBeNull();
  });
});

// 코드리뷰 F1·F2 — 계산 불가는 '사슬 전체'가 아니라 '그 구간'까지만.
describe("죽은 구간만 버린다(F1·F2)", () => {
  const f2: FieldDef[] = [
    { key: "금액", label: "금액", type: "number" },
    { key: "비율", label: "비율", type: "percent" },
    { key: "부가", label: "부가", type: "number" },
    // 평면: 금액 × 비율 + 부가
    { key: "평면", label: "평면", type: "formula", formula: [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "*", unit: "column", value: 0, columnKey: "비율" },
      { op: "+", unit: "column", value: 0, columnKey: "부가" },
    ] },
    // 묶음: (금액 × 비율) + 부가 — 평면과 같은 값이어야 한다
    { key: "묶음", label: "묶음", type: "formula", formula: [
      { op: "+", unit: "group", terms: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "*", unit: "column", value: 0, columnKey: "비율" },
      ] },
      { op: "+", unit: "column", value: 0, columnKey: "부가" },
    ] },
  ];
  const G = (k: string) => f2.find((f) => f.key === k)!;

  it("비율이 비어도 뒤에 붙은 실제 값은 살린다 — 합계에서 사라지면 안 된다", () => {
    expect(evalFormulaForTier(G("평면"), { 금액: 100, 부가: 7 }, f2)).toBe(7);
  });

  it("평면식과 묶음식이 같은 값을 낸다 (종전엔 '-' 와 7 로 갈렸다)", () => {
    const tier = { 금액: 100, 부가: 7 };
    expect(evalFormulaForTier(G("묶음"), tier, f2)).toBe(evalFormulaForTier(G("평면"), tier, f2));
  });

  it("뒤에 붙은 값도 비면 여전히 null", () => {
    expect(evalFormulaForTier(G("평면"), { 금액: 100 }, f2)).toBeNull();
    expect(evalFormulaForTier(G("묶음"), { 금액: 100 }, f2)).toBeNull();
  });

  it("전부 있으면 종전대로 계산", () => {
    expect(evalFormulaForTier(G("평면"), { 금액: 100, 비율: 20, 부가: 7 }, f2)).toBe(27);
    expect(evalFormulaForTier(G("묶음"), { 금액: 100, 비율: 20, 부가: 7 }, f2)).toBe(27);
  });
});
