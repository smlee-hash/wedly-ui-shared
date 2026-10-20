import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentedControl } from "./SegmentedControl";

// 2026-10-20 해피콜 시각 검수에서 「내 항목만」 구간 단추에 WEDLY 초점 링 없이
// 브라우저 기본 윤곽만 보인다는 지적이 두 번 나왔다. 키보드로 닿은 구간은 WEDLY 링으로 보이고,
// 링(box-shadow)이 transition 으로 서서히 사라지며 남지 않아야 한다.
function buttonClasses(value: string): string[][] {
  const html = renderToStaticMarkup(
    createElement(SegmentedControl, {
      options: [
        { value: "mine", label: "내 항목만" },
        { value: "all", label: "전체 보기" },
      ],
      value,
      onChange: () => {},
    }),
  );
  return [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
}

describe("SegmentedControl keyboard focus", () => {
  it.each(["mine", "all"])("every segment shows the WEDLY ring when %s is selected", (value) => {
    const buttons = buttonClasses(value);
    expect(buttons).toHaveLength(2);
    for (const cls of buttons) {
      expect(cls).toEqual(
        expect.arrayContaining([
          "focus-visible:outline-none",
          "focus-visible:ring-2",
          "focus-visible:ring-wedly-accent",
          "focus-visible:ring-offset-2",
          "focus-visible:transition-none",
          // 옆 구간(흰 알약)이 링 오른쪽을 덮지 않게 초점 동안 위로 올린다.
          "focus-visible:relative",
          "focus-visible:z-10",
        ]),
      );
      // transition·transition-all 은 box-shadow(링)까지 서서히 바꿔 초점이 빠진 뒤에도 링이 남는다.
      expect(cls).not.toContain("transition");
      expect(cls).not.toContain("transition-all");
      expect(cls.filter((c) => c.startsWith("transition-[") && c.includes("box-shadow"))).toEqual([]);
    }
  });
});
