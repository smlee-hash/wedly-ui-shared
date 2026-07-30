// src/tiered/conditional-formula.test.ts
import { describe, it, expect } from "vitest";
import { resolveConditionalFormula, evalFormulaForTier, parseFormulaTerms, type FieldDef, type FormulaTerm, type ConditionClause } from "./index";

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
  it("두 수식칸이 서로 조건분기로 맞물려도 무한재귀 없이 차단(null)", () => {
    const fields: FieldDef[] = [
      { key: "a", label: "a", type: "formula",
        formula: [{ op: "+", unit: "column", columnKey: "b" }],
        conditional: { rules: [{ leftKey: "x", right: { kind: "text", value: "loop" }, formula: [{ op: "+", unit: "column", columnKey: "b" }] }] } },
      { key: "b", label: "b", type: "formula",
        formula: [{ op: "+", unit: "column", columnKey: "a" }],
        conditional: { rules: [{ leftKey: "x", right: { kind: "text", value: "loop" }, formula: [{ op: "+", unit: "column", columnKey: "a" }] }] } },
    ];
    expect(evalFormulaForTier(fields[0], {}, fields, new Set(), { x: "loop" })).toBe(null);
  });
  it("조건의 기준칸(leftKey)이 자기 자신(수식칸)이어도 무한재귀 없이 안전", () => {
    const fields: FieldDef[] = [
      { key: "self", label: "self", type: "formula",
        formula: [{ op: "+", unit: "number", value: 7 }],
        conditional: { rules: [{ leftKey: "self", right: { kind: "text", value: "7" }, formula: [{ op: "+", unit: "number", value: 99 }] }] } },
    ];
    // leftKey=self → getCondValue(self)는 순환차단으로 null → 매칭 안 함 → 기본식 7
    expect(evalFormulaForTier(fields[0], {}, fields, new Set(), {})).toBe(7);
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

describe("resolveConditionalFormula — 비교 연산자(op)", () => {
  const mk = (op: "eq" | "neq" | "contains" | "notContains"): FieldDef => ({
    key: "f", label: "f", type: "formula", formula: base,
    conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "하이브" }, op, formula: hive }] },
  });
  it("op 미지정이면 eq(같음)로 동작 — 앞호환", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base,
      conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "하이브" }, formula: hive }] } };
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브정밀" }))).toBe(base);
  });
  it("eq: 정확히 같을 때만", () => {
    expect(resolveConditionalFormula(mk("eq"), gv({ 분류: "하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(mk("eq"), gv({ 분류: "하이브정밀" }))).toBe(base);
  });
  it("neq: 다르면 일치, 같으면 기본식", () => {
    expect(resolveConditionalFormula(mk("neq"), gv({ 분류: "위들리" }))).toBe(hive);
    expect(resolveConditionalFormula(mk("neq"), gv({ 분류: "하이브" }))).toBe(base);
  });
  it("contains: 부분 글자 포함(다중값 포함)", () => {
    expect(resolveConditionalFormula(mk("contains"), gv({ 분류: "하이브정밀" }))).toBe(hive);
    expect(resolveConditionalFormula(mk("contains"), gv({ 분류: "서월, 하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(mk("contains"), gv({ 분류: "위들리" }))).toBe(base);
  });
  it("notContains: 포함 안 하면 일치", () => {
    expect(resolveConditionalFormula(mk("notContains"), gv({ 분류: "위들리" }))).toBe(hive);
    expect(resolveConditionalFormula(mk("notContains"), gv({ 분류: "하이브정밀" }))).toBe(base);
  });
  it("빈 기준 칸은 어떤 op 도 매칭 안 함 → 기본식", () => {
    expect(resolveConditionalFormula(mk("neq"), gv({}))).toBe(base);
    expect(resolveConditionalFormula(mk("notContains"), gv({}))).toBe(base);
    expect(resolveConditionalFormula(mk("eq"), gv({}))).toBe(base);
  });
});

describe("resolveConditionalFormula — 연산자 엣지(가드·다중값 일관성)", () => {
  it("공백만 있는 값은 어떤 op 도 매칭 안 함(가드) — 전체 행 오매칭 방지", () => {
    const wsRight = (op: "eq" | "contains" | "notContains") => ({
      key: "f", label: "f", type: "formula" as const, formula: base,
      conditional: { rules: [{ leftKey: "분류", right: { kind: "text" as const, value: "   " }, op, formula: hive }] },
    });
    expect(resolveConditionalFormula(wsRight("contains"), gv({ 분류: "하이브" }))).toBe(base);
    expect(resolveConditionalFormula(wsRight("eq"), gv({ 분류: "하이브" }))).toBe(base);
    // 기준 칸이 공백뿐 → 미매칭 → 기본식
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base,
      conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "하이브" }, op: "notContains", formula: hive }] } };
    expect(resolveConditionalFormula(f, gv({ 분류: "   " }))).toBe(base);
  });
  it("contains: 비교값이 콤마 다중값이면 토큰 중 하나라도 부분 포함하면 일치(같음과 의미축 통일)", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base,
      conditional: { rules: [{ leftKey: "분류", right: { kind: "text", value: "서월, 하이브" }, op: "contains", formula: hive }] } };
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브정밀" }))).toBe(hive); // "하이브" 토큰 부분 포함
    expect(resolveConditionalFormula(f, gv({ 분류: "서월기업" }))).toBe(hive);   // "서월" 토큰 부분 포함
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리" }))).toBe(base);      // 둘 다 미포함
  });
});

