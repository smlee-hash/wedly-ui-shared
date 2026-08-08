import { describe, it, expect } from "vitest";
import { evalFormulaForTier, parseFormulaTerms, parseScoreCards, type FieldDef } from "./index";

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

// ─────────────────────────────────────────────────────────────────────────
// 소수점 오차로 돈이 깎이는 것 막기 (2026-08-08 적대적 검증에서 발견)
// 컴퓨터의 소수 계산은 딱 떨어지는 금액도 아주 조금 모자라게 만든다.
// 반올림은 이 오차를 스스로 삼키지만 내림은 경계에서 그대로 한 단위 떨어진다.
// ─────────────────────────────────────────────────────────────────────────
describe("내림 — 딱 떨어지는 금액이 오차로 깎이지 않는다", () => {
  const 비율칸: FieldDef[] = [
    { key: "환급액", label: "환급액", type: "number" },
    {
      key: "수수료내림", label: "수수료내림", type: "formula", formulaResult: "number",
      formula: [
        { op: "+", unit: "column", value: 0, columnKey: "환급액" },
        { op: "*", unit: "percent", value: 70 },
        { op: "floor", unit: "number", value: 10000 },
      ],
    } as FieldDef,
  ];
  const 계산 = (환급액: number, fields = 비율칸, key = "수수료내림") =>
    evalFormulaForTier(fields.find((f) => f.key === key)!, { id: "t1", 환급액 } as never, fields);

  it("700,000 × 70% = 490,000 — 480,000 으로 깎이면 안 된다", () => {
    // 그냥 곱하면 489999.99999999994 가 나온다.
    expect(700000 * (70 / 100)).toBeLessThan(490000);
    expect(계산(700000)).toBe(490000);
  });

  it("1,400,000 × 70% = 980,000", () => {
    expect(계산(1400000)).toBe(980000);
  });

  it("2,700,000 × 70% = 1,890,000", () => {
    expect(계산(2700000)).toBe(1890000);
  });

  it("진짜로 모자란 금액은 그대로 내려간다 — 489,999 → 480,000", () => {
    const f: FieldDef[] = [
      { key: "금액2", label: "금액2", type: "number" },
      {
        key: "그냥내림", label: "그냥내림", type: "formula", formulaResult: "number",
        formula: [
          { op: "+", unit: "column", value: 0, columnKey: "금액2" },
          { op: "floor", unit: "number", value: 10000 },
        ],
      } as FieldDef,
    ];
    const run = (금액2: number) =>
      evalFormulaForTier(f.find((x) => x.key === "그냥내림")!, { id: "t1", 금액2 } as never, f);
    expect(run(489999)).toBe(480000);
    expect(run(489999.5)).toBe(480000);
    expect(run(490000)).toBe(490000);
  });

  it("금액×비율 조합을 넓게 훑어도 어긋나는 곳이 없다", () => {
    const 어긋남: string[] = [];
    for (let base = 100000; base <= 20000000; base += 100000) {
      for (const rate of [10, 15, 20, 25, 30, 33, 35, 40, 50, 60, 70, 80, 90]) {
        const 정확 = Math.round(base * rate) / 100;           // 정수 곱 → 오차 없음
        const 기대 = Math.floor(정확 / 10000) * 10000;
        const 얻음 = evalFormulaForTier(
          {
            key: "x", label: "x", type: "formula", formulaResult: "number",
            formula: [
              { op: "+", unit: "column", value: 0, columnKey: "환급액" },
              { op: "*", unit: "percent", value: rate },
              { op: "floor", unit: "number", value: 10000 },
            ],
          } as FieldDef,
          { id: "t1", 환급액: base } as never,
          [{ key: "환급액", label: "환급액", type: "number" } as FieldDef],
        );
        if (얻음 !== 기대) 어긋남.push(`${base}×${rate}% → ${얻음} (기대 ${기대})`);
      }
    }
    expect(어긋남).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 스코어카드 직접 수식에 '내림'이 새어 들어가면 ×10,000 이 된다 (코드 리뷰 지적, 2026-08-08)
// 스코어카드 파서는 모르는 연산을 '곱하기'로 되돌리므로, 반올림처럼 내림도 '버려야' 한다.
// 반올림만 막아 두면 내림이 그대로 통과해 금액이 1만 배가 된다.
// ─────────────────────────────────────────────────────────────────────────
describe("스코어카드 직접 수식 — 반올림·내림 항은 버린다", () => {
  const 카드 = (custom: unknown[]) => [{
    id: "c1", label: "합계", color: "blue",
    formula: { plus: ["금액"], minus: [], custom },
  }];

  it("내림 항은 버려진다 — 곱하기 10,000 으로 둔갑하지 않는다", () => {
    const parsed = parseScoreCards(카드([{ op: "floor", unit: "number", value: 10000 }]));
    // 항이 하나도 안 남으면 파서가 custom 칸 자체를 안 만든다(= 버려졌다는 뜻).
    expect(parsed?.[0].formula.custom ?? []).toEqual([]);
  });

  it("반올림 항도 그대로 버려진다(기존 동작 유지)", () => {
    const parsed = parseScoreCards(카드([{ op: "round", unit: "number", value: 1000 }]));
    expect(parsed?.[0].formula.custom ?? []).toEqual([]);
  });

  it("멀쩡한 항은 그대로 남는다", () => {
    const parsed = parseScoreCards(카드([{ op: "*", unit: "percent", value: 30 }]));
    expect(parsed?.[0].formula.custom).toEqual([{ op: "*", unit: "percent", value: 30 }]);
  });

  it("내림이 섞여 있어도 멀쩡한 항만 남는다", () => {
    const parsed = parseScoreCards(카드([
      { op: "*", unit: "percent", value: 30 },
      { op: "floor", unit: "number", value: 10000 },
    ]));
    expect(parsed?.[0].formula.custom).toEqual([{ op: "*", unit: "percent", value: 30 }]);
  });
});
