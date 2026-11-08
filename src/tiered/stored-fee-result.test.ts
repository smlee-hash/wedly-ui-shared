// 저장된 정산 기준표 계산 기록(_fs_·_fsr_·_fsb_) 읽기·보존 — 하이브·일루아 갈래 (settle3 F)
// ERP 서버가 차수에 남긴 계산 기록이 있으면 앱은 다시 계산하지 않고 저장값을 그대로 읽는다.
// 기록이 없는 옛 차수는 지금과 똑같이 계산해야 한다(아래 「기록 없는 옛 차수」의 값은 바꾸기 전 엔진이 낸 값).
import { describe, expect, it } from "vitest";
import {
  evalFormulaForTier,
  parseTiers,
  readStoredFeeResult,
  FEE_LIVE_KEY,
  TIER_FEE_BASIS_PREFIX,
  TIER_FEE_REASON_PREFIX,
  TIER_FEE_STAMP_PREFIX,
  type FieldDef,
  type TierData,
} from "./index";

const col = (key: string, op: "+" | "-" | "*" = "+") => ({ op, unit: "column" as const, columnKey: key });
const pct = (value: number) => ({ op: "*" as const, unit: "percent" as const, value });

// 옛 첫 일치 방식: 담당이 「일루아」면 30%, 아니면(그 외) 10%. 하이브 50%. 위들리 = 계약금 - 컨설턴트 - 하이브.
const consultant: FieldDef = {
  key: "컨설턴트수수료", label: "컨설턴트 수수료", type: "formula",
  formula: [col("계약금"), pct(10)],
  conditional: { rules: [
    { leftKey: "컨설팅담당", right: { kind: "text", value: "일루아" }, formula: [col("계약금"), pct(30)] },
  ] },
};
const hive: FieldDef = { key: "하이브수수료", label: "하이브 수수료", type: "formula", formula: [col("계약금"), pct(50)] };
const widly: FieldDef = {
  key: "위들리수수료", label: "위들리 수수료", type: "formula",
  formula: [col("계약금"), col("컨설턴트수수료", "-"), col("하이브수수료", "-")],
};
const fields: FieldDef[] = [
  { key: "계약금", label: "계약금", type: "number" },
  { key: "컨설팅담당", label: "컨설팅 담당", type: "text" },
  consultant, hive, widly,
];
const tier = (extra: Record<string, unknown>): TierData => ({ id: "t1", label: "1차 정산", ...extra } as TierData);
const calc = (f: FieldDef, t: TierData, cv?: Record<string, unknown>) => evalFormulaForTier(f, t, fields, undefined, cv);

