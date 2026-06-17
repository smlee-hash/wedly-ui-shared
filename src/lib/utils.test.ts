import { describe, it, expect } from "vitest";
import { toDateInputValue } from "./utils";

describe("toDateInputValue", () => {
  it("returns empty for null/undefined/empty", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("")).toBe("");
  });
  it("keeps a date-only string", () => {
    expect(toDateInputValue("2026-06-17")).toBe("2026-06-17");
  });
  it("strips the time portion", () => {
    expect(toDateInputValue("2026-06-17T14:30")).toBe("2026-06-17");
    expect(toDateInputValue("2026-06-17T14:30:00.000Z")).toBe("2026-06-17");
  });
});
