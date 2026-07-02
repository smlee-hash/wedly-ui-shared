import { describe, it, expect } from "vitest";
import {
  parseISODate, toISO, addDays, addMonths, mondayOf,
  parseDateFormula, evalDateFormulaForTier,
} from "./date-formula";
import type { FieldDef, TierData } from "./index";

describe("date-formula 산술 헬퍼", () => {
  it("parseISODate: 유효/무효", () => {
    expect(parseISODate("2026-06-22")).toEqual({ y: 2026, m: 6, d: 22 });
    expect(parseISODate("2026-06-22T10:00")).toEqual({ y: 2026, m: 6, d: 22 });
    expect(parseISODate("2026-13-01")).toBeNull();
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("")).toBeNull();
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(20260622)).toBeNull();
  });
  it("addDays: 월·연 넘김", () => {
    expect(toISO(addDays(2026, 6, 22, 30))).toBe("2026-07-22");
    expect(toISO(addDays(2026, 12, 25, 10))).toBe("2027-01-04");
    expect(toISO(addDays(2026, 6, 22, -30))).toBe("2026-05-23");
  });
  it("addMonths: 월말 보정·윤년", () => {
    expect(toISO(addMonths(2026, 1, 31, 1))).toBe("2026-02-28"); // 평년 클램프
    expect(toISO(addMonths(2024, 1, 31, 1))).toBe("2024-02-29"); // 윤년 클램프
    expect(toISO(addMonths(2026, 6, 22, 3))).toBe("2026-09-22");
    expect(toISO(addMonths(2026, 1, 15, -2))).toBe("2025-11-15");
  });
  it("mondayOf: 그 주 월요일", () => {
    expect(toISO(mondayOf(2026, 6, 22))).toBe("2026-06-22"); // 월요일
    expect(toISO(mondayOf(2026, 6, 24))).toBe("2026-06-22"); // 수요일
    expect(toISO(mondayOf(2026, 6, 28))).toBe("2026-06-22"); // 일요일도 같은 주
  });
});

describe("parseDateFormula 안전 파싱", () => {
  it("offset 모드", () => {
    expect(parseDateFormula({ mode: "offset", baseKey: "계약일", offsets: [{ amount: 30, unit: "day" }] }))
      .toEqual({ mode: "offset", baseKey: "계약일", offsets: [{ amount: 30, unit: "day" }] });
  });
  it("weekday 모드", () => {
    expect(parseDateFormula({ mode: "weekday", baseKey: "착수일", weeksAhead: 1, weekday: 5 }))
      .toEqual({ mode: "weekday", baseKey: "착수일", weeksAhead: 1, weekday: 5 });
  });
  it("baseKey 없으면 undefined", () => {
    expect(parseDateFormula({ mode: "offset", offsets: [] })).toBeUndefined();
    expect(parseDateFormula(null)).toBeUndefined();
  });
  it("이상값 보정: 잘못된 unit→day, 요일 범위 밖→금(5), offsets 비배열→[]", () => {
    expect(parseDateFormula({ mode: "offset", baseKey: "d", offsets: [{ amount: 2, unit: "xx" }] }))
      .toEqual({ mode: "offset", baseKey: "d", offsets: [{ amount: 2, unit: "day" }] });
    expect(parseDateFormula({ mode: "weekday", baseKey: "d", weeksAhead: 2, weekday: 9 }))
      .toEqual({ mode: "weekday", baseKey: "d", weeksAhead: 2, weekday: 5 });
    expect(parseDateFormula({ mode: "offset", baseKey: "d", offsets: "nope" }))
      .toEqual({ mode: "offset", baseKey: "d", offsets: [] });
  });
});

const dateCol = (key: string): FieldDef => ({ key, label: key, type: "date" });
const dfCol = (key: string, spec: unknown): FieldDef =>
  ({ key, label: key, type: "formula", formulaResult: "date", dateFormula: spec as never });

describe("evalDateFormulaForTier", () => {
  it("offset: 계약일 + 30일", () => {
    const f = dfCol("만기", { mode: "offset", baseKey: "계약일", offsets: [{ amount: 30, unit: "day" }] });
    const fields = [dateCol("계약일"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "계약일": "2026-06-22" } as TierData, fields)).toBe("2026-07-22");
  });
  it("offset: 여러 항(+2주 +1개월)", () => {
    const f = dfCol("x", { mode: "offset", baseKey: "착수일", offsets: [{ amount: 2, unit: "week" }, { amount: 1, unit: "month" }] });
    const fields = [dateCol("착수일"), f];
    // 2026-01-31 +2주 = 2026-02-14, +1개월 = 2026-03-14
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "착수일": "2026-01-31" } as TierData, fields)).toBe("2026-03-14");
  });
  it("weekday: 착수일(월) 기준 다음 주 금요일", () => {
    const f = dfCol("금", { mode: "weekday", baseKey: "착수일", weeksAhead: 1, weekday: 5 });
    const fields = [dateCol("착수일"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "착수일": "2026-06-22" } as TierData, fields)).toBe("2026-07-03");
  });
  it("weekday: 토요일 기준 다음 주 금요일도 같은 주 다음(2026-07-03)", () => {
    const f = dfCol("금", { mode: "weekday", baseKey: "d", weeksAhead: 1, weekday: 5 });
    const fields = [dateCol("d"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "d": "2026-06-27" } as TierData, fields)).toBe("2026-07-03");
  });
  it("weekday: 이번 주(0) 월요일(1)", () => {
    const f = dfCol("월", { mode: "weekday", baseKey: "d", weeksAhead: 0, weekday: 1 });
    const fields = [dateCol("d"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "d": "2026-06-24" } as TierData, fields)).toBe("2026-06-22");
  });
  it("weekday: 이번 주 일요일(0)", () => {
    const f = dfCol("일", { mode: "weekday", baseKey: "d", weeksAhead: 0, weekday: 0 });
    const fields = [dateCol("d"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "d": "2026-06-22" } as TierData, fields)).toBe("2026-06-28");
  });
  it("기준 비었으면 null / 기본정보(conditionValues) 날짜도 기준 가능", () => {
    const f = dfCol("x", { mode: "offset", baseKey: "계약일", offsets: [{ amount: 1, unit: "day" }] });
    const fields = [dateCol("계약일"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차" } as TierData, fields)).toBeNull();
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차" } as TierData, fields, new Set(), { "계약일": "2026-06-22" })).toBe("2026-06-23");
  });
  it("기준이 다른 날짜 수식 칸이면 연쇄 / 순환은 null", () => {
    const a = dfCol("a", { mode: "offset", baseKey: "계약일", offsets: [{ amount: 1, unit: "day" }] });
    const b = dfCol("b", { mode: "offset", baseKey: "a", offsets: [{ amount: 1, unit: "day" }] });
    const fields = [dateCol("계약일"), a, b];
    expect(evalDateFormulaForTier(b, { id: "t", label: "1차", "계약일": "2026-06-22" } as TierData, fields)).toBe("2026-06-24");
    const c = dfCol("c", { mode: "offset", baseKey: "c", offsets: [{ amount: 1, unit: "day" }] });
    expect(evalDateFormulaForTier(c, { id: "t", label: "1차" } as TierData, [c])).toBeNull();
  });
  it("잘못된 날짜 기준이면 null", () => {
    const f = dfCol("x", { mode: "offset", baseKey: "d", offsets: [{ amount: 1, unit: "day" }] });
    const fields = [dateCol("d"), f];
    expect(evalDateFormulaForTier(f, { id: "t", label: "1차", "d": "오늘" } as TierData, fields)).toBeNull();
  });
});
