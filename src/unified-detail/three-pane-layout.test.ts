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
  "flex-1 min-w-[380px] border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
const CENTER_WIDE_RAIL_OPEN = "w-[380px] 2xl:w-[520px] min-w-[260px] flex flex-col min-h-0";
const CENTER_WIDE_RAIL_CLOSED = "flex-1 min-w-0 flex flex-col min-h-0";

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
    expect(centerPaneClass(false, "center", false, false)).toBe(CENTER_WIDE);
    expect(centerPaneClass(false, "center", false, true)).toBe(CENTER_WIDE);
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

    expect(centerPaneClass(true, "center", false, false)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "basic", false, false)).toBe("hidden");
    expect(centerPaneClass(true, "side", false, false)).toBe("hidden");

    expect(sidePaneClass(true, "side", { rail: false, railOpen: false })).toBe(SIDE_NARROW_ON);
    expect(sidePaneClass(true, "basic", { rail: false, railOpen: false })).toBe("hidden");
    expect(sidePaneClass(true, "center", { rail: false, railOpen: false })).toBe("hidden");
  });

  it("레일 없을 때 가운데는 min-w-0 이고 min-w-[380px] 2xl:min-w-[520px] 이 없다", () => {
    const cls = centerPaneClass(false, "center", false, false);
    expect(cls).toBe(CENTER_WIDE);
    expect(cls).toContain("min-w-0");
    expect(cls).not.toContain("min-w-[380px] 2xl:min-w-[520px]");
  });

  it("세 인자로만 부르면 레일 없음 경로와 같은 문자열을 돌려준다", () => {
    expect(centerPaneClass(false, "center", false)).toBe(CENTER_WIDE);
    expect(centerPaneClass(false, "center", false)).toBe(
      centerPaneClass(false, "center", false, false),
    );
    expect(centerPaneClass(true, "center", false)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "basic", false)).toBe("hidden");
    expect(centerPaneClass(true, "side", false)).toBe("hidden");
  });
});

