import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  basicPaneClass,
  centerPaneClass,
  modalBoxClass,
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
  "relative flex-1 min-w-[380px] border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
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

  it("mergeBasic 이면 왼쪽 칸에 basicPane 을 안 넣고, 없으면 넣는다", () => {
    const src = readFileSync(join(DIR, "ThreePaneShell.tsx"), "utf8");
    // 이 보관함 시험은 JSX 렌더 없이 소스를 대조한다(react-dom 미설치).
    // 좁은 화면(포커스 모드)에서는 합치기를 무시해야 「기본정보」 전환 단추가 빈 칸을 보이지 않는다(코덱스 2026-09-02).
    expect(src).toContain("const merge = mergeBasic && !narrowSwitch;");
    expect(src).toContain("{merge ? null : basicPane}");
    expect(src).toContain("basicPaneClass(narrowSwitch, narrowPane, merge)");
    expect(src).toContain("centerPaneClass(narrowSwitch, narrowPane, hasTrackRail, railOpen, merge)");
    expect(src).toContain("{ rail: hasTrackRail, railOpen, mergeBasic: merge }");
    expect(src).toContain("mergeBasic = false");
    expect(src).toMatch(/<aside className=\{basicPaneClass\([^)]*merge\)\}>\{merge \? null : basicPane\}<\/aside>/);
  });

  it("레일 안쪽은 오류가 없고 한 번 보인 뒤에만 붙인다", () => {
    const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
    expect(src).toContain("!error && WideCenterPanel && trackEverShown");
    expect(src).toContain('trackVisible ? (mergeBasic ? "flex-1 min-w-0 min-h-0 overflow-y-auto" : "flex-1 min-h-0 overflow-y-auto") : "hidden"');
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
  const collapsedStart = src.indexOf('<span className="sr-only">펼치기</span>');
  const collapsedEnd = src.indexOf("</button>", collapsedStart);
  const collapsed = collapsedStart >= 0 ? src.slice(collapsedStart, collapsedEnd) : "";

  it("펼침이면 ‹ (M10) 이고, 접힘 탭은 › (M6) 이다 — 사장님 2026-09-02", () => {
    expect(handle).toContain('d="M10 4l-4 4 4 4"');
    expect(collapsed).toContain('d="M6 4l4 4-4 4"');
    expect(collapsed).not.toContain('d="M10 4l-4 4 4 4"');
  });

  it("접힌 손잡이는 흰 띠 안에 진한 파랑 세로 탭이다", () => {
    expect(src).toContain("flex-1 w-full flex flex-col items-center bg-white pt-3 focus:outline-none group");
    expect(collapsed).toContain("bg-wedly-accent");
    expect(collapsed).toContain("group-hover:bg-wedly-accent-ink");
    expect(collapsed).toContain("group-hover:-translate-x-[3px]");
    expect(collapsed).toContain("group-focus-visible:ring-[3px]");
    expect(collapsed).toContain("group-focus-visible:ring-wedly-accent/40");
    expect(collapsed).toContain("motion-safe:animate-[wedly-nudge_1.2s_ease-in-out_3]");
    expect(collapsed).toContain('strokeWidth="2"');
    expect(collapsed).toContain("컨설팅 업무 현황");
    // 「눌러서 펼치기」 안내 글자는 사장님 지시로 뺐다(2026-09-02). 접힘 화살표는 오른쪽(›).
    expect(src).not.toContain("눌러서 펼치기");
    expect(collapsed).toContain('d="M6 4l4 4-4 4"');
    expect(src).not.toMatch(/bg-blue-\d/);
    // 옛 접힘 바탕(옅은 파란 띠 단추 하나)은 접힘 갈래에서 빠진다.
    expect(src).not.toContain(
      "flex-1 w-full flex flex-col items-center justify-center gap-2 py-3 bg-wedly-bg-blue text-wedly-accent-ink hover:bg-wedly-bg-blue/70 transition-colors",
    );
    const css = readFileSync(join(DIR, "../styles.css"), "utf8");
    expect(css).toContain("/* 접힌 「컨설팅 업무 현황」 손잡이가 처음 세 번 살짝 흔들려 「눌러서 펼친다」를 알린다(2026-09-02) */");
    expect(css).toContain("@keyframes wedly-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-3px); } }");
  });

  it("펼친 손잡이는 오른쪽 가장자리 세로 파란 탭이다(접힌 손잡이와 같은 모양, ‹ + 접기)", () => {
    expect(handle).toContain(
      "order-last w-11 flex-shrink-0 flex flex-col items-center bg-white border-l border-wedly-bd/60 pt-3 focus:outline-none group",
    );
    expect(handle).toContain(
      "flex w-9 flex-col items-center gap-2 rounded-l-xl rounded-r-md bg-wedly-accent px-2 py-3 text-white shadow-[0_2px_8px_rgba(0,106,255,0.35)] transition-all duration-150 ease-out group-hover:bg-wedly-accent-ink group-hover:translate-x-[3px] group-focus-visible:ring-[3px] group-focus-visible:ring-wedly-accent/40",
    );
    expect(handle).toContain('d="M10 4l-4 4 4 4"');
    expect(handle).toContain('strokeWidth="2"');
    expect(handle).toContain('style={{ writingMode: "vertical-rl" }}>접기</span>');
    expect(src).not.toContain(
      "absolute left-0 top-0 z-20 h-12 w-8 flex items-center justify-center border-b border-r border-wedly-bd/60 bg-wedly-bg-gray text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1 transition-colors",
    );
    // 겹쳐 두려면 담는 칸에 기준(relative)이 있어야 한다 — 짝을 못 박는다.
    expect(sidePaneClass(false, "side", { rail: true, railOpen: true })).toContain("relative");
  });

  it("접힘 탭은 펼치기 레이블·배지 연결을 갖고, 펼침은 오른쪽 세로 탭이다", () => {
    expect(src).not.toContain('aria-label="컨설팅 업무 현황 펼치기"');
    expect(src).toContain('<span className="sr-only">펼치기</span>');
    expect(src).toContain('aria-label={trackRailOpen ? "컨설팅 업무 현황 접기" : undefined}');
    expect(src).toContain("aria-expanded={trackRailOpen}");
    expect(src).toContain("const TrackRailBadge = adapter.components.trackRailBadge");
    expect(src).toContain("{TrackRailBadge && <TrackRailBadge primaryRow={row as Record<string, unknown>} />}");
    expect(handle).toContain("order-last w-11 flex-shrink-0");
  });

  it("세 칸 머리 줄 높이가 h-12 로 같다 — 왼쪽(3분할)·가운데 분야 탭·레일 손잡이", () => {
    const view = src;
    // 가운데 분야 탭 줄 — 2분할도 한 줄 고정(h-12). 줄바꿈(min-h-12/flex-wrap)은 쓰지 않는다(2026-09-02 사장님).
    expect(view).toContain('bg-wedly-bg-gray border-b border-wedly-bd/60 flex-shrink-0 ${mergeBasic ? "px-4 h-12" : "px-3 sm:px-6 h-12"}');
    expect(view).toContain('className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto"');
    expect(view).toContain('${mergeBasic ? "px-2.5" : "px-3"} py-1.5 rounded-full');
    expect(view).not.toContain("min-h-12 py-1.5");
    expect(view).not.toContain('${mergeBasic ? "flex-wrap" : "overflow-x-auto"}');
    // 왼쪽 기본정보 머리(3분할일 때만 밴드)
    expect(view).toContain('${stacked ? "h-12" : "py-2.5"}');
    expect(view).toContain('-mx-4 -mt-4 rounded-none border-x-0 border-t-0');
  });

  it("손잡이 클릭에서 펼침과 한 번 보임을 같은 렌더에서 같이 켠다", () => {
    expect(src).toContain(
      "onClick={() => { setTrackRailOpen((v) => !v); setTrackEverShown(true); }}",
    );
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
  });
});

