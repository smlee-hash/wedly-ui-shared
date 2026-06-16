// src/tiered/conditional-formula.test.ts
import { describe, it, expect } from "vitest";
import { resolveConditionalFormula, evalFormulaForTier, type FieldDef, type FormulaTerm } from "./index";

const base: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "A" }];
const hive: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "B" }];
const widly: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "C" }];

// getValue 헬퍼: 키→값 맵
const gv = (m: Record<string, unknown>) => (k: string) => m[k];

describe("resolveConditionalFormula — 새 모델(칸↔글자)", () => {
  const f: FieldDef = {
    key: "f", label: "f", type: "formula", formula: base,
    conditional: { rules: [
      { leftKey: "분류", right: { kind: "text", value: "하이브" }, formula: hive },
      { leftKey: "분류", right: { kind: "text", value: "위들리" }, formula: widly },
    ] },
  };
  it("conditional 없으면 기본 formula", () => {
    const p: FieldDef = { key: "f", label: "f", type: "formula", formula: base };
    expect(resolveConditionalFormula(p, gv({}))).toBe(base);
  });
  it("기준 칸 값이 규칙 글자와 같으면 그 식", () => {
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리" }))).toBe(widly);
  });
  it("매칭 없으면 기본 formula", () => {
    expect(resolveConditionalFormula(f, gv({ 분류: "서월" }))).toBe(base);
    expect(resolveConditionalFormula(f, gv({}))).toBe(base);
  });
  it("다중값(콤마/배열) 포함 매칭", () => {
    expect(resolveConditionalFormula(f, gv({ 분류: "서월, 하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: ["서월", "위들리"] }))).toBe(widly);
  });
});

describe("resolveConditionalFormula — 칸↔칸", () => {
  const f: FieldDef = {
    key: "f", label: "f", type: "formula", formula: base,
    conditional: { rules: [
      { leftKey: "확정수수료", right: { kind: "field", key: "예상수수료" }, formula: hive },
    ] },
  };
  it("두 칸 값이 같으면 그 식", () => {
    expect(resolveConditionalFormula(f, gv({ 확정수수료: 100, 예상수수료: 100 }))).toBe(hive);
  });
  it("두 칸 값이 다르면 기본식", () => {
    expect(resolveConditionalFormula(f, gv({ 확정수수료: 100, 예상수수료: 200 }))).toBe(base);
  });
  it("오른쪽 칸 값이 비면 매칭 안 함 → 기본식", () => {
    expect(resolveConditionalFormula(f, gv({ 확정수수료: 100 }))).toBe(base);
  });
});

describe("resolveConditionalFormula — 옛 형식 앞호환", () => {
  it("conditionFieldKey + whenValue 형식도 흡수", () => {
    const old: FieldDef = {
      key: "f", label: "f", type: "formula", formula: base,
      conditional: { conditionFieldKey: "분류", rules: [{ whenValue: "하이브", formula: hive }] },
    };
    expect(resolveConditionalFormula(old, gv({ 분류: "하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(old, gv({ 분류: "서월" }))).toBe(base);
  });
  it("빈 비교값은 매칭 안 함", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base, conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "" }, formula: hive }] } };
    expect(resolveConditionalFormula(f, gv({ 분류: "" }))).toBe(base);
  });
  it("규칙 formula 누락(비정상)이면 건너뜀", () => {
    const f = { key: "f", label: "f", type: "formula", formula: base, conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "하이브" } }] } } as unknown as FieldDef;
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브" }))).toBe(base);
  });
});

describe("evalFormulaForTier + 조건(칸↔글자, 칸↔칸)", () => {
  // A=100. 기본식 A*0.1=10, 하이브식 A*0.2=20.
  const fields: FieldDef[] = [
    { key: "A", label: "A", type: "number" },
    { key: "예상", label: "예상", type: "number" },
    { key: "확정", label: "확정", type: "number" },
    {
      key: "fee", label: "fee", type: "formula",
      formula: [{ op: "+", unit: "column", columnKey: "A" }, { op: "*", unit: "percent", value: 10 }],
      conditional: { rules: [
        { leftKey: "분류", right: { kind: "text", value: "하이브" }, formula: [{ op: "+", unit: "column", columnKey: "A" }, { op: "*", unit: "percent", value: 20 }] },
        { leftKey: "확정", right: { kind: "field", key: "예상" }, formula: [{ op: "+", unit: "column", columnKey: "A" }, { op: "*", unit: "percent", value: 50 }] },
      ] },
    },
  ];
  const feeField = fields[3];
  it("조건 없으면 기본식 100*0.1=10", () => {
    expect(evalFormulaForTier(feeField, { A: 100 }, fields)).toBe(10);
  });
  it("기본정보 기준값=하이브면 100*0.2=20", () => {
    expect(evalFormulaForTier(feeField, { A: 100 }, fields, new Set(), { 분류: "하이브" })).toBe(20);
  });
  it("정산 칸끼리 확정==예상이면 100*0.5=50", () => {
    expect(evalFormulaForTier(feeField, { A: 100, 확정: 300, 예상: 300 }, fields, new Set(), {})).toBe(50);
  });
  it("정산 칸 확정!=예상이면 기본식 10", () => {
    expect(evalFormulaForTier(feeField, { A: 100, 확정: 300, 예상: 999 }, fields, new Set(), {})).toBe(10);
  });
});

describe("evalFormulaForTier — 조건 자기참조 순환 차단", () => {
  it("조건 분기가 자기 자신을 참조해도 순환 차단(null)", () => {
    const fields: FieldDef[] = [
      { key: "self", label: "self", type: "formula",
        formula: [{ op: "+", unit: "number", value: 1 }],
        conditional: { rules: [{ leftKey: "x", right: { kind: "text", value: "loop" }, formula: [{ op: "+", unit: "column", columnKey: "self" }] }] } },
    ];
    expect(evalFormulaForTier(fields[0], {}, fields, new Set(), { x: "loop" })).toBe(null);
  });
});
