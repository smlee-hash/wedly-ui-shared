// 조건 기준 칸이 기본정보 칸(conditionValues)일 때 evalFormulaForTier 매칭 고정 테스트
import { describe, it, expect } from "vitest";
import { evalFormulaForTier, type FieldDef, type FormulaTerm } from "./index";

const base: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "계약금" }];
const hive: FormulaTerm[] = [
  { op: "+", unit: "column", columnKey: "계약금" },
  { op: "*", unit: "percent", value: 50 },
];
const fields: FieldDef[] = [
  { key: "계약금", label: "계약금", type: "number" },
  {
    key: "수수료",
    label: "수수료",
    type: "formula",
    formula: base,
    conditional: {
      rules: [
        {
          leftKey: "59DB담당",
          right: { kind: "text", value: "하이브" },
          op: "eq",
          formula: hive,
        },
      ],
    },
  },
];

describe("조건 기준 칸이 기본정보 칸(conditionValues)일 때", () => {
  it("conditionValues에 그 칸 값이 있으면 조건 매칭(식 전환)", () => {
    // 계약금=100, 59DB담당은 정산행에 없고 conditionValues에만 있음
    expect(
      evalFormulaForTier(
        fields[1],
        { 계약금: 100 } as never,
        fields,
        undefined,
        { "59DB담당": "하이브" },
      ),
    ).toBe(50);
  });

  it("conditionValues에 없으면(정산행만) 미매칭 → 기본식", () => {
    // conditionValues에 59DB담당 없음 → 기본식(계약금 그대로 = 100)
    expect(
      evalFormulaForTier(
        fields[1],
        { 계약금: 100 } as never,
        fields,
        undefined,
        {},
      ),
    ).toBe(100);
  });

  it("conditionValues 미전달이면 기본식", () => {
    expect(
      evalFormulaForTier(
        fields[1],
        { 계약금: 100 } as never,
        fields,
        undefined,
        undefined,
      ),
    ).toBe(100);
  });

  it("conditionValues 값이 달라도 매칭 안 되면 기본식", () => {
    // 59DB담당이 "ERP"라면 규칙 "하이브"와 다르므로 기본식(계약금=100)
    expect(
      evalFormulaForTier(
        fields[1],
        { 계약금: 100 } as never,
        fields,
        undefined,
        { "59DB담당": "ERP" },
      ),
    ).toBe(100);
  });
});
