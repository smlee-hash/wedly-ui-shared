// src/tiered/exactly-one.test.ts
// "정확히 하나" 계산 방식(conditional.match === "exactlyOne") — 정산 기준표 한 줄만 맞을 때만 계산한다.
// 시험 자료는 전부 가짜(업체명·금액 모두 임의)다.
import { describe, it, expect } from "vitest";
import {
  FEE_LIVE_KEY,
  evalFormulaForTierDetailed,
  formulaBlockMessage,
  parseTiers,
  readStoredFeeResult,
  type ConditionClause,
  type FieldDef,
  type FormulaTerm,
  type TierData,
} from "./index";

// ── 가짜 정산 기준표(정부지원금 계약금 일부) ──
const eq = (leftKey: string, ...values: string[]): ConditionClause => ({
  leftKey, right: { kind: "text", value: values.join(",") }, op: "eq",
});
const gte = (leftKey: string, value: string): ConditionClause => ({ leftKey, right: { kind: "text", value }, op: "gte" });
const lte = (leftKey: string, value: string): ConditionClause => ({ leftKey, right: { kind: "text", value }, op: "lte" });

interface Row {
  n: number;
  cons: string;
  name?: string;
  sales: string;
  db: string[];
  start?: Array<ConditionClause>;
  contract?: Array<ConditionClause>;
  region?: string;
  share: [number, number][]; // [컨설턴트, 하이브] 몫을 [분자, 분모]로
}
const TABLE: Row[] = [
  { n: 13, cons: "일루아", sales: "하이브", db: ["하이브", "기존고객"], start: [lte("착수일", "2026-07-31")], region: "그 외", share: [[3, 10], [21, 40]] },
  { n: 17, cons: "컨설턴트", name: "김가나", sales: "하이브", db: ["위들리"], contract: [gte("계약일", "2026-08-24")], share: [[3, 10], [21, 50]] },
  { n: 25, cons: "컨설턴트", name: "박다라", sales: "위들리", db: ["위들리"], start: [gte("착수일", "2026-08-01"), lte("착수일", "2027-01-31")], share: [[0, 1], [0, 1]] },
];

const share = (num: number, den: number): FormulaTerm[] => [
  { op: "+", unit: "column", columnKey: "계약금" },
  { op: "*", unit: "number", value: num },
  { op: "/", unit: "number", value: den },
  { op: "floor", unit: "number", value: 1 },
];

const EMPTY_REASONS = {
  착수일: "착수일 미입력으로 수수료 계산 불가",
  계약일: "날짜 확인 필요",
  사업장지역: "주소 확인 필요",
};

const rulesFor = (col: 0 | 1) => TABLE.map((r) => ({
  basisRow: r.n,
  gid: `row${r.n}`,
  clauses: [
    eq("컨설팅담당", r.cons),
    ...(r.name ? [eq("담당컨설턴트", r.name)] : []),
    eq("영업담당", r.sales),
    eq("DB분류", ...r.db),
    ...(r.start ?? []),
    ...(r.contract ?? []),
    ...(r.region ? [eq("사업장지역", r.region)] : []),
  ],
  formula: share(...r.share[col]),
}));

