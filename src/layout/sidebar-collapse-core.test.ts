import { describe, it, expect } from "vitest";
import { resolveStoredCollapsed } from "./sidebar-collapse-core";

describe("resolveStoredCollapsed", () => {
  it("저장값 없으면 변경 없음(null)", () => {
    expect(resolveStoredCollapsed(null, false)).toBe(null);
    expect(resolveStoredCollapsed(null, true)).toBe(null);
  });
  it("저장값이 현재와 같으면 변경 없음(null)", () => {
    expect(resolveStoredCollapsed("true", true)).toBe(null);
    expect(resolveStoredCollapsed("false", false)).toBe(null);
  });
  it("저장값이 현재와 다르면 그 값으로 복원", () => {
    expect(resolveStoredCollapsed("true", false)).toBe(true);
    expect(resolveStoredCollapsed("false", true)).toBe(false);
  });
});
