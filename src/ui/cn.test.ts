import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("표 제목 크기와 색상", () => {
  it.each(["text-white", "text-wedly-muted"])("%s 색과 표 제목 크기를 함께 보존한다", (color) => {
    expect(cn("text-wedly-tablehead", color)).toBe(`text-wedly-tablehead ${color}`);
    expect(cn(color, "text-wedly-tablehead")).toBe(`${color} text-wedly-tablehead`);
  });
  it("호출자가 지정한 다른 크기는 기존 표 제목 크기를 대체한다", () => {
    expect(cn("text-wedly-tablehead", "text-wedly-value", "text-white")).toBe("text-wedly-value text-white");
  });
});