describe("저장된 계산 기록 우선", () => {
  it("기록이 있으면 앱은 저장값을 그대로 읽고, 서버(FEE_LIVE_KEY)만 다시 계산한다", () => {
    const t = tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 컨설턴트수수료: 111, _fs_컨설턴트수수료: "2026-11-05T00:00:00Z" });
    expect(calc(consultant, t)).toBe(111);
    expect(calc(consultant, t, { [FEE_LIVE_KEY]: true })).toBe(600_000);
  });
  it("기록에 비운 이유가 있으면 값이 남아 있어도 값 없음(null)", () => {
    const t = tier({ 계약금: 2_000_000, 컨설턴트수수료: 5, _fs_컨설턴트수수료: "t", _fsr_컨설턴트수수료: "날짜 확인 필요" });
    expect(calc(consultant, t)).toBeNull();
  });
  it("기록은 있는데 저장값이 비었거나 숫자가 아니면 값 없음 — 옛 식으로 대신 계산하지 않는다", () => {
    expect(calc(consultant, tier({ 계약금: 2_000_000, 컨설턴트수수료: null, _fs_컨설턴트수수료: "t" }))).toBeNull();
    expect(calc(consultant, tier({ 계약금: 2_000_000, 컨설턴트수수료: "abc", _fs_컨설턴트수수료: "t" }))).toBeNull();
  });
  it("기록이 0원이면 0원 그대로", () => {
    expect(calc(consultant, tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 컨설턴트수수료: 0, _fs_컨설턴트수수료: "t" }))).toBe(0);
  });
  it("사람이 고친 값(_ovr_)은 기록보다 먼저다", () => {
    const t = tier({ 계약금: 2_000_000, 컨설턴트수수료: 111, _fs_컨설턴트수수료: "t", _fsr_컨설턴트수수료: "조건 중복 - 확인 필요", _ovr_컨설턴트수수료: 9 });
    expect(calc(consultant, t)).toBe(9);
  });
  it("관리값(_cf_)도 기록보다 먼저다", () => {
    const t = tier({ 계약금: 2_000_000, 컨설턴트수수료: 37, _cf_컨설턴트수수료: "rev-1", _fs_컨설턴트수수료: "t", _fsr_컨설턴트수수료: "날짜 확인 필요" });
    expect(calc(consultant, t)).toBe(37);
  });
  it("이 칸을 식에서 이어 받는 칸도 저장값을 쓴다(위들리 = 계약금 - 저장된 컨설턴트 - 저장된 하이브)", () => {
    const t = tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 컨설턴트수수료: 111, _fs_컨설턴트수수료: "t", 하이브수수료: 222, _fs_하이브수수료: "t" });
    expect(calc(widly, t)).toBe(2_000_000 - 111 - 222);
  });
  it("이어 받는 칸 자신의 기록이 있으면 그 기록이 먼저 — 이유가 있으면 값 없음", () => {
    const t = tier({ 계약금: 2_000_000, 위들리수수료: 123, _fs_위들리수수료: "t" });
    expect(calc(widly, t)).toBe(123);
    expect(calc(widly, tier({ 계약금: 2_000_000, 위들리수수료: 5, _fs_위들리수수료: "t", _fsr_위들리수수료: "계약금 확인 필요" }))).toBeNull();
    expect(calc(widly, tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 위들리수수료: 123, _fs_위들리수수료: "t" }), { [FEE_LIVE_KEY]: true })).toBe(400_000);
  });
  it("조건 판정이 수식 칸을 읽을 때도 저장값을 쓴다", () => {
    const gate: FieldDef = {
      key: "구간", label: "구간", type: "formula", formula: [{ op: "+", unit: "number", value: 1 }],
      conditional: { rules: [
        { leftKey: "컨설턴트수수료", right: { kind: "text", value: "111" }, formula: [{ op: "+", unit: "number", value: 2 }] },
      ] },
    };
    const fs2 = [...fields, gate];
    const t = tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 컨설턴트수수료: 111, _fs_컨설턴트수수료: "t" });
    expect(evalFormulaForTier(gate, t, fs2)).toBe(2);
    expect(evalFormulaForTier(gate, t, fs2, undefined, { [FEE_LIVE_KEY]: true })).toBe(1);
  });
});

describe("기록 없는 옛 차수 — 바꾸기 전과 같은 값", () => {
  // 아래 기대값은 바꾸기 전 엔진(하이브 12da79f · 일루아 a317486)이 같은 입력에 낸 값이다.
  const cases: Array<{ name: string; t: TierData; want: Record<string, number | null> }> = [
    { name: "담당 일루아(첫 일치)", t: tier({ 계약금: 2_000_000, 컨설팅담당: "일루아", 컨설턴트수수료: 111 }), want: { 컨설턴트수수료: 600_000, 하이브수수료: 1_000_000, 위들리수수료: 400_000 } },
    { name: "담당 다른 사람(그 외 식)", t: tier({ 계약금: 1_000_000, 컨설팅담당: "서월" }), want: { 컨설턴트수수료: 100_000, 하이브수수료: 500_000, 위들리수수료: 400_000 } },
    { name: "계약금 빈칸", t: tier({ 계약금: null, 컨설팅담당: "일루아" }), want: { 컨설턴트수수료: null, 하이브수수료: null, 위들리수수료: null } },
    { name: "비운 이유만 있고 계산한 때가 없음(기록 아님)", t: tier({ 계약금: 1_000_000, _fsr_컨설턴트수수료: "날짜 확인 필요", _fsb_컨설턴트수수료: "정부지원금 13번 행" }), want: { 컨설턴트수수료: 100_000, 하이브수수료: 500_000, 위들리수수료: 400_000 } },
    { name: "수동값", t: tier({ 계약금: 1_000_000, _ovr_컨설턴트수수료: 7 }), want: { 컨설턴트수수료: 7, 하이브수수료: 500_000, 위들리수수료: 499_993 } },
  ];
  for (const c of cases) {
    it(c.name, () => {
      for (const f of [consultant, hive, widly]) expect(calc(f, c.t), f.key).toBe(c.want[f.key]);
    });
  }
});