const baseFields: FieldDef[] = [
  { key: "컨설팅담당", label: "컨설팅 담당", type: "text" },
  { key: "담당컨설턴트", label: "담당 컨설턴트", type: "text" },
  { key: "계약일", label: "계약일", type: "date" },
  { key: "착수일", label: "착수일", type: "date" },
  { key: "계약금", label: "계약금", type: "number" },
];
const consultant: FieldDef = {
  key: "컨설턴트수수료", label: "[컨설턴트] 수수료", type: "formula",
  conditional: {
    match: "exactlyOne", rules: rulesFor(0), emptyReasons: EMPTY_REASONS,
    blockedValues: [{ columnKey: "계약금", values: [1_100_000, 2_200_000], reason: "계약금 확인 필요" }],
  },
};
const hive: FieldDef = {
  key: "하이브수수료", label: "[하이브] 수수료", type: "formula",
  conditional: {
    match: "exactlyOne", rules: rulesFor(1), emptyReasons: EMPTY_REASONS,
    blockedValues: [{ columnKey: "계약금", values: [1_100_000, 2_200_000], reason: "계약금 확인 필요" }],
  },
};
// 위들리 = 나머지 (계약금 − 컨설턴트 − 하이브). 막힌 칸이 있으면 같은 이유로 막힌다.
const widly: FieldDef = {
  key: "위들리수수료", label: "[위들리] 수수료", type: "formula",
  formula: [
    { op: "+", unit: "column", columnKey: "계약금" },
    { op: "-", unit: "column", columnKey: "컨설턴트수수료" },
    { op: "-", unit: "column", columnKey: "하이브수수료" },
  ],
};
const fields = [...baseFields, consultant, hive, widly];

const tier = (o: Record<string, string | number>): TierData => ({ id: "t1", label: "1차", ...o } as TierData);
const calc = (f: FieldDef, t: TierData, cv: Record<string, unknown>) => evalFormulaForTierDetailed(f, t, fields, undefined, cv);
const reasonOf = (f: FieldDef, t: TierData, cv: Record<string, unknown>) => {
  const d = calc(f, t, cv);
  return d.blocked ? formulaBlockMessage(d.blocked, (k) => fields.find((x) => x.key === k)?.label, f.key) : null;
};

