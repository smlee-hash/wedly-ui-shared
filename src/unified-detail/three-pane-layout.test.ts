import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  basicPaneClass,
  centerPaneClass,
  narrowPaneTabs,
  sidePaneClass,
  threePaneSlots,
  type PaneName,
} from "./three-pane-layout";

const DIR = dirname(fileURLToPath(import.meta.url));

// 슬롯 미주입(하이브·일루아)은 이 문자열이 한 글자도 바뀌면 안 된다.
const BASIC_WIDE =
  "w-[320px] 2xl:w-[400px] flex-shrink-0 border-r border-wedly-bd/60 overflow-y-auto";
const CENTER_WIDE = "flex-1 min-w-0 flex flex-col";
const SIDE_WIDE =
  "w-[380px] 2xl:w-[520px] flex-shrink-0 border-l border-wedly-bd/60 flex flex-col min-h-0";

const BASIC_NARROW_ON = "flex-1 min-w-0 overflow-y-auto";
const CENTER_NARROW_ON = "flex-1 min-w-0 flex flex-col";
const SIDE_NARROW_ON = "flex-1 min-w-0 flex flex-col min-h-0";

const SIDE_RAIL_CLOSED =
  "w-[44px] flex-shrink-0 border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
const SIDE_RAIL_OPEN =
  "w-[600px] 2xl:w-[760px] min-w-[320px] border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
const CENTER_WIDE_WITH_RAIL = "flex-1 min-w-[380px] 2xl:min-w-[520px] flex flex-col min-h-0";

const PANES: PaneName[] = ["basic", "center", "side"];
const RAIL_WIDTH_CLASSES = ["w-[44px]", "w-[600px]", "2xl:w-[760px]"];

describe("narrowPaneTabs", () => {
  it("레일 없으면 지금 순서 그대로(기본정보 · 업무 현황 · 정보 · 기록)", () => {
    expect(narrowPaneTabs(false)).toEqual([
      ["basic", "기본정보"],
      ["center", "업무 현황"],
      ["side", "정보 · 기록"],
    ]);
  });

  it("레일 있으면 업무 현황을 맨 뒤로 보낸다", () => {
    expect(narrowPaneTabs(true)).toEqual([
      ["basic", "기본정보"],
      ["center", "정보 · 기록"],
      ["side", "업무 현황"],
    ]);
  });
});

describe("레일 없음 — 하이브·일루아 불변", () => {
  it("넓은 화면 세 칸 클래스가 지금 문자열과 정확히 같다", () => {
    expect(basicPaneClass(false, "center")).toBe(BASIC_WIDE);
    expect(centerPaneClass(false, "center", false)).toBe(CENTER_WIDE);
    expect(sidePaneClass(false, "center", { rail: false, railOpen: false })).toBe(SIDE_WIDE);
  });

  it("레일이 없으면 펼침 여부는 오른쪽 칸 클래스에 영향을 주지 않는다", () => {
    expect(sidePaneClass(false, "center", { rail: false, railOpen: true })).toBe(SIDE_WIDE);
    expect(sidePaneClass(false, "basic", { rail: false, railOpen: true })).toBe(SIDE_WIDE);
  });

  it("좁은 화면 켜진 칸/숨긴 칸 클래스가 지금과 같다", () => {
    expect(basicPaneClass(true, "basic")).toBe(BASIC_NARROW_ON);
    expect(basicPaneClass(true, "center")).toBe("hidden");
    expect(basicPaneClass(true, "side")).toBe("hidden");

    expect(centerPaneClass(true, "center", false)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "basic", false)).toBe("hidden");
    expect(centerPaneClass(true, "side", false)).toBe("hidden");

    expect(sidePaneClass(true, "side", { rail: false, railOpen: false })).toBe(SIDE_NARROW_ON);
    expect(sidePaneClass(true, "basic", { rail: false, railOpen: false })).toBe("hidden");
    expect(sidePaneClass(true, "center", { rail: false, railOpen: false })).toBe("hidden");
  });

  it("레일 없을 때 가운데는 min-w-0 이고 min-w-[380px] 2xl:min-w-[520px] 이 없다", () => {
    const cls = centerPaneClass(false, "center", false);
    expect(cls).toBe(CENTER_WIDE);
    expect(cls).toContain("min-w-0");
    expect(cls).not.toContain("min-w-[380px] 2xl:min-w-[520px]");
  });
});

