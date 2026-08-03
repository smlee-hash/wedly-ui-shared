import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime } from "./utils";

// ★이 시험은 **어느 시간대의 컴퓨터에서 돌려도 같은 결과**여야 한다.
//  종전 구현은 보는 사람 컴퓨터 시간대(getHours)로 그려서, 베트남(+7)에 있는 컴퓨터에서
//  한국시간 18:07 이 16:07 로 보였다(2026-08-03 사장님 실측 — WEDLY ERP 1차 DB 등록일시).
describe("formatDateTime — 항상 한국시간으로 그린다", () => {
  it("세계표준시 값을 한국시간(+9)으로 바꿔 보여준다", () => {
    expect(formatDateTime("2026-08-02T09:07:02.539Z")).toBe("2026.08.02 18:07");
  });

  it("시간대가 붙은 값도 한국시간 기준으로 맞춘다", () => {
    expect(formatDateTime("2025-09-12T10:42:00+09:00")).toBe("2025.09.12 10:42");
    expect(formatDateTime("2025-09-12T01:42:00Z")).toBe("2025.09.12 10:42");
  });

  it("시간대 표시가 없는 값은 적힌 그대로 읽는다(한국시간 표기로 저장된 값)", () => {
    expect(formatDateTime("2026-05-20T14:30")).toBe("2026.05.20 14:30");
    expect(formatDateTime("2026-05-20 14:30")).toBe("2026.05.20 14:30");
  });

  it("날짜만 있으면 자정으로 본다", () => {
    expect(formatDateTime("2026-05-20")).toBe("2026.05.20 00:00");
  });

  it("빈값은 '-', 날짜로 못 읽는 값은 원문 그대로", () => {
    expect(formatDateTime(null)).toBe("-");
    expect(formatDateTime("2026-13-45T99:99:99Z")).toBe("2026-13-45T99:99:99Z");
    expect(formatDateTime("어제")).toBe("어제");
  });
});

describe("formatDate — 한국시간 기준, 자정이면 날짜만", () => {
  it("세계표준시 값을 한국시간으로 바꾼다", () => {
    expect(formatDate("2026-08-02T09:07:02.539Z")).toBe("2026.08.02 18:07");
  });

  it("한국시간으로 날짜가 넘어가는 값도 한국 날짜로 센다", () => {
    // 세계표준시 8/2 15:00 = 한국시간 8/3 00:00 → 자정이라 날짜만
    expect(formatDate("2026-08-02T15:00:00.000Z")).toBe("2026.08.03");
    // 세계표준시 8/2 16:30 = 한국시간 8/3 01:30
    expect(formatDate("2026-08-02T16:30:00.000Z")).toBe("2026.08.03 01:30");
  });

  it("날짜만 있는 값은 날짜만 보여준다", () => {
    expect(formatDate("2026-05-20")).toBe("2026.05.20");
  });

  it("시간대 표시 없는 자정 값은 날짜만(옛 저장 방식 보존)", () => {
    expect(formatDate("2026-05-20T00:00")).toBe("2026.05.20");
  });

  it("시간대 표시 없는 값은 적힌 시각 그대로", () => {
    expect(formatDate("2026-05-20T14:30")).toBe("2026.05.20 14:30");
  });

  it("빈값은 '-', 날짜로 못 읽는 값은 원문 그대로", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("2026-13-45T00:00:00Z")).toBe("2026-13-45T00:00:00Z");
  });
});