describe("정확히 하나 — 정부지원금 계약금 예시", () => {
  it("13번 줄: 계약금 2,000,000 → 컨설턴트 600,000 / 하이브 1,050,000 / 위들리 350,000", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000 });
    const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
    expect(calc(consultant, t, cv)).toMatchObject({ value: 600_000, basisRow: 13 });
    expect(calc(hive, t, cv)).toMatchObject({ value: 1_050_000, basisRow: 13 });
    expect(calc(widly, t, cv).value).toBe(350_000);
  });

  it("17번 줄: 계약일 이후 · 계약금 1,000,000 → 300,000 / 420,000 / 280,000", () => {
    const t = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "김가나", 계약일: "2026-09-01", 계약금: 1_000_000 });
    const cv = { 영업담당: "하이브", DB분류: "위들리" };
    expect(calc(consultant, t, cv)).toMatchObject({ value: 300_000, basisRow: 17 });
    expect(calc(hive, t, cv).value).toBe(420_000);
    expect(calc(widly, t, cv).value).toBe(280_000);
  });

  it("25번 줄: 날짜 범위의 양쪽 끝날도 포함 · 컨설턴트·하이브 0, 위들리 전부", () => {
    const cv = { 영업담당: "위들리", DB분류: "위들리" };
    for (const start of ["2026-08-01", "2027-01-31"]) {
      const t = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "박다라", 착수일: start, 계약금: 3_000_000 });
      expect(calc(consultant, t, cv)).toMatchObject({ value: 0, basisRow: 25 });
      expect(calc(widly, t, cv).value).toBe(3_000_000);
    }
    const out = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "박다라", 착수일: "2027-02-01", 계약금: 3_000_000 });
    expect(reasonOf(consultant, out, cv)).toBe("정산 기준 확인 필요");
  });

  it("컨설턴트·하이브 몫은 원 단위 내림, 위들리가 나머지를 가진다", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 1_000_001 });
    const cv = { 영업담당: "하이브", DB분류: "하이브", 사업장지역: "그 외" };
    expect(calc(consultant, t, cv).value).toBe(300_000);
    expect(calc(hive, t, cv).value).toBe(525_000);
    expect(calc(widly, t, cv).value).toBe(175_001);
  });

  it("맞는 줄이 하나도 없으면 「정산 기준 확인 필요」 — 위들리도 같은 이유로 비운다", () => {
    const t = tier({ 컨설팅담당: "없는담당", 착수일: "2026-07-10", 계약금: 2_000_000 });
    const cv = { 영업담당: "하이브", DB분류: "하이브", 사업장지역: "그 외" };
    expect(calc(consultant, t, cv)).toMatchObject({ value: null, blocked: { kind: "basis", reason: "정산 기준 확인 필요" } });
    expect(reasonOf(widly, t, cv)).toBe("정산 기준 확인 필요");
    expect(calc(widly, t, cv).value).toBeNull();
  });

  it("착수일이 비면 착수일 조건이 있는 줄만 모름이 된다 — 계약일로 대신하지 않는다", () => {
    const t = tier({ 컨설팅담당: "일루아", 계약일: "2026-01-01", 계약금: 2_000_000 });
    const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
    expect(calc(consultant, t, cv).value).toBeNull();
    expect(reasonOf(consultant, t, cv)).toBe("착수일 미입력으로 수수료 계산 불가");
    // 착수일 조건이 없는 17번 줄은 착수일이 비어도 그대로 계산된다.
    const t17 = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "김가나", 계약일: "2026-09-01", 계약금: 1_000_000 });
    expect(calc(consultant, t17, { 영업담당: "하이브", DB분류: "위들리" }).value).toBe(300_000);
  });

  it("계약일이 비면 「날짜 확인 필요」, 지역을 못 읽으면 「주소 확인 필요」", () => {
    const t = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "김가나", 계약금: 1_000_000 });
    expect(reasonOf(consultant, t, { 영업담당: "하이브", DB분류: "위들리" })).toBe("날짜 확인 필요");
    const t13 = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000 });
    expect(reasonOf(consultant, t13, { 영업담당: "하이브", DB분류: "기존고객" })).toBe("주소 확인 필요");
  });

  it("다른 조건이 이미 어긋난 줄은 모름이 아니라 거짓이다 — 빈 날짜가 이유로 새지 않는다", () => {
    // 영업담당이 달라 13번·17번은 거짓. 25번은 위들리 영업·착수일 칸이 비어 모름 → 착수일 안내.
    const t = tier({ 컨설팅담당: "컨설턴트", 담당컨설턴트: "박다라", 계약금: 3_000_000 });
    expect(reasonOf(consultant, t, { 영업담당: "위들리", DB분류: "위들리" })).toBe("착수일 미입력으로 수수료 계산 불가");
    expect(reasonOf(consultant, t, { 영업담당: "하이브", DB분류: "위들리" })).toBe("정산 기준 확인 필요");
  });

  it("계약금 1,100,000 / 2,200,000 은 「계약금 확인 필요」", () => {
    const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
    for (const amount of [1_100_000, 2_200_000]) {
      const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: amount });
      expect(reasonOf(consultant, t, cv)).toBe("계약금 확인 필요");
      expect(reasonOf(widly, t, cv)).toBe("계약금 확인 필요");
    }
  });

  it("식에 쓰는 칸(계약금)이 비면 부분 계산 없이 비운다", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10" });
    const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
    const d = calc(consultant, t, cv);
    expect(d.value).toBeNull();
    expect(d.blocked).toMatchObject({ kind: "basis", reason: "계약금 확인 필요" });
  });

  it("성공보수: 요율 칸이 비면 「성공보수 수수료율 확인 필요」 — 있는 값만으로 계산하지 않는다", () => {
    const rate: FieldDef = { key: "성공보수_수수료율", label: "성공보수 수수료율", type: "percent" };
    const total: FieldDef = { key: "총액", label: "총액", type: "number" };
    const success: FieldDef = {
      key: "성공보수_컨설턴트", label: "[컨설턴트] 성공보수 수수료", type: "formula",
      conditional: {
        match: "exactlyOne", emptyReasons: EMPTY_REASONS,
        rules: [{
          basisRow: 13, gid: "row13",
          clauses: [eq("영업담당", "하이브")],
          formula: [
            { op: "+", unit: "column", columnKey: "총액" }, { op: "*", unit: "column", columnKey: "성공보수_수수료율" },
            { op: "*", unit: "number", value: 7 }, { op: "/", unit: "number", value: 10 }, { op: "floor", unit: "number", value: 1 },
          ],
        }],
      },
    };
    const fs = [total, rate, success];
    const cv = { 영업담당: "하이브" };
    const noRate = evalFormulaForTierDetailed(success, tier({ 총액: 10_000_000 }), fs, undefined, cv);
    expect(noRate.value).toBeNull();
    expect(noRate.blocked).toMatchObject({ kind: "basis", reason: "성공보수 수수료율 확인 필요" });
    const ok = evalFormulaForTierDetailed(success, tier({ 총액: 10_000_000, 성공보수_수수료율: 20 }), fs, undefined, cv);
    expect(ok).toMatchObject({ value: 1_400_000, basisRow: 13 });
  });

  it("사람이 고친 값(_ovr_)은 계산보다 먼저다", () => {
    const t = tier({ 컨설팅담당: "없는담당", 계약금: 2_000_000, _ovr_컨설턴트수수료: 123_456 });
    expect(calc(consultant, t, { 영업담당: "하이브", DB분류: "하이브" }).value).toBe(123_456);
  });

  it("앞 단계에서 정한 막힘 사유(guardKeys)가 먼저 적용된다", () => {
    const guarded: FieldDef = {
      ...consultant,
      conditional: { ...consultant.conditional!, guardKeys: ["__blockConsultant", "__blockDates"] },
    };
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000 });
    const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
    expect(calc(guarded, t, cv).value).toBe(600_000);
    expect(reasonOf(guarded, t, { ...cv, __blockConsultant: "컨설턴트 확인 필요" })).toBe("컨설턴트 확인 필요");
    expect(reasonOf(guarded, t, { ...cv, __blockDates: "착수일·계약일 확인 필요" })).toBe("착수일·계약일 확인 필요");
  });
});

