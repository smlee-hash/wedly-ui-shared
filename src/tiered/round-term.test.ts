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

// ── 위험한 조합 — 반올림이 기존 '계산 불가(빈칸)' 규칙과 부딪히지 않는지 ──
// 이 조합들은 실제로 손으로 확인해 통과시킨 것이다. 여기 없으면 나중에
// evalTermChain 을 고칠 때 조용히 깨진다.
describe("round 항 — 다른 규칙과의 조합", () => {
  const mk = (key: string, formula: unknown[]): FieldDef =>
    ({ key, label: key, type: "formula", formulaResult: "number", formula } as FieldDef);
  const 빈율칸 = { key: "빈율", label: "빈율", type: "percent" } as FieldDef;
  const run = (f: FieldDef, tier: Record<string, unknown>) =>
    evalFormulaForTier(f, tier as never, [...fields, 빈율칸, f]);

  it("죽은 구간(빈칸 곱하기) 위에 반올림이 와도 여전히 '-'", () => {
    const f = mk("A", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "*", unit: "column", value: 0, columnKey: "빈율" },
      { op: "round", unit: "number", value: 1000 },
    ]);
    expect(run(f, { id: "t", 금액: 6856400 })).toBeNull();
  });

  it("죽은 구간 뒤에 반올림·더하기가 오면 뒤의 값만 살아난다", () => {
    const f = mk("B", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "*", unit: "column", value: 0, columnKey: "빈율" },
      { op: "round", unit: "number", value: 1000 },
      { op: "+", unit: "number", value: 7000 },
    ]);
    expect(run(f, { id: "t", 금액: 6856400 })).toBe(7000);
  });

  it("반올림이 연속 두 번이면 순서대로 적용된다(천원 → 만원)", () => {
    const f = mk("C", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "round", unit: "number", value: 1000 },
      { op: "round", unit: "number", value: 10000 },
    ]);
    expect(run(f, { id: "t", 금액: 2056920 })).toBe(2060000);
  });

  it("반올림이 맨 끝에 오면 최종값을 반올림한다", () => {
    const f = mk("D", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "*", unit: "percent", value: 110 },
      { op: "round", unit: "number", value: 1000 },
    ]);
    expect(run(f, { id: "t", 금액: 2056920 })).toBe(2263000);
  });

  it("묶음(괄호) 안쪽의 반올림도 먹는다", () => {
    const f = mk("E", [
      { op: "+", unit: "group", terms: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "round", unit: "number", value: 1000 },
      ] },
      { op: "*", unit: "percent", value: 110 },
    ]);
    expect(run(f, { id: "t", 금액: 2056920 })).toBeCloseTo(2262700, 6);
  });

  it("수억·수천억 금액에서도 1원까지 정확하다", () => {
    const f = mk("F", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "round", unit: "number", value: 1000 },
    ]);
    expect(run(f, { id: "t", 금액: 987654321 })).toBe(987654000);
    expect(run(f, { id: "t", 금액: 123456789012 })).toBe(123456789000);
  });

  it("반올림 단위가 없거나 숫자가 아니면 값을 손대지 않는다", () => {
    const f1 = mk("G", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "round", unit: "number" },
    ]);
    expect(run(f1, { id: "t", 금액: 12345 })).toBe(12345);
    const f2 = mk("H", [
      { op: "+", unit: "column", value: 0, columnKey: "금액" },
      { op: "round", unit: "number", value: "1000" },
    ]);
    expect(run(f2, { id: "t", 금액: 12345 })).toBe(12345);
  });
});
// ── 잘못 저장된 반올림 딱지 방어 (적대적 검토 지적) ──
// 반올림은 '단위(원)'를 받는 연산이라 컬럼·묶음 항에는 붙을 수 없다.
// 붙어 있으면 평가기가 그 항을 통째로 건너뛰어 금액이 소리 없이 사라지므로,
// 걸러내는 단계에서 더하기로 되돌린다(반올림 도입 전과 같은 동작).
describe("round 항 — 잘못된 자리에 붙은 경우 되돌리기", () => {
  it("컬럼 항에 붙은 반올림은 더하기로 되돌아간다(금액이 안 사라진다)", () => {
    const raw = [
      { op: "+", unit: "column", columnKey: "기본" },
      { op: "round", unit: "column", columnKey: "보너스" },
    ];
    const parsed = parseFormulaTerms(raw);
    expect(parsed[1].op).toBe("+");
    expect(parsed[1].columnKey).toBe("보너스");

    const fs: FieldDef[] = [
      { key: "기본", label: "기본", type: "number" },
      { key: "보너스", label: "보너스", type: "number" },
      { key: "합", label: "합", type: "formula", formulaResult: "number", formula: parsed } as FieldDef,
    ];
    expect(evalFormulaForTier(fs[2], { id: "t", 기본: 10000, 보너스: 99999 } as never, fs)).toBe(109999);
  });

  it("묶음 항에 붙은 반올림도 더하기로 되돌아간다", () => {
    const parsed = parseFormulaTerms([
      { op: "+", unit: "number", value: 10000 },
      { op: "round", unit: "group", terms: [{ op: "+", unit: "number", value: 99999 }] },
    ]);
    expect(parsed[1].op).toBe("+");
    expect(parsed[1].unit).toBe("group");

    const f = { key: "합2", label: "합2", type: "formula", formulaResult: "number", formula: parsed } as FieldDef;
    expect(evalFormulaForTier(f, { id: "t" } as never, [f])).toBe(109999);
  });

  it("퍼센트 항에 붙은 반올림도 더하기로 되돌아간다", () => {
    const parsed = parseFormulaTerms([
      { op: "+", unit: "number", value: 10000 },
      { op: "round", unit: "percent", value: 30 },
    ]);
    expect(parsed[1].op).toBe("+");
  });

  it("숫자 항의 반올림은 그대로 살아 있다", () => {
    const parsed = parseFormulaTerms([
      { op: "+", unit: "number", value: 12345 },
      { op: "round", unit: "number", value: 1000 },
    ]);
    expect(parsed[1].op).toBe("round");
    expect(parsed[1].value).toBe(1000);
  });

  it("반올림 단위가 음수면 값을 손대지 않는다", () => {
    const f: FieldDef = {
      key: "음수단위", label: "음수단위", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "round", unit: "number", value: -1000 },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 12345 } as never, all)).toBe(12345);
  });

  it("퍼센트 곱하기 경계 — 8,230,000 × 15% 는 정확히 1,234,500 이라 1,235,000 으로 올라간다", () => {
    const f: FieldDef = {
      key: "경계", label: "경계", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "금액" },
        { op: "*", unit: "percent", value: 15 },
        { op: "round", unit: "number", value: 1000 },
      ],
    } as FieldDef;
    const all = [...fields, f];
    expect(evalFormulaForTier(f, { id: "t1", 금액: 8230000 } as never, all)).toBe(1235000);
  });
});
