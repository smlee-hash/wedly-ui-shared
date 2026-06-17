// src/tiered/conditional-formula.test.ts
import { describe, it, expect } from "vitest";
import { resolveConditionalFormula, evalFormulaForTier, parseFormulaTerms, type FieldDef, type FormulaTerm } from "./index";

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

describe("evalFormulaForTier + conditionValues", () => {
  // A=100. 기본식: A*0.1=10. 하이브식: A*0.2=20.
  const fields: FieldDef[] = [
    { key: "A", label: "A", type: "number" },
    {
      key: "fee", label: "fee", type: "formula",
      formula: [{ op: "+", unit: "column", columnKey: "A" }, { op: "*", unit: "percent", value: 10 }],
      conditional: {
        conditionFieldKey: "54DB분류",
        rules: [{ whenValue: "하이브", formula: [{ op: "+", unit: "column", columnKey: "A" }, { op: "*", unit: "percent", value: 20 }] }],
      },
    },
  ];
  const tier = { A: 100 };
  const feeField = fields[1];

  it("conditionValues 없으면 기본식(앞호환): 100*0.1=10", () => {
    expect(evalFormulaForTier(feeField, tier, fields)).toBe(10);
  });
  it("기준값=하이브면 조건식: 100*0.2=20", () => {
    expect(evalFormulaForTier(feeField, tier, fields, new Set(), { "54DB분류": "하이브" })).toBe(20);
  });
  it("기준값 매칭 안 되면 기본식: 100*0.1=10", () => {
    expect(evalFormulaForTier(feeField, tier, fields, new Set(), { "54DB분류": "서월" })).toBe(10);
  });
});

describe("resolveConditionalFormula — 보강", () => {
  const base: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "A" }];
  const hive: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "B" }];
  it("whenValue 앞뒤 공백 무시하고 매칭", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base, conditional: { conditionFieldKey: "x", rules: [{ whenValue: " 하이브 ", formula: hive }] } };
    expect(resolveConditionalFormula(f, "하이브")).toBe(hive);
  });
  it("빈 whenValue 는 매칭 안 함 → 기본식", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base, conditional: { conditionFieldKey: "x", rules: [{ whenValue: "", formula: hive }] } };
    expect(resolveConditionalFormula(f, "")).toBe(base);
  });
  it("규칙에 formula 누락(비정상)이면 건너뛰고 기본식", () => {
    const f = { key: "f", label: "f", type: "formula", formula: base, conditional: { conditionFieldKey: "x", rules: [{ whenValue: "하이브" } as unknown as { whenValue: string; formula: FormulaTerm[] }] } } as FieldDef;
    expect(resolveConditionalFormula(f, "하이브")).toBe(base);
  });
  it("매칭된 규칙의 식이 빈 배열이면 resolve 는 [] 반환", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base, conditional: { conditionFieldKey: "x", rules: [{ whenValue: "하이브", formula: [] }] } };
    expect(resolveConditionalFormula(f, "하이브")).toEqual([]);
  });
});

describe("evalFormulaForTier — 조건별 재귀/순환", () => {
  it("조건식이 다른 조건식 칸을 참조해도 conditionValues 전파", () => {
    const fields: FieldDef[] = [
      { key: "A", label: "A", type: "number" },
      { key: "B", label: "B", type: "number" },
      { key: "inner", label: "inner", type: "formula",
        formula: [{ op: "+", unit: "column", columnKey: "A" }],
        conditional: { conditionFieldKey: "54DB분류", rules: [{ whenValue: "하이브", formula: [{ op: "+", unit: "column", columnKey: "B" }] }] } },
      { key: "outer", label: "outer", type: "formula", formula: [{ op: "+", unit: "column", columnKey: "inner" }] },
    ];
    const tier = { A: 100, B: 200 };
    const outer = fields[3];
    expect(evalFormulaForTier(outer, tier, fields)).toBe(100);
    expect(evalFormulaForTier(outer, tier, fields, new Set(), { "54DB분류": "하이브" })).toBe(200);
  });
  it("조건 분기가 자기 자신을 참조해도 순환 차단(null)", () => {
    const fields: FieldDef[] = [
      { key: "self", label: "self", type: "formula",
        formula: [{ op: "+", unit: "number", value: 1 }],
        conditional: { conditionFieldKey: "x", rules: [{ whenValue: "loop", formula: [{ op: "+", unit: "column", columnKey: "self" }] }] } },
    ];
    expect(evalFormulaForTier(fields[0], {}, fields, new Set(), { x: "loop" })).toBe(null);
  });
  it("매칭된 규칙의 식이 빈 배열이면 계산값 null", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: [{ op: "+", unit: "number", value: 5 }], conditional: { conditionFieldKey: "x", rules: [{ whenValue: "하이브", formula: [] }] } };
    expect(evalFormulaForTier(f, {}, [f], new Set(), { x: "하이브" })).toBe(null);
  });
});