describe("레일 있음 — 오른쪽이 접이식, 가운데가 flex-1", () => {
  it("넓은 화면에서 왼쪽은 지금과 같고 가운데는 360px 하한", () => {
    expect(basicPaneClass(false, "center")).toBe(BASIC_WIDE);
    expect(centerPaneClass(false, "center", true)).toBe(CENTER_WIDE_WITH_RAIL);
    expect(centerPaneClass(false, "center", true)).toContain("flex-1");
    expect(centerPaneClass(false, "center", true)).toContain("min-w-[380px] 2xl:min-w-[520px]");
  });

  it("레일 있을 때 가운데는 min-w-[380px] 2xl:min-w-[520px] 이고 레일 없을 때는 min-w-0", () => {
    expect(centerPaneClass(false, "center", true)).toContain("min-w-[380px] 2xl:min-w-[520px]");
    expect(centerPaneClass(false, "center", true)).not.toContain("min-w-0");
    expect(centerPaneClass(false, "center", false)).toContain("min-w-0");
    expect(centerPaneClass(false, "center", false)).not.toContain("min-w-[380px] 2xl:min-w-[520px]");
  });

  it("접히면 오른쪽이 44px 이고 flex-shrink-0 을 유지한다", () => {
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toBe(SIDE_RAIL_CLOSED);
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toContain("w-[44px]");
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toContain("flex-shrink-0");
  });

  it("펼치면 오른쪽이 600px(2xl 760px) 이고 flex-shrink-0 이 없으며 min-w-[320px] 이 있다", () => {
    const open = sidePaneClass(false, "center", { rail: true, railOpen: true });
    expect(open).toBe(SIDE_RAIL_OPEN);
    expect(open).toContain("w-[600px]");
    expect(open).toContain("2xl:w-[760px]");
    expect(open).toContain("min-w-[320px]");
    expect(open).not.toContain("flex-shrink-0");
  });

  it("접힘과 펼침의 폭 클래스가 실제로 달라진다", () => {
    const closed = sidePaneClass(false, "side", { rail: true, railOpen: false });
    const open = sidePaneClass(false, "side", { rail: true, railOpen: true });
    expect(closed).not.toBe(open);
    expect(closed.includes("w-[44px]")).toBe(true);
    expect(open.includes("w-[44px]")).toBe(false);
    expect(open.includes("w-[600px]")).toBe(true);
    expect(closed.includes("w-[600px]")).toBe(false);
  });
});

describe("threePaneSlots — 배치 규칙", () => {
  it("레일이 있으면 가운데=정보·기록(detail), 오른쪽=업무 현황(track)", () => {
    expect(threePaneSlots(true)).toEqual({ center: "detail", side: "track" });
  });

  it("레일이 없으면 가운데=분야(plain), 오른쪽=정보·기록(detail) — 하이브·일루아", () => {
    expect(threePaneSlots(false)).toEqual({ center: "plain", side: "detail" });
  });

  it("ThreePaneShell 이 이 슬롯 값을 가운데/오른쪽에 그대로 넣는다", () => {
    const src = readFileSync(join(DIR, "ThreePaneShell.tsx"), "utf8");
    expect(src).toContain("threePaneSlots(hasTrackRail)");
    expect(src).toContain('slots.center === "detail" ? detailPane : plainCenterPane');
    expect(src).toContain('slots.side === "track"');
    expect(src).toContain("{railHandle}");
    expect(src).toContain("{trackPane}");
  });

  it("레일 안쪽은 오류가 없고 한 번 보인 뒤에만 붙인다", () => {
    const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
    expect(src).toContain("!error && WideCenterPanel && trackEverShown");
    expect(src).toContain('trackVisible ? "flex-1 min-h-0 overflow-y-auto" : "hidden"');
    expect(src).toContain('if (!narrowSwitch && narrowPane === "side") setTrackRailOpen(true)');
  });

  it("package.json subpath 가 ThreePaneShell 을 가리킨다", () => {
    const pkg = JSON.parse(readFileSync(join(DIR, "../../package.json"), "utf8")) as {
      exports: Record<string, { types?: string; default?: string }>;
    };
    expect(pkg.exports["./unified-detail/three-pane"]).toEqual({
      types: "./src/unified-detail/ThreePaneShell.tsx",
      default: "./src/unified-detail/ThreePaneShell.tsx",
    });
  });
});

describe("좁은 화면 — 레일 폭 클래스를 붙이지 않는다", () => {
  it("레일 여부와 펼침과 관계없이 레일 폭 클래스가 안 붙는다", () => {
    for (const pane of PANES) {
      const variants = [
        sidePaneClass(true, pane, { rail: false, railOpen: false }),
        sidePaneClass(true, pane, { rail: false, railOpen: true }),
        sidePaneClass(true, pane, { rail: true, railOpen: false }),
        sidePaneClass(true, pane, { rail: true, railOpen: true }),
      ];
      for (const cls of variants) {
        for (const width of RAIL_WIDTH_CLASSES) {
          expect(cls).not.toContain(width);
        }
      }
    }
  });

  it("좁은 화면 전환식 클래스는 레일이 있어도 지금과 같다", () => {
    expect(sidePaneClass(true, "side", { rail: true, railOpen: false })).toBe(SIDE_NARROW_ON);
    expect(sidePaneClass(true, "side", { rail: true, railOpen: true })).toBe(SIDE_NARROW_ON);
    expect(sidePaneClass(true, "center", { rail: true, railOpen: false })).toBe("hidden");
    expect(basicPaneClass(true, "basic")).toBe(BASIC_NARROW_ON);
    expect(centerPaneClass(true, "center", true)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "center", false)).toBe(CENTER_NARROW_ON);
  });
});
