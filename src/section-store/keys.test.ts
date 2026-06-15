import { describe, it, expect } from "vitest";
import { secstoreKey, normalizeBizno, isValidSection, isValidKind, isValidBizno } from "./keys";

describe("section-store keys (3앱 공통 약속)", () => {
  it("키 포맷", () =>
    expect(secstoreKey("123", "government-subsidy", "history")).toBe(
      "secstore:123:government-subsidy:history",
    ));
  it("사업자번호 숫자만 추출", () => {
    expect(normalizeBizno("12-345-67")).toBe("1234567");
    expect(normalizeBizno(null)).toBe("");
  });
  it("사업자번호 검증", () => {
    expect(isValidBizno("1234567890")).toBe(true);
    expect(isValidBizno("12-34")).toBe(false);
  });
  it("분야는 슬러그만 허용(한글 거부 → 유령 키 차단)", () => {
    expect(isValidSection("government-subsidy")).toBe(true);
    expect(isValidSection("labor-subsidy")).toBe(true);
    expect(isValidSection("정부지원금")).toBe(false);
    expect(isValidSection("a".repeat(65))).toBe(false);
  });
  it("종류 검증", () => {
    expect(isValidKind("history")).toBe(true);
    expect(isValidKind("settlement")).toBe(true);
    expect(isValidKind("bad")).toBe(false);
  });
});