describe("정확히 하나 — 조건 중복", () => {
  const dup = (gidA: string, gidB: string): FieldDef => ({
    key: "r", label: "r", type: "formula",
    conditional: {
      match: "exactlyOne",
      rules: [
        { basisRow: 1, gid: gidA, clauses: [eq("영업담당", "하이브")], formula: [{ op: "+", unit: "number", value: 10 }] },
        { basisRow: 2, gid: gidB, clauses: [eq("영업담당", "하이브")], formula: [{ op: "+", unit: "number", value: 10 }] },
      ],
    },
  });
  it("서로 다른 두 줄이 함께 맞으면 결과가 같아도 「조건 중복 - 확인 필요」", () => {
    const f = dup("a", "b");
    const d = evalFormulaForTierDetailed(f, tier({}), [f], undefined, { 영업담당: "하이브" });
    expect(d.value).toBeNull();
    expect(d.blocked).toMatchObject({ kind: "basis", reason: "조건 중복 - 확인 필요" });
    expect(d.ruleIdx).toEqual([0, 1]);
  });
  it("한 줄을 펼친 규칙(같은 gid)은 하나로 센다", () => {
    const f = dup("a", "a");
    const d = evalFormulaForTierDetailed(f, tier({}), [f], undefined, { 영업담당: "하이브" });
    expect(d.value).toBe(10);
    expect(d.basisRow).toBe(1);
  });
});

