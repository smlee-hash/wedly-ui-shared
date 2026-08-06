import { describe, it, expect } from "vitest";
import { evalFormulaForTier, parseFormulaTerms, type FieldDef } from "./index";

const fields: FieldDef[] = [
  { key: "금액", label: "금액", type: "number" },
  {
    key: "반올림", label: "반올림", type: "formula", formulaResult: "number",
    formula: [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "round", unit: "number", value: 1000 },
    ],
  } as FieldDef,
  {
    key: "부가세포함", label: "부가세포함", type: "formula", formulaResult: "number",
    formula: [
      { op: "+", unit: "column", value: 0, columnKey: "반올림" },
      { op: "*", unit: "percent", value: 110 },
    ],
  } as FieldDef,
];

const evalAt = (key: string, 금액: number | null) =>
  evalFormulaForTier(fields.find((f) => f.key === key)!, { id: "t1", 금액 } as never, fields);

describe("round 항 — 천원 단위 반올림", () => {
  it("올림 쪽: 2,056,920 → 2,057,000", () => {
    expect(evalAt("반올림", 2056920)).toBe(2057000);
  });

  it("내림 쪽: 1,234,499 → 1,234,000", () => {
    expect(evalAt("반올림", 1234499)).toBe(1234000);
  });

  it("정확히 500원이면 올린다: 1,234,500 → 1,235,000", () => {
    expect(evalAt("반올림", 1234500)).toBe(1235000);
  });

  it("음수는 부호 대칭으로 반올림한다: -1,500 → -2,000", () => {
    expect(evalAt("반올림", -1500)).toBe(-2000);
  });

  it("이미 딱 떨어지면 그대로: 910,000 → 910,000", () => {
    expect(evalAt("반올림", 910000)).toBe(910000);
  });

  it("반올림 뒤 부가세 10%: 2,056,920 → 2,262,700", () => {
    expect(evalAt("부가세포함", 2056920)).toBeCloseTo(2262700, 6);
  });

  it("입력이 비면 계산하지 않는다(null)", () => {
    expect(evalAt("반올림", null)).toBeNull();
  });

  it("반올림 단위가 0이면 값을 그대로 둔다(0으로 나누기 방지)", () => {
    const f: FieldDef = {
      key: "위험", label: "위험", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "round", unit: "number", value: 0 },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 12345 } as never, all)).toBe(12345);
  });

  it("저장된 round 항을 파싱해도 op 이 '+' 로 바뀌지 않는다", () => {
    const parsed = parseFormulaTerms([{ op: "round", unit: "number", value: 1000 }]);
    expect(parsed).toEqual([{ op: "round", unit: "number", value: 1000 }]);
  });

  it("반올림이 맨 앞에 오면 그냥 건너뛴다(손으로 쓴 데이터 대비)", () => {
    const f: FieldDef = {
      key: "앞반올림", label: "앞반올림", type: "formula", formulaResult: "number",
      formula: [
        { op: "round", unit: "number", value: 1000 },
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 12345 } as never, all)).toBe(12345);
  });

  it("★빈칸 규칙이 안 깨졌는지 — 곱셈에 빈칸이 끼면 반올림이 있어도 '-'(null)", () => {
    const f: FieldDef = {
      key: "빈율", label: "빈율", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "*", unit: "column", value: 0, columnKey: "없는율" },
        { op: "round", unit: "number", value: 1000 },
      ],
    } as FieldDef;
    const all = [...fields, { key: "없는율", label: "없는율", type: "percent" } as FieldDef, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 6856400 } as never, all)).toBeNull();
  });
});