describe("레일 있음 — 펼치면 업무 현황이 남는 자리를 전부 가져간다", () => {
  it("펼침일 때 가운데는 옛 오른쪽 칸 폭으로 고정이고 flex-1 이 아니다", () => {
    const center = centerPaneClass(false, "center", true, true);
    expect(center).toBe(CENTER_WIDE_RAIL_OPEN);
    expect(center).toContain("w-[380px] 2xl:w-[520px]");
    expect(center).not.toContain("flex-1");
  });

  it("펼침일 때 레일은 flex-1 이고 min-w-[380px] 이며 w-[600px] 이 없다", () => {
    const open = sidePaneClass(false, "center", { rail: true, railOpen: true });
    expect(open).toBe(SIDE_RAIL_OPEN);
    expect(open).toContain("flex-1");
    expect(open).toContain("min-w-[380px]");
    expect(open).not.toContain("min-w-[420px]");
    expect(open).not.toContain("w-[600px]");
    expect(open).not.toContain("2xl:w-[760px]");
    expect(open).not.toContain("flex-shrink-0");
  });

  it("펼침 최소폭 합은 1024px 모달(96vw=983)보다 작다", () => {
    const center = centerPaneClass(false, "center", true, true);
    const side = sidePaneClass(false, "center", { rail: true, railOpen: true });
    expect(center).toContain("min-w-[260px]");
    expect(center).not.toContain("min-w-[320px]");
    expect(side).toContain("min-w-[380px]");
    expect(side).not.toContain("min-w-[420px]");
    // 좌 320 + 가운데 260 + 레일 380 = 960 ≤ 983
    expect(320 + 260 + 380).toBeLessThanOrEqual(Math.round(1024 * 0.96));
  });

  it("접힘일 때는 가운데가 flex-1 min-w-0 이다", () => {
    const center = centerPaneClass(false, "center", true, false);
    expect(center).toBe(CENTER_WIDE_RAIL_CLOSED);
    expect(center).toContain("flex-1");
    expect(center).toContain("min-w-0");
  });

  it("넓은 화면에서 왼쪽은 레일 없음과 같고, 접힘 레일은 44px 이다", () => {
    expect(basicPaneClass(false, "center")).toBe(BASIC_WIDE);
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toBe(SIDE_RAIL_CLOSED);
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toContain("w-[44px]");
    expect(sidePaneClass(false, "center", { rail: true, railOpen: false })).toContain("flex-shrink-0");
  });

  it("레일 없을 때 가운데는 접힘/펼침과 무관하게 min-w-0 이고 고정폭이 없다", () => {
    expect(centerPaneClass(false, "center", false, false)).toContain("min-w-0");
    expect(centerPaneClass(false, "center", false, true)).toBe(CENTER_WIDE);
    expect(centerPaneClass(false, "center", false, false)).not.toContain("w-[380px] 2xl:w-[520px]");
    expect(centerPaneClass(false, "center", false, true)).not.toContain("min-w-[380px] 2xl:min-w-[520px]");
  });

  it("접힘과 펼침의 폭 클래스가 실제로 달라진다", () => {
    const closed = sidePaneClass(false, "side", { rail: true, railOpen: false });
    const open = sidePaneClass(false, "side", { rail: true, railOpen: true });
    expect(closed).not.toBe(open);
    expect(closed.includes("w-[44px]")).toBe(true);
    expect(open.includes("w-[44px]")).toBe(false);
    expect(open.includes("flex-1")).toBe(true);
    expect(closed.includes("flex-1")).toBe(false);
    expect(open.includes("w-[600px]")).toBe(false);
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
    expect(src).toContain("centerPaneClass(narrowSwitch, narrowPane, hasTrackRail, railOpen)");
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
    expect(centerPaneClass(true, "center", true, true)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "center", true, false)).toBe(CENTER_NARROW_ON);
    expect(centerPaneClass(true, "center", false, false)).toBe(CENTER_NARROW_ON);
  });
});

describe("접이식 손잡이 — 화살표 방향과 접힘 시인성", () => {
  const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
  const handleStart = src.indexOf("aria-expanded={trackRailOpen}");
  const handleEnd = src.indexOf("</button>", handleStart);
  const handle = src.slice(handleStart, handleEnd);

  it("펼침이면 < (M10), 접힘이면 > (M6) 이다", () => {
    expect(handle).toMatch(
      /trackRailOpen \?[\s\S]*?d="M10 4l-4 4 4 4"[\s\S]*?:[\s\S]*?d="M6 4l4 4-4 4"/,
    );
  });

  it("접힌 손잡이는 WEDLY 파란 바탕·잉크색이고 화살표가 더 굵다", () => {
    expect(handle).toContain("bg-wedly-bg-blue");
    expect(handle).toContain("text-wedly-accent-ink");
    expect(handle).toContain("hover:bg-wedly-bg-blue/70");
    expect(handle).toContain('width={trackRailOpen ? "16" : "18"}');
    expect(handle).toContain('strokeWidth="2"');
    expect(handle).not.toContain("bg-wedly-bg-gray/50");
    expect(handle).not.toMatch(/bg-blue-\d/);
    expect(handle).toContain("font-semibold");
    expect(handle).toContain("업무 현황");
  });

  it("펼친 가로 손잡이 줄은 회색 그대로이고 화살표만 반대다", () => {
    expect(handle).toContain(
      "flex-shrink-0 flex items-center gap-1 h-10 px-2 border-b border-wedly-bd/60 text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1 transition-colors",
    );
    expect(handle).toContain('strokeWidth="1.5"');
  });

  it("손잡이 클릭에서 펼침과 한 번 보임을 같은 렌더에서 같이 켠다", () => {
    expect(src).toContain(
      "onClick={() => { setTrackRailOpen((v) => !v); setTrackEverShown(true); }}",
    );
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
  });
});