describe("정확히 하나 — 경정청구 예시", () => {
  const F = (n: number, d: number, rest = false): FormulaTerm[] => rest
    ? [{ op: "+", unit: "column", columnKey: "총수수료" }, { op: "-", unit: "column", columnKey: "서월" }, { op: "-", unit: "column", columnKey: "하이브" }]
    : [{ op: "+", unit: "column", columnKey: "총수수료" }, { op: "*", unit: "number", value: n }, { op: "/", unit: "number", value: d }, { op: "floor", unit: "number", value: 1 }];
  const rows = [
    { n: 1, sales: "하이브", db: "위들리", date: [lte("19계약서작성일", "2026-08-31")], seo: [1, 3], hive: [1, 3] },
    { n: 2, sales: "하이브", db: "위들리", date: [gte("19계약서작성일", "2026-09-01")], seo: [1, 3], hive: [11, 30] },
    { n: 3, sales: "하이브", db: "하이브", date: [], seo: [1, 3], hive: [19, 30] },
    { n: 4, sales: "위들리", db: "위들리", date: [], seo: [2, 5], hive: [0, 1] },
  ];
  const mkRules = (pick: "seo" | "hive") => rows.map((r) => ({
    basisRow: r.n, gid: `r${r.n}`,
    clauses: [eq("영업담당", r.sales), eq("DB분류", r.db), ...r.date],
    formula: F(...(r[pick] as [number, number])),
  }));
  const cond = (pick: "seo" | "hive") => ({ match: "exactlyOne" as const, rules: mkRules(pick), emptyReasons: { "19계약서작성일": "날짜 확인 필요" } });
  const seo: FieldDef = { key: "서월", label: "[서월]", type: "formula", conditional: cond("seo") };
  const hv: FieldDef = { key: "하이브", label: "[하이브]", type: "formula", conditional: cond("hive") };
  const wd: FieldDef = { key: "위들리", label: "[위들리]", type: "formula", formula: F(0, 0, true) };
  const fs = [{ key: "총수수료", label: "총수수료", type: "number" } as FieldDef, seo, hv, wd];
  const run = (f: FieldDef, total: number, cv: Record<string, unknown>) =>
    evalFormulaForTierDetailed(f, tier({ 총수수료: total }), fs, undefined, cv);

  it("3,000,000: 계약 전(1번) 1/3씩, 계약 뒤(2번) 서월 1/3·하이브 11/30·위들리 나머지", () => {
    const before = { 영업담당: "하이브", DB분류: "위들리", "19계약서작성일": "2026-08-31" };
    expect([seo, hv, wd].map((f) => run(f, 3_000_000, before).value)).toEqual([1_000_000, 1_000_000, 1_000_000]);
    const after = { ...before, "19계약서작성일": "2026-09-01" };
    expect([seo, hv, wd].map((f) => run(f, 3_000_000, after).value)).toEqual([1_000_000, 1_100_000, 900_000]);
    expect(run(hv, 3_000_000, after).basisRow).toBe(2);
  });

  it("2,696,637: 내림한 몫을 뺀 나머지가 위들리", () => {
    const after = { 영업담당: "하이브", DB분류: "위들리", "19계약서작성일": "2026-10-05" };
    expect([seo, hv, wd].map((f) => run(f, 2_696_637, after).value)).toEqual([898_879, 988_766, 808_992]);
  });

  it("2,696,637 하이브/하이브(3번 줄) → 서월 898,879 · 하이브 1,707,870 · 위들리 89,888", () => {
    const cv = { 영업담당: "하이브", DB분류: "하이브" };
    expect([seo, hv, wd].map((f) => run(f, 2_696_637, cv).value)).toEqual([898_879, 1_707_870, 89_888]);
  });

  it("3,000,000 위들리/위들리(4번 줄) → 서월 1,200,000 · 하이브 0 · 위들리 1,800,000", () => {
    const cv = { 영업담당: "위들리", DB분류: "위들리" };
    expect([seo, hv, wd].map((f) => run(f, 3_000_000, cv).value)).toEqual([1_200_000, 0, 1_800_000]);
  });

  it("날짜가 없으면 날짜 조건이 있는 줄만 모름 — 3번·4번 줄은 날짜 없이도 계산", () => {
    expect(run(seo, 3_000_000, { 영업담당: "하이브", DB분류: "위들리" }).blocked)
      .toMatchObject({ kind: "basis", reason: "날짜 확인 필요" });
    expect(run(hv, 3_000_000, { 영업담당: "하이브", DB분류: "하이브" }).value).toBe(1_900_000);
    expect(run(seo, 3_000_000, { 영업담당: "위들리", DB분류: "위들리" }).value).toBe(1_200_000);
  });
});