describe("resolveConditionalFormula — 여러 조건 AND/OR(clauses)", () => {
  const cl = (leftKey: string, value: string, op: "eq" | "neq" | "contains" | "notContains" = "eq"): ConditionClause =>
    ({ leftKey, right: { kind: "text", value }, op });
  const mk = (clauses: ConditionClause[], combine?: "and" | "or"): FieldDef => ({
    key: "f", label: "f", type: "formula", formula: base,
    conditional: { rules: [{ clauses, combine, formula: hive }] },
  });

  it("AND: 모든 절이 맞아야 그 식", () => {
    const f = mk([cl("분류", "하이브"), cl("지역", "서울")], "and");
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 지역: "서울" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 지역: "부산" }))).toBe(base);
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리", 지역: "서울" }))).toBe(base);
  });
  it("OR: 한 절만 맞아도 그 식", () => {
    const f = mk([cl("분류", "하이브"), cl("지역", "서울")], "or");
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 지역: "부산" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리", 지역: "서울" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리", 지역: "부산" }))).toBe(base);
  });
  it("combine 미지정이면 AND(모두 만족)로 취급", () => {
    const f = mk([cl("분류", "하이브"), cl("지역", "서울")]);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 지역: "서울" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 지역: "부산" }))).toBe(base);
  });
  it("AND + 연산자 혼용(같음 + 포함)", () => {
    const f = mk([cl("분류", "하이브"), cl("메모", "우수", "contains")], "and");
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 메모: "우수고객" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 메모: "일반" }))).toBe(base);
  });
  it("빈 값 절: AND면 전체 불일치, OR면 무시", () => {
    const fAnd = mk([cl("분류", "하이브"), cl("지역", "서울")], "and");
    expect(resolveConditionalFormula(fAnd, gv({ 분류: "하이브" }))).toBe(base);
    const fOr = mk([cl("분류", "하이브"), cl("지역", "서울")], "or");
    expect(resolveConditionalFormula(fOr, gv({ 분류: "하이브" }))).toBe(hive);
  });
  it("절 right 가 '다른 칸'(field)도 동작", () => {
    const f: FieldDef = { key: "f", label: "f", type: "formula", formula: base,
      conditional: { rules: [{ clauses: [
        { leftKey: "분류", right: { kind: "text", value: "하이브" }, op: "eq" },
        { leftKey: "확정", right: { kind: "field", key: "예상" }, op: "eq" },
      ], combine: "and", formula: hive }] } };
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 확정: 100, 예상: 100 }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브", 확정: 100, 예상: 200 }))).toBe(base);
  });
  it("절 1개만 있는 clauses 는 옛 단일과 동일", () => {
    const f = mk([cl("분류", "하이브")]);
    expect(resolveConditionalFormula(f, gv({ 분류: "하이브" }))).toBe(hive);
    expect(resolveConditionalFormula(f, gv({ 분류: "위들리" }))).toBe(base);
  });
});