describe("mergeBasic — ERP 넓은 화면에서 기본정보를 탭줄에 합친 2분할", () => {
  it("왼쪽 칸은 hidden, 좁은 화면·기본값은 지금과 같다", () => {
    expect(basicPaneClass(false, "basic", true)).toBe("hidden");
    expect(basicPaneClass(false, "basic")).toBe(basicPaneClass(false, "basic", false));
    expect(basicPaneClass(true, "basic", true)).toBe(basicPaneClass(true, "basic"));
  });
  it("펼침이면 가운데 40% 고정·레일이 나머지, 접힘이면 가운데 flex-1", () => {
    expect(centerPaneClass(false, "center", true, true, true)).toBe("w-[40%] min-w-[672px] flex-shrink-0 flex flex-col min-h-0");
    expect(centerPaneClass(false, "center", true, false, true)).toBe("flex-1 min-w-0 flex flex-col min-h-0");
    expect(sidePaneClass(false, "side", { rail: true, railOpen: true, mergeBasic: true })).toBe(
      "relative flex-1 min-w-0 border-l border-wedly-bd/60 flex flex-row min-h-0 transition-[width] duration-200 ease-out",
    );
    expect(sidePaneClass(false, "side", { rail: true, railOpen: false, mergeBasic: true })).toBe(
      sidePaneClass(false, "side", { rail: true, railOpen: false }),
    );
  });
  it("mergeBasic 을 안 주면 네 함수 모두 옛 문자열 그대로", () => {
    expect(centerPaneClass(false, "center", true, true)).toBe("w-[380px] 2xl:w-[520px] min-w-[260px] flex flex-col min-h-0");
    expect(sidePaneClass(false, "side", { rail: true, railOpen: true })).toContain("min-w-[380px]");
  });
  it("모달 상자 — 접힘이면 왼쪽 40% 폭(38.4vw)+손잡이 44px 로 줄고, 그 외엔 지금 문자열", () => {
    const now = "sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] sm:rounded-2xl";
    expect(modalBoxClass(false, false, false)).toBe(now);
    expect(modalBoxClass(false, true, true)).toBe(now);
    expect(modalBoxClass(true, true, false)).toBe("");
    expect(modalBoxClass(false, true, false)).toBe(
      "sm:w-[max(calc(38.4vw_+_44px),716px)] sm:h-[94vh] sm:max-w-[716px] sm:max-h-[94vh] sm:rounded-2xl",
    );
  });

  it("mergeBasic 펼침이면 기본정보 머리띠를 숨기고 도구를 탭줄 오른쪽에 붙인다", () => {
    const view = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
    expect(view).toContain("const [basicToolsSlot, setBasicToolsSlot] = useState<HTMLElement | null>(null);");
    expect(view).toContain('import { createPortal } from "react-dom"');
    expect(view).toContain("hideHeader={mergeBasic}");
    expect(view).toContain("toolsSlot={mergeBasic ? basicToolsSlot : undefined}");
    expect(view).toContain("hideHeader?: boolean");
    expect(view).toContain("toolsSlot?: HTMLElement | null");
    expect(view).toContain('{mergeBasic && <div ref={setBasicToolsSlot} className={activeTab === "__basic__" ? "flex items-center gap-1.5" : "hidden"} />}');
    expect(view).toContain("{isAdmin && (!mergeBasic || activeTab !== \"__basic__\" || visibleGroups.length === 0) && (");
    expect(view).toContain('<div className="flex-shrink-0 flex items-center gap-1.5 ml-2">');
    expect(view).toContain("createPortal(");
    expect(view).toContain("<CommonFieldsLauncher");
    expect(view).toContain("<SectionAdminMenu");
    expect(view).toMatch(/<CommonFieldsLauncher[\s\S]*?compact/);
    expect(view).toMatch(/<SectionAdminMenu[\s\S]*?compact/);
  });
});

describe("CommonFieldsLauncher — compact 아이콘 단추", () => {
  const src = readFileSync(join(DIR, "CommonFieldsLauncher.tsx"), "utf8");

  it("compact 가 아니면 지금 여는 단추 문자열이 그대로다", () => {
    expect(src).toContain(
      'className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2 py-1 text-[11px] font-medium text-wedly-t2 hover:bg-wedly-bg-gray transition-colors"',
    );
    expect(src).toContain("<span aria-hidden>⚙</span> 공통 칸 관리");
  });

  it("compact 면 아이콘만 28px 단추다", () => {
    expect(src).toContain("compact?: boolean");
    expect(src).toContain(
      'className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-wedly-bd text-[12px] text-wedly-t2 hover:bg-wedly-bg-gray transition-colors"',
    );
    expect(src).toContain('title="공통 칸 관리 (관리자 전용)"');
    expect(src).toContain('aria-label="공통 칸 관리"');
  });
});