describe("옛 정의 회귀 — 새 칸을 모르는 정의는 이전과 똑같이 계산", () => {
  const f: FieldDef = {
    key: "f", label: "f", type: "formula",
    formula: [{ op: "+", unit: "number", value: 1 }],
    conditional: { rules: [
      { leftKey: "분류", right: { kind: "text", value: "하이브" }, formula: [{ op: "+", unit: "number", value: 2 }], basisRow: 99, gid: "x" },
      { leftKey: "분류", right: { kind: "text", value: "하이브" }, formula: [{ op: "+", unit: "number", value: 3 }] },
    ] },
  };
  it("match 가 없으면 위에서 처음 맞는 규칙(basisRow·gid 는 읽지 않음)", () => {
    expect(evalFormulaForTierDetailed(f, tier({}), [f], undefined, { 분류: "하이브" }).value).toBe(2);
    expect(evalFormulaForTierDetailed(f, tier({}), [f], undefined, { 분류: "기타" }).value).toBe(1);
  });
  it("match=all 도 그대로 — 결과가 다르면 충돌", () => {
    const all: FieldDef = { ...f, conditional: { ...f.conditional!, match: "all" } };
    expect(evalFormulaForTierDetailed(all, tier({}), [all], undefined, { 분류: "하이브" }).blocked?.kind).toBe("conflict");
  });
});

describe("저장된 계산 기록 우선", () => {
  const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
  it("기록이 있으면 앱은 저장값을 그대로 읽고, 서버(FEE_LIVE_KEY)만 다시 계산한다", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000, 컨설턴트수수료: 111, _fs_컨설턴트수수료: "2026-11-05T00:00:00Z" });
    expect(calc(consultant, t, cv).value).toBe(111);
    expect(calc(consultant, t, { ...cv, [FEE_LIVE_KEY]: true }).value).toBe(600_000);
  });
  it("기록에 비운 이유가 있으면 그 이유로 막힌다 — 값이 남아 있어도 보이지 않는다", () => {
    const t = tier({ 컨설턴트수수료: 5, _fs_컨설턴트수수료: "t", _fsr_컨설턴트수수료: "날짜 확인 필요" });
    expect(calc(consultant, t, cv)).toMatchObject({ value: null, blocked: { kind: "basis", reason: "날짜 확인 필요" } });
  });
  it("기록이 없는 칸은 지금처럼 계산한다", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000 });
    expect(calc(consultant, t, cv).value).toBe(600_000);
  });
  it("사람이 고친 값(_ovr_)은 기록보다 먼저다", () => {
    const t = tier({ 컨설턴트수수료: 111, _fs_컨설턴트수수료: "t", _ovr_컨설턴트수수료: 9 });
    expect(calc(consultant, t, cv).value).toBe(9);
  });
  it("나머지(위들리) 칸도 같은 기록을 읽는다 — 앱은 저장값, 서버만 다시 계산", () => {
    const t = tier({ 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000, 위들리수수료: 123, _fs_위들리수수료: "t" });
    expect(calc(widly, t, cv).value).toBe(123);
    expect(calc(widly, t, { ...cv, [FEE_LIVE_KEY]: true }).value).toBe(350_000);
  });
  it("나머지(위들리) 칸에 비운 이유가 있으면 값이 남아 있어도 그 이유로 막힌다", () => {
    const t = tier({ 계약금: 2_000_000, 위들리수수료: 5, _fs_위들리수수료: "t", _fsr_위들리수수료: "계약금 확인 필요" });
    expect(calc(widly, t, cv)).toMatchObject({ value: null, blocked: { kind: "basis", reason: "계약금 확인 필요" } });
  });
  it("위들리 자신의 기록이 없으면 저장된 컨설턴트·하이브 값을 이어 받아 나머지를 구한다", () => {
    const t = tier({ 계약금: 2_000_000, 컨설턴트수수료: 111, _fs_컨설턴트수수료: "t", 하이브수수료: 222, _fs_하이브수수료: "t" });
    expect(calc(widly, t, cv).value).toBe(2_000_000 - 111 - 222);
  });
});

