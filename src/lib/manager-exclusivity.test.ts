import { describe, it, expect } from "vitest";
import {
  INQUIRY_MANAGER_KEY,
  CONSOLIDATION_MANAGER_KEY,
  isManagerFilled,
  bothManagersFilled,
  managerLockState,
} from "./manager-exclusivity";

const A = INQUIRY_MANAGER_KEY;      // 조회 담당자
const B = CONSOLIDATION_MANAGER_KEY; // 다지기 담당자

describe("isManagerFilled", () => {
  it("빈값(null/빈문자/공백만)은 false", () => {
    expect(isManagerFilled(null)).toBe(false);
    expect(isManagerFilled(undefined)).toBe(false);
    expect(isManagerFilled("")).toBe(false);
    expect(isManagerFilled("   ")).toBe(false);
  });
  it("이름이 있으면 true(여러 명 포함)", () => {
    expect(isManagerFilled("홍길동")).toBe(true);
    expect(isManagerFilled("홍길동, 김철수")).toBe(true);
  });
});

describe("bothManagersFilled", () => {
  it("둘 다 차 있으면 true", () => {
    expect(bothManagersFilled({ [A]: "홍길동", [B]: "김철수" })).toBe(true);
  });
  it("하나라도 비면 false", () => {
    expect(bothManagersFilled({ [A]: "홍길동", [B]: "" })).toBe(false);
    expect(bothManagersFilled({ [A]: "", [B]: "김철수" })).toBe(false);
    expect(bothManagersFilled({})).toBe(false);
    expect(bothManagersFilled(null)).toBe(false);
  });
});

describe("managerLockState", () => {
  it("둘 다 빈칸 → 잠금 없음", () => {
    expect(managerLockState(A, { [A]: "", [B]: "" }).locked).toBe(false);
    expect(managerLockState(B, { [A]: "", [B]: "" }).locked).toBe(false);
  });
  it("A만 차면 → B 잠금, A는 안 잠김", () => {
    const row = { [A]: "홍길동", [B]: "" };
    expect(managerLockState(A, row).locked).toBe(false);
    expect(managerLockState(B, row).locked).toBe(true);
    expect(managerLockState(B, row).reason).toContain("조회 담당자");
  });
  it("B만 차면 → A 잠금, B는 안 잠김", () => {
    const row = { [A]: "", [B]: "김철수" };
    expect(managerLockState(A, row).locked).toBe(true);
    expect(managerLockState(A, row).reason).toContain("다지기 담당자");
    expect(managerLockState(B, row).locked).toBe(false);
  });
  it("둘 다 차면(예외 데이터) → 둘 다 안 잠김(하나를 지울 수 있어야 함)", () => {
    const row = { [A]: "홍길동", [B]: "김철수" };
    expect(managerLockState(A, row).locked).toBe(false);
    expect(managerLockState(B, row).locked).toBe(false);
  });
  it("대상이 아닌 다른 칸은 항상 잠금 없음", () => {
    expect(managerLockState("custom_other", { [A]: "홍길동", [B]: "김철수" }).locked).toBe(false);
  });
});
