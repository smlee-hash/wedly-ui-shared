import { describe, it, expect } from "vitest";
import { commitWhileTyping, clampNumberInput } from "./number-input-core";

/**
 * ★독립 화면 검사 2026-09-05(높음) — 친 값을 **칸을 떠날 때만** 넘겨서,
 *  ERP 설정 화면에서 20 을 지우고 25 를 친 뒤 곧장 「설정 저장」을 누르면
 *  **옛 값이 저장되고 칸에는 25 가 남았다**(칸 표시 ≠ 저장값). 늘리기 단추는 즉시 반영됐다.
 *  그래서 타자 중에도 「지금 바로 넘길 수 있는 값」이면 그 자리에서 넘긴다.
 */
describe("commitWhileTyping — 타자 중 바로 넘길 값인가", () => {
  const MIN = 1, MAX = 500;

  it("범위 안 숫자는 바로 넘긴다 — 저장을 곧장 눌러도 친 값이 저장된다", () => {
    expect(commitWhileTyping("25", MIN, MAX)).toBe(25);
    expect(commitWhileTyping("1", MIN, MAX)).toBe(1);      // 경계
    expect(commitWhileTyping("500", MIN, MAX)).toBe(500);  // 경계
  });

  it("범위 밖 값은 타자 중엔 안 넘긴다 — 「25」를 치려고 2 를 친 순간 잘리면 안 된다", () => {
    expect(commitWhileTyping("999", MIN, MAX)).toBeNull();
    expect(commitWhileTyping("0", MIN, MAX)).toBeNull();
    expect(commitWhileTyping("-3", MIN, MAX)).toBeNull();
  });

  it("빈 값·부호만·숫자가 아닌 값은 안 넘긴다 — 지우는 중일 뿐이다", () => {
    for (const raw of ["", "   ", "-", "+", ".", "e", "abc"]) {
      expect(commitWhileTyping(raw, MIN, MAX), raw).toBeNull();
    }
  });

  it("소수점 자리는 반올림해 넘긴다(단추와 같은 규칙)", () => {
    expect(commitWhileTyping("2.5", MIN, MAX)).toBe(2.5);
    expect(commitWhileTyping("2.00000009", MIN, MAX)).toBe(2);
  });

  it("범위를 안 준 칸은 숫자면 그대로 넘긴다", () => {
    expect(commitWhileTyping("-42", -Infinity, Infinity)).toBe(-42);
  });
});

describe("clampNumberInput — 칸을 떠날 때·단추가 쓰는 자르기(종전 그대로)", () => {
  const MIN = 1, MAX = 500;

  it("범위 밖은 잘라서 넘긴다 — 999 를 치고 칸을 떠나면 500", () => {
    expect(clampNumberInput(999, MIN, MAX)).toBe(500);
    expect(clampNumberInput(0, MIN, MAX)).toBe(1);
  });

  it("숫자가 아니면 0 을 범위로 잘라 넘긴다 — 빈 칸으로 두고 떠났을 때", () => {
    expect(clampNumberInput(NaN, MIN, MAX)).toBe(1);
    expect(clampNumberInput(NaN, -10, 10)).toBe(0);
  });

  it("늘리기 단추는 종전대로 — 20 에서 한 칸 올리면 21", () => {
    expect(clampNumberInput(20 + 1, MIN, MAX)).toBe(21);
    expect(clampNumberInput(20 - 1, MIN, MAX)).toBe(19);
  });
});