describe("저장된 계산 결과 읽기·보존", () => {
  it("parseTiers 가 _fs_* 키를 보존한다", () => {
    const raw = [{ id: "a", label: "1차", 계약금: 5, _fs_컨설턴트수수료: "2026-11-05", _fsr_컨설턴트수수료: "정산 기준 확인 필요", _fsb_컨설턴트수수료: "정부지원금 13번 행" }];
    const [t] = parseTiers(raw, [{ key: "계약금", label: "계약금", type: "number" }]);
    expect(readStoredFeeResult(t, "컨설턴트수수료")).toEqual({ computedAt: "2026-11-05", reason: "정산 기준 확인 필요", basis: "정부지원금 13번 행" });
  });
  it("저장된 것이 없으면 모두 비어 있다", () => {
    expect(readStoredFeeResult(tier({}), "x")).toEqual({});
  });
});

describe("정의 없이 읽어도 계산해 둔 금액이 남는다", () => {
  const cv = { 영업담당: "하이브", DB분류: "기존고객", 사업장지역: "그 외" };
  const base = { 컨설팅담당: "일루아", 착수일: "2026-07-10", 계약금: 2_000_000 };
  it("_fs_ 기록이 있는 칸은 칸 정의가 없어도 금액을 함께 지킨다", () => {
    const raw = [{ id: "a", label: "1차", 컨설턴트수수료: 600_000, _fs_컨설턴트수수료: "2026-11-05", 하이브수수료: "350000", _fs_하이브수수료: "2026-11-05", 위들리수수료: 9, _fsb_위들리수수료: "정부지원금 13번 행" }];
    const [noDefs] = parseTiers(raw, []);
    expect(noDefs.컨설턴트수수료).toBe(600_000);
    expect(noDefs.하이브수수료).toBe(350_000);
    expect(noDefs.위들리수수료).toBeUndefined(); // 계산한 때 기록이 없는 칸은 종전처럼 정의 없이는 옮기지 않는다
    expect(calc(consultant, { ...noDefs, ...base } as TierData, cv).value).toBe(600_000);
  });
  it("투영으로 지워진 금액은 정의가 없어도 빈칸으로 남는다 — 옛 식으로 돌아가지 않는다", () => {
    const [t] = parseTiers([{ id: "a", label: "1차", _fs_컨설턴트수수료: "t" }], []);
    expect(t.컨설턴트수수료).toBeNull();
    expect(calc(consultant, { ...t, ...base } as TierData, cv).value).toBeNull();
    expect(calc(consultant, { ...t, ...base } as TierData, { ...cv, [FEE_LIVE_KEY]: true }).value).toBe(600_000);
  });
  it("_ 로 시작하거나 예약된 칸 이름은 금액을 옮기지 않는다", () => {
    const [t] = parseTiers([{ id: "a", label: "1차", _x: 5, _fs__x: "t", _fs_label: "t", _fs_id: "t" }], []);
    expect(t._x).toBeUndefined();
    expect(t.label).toBe("1차");
    expect(t.id).toBe("a");
  });
  it("기록이 있는 칸의 저장값이 공백 글자면 0원이 아니라 빈칸이다", () => {
    expect(calc(consultant, tier({ ...base, 컨설턴트수수료: " ", _fs_컨설턴트수수료: "t" }), cv).value).toBeNull();
  });
});