// ── 크기 비교(이후·이전) — 2026-08-01 요율 분기용 ──
describe("resolveConditionalFormula — 이후(gte)·이전(lte) 비교", () => {
  const 새요율: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "NEW" }];
  const 기본식: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "OLD" }];
  const f: FieldDef = {
    key: "수수료", label: "수수료", type: "formula", formula: 기본식,
    conditional: { rules: [
      { leftKey: "계약일", right: { kind: "text", value: "2026-08-01" }, op: "gte", formula: 새요율 },
    ] },
  };

  it("기준일 당일이면 새 식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-08-01" }))).toBe(새요율);
  });
  it("기준일 다음날이면 새 식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-08-02" }))).toBe(새요율);
  });
  it("기준일 하루 전이면 기본식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-07-31" }))).toBe(기본식);
  });
  it("해가 넘어가도 앞뒤가 맞는다", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2027-01-05" }))).toBe(새요율);
    expect(resolveConditionalFormula(f, gv({ 계약일: "2025-12-31" }))).toBe(기본식);
  });
  it("시각이 붙은 값도 날짜 부분으로 비교", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-08-01T09:30" }))).toBe(새요율);
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-07-31T23:59" }))).toBe(기본식);
  });
  it("빈 값이면 매칭 안 함(기본식)", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "" }))).toBe(기본식);
    expect(resolveConditionalFormula(f, gv({}))).toBe(기본식);
  });
  it("날짜가 아닌 글자는 매칭 안 함(글자 크기 비교 금지)", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "미정" }))).toBe(기본식);
  });

  const num: FieldDef = {
    key: "수수료", label: "수수료", type: "formula", formula: 기본식,
    conditional: { rules: [
      { leftKey: "계약금", right: { kind: "text", value: "1000000" }, op: "gte", formula: 새요율 },
    ] },
  };
  it("숫자끼리도 크기 비교(글자순 아님)", () => {
    expect(resolveConditionalFormula(num, gv({ 계약금: 2000000 }))).toBe(새요율);
    expect(resolveConditionalFormula(num, gv({ 계약금: 999999 }))).toBe(기본식);
    expect(resolveConditionalFormula(num, gv({ 계약금: "1,500,000" }))).toBe(새요율);
  });
  it("한쪽만 날짜, 한쪽은 숫자면 매칭 안 함", () => {
    expect(resolveConditionalFormula(num, gv({ 계약금: "2026-08-05" }))).toBe(기본식);
  });

  const lte: FieldDef = {
    key: "수수료", label: "수수료", type: "formula", formula: 기본식,
    conditional: { rules: [
      { leftKey: "계약일", right: { kind: "text", value: "2026-07-31" }, op: "lte", formula: 새요율 },
    ] },
  };
  it("이전(lte)은 반대로 판정", () => {
    expect(resolveConditionalFormula(lte, gv({ 계약일: "2026-07-31" }))).toBe(새요율);
    expect(resolveConditionalFormula(lte, gv({ 계약일: "2026-07-30" }))).toBe(새요율);
    expect(resolveConditionalFormula(lte, gv({ 계약일: "2026-08-01" }))).toBe(기본식);
  });

  const both: FieldDef = {
    key: "수수료", label: "수수료", type: "formula", formula: 기본식,
    conditional: { rules: [
      { clauses: [
          { leftKey: "계약일", right: { kind: "text", value: "2026-08-01" }, op: "gte" },
          { leftKey: "분류", right: { kind: "text", value: "정부지원금" }, op: "eq" },
        ], combine: "and", formula: 새요율 },
    ] },
  };
  it("크기 비교와 기존 비교를 한 규칙에서 함께 쓸 수 있다", () => {
    expect(resolveConditionalFormula(both, gv({ 계약일: "2026-08-10", 분류: "정부지원금" }))).toBe(새요율);
    expect(resolveConditionalFormula(both, gv({ 계약일: "2026-08-10", 분류: "정책자금" }))).toBe(기본식);
    expect(resolveConditionalFormula(both, gv({ 계약일: "2026-07-10", 분류: "정부지원금" }))).toBe(기본식);
  });
});

// 점·빗금으로 적힌 날짜도 같은 날로 본다 — 대량 업로드·외부 연동으로 들어올 수 있는 형식.
// (못 알아보면 조용히 옛 요율로 떨어져 사람이 못 잡는다)
describe("resolveConditionalFormula — 날짜 구분자가 달라도 같게 판정", () => {
  const 새요율: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "NEW" }];
  const 기본식: FormulaTerm[] = [{ op: "+", unit: "column", columnKey: "OLD" }];
  const f: FieldDef = {
    key: "수수료", label: "수수료", type: "formula", formula: 기본식,
    conditional: { rules: [
      { leftKey: "계약일", right: { kind: "text", value: "2026-08-01" }, op: "gte", formula: 새요율 },
    ] },
  };
  it("점 표기 2026.08.05 → 새 식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026.08.05" }))).toBe(새요율);
  });
  it("빗금 표기 2026/08/05 → 새 식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026/08/05" }))).toBe(새요율);
  });
  it("점 표기라도 기준일 전이면 기본식", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026.07.31" }))).toBe(기본식);
  });
  it("비교값 쪽이 점 표기여도 판정된다", () => {
    const g: FieldDef = { ...f, conditional: { rules: [
      { leftKey: "계약일", right: { kind: "text", value: "2026.08.01" }, op: "gte", formula: 새요율 },
    ] } };
    expect(resolveConditionalFormula(g, gv({ 계약일: "2026-08-01" }))).toBe(새요율);
    expect(resolveConditionalFormula(g, gv({ 계약일: "2026-07-31" }))).toBe(기본식);
  });
  it("2026.8.5 처럼 한 자리로 적혀도 같은 날로 본다", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026.8.5" }))).toBe(새요율);
    expect(resolveConditionalFormula(f, gv({ 계약일: "2026-7-31" }))).toBe(기본식);
  });
  it("날짜로 볼 수 없는 글자는 여전히 매칭 안 함", () => {
    expect(resolveConditionalFormula(f, gv({ 계약일: "8월 초" }))).toBe(기본식);
  });
});