describe("parseFormulaTerms — 묶음(group)", () => {
  it("group 항을 안쪽 terms 와 함께 보존", () => {
    const raw = [
      { op: "+", unit: "column", columnKey: "A" },
      { op: "-", unit: "group", terms: [
        { op: "+", unit: "column", columnKey: "A" },
        { op: "*", unit: "percent", value: 33.3 },
      ] },
    ];
    const out = parseFormulaTerms(raw);
    expect(out).toHaveLength(2);
    expect(out[1].unit).toBe("group");
    expect(out[1].terms).toHaveLength(2);
    expect(out[1].terms![1]).toMatchObject({ op: "*", unit: "percent", value: 33.3 });
  });
  it("빈 묶음은 버린다", () => {
    const out = parseFormulaTerms([{ op: "+", unit: "group", terms: [] }]);
    expect(out).toHaveLength(0);
  });
  it("두 겹 중첩은 평탄화(안쪽 group 제거)", () => {
    const raw = [{ op: "+", unit: "group", terms: [
      { op: "+", unit: "group", terms: [{ op: "+", unit: "number", value: 5 }] },
      { op: "+", unit: "number", value: 2 },
    ] }];
    const out = parseFormulaTerms(raw);
    expect(out[0].unit).toBe("group");
    // 안쪽 group 은 제거되고 number 항만 남음
    expect(out[0].terms).toHaveLength(1);
    expect(out[0].terms![0]).toMatchObject({ unit: "number", value: 2 });
  });
});

describe("evalFormulaForTier — 묶음(group) 우선 계산", () => {
  const fields: FieldDef[] = [
    { key: "A", label: "총예상", type: "number" },
    { key: "fee", label: "fee", type: "formula", formula: [
      { op: "+", unit: "column", columnKey: "A" },
      { op: "-", unit: "group", terms: [
        { op: "+", unit: "column", columnKey: "A" },
        { op: "*", unit: "percent", value: 33.3 },
        { op: "*", unit: "percent", value: 25 },
      ] },
    ] },
  ];
  it("A − (A×33.3%×25%) = A − 0.08325A", () => {
    // A=1,000,000 → 1,000,000 − (1,000,000×0.333×0.25)=1,000,000−83,250=916,750
    expect(evalFormulaForTier(fields[1], { A: 1_000_000 }, fields)).toBeCloseTo(916_750, 4);
  });
  it("묶음 안 입력 전부 없음 → 묶음은 has=false (무시)", () => {
    const f: FieldDef[] = [
      { key: "X", label: "X", type: "number" },
      { key: "g", label: "g", type: "formula", formula: [
        { op: "+", unit: "number", value: 10 },
        { op: "+", unit: "group", terms: [{ op: "+", unit: "column", columnKey: "X" }] },
      ] },
    ];
    expect(evalFormulaForTier(f[1], {}, f)).toBe(10); // 묶음(X 빈값) 무시, 시작 10
  });
  it("묶음 안 0 나누기 안전", () => {
    const f: FieldDef[] = [
      { key: "g", label: "g", type: "formula", formula: [
        { op: "+", unit: "number", value: 100 },
        { op: "/", unit: "group", terms: [{ op: "+", unit: "number", value: 0 }] },
      ] },
    ];
    expect(evalFormulaForTier(f[0], {}, f)).toBe(100); // /0 → 그대로
  });
  it("시작값이 묶음: (A+50)×2", () => {
    const f: FieldDef[] = [
      { key: "A", label: "A", type: "number" },
      { key: "g", label: "g", type: "formula", formula: [
        { op: "+", unit: "group", terms: [
          { op: "+", unit: "column", columnKey: "A" },
          { op: "+", unit: "number", value: 50 },
        ] },
        { op: "*", unit: "number", value: 2 },
      ] },
    ];
    expect(evalFormulaForTier(f[1], { A: 100 }, f)).toBe(300); // (100+50)*2
  });
});
