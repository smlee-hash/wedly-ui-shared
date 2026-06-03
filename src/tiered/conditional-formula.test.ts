// src/tiered/conditional-formula.test.ts
import { describe, it, expect } from "vitest";
import { resolveConditionalFormula, type FieldDef, type FormulaTerm } from "./index";

const baseFormula: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "A" }];
const hiveFormula: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "B" }];
const widlyFormula: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "C" }];

const plainField: FieldDef = { key: "f", label: "f", type: "formula", formula: baseFormula };
const condField: FieldDef = {
  key: "f", label: "f", type: "formula", formula: baseFormula,
  conditional: {
    conditionFieldKey: "54DB분류",
    rules: [
      { whenValue: "하이브", formula: hiveFormula },
      { whenValue: "위들리", formula: widlyFormula },
    ],
  },
};

describe("resolveConditionalFormula", () => {
  it("conditional 없으면 기본 formula 반환", () => {
    expect(resolveConditionalFormula(plainField, "하이브")).toBe(baseFormula);
  });
  it("값이 규칙과 일치하면 그 규칙의 식", () => {
    expect(resolveConditionalFormula(condField, "하이브")).toBe(hiveFormula);
    expect(resolveConditionalFormula(condField, "위들리")).toBe(widlyFormula);
  });
  it("매칭 없으면 기본 formula", () => {
    expect(resolveConditionalFormula(condField, "서월")).toBe(baseFormula);
    expect(resolveConditionalFormula(condField, undefined)).toBe(baseFormula);
    expect(resolveConditionalFormula(condField, null)).toBe(baseFormula);
  });
  it("다중 선택(배열)이면 포함 매칭", () => {
    expect(resolveConditionalFormula(condField, ["서월", "하이브"])).toBe(hiveFormula);
  });
  it("다중 선택(콤마 문자열)이면 포함 매칭", () => {
    expect(resolveConditionalFormula(condField, "서월, 위들리")).toBe(widlyFormula);
  });
  it("rules 비정상(빈배열/누락)이면 기본 formula", () => {
    const bad: FieldDef = { key: "f", label: "f", type: "formula", formula: baseFormula, conditional: { conditionFieldKey: "x", rules: [] } };
    expect(resolveConditionalFormula(bad, "하이브")).toBe(baseFormula);
  });
});
