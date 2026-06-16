import { describe, it, expect } from "vitest";
import { formatPercent } from "./utils";

describe("formatPercent", () => {
  it("정수는 값 뒤에 % (5 → '5%')", () => {
    expect(formatPercent(5)).toBe("5%");
  });
  it("소수점 유지 (1.65 → '1.65%')", () => {
    expect(formatPercent(1.65)).toBe("1.65%");
  });
  it("0과 음수 (0 → '0%', -3.5 → '-3.5%')", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(-3.5)).toBe("-3.5%");
  });
  it("숫자 문자열도 처리 ('12' → '12%')", () => {
    expect(formatPercent("12")).toBe("12%");
  });
  it("빈값/null은 '-'", () => {
    expect(formatPercent(null)).toBe("-");
    expect(formatPercent(undefined)).toBe("-");
    expect(formatPercent("")).toBe("-");
  });
  it("숫자가 아니면 원문 유지 ('abc' → 'abc')", () => {
    expect(formatPercent("abc")).toBe("abc");
  });
});