describe("parseTiers 가 계산 기록을 지킨다", () => {
  it("_fs_·_fsr_·_fsb_ 글자 값을 칸 정의가 없어도 보존한다", () => {
    const raw = [{ id: "a", label: "1차", 계약금: 5, 컨설턴트수수료: 600_000, _fs_컨설턴트수수료: "2026-11-05", _fsr_하이브수수료: "정산 기준 확인 필요", _fs_하이브수수료: "2026-11-05", _fsb_컨설턴트수수료: "정부지원금 13번 행" }];
    const [noDefs] = parseTiers(raw, []);
    expect(noDefs._fs_컨설턴트수수료).toBe("2026-11-05");
    expect(noDefs._fsr_하이브수수료).toBe("정산 기준 확인 필요");
    expect(noDefs._fsb_컨설턴트수수료).toBe("정부지원금 13번 행");
    const [withDefs] = parseTiers(JSON.stringify(raw), fields);
    expect(readStoredFeeResult(withDefs, "컨설턴트수수료")).toEqual({ computedAt: "2026-11-05", basis: "정부지원금 13번 행" });
    expect(readStoredFeeResult(withDefs, "하이브수수료")).toEqual({ computedAt: "2026-11-05", reason: "정산 기준 확인 필요" });
    expect(withDefs.컨설턴트수수료).toBe(600_000);
  });
  it("빈 글자·숫자·객체는 기록으로 보지 않는다", () => {
    const [t] = parseTiers([{ id: "a", label: "1차", _fs_x: "", _fsr_x: 3, _fsb_x: { a: 1 } }], []);
    expect(Object.keys(t).filter((k) => k.startsWith("_fs"))).toEqual([]);
  });
  it("저장된 것이 없으면 빈 객체", () => {
    expect(readStoredFeeResult(tier({}), "x")).toEqual({});
  });
  it("접두사 상수는 ERP 갈래와 같다", () => {
    expect([TIER_FEE_STAMP_PREFIX, TIER_FEE_REASON_PREFIX, TIER_FEE_BASIS_PREFIX, FEE_LIVE_KEY]).toEqual(["_fs_", "_fsr_", "_fsb_", "__fsLive"]);
  });
});

describe("정의 없이 읽어도 계산해 둔 금액이 남는다", () => {
  it("_fs_ 기록이 있는 칸은 칸 정의가 없어도 금액을 함께 지킨다", () => {
    const raw = [{ id: "a", label: "1차", 컨설턴트수수료: 600_000, _fs_컨설턴트수수료: "2026-11-05", 하이브수수료: "350000", _fs_하이브수수료: "2026-11-05", 위들리수수료: 9, _fsb_위들리수수료: "정부지원금 13번 행" }];
    const [noDefs] = parseTiers(raw, []);
    expect(noDefs.컨설턴트수수료).toBe(600_000);
    expect(noDefs.하이브수수료).toBe(350_000);
    expect(noDefs.위들리수수료).toBeUndefined(); // 계산한 때 기록이 없는 칸은 종전처럼 정의 없이는 옮기지 않는다
    expect(calc(consultant, noDefs)).toBe(600_000);
  });
  it("투영으로 지워진 금액은 정의가 없어도 빈칸으로 남는다 — 옛 식으로 돌아가지 않는다", () => {
    const [t] = parseTiers([{ id: "a", label: "1차", _fs_컨설턴트수수료: "t" }], []);
    expect(t.컨설턴트수수료).toBeNull();
    expect(calc(consultant, { ...t, 계약금: 1_000_000 } as TierData)).toBeNull();
  });
  it("_ 로 시작하거나 예약된 칸 이름은 금액을 옮기지 않는다", () => {
    const [t] = parseTiers([{ id: "a", label: "1차", _x: 5, _fs__x: "t", _fs_label: "t", _fs_id: "t" }], []);
    expect(t._x).toBeUndefined();
    expect(t.label).toBe("1차");
    expect(t.id).toBe("a");
  });
  it("기록이 있는 칸의 저장값이 공백 글자면 0원이 아니라 빈칸이다", () => {
    expect(calc(consultant, tier({ 계약금: 1_000_000, 컨설턴트수수료: " ", _fs_컨설턴트수수료: "t" }))).toBeNull();
  });
});
