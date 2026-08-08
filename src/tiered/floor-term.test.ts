import { describe, it, expect } from "vitest";
import { evalFormulaForTier, parseFormulaTerms, type FieldDef } from "./index";

const fields: FieldDef[] = [
  { key: "금액", label: "금액", type: "number" },
  {
    key: "내림", label: "내림", type: "formula", formulaResult: "number",
    formula: [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "floor", unit: "number", value: 10000 },
    ],
  } as FieldDef,
  {
    key: "부가세포함", label: "부가세포함", type: "formula", formulaResult: "number",
    formula: [
      { op: "+", unit: "column", value: 0, columnKey: "내림" },
      { op: "*", unit: "percent", value: 110 },
    ],
  } as FieldDef,
];

const evalAt = (key: string, 금액: number | null) =>
  evalFormulaForTier(fields.find((f) => f.key === key)!, { id: "t1", 금액 } as never, fields);

describe("floor 항 — 만원 단위 내림", () => {
  it("두원TCS: 2,056,920 → 2,050,000", () => {
    expect(evalAt("내림", 2056920)).toBe(2050000);
  });

  it("신화주유소: 917,944 → 910,000", () => {
    expect(evalAt("내림", 917944)).toBe(910000);
  });

  it("반올림이었다면 올라갔을 값도 내려간다: 2,059,999 → 2,050,000", () => {
    expect(evalAt("내림", 2059999)).toBe(2050000);
  });

  it("이미 딱 떨어지면 그대로: 2,050,000 → 2,050,000", () => {
    expect(evalAt("내림", 2050000)).toBe(2050000);
  });

  it("만원 미만은 0원이 된다: 9,999 → 0", () => {
    expect(evalAt("내림", 9999)).toBe(0);
  });

  it("음수는 0 쪽으로 버린다(절사): -2,056,920 → -2,050,000", () => {
    expect(evalAt("내림", -2056920)).toBe(-2050000);
  });

  it("내림 뒤 부가세 10%: 2,056,920 → 2,255,000", () => {
    expect(evalAt("부가세포함", 2056920)).toBeCloseTo(2255000, 6);
  });

  it("입력이 비면 계산하지 않는다(null)", () => {
    expect(evalAt("내림", null)).toBeNull();
  });

  it("내림 단위가 0이면 값을 그대로 둔다(0으로 나누기 방지)", () => {
    const f: FieldDef = {
      key: "위험", label: "위험", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "floor", unit: "number", value: 0 },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 12345 } as never, all)).toBe(12345);
  });

  it("저장된 floor 항을 파싱해도 op 이 '+' 로 바뀌지 않는다", () => {
    const parsed = parseFormulaTerms([{ op: "floor", unit: "number", value: 10000 }]);
    expect(parsed).toEqual([{ op: "floor", unit: "number", value: 10000 }]);
  });

  it("내림이 맨 앞에 오면 그냥 건너뛴다(손으로 쓴 데이터 대비)", () => {
    const f: FieldDef = {
      key: "앞내림", label: "앞내림", type: "formula", formulaResult: "number",
      formula: [
        { op: "floor", unit: "number", value: 10000 },
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 12345 } as never, all)).toBe(12345);
  });

  it("★컬럼 항에 붙은 내림은 '+'로 되돌아간다 — 그 칸 금액이 사라지지 않게", () => {
    const parsed = parseFormulaTerms([
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "floor", unit: "column", value: 10000, columnKey: "금액" },
    ]);
    expect(parsed[1].op).toBe("+");
  });

  it("★묶음(괄호)에 붙은 내림도 '+'로 되돌아간다 — 묶음 금액이 통째로 사라지지 않게", () => {
    const parsed = parseFormulaTerms([
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "floor", unit: "group", terms: [{ op: "+", unit: "number", value: 5 }] },
    ]);
    expect(parsed[1].op).toBe("+");
    expect(parsed[1].unit).toBe("group");
  });

  it("★빈칸 규칙이 안 깨졌는지 — 곱셈에 빈칸이 끼면 내림이 있어도 '-'(null)", () => {
    const f: FieldDef = {
      key: "빈율", label: "빈율", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "*", unit: "column", value: 0, columnKey: "없는율" },
        { op: "floor", unit: "number", value: 10000 },
      ],
    } as FieldDef;
    const all = [...fields, { key: "없는율", label: "없는율", type: "percent" } as FieldDef, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 6856400 } as never, all)).toBeNull();
  });

  it("반올림은 그대로 살아 있다(같이 쓰여도 서로 안 섞임)", () => {
    const f: FieldDef = {
      key: "반올림", label: "반올림", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "round", unit: "number", value: 1000 },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 2056920 } as never, all)).toBe(2057000);
  });
});
