import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { WideCenterView } from "./adapter-types";
import {
  basicPaneClass,
  bigTabBarClass,
  bigTabClass,
  bigTabList,
  centerPaneClass,
  modalBoxClass,
  narrowPaneTabs,
  noteScroll,
  restoreScrolls,
  sidePaneClass,
  threePaneSlots,
  type BigTabKey,
  type PaneName,
  type ScrollMemo,
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

  it("업무 현황 조각은 오류가 없고 한 번 보인 뒤에만 붙이고, DB 정보 탭에서는 hidden 으로만 감춘다", () => {
    const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
    expect(src).toContain("!error && WideCenterPanel && trackEverShown");
    expect(src).toContain('shownBigTab !== "db" ? "flex-1 min-w-0 min-h-0 overflow-y-auto" : "hidden"');
    expect(src).toContain('const trackVisible = shownBigTab !== "db";');
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
    // 좁은 화면 → 넓은 화면 때 레일을 여는 옛 효과는 레일과 함께 없어졌다.
    expect(src).not.toContain('if (!narrowSwitch && narrowPane === "side") setTrackRailOpen(true)');
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

// 2026-11-09 사장님 승인 시안 「상세창 큰 탭」: 세로 손잡이·레일 안 작은 탭·휴대폰 3단추가 헤더 아래 큰 탭 한 줄로 바뀌었다.
describe("큰 탭 — 세로 손잡이 대신 헤더 아래 한 줄 탭", () => {
  const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
  // 레일 앱 갈래(큰 탭 + 두 패널)와 레일 없는 앱 갈래(옛 3칸 배치)를 소스에서 잘라 본다.
  const railStart = src.indexOf('role="tablist"');
  const noRailStart = src.indexOf("{/* 좁은 화면(휴대폰)", railStart);
  const noRailEnd = src.indexOf("// ── 렌더 ──", noRailStart);
  const railBranch = src.slice(railStart, noRailStart);
  const noRailBranch = src.slice(noRailStart, noRailEnd);

  it("두 갈래를 제대로 잘라 왔다", () => {
    expect(railStart).toBeGreaterThan(-1);
    expect(noRailStart).toBeGreaterThan(railStart);
    expect(noRailEnd).toBeGreaterThan(noRailStart);
  });

  it("탭 줄은 tablist·tab·aria-selected 를 갖고 이름은 「상세창 탭」이다", () => {
    expect(src).toContain('role="tablist"');
    expect(src).toContain('aria-label="상세창 탭"');
    expect(src).toContain("className={bigTabBarClass(narrowSwitch)}");
    expect(src).toContain("onKeyDown={onBigTabKeyDown}");
    expect(src).toContain('role="tab"');
    expect(src).toContain("aria-selected={shownBigTab === key}");
    expect(src).toContain("aria-controls={panelId(key)}");
    expect(src).toContain("tabIndex={shownBigTab === key ? 0 : -1}");
    expect(src).toContain("className={bigTabClass(narrowSwitch, shownBigTab === key)}");
    expect(src).toContain("onClick={() => selectBigTab(key)}");
  });

  it("처음 탭은 DB 정보이고, 어댑터가 보기 목록을 바꿔 사라진 탭은 DB 정보로 읽는다", () => {
    expect(src).toContain('const [bigTab, setBigTab] = useState<BigTabKey>("db");');
    expect(src).toContain("const bigTabs = bigTabList(adapter.components.wideCenterViews);");
    expect(src).toContain('const shownBigTab: BigTabKey = bigTabs.some(([k]) => k === bigTab) ? bigTab : "db";');
  });

  it("탭을 고르는 같은 렌더에서 업무 현황 조각을 붙인다(DB 정보가 아닐 때만)", () => {
    expect(src).toContain("const selectBigTab = useCallback((key: BigTabKey) => {");
    expect(src).toContain('if (key !== "db") setTrackEverShown(true);');
  });

  it("방향키·Home·End 로 옮기고 이 네 키에만 preventDefault 를 건다", () => {
    expect(src).toContain('if (e.key === "ArrowRight") next = (cur + 1) % n;');
    expect(src).toContain('else if (e.key === "ArrowLeft") next = (cur - 1 + n) % n;');
    expect(src).toContain('else if (e.key === "Home") next = 0;');
    expect(src).toContain('else if (e.key === "End") next = n - 1;');
    const handlerStart = src.indexOf("const onBigTabKeyDown");
    const handler = src.slice(handlerStart, src.indexOf("\n  };", handlerStart));
    // 네 키가 아니면 preventDefault 앞에서 빠진다.
    expect(handler.indexOf("else return;")).toBeGreaterThan(-1);
    expect(handler.indexOf("else return;")).toBeLessThan(handler.indexOf("e.preventDefault()"));
    expect(handler.match(/preventDefault/g)).toHaveLength(1);
    expect(handler).toContain("bigTabRefs.current[next]?.focus();");
  });

  it("업무 현황·추천 정책은 한 패널 id 를 같이 쓴다", () => {
    expect(src).toContain('const panelId = (key: BigTabKey) => `${bigTabBaseId}-panel-${key === "recommend" ? "track" : key}`;');
    expect(src).toContain("const bigTabBaseId = useId();");
    expect(src).toContain("aria-labelledby={tabId(shownBigTab === \"recommend\" ? \"recommend\" : \"track\")}");
  });

  it("모달 상자는 DB 정보면 좁게, 업무 현황·추천 정책이면 96vw 로 간다", () => {
    expect(src).toContain('modalBoxClass(narrowSwitch, mergeBasic, shownBigTab !== "db")');
    expect(modalBoxClass(false, true, false)).toContain("sm:max-w-[716px]");
    expect(modalBoxClass(false, true, true)).toContain("sm:w-[96vw]");
    expect(modalBoxClass(false, true, true)).toContain("sm:max-w-[1680px]");
  });

  it("합치기는 좁은 화면에서도 켠다 — mergeBasic 에서 !narrowSwitch 를 뺐다", () => {
    expect(src).toContain("const mergeBasic = threePane && Boolean(adapter.components.wideCenterPanel);");
    expect(src).not.toContain("const mergeBasic = threePane && !narrowSwitch");
  });

  it("업무 현황 조각은 key 고정 한 벌이고 view 와 onViewChange 를 받는다", () => {
    expect(railBranch).toContain("!error && WideCenterPanel && trackEverShown");
    expect(railBranch).toContain('key="wide-center"');
    expect(railBranch).toContain('view={shownBigTab === "recommend" ? "recommend" : "track"}');
    expect(railBranch).toContain("onViewChange={selectBigTab}");
    // 조각은 이 갈래에 한 번만 그린다(탭을 옮겨도 같은 자리라 다시 마운트되지 않는다).
    expect(railBranch.split("<WideCenterPanel").length - 1).toBe(1);
  });

  it("배지는 「컨설팅 업무 현황」 탭 안에만 붙고 선택 여부를 받는다", () => {
    expect(src).toContain("const TrackRailBadge = adapter.components.trackRailBadge");
    expect(src).toContain('{key === "track" && TrackRailBadge && <TrackRailBadge primaryRow={row as Record<string, unknown>} selected={shownBigTab === "track"} />}');
    expect(src).toContain("selected={shownBigTab === \"track\"}");
    expect(src).not.toContain("{TrackRailBadge && <TrackRailBadge primaryRow={row as Record<string, unknown>} />}");
  });

  it("불러오기 오류 블록은 두 패널 위에 있어 어느 탭에서나 보인다", () => {
    expect(railBranch.indexOf("{errorBlock}")).toBeGreaterThan(-1);
    expect(railBranch.indexOf("{errorBlock}")).toBeLessThan(railBranch.indexOf('id={panelId("db")}'));
    expect(railBranch.indexOf("{errorBlock}")).toBeLessThan(railBranch.indexOf('id={panelId("track")}'));
  });

  it("DB 정보 패널은 sideContent 를 그대로 담고(복사 금지), 다른 탭이면 hidden 으로 감춘다", () => {
    expect(railBranch).toContain('className={shownBigTab === "db" ? "flex flex-1 min-h-0 flex-col" : "hidden"}');
    expect(railBranch).toContain("{sideContent}");
    expect(railBranch.split("<GroupDomainPanel")).toHaveLength(1);
  });

  it("분야 본문으로 돌아오는 두 길(탭 열기·히스토리로 열기)은 DB 정보 탭으로 되돌린다", () => {
    const openStart = src.indexOf("const openGroupTab = useCallback(");
    const openEnd = src.indexOf("}, [adapter]);", openStart);
    const openGroupTab = src.slice(openStart, openEnd);
    expect(openStart).toBeGreaterThan(-1);
    expect(openGroupTab).toContain("setActiveTab(groupKey);");
    expect(openGroupTab).toContain('setNarrowPane(adapter.components.wideCenterPanel ? "center" : "side");');
    expect(openGroupTab).toContain('setBigTab("db")');

    const effStart = src.indexOf("if (!openOnHistory || didInitHistoryRef.current || !detail) return;");
    const effEnd = src.indexOf("didInitHistoryRef.current = true;", effStart);
    const effect = src.slice(effStart, effEnd);
    expect(effStart).toBeGreaterThan(-1);
    expect(effEnd).toBeGreaterThan(effStart);
    expect(effect).toContain('setSubTab("history");');
    expect(effect).toContain('setBigTab("db")');
  });

  it("옛 손잡이·레일 열림 상태는 소스에 없다", () => {
    expect(src).not.toContain("aria-expanded={trackRailOpen}");
    expect(src).not.toContain("setTrackRailOpen");
    expect(src).not.toContain("trackRailOpen");
    expect(src).not.toContain("wedly-nudge");
    expect(src).not.toContain("눌러서 펼치기");
    expect(src).not.toContain('<span className="sr-only">펼치기</span>');
  });

  it("레일 앱 갈래에는 3칸 껍데기·손잡이·휴대폰 3단추가 없다", () => {
    expect(railBranch).not.toContain("<ThreePaneShell");
    expect(railBranch).not.toContain("railHandle");
    expect(railBranch).not.toContain("narrowPaneTabs");
  });

  it("레일 없는 앱 갈래는 옛 배치 그대로다 — 휴대폰 3단추와 3칸 껍데기", () => {
    expect(noRailBranch).toContain("{narrowSwitch && (");
    expect(noRailBranch).toContain("narrowPaneTabs(hasTrackRail)");
    expect(noRailBranch).toContain("onClick={() => setNarrowPane(key)}");
    expect(noRailBranch).toContain("<ThreePaneShell");
    expect(noRailBranch).toContain("hasTrackRail={hasTrackRail}");
    expect(noRailBranch).toContain("mergeBasic={mergeBasic}");
    expect(noRailBranch).toContain("plainCenterPane={centerContent}");
    // 레일이 없으니 접힘 값·업무 현황 칸·손잡이는 비워 넘긴다.
    expect(noRailBranch).toContain("railOpen={false}");
    expect(noRailBranch).toContain("trackPane={null}");
    expect(noRailBranch).toContain("railHandle={null}");
  });

  it("큰 탭 앞 아이콘은 인라인 SVG 이고 WEDLY 토큰 클래스만 쓴다", () => {
    expect(src).toContain("function BigTabIcon({ tab }: { tab: BigTabKey }) {");
    expect(src).toContain('{!narrowSwitch && <BigTabIcon tab={key} />}');
    expect(src).toContain(
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-shrink-0">',
    );
    expect(src).toContain('<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" /><path d="M19 3v4M17 5h4" />');
    expect(src).toContain('<path d="m9 14 2 2 4-4" />');
    expect(src).not.toMatch(/bg-blue-\d/);
    expect(src).not.toContain("from \"lucide-react\"");
    const iconStart = src.indexOf("function BigTabIcon(");
    const icon = src.slice(iconStart, src.indexOf("function StatusDot(", iconStart));
    expect(icon).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("세 칸 머리 줄 높이가 h-12 로 같다 — 왼쪽(3분할)·가운데 분야 탭 줄(DB 정보 탭 안)", () => {
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

  it("탭 클릭에서 선택과 한 번 보임을 같은 렌더에서 같이 켠다", () => {
    expect(src).toContain("onClick={() => selectBigTab(key)}");
    expect(src).toContain('if (key !== "db") setTrackEverShown(true);');
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
  });
});

describe("mergeBasic — 업무 현황 조각이 있는 앱에서 기본정보를 탭줄에 합친 밴드", () => {
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

  it("mergeBasic 이면(좁은 화면 포함) 기본정보 머리띠를 숨기고 도구를 탭줄 오른쪽에 붙인다", () => {
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

// ── 상세창 큰 탭 (2026-11-09 사장님 승인 시안) ──

const BIG_DB: [BigTabKey, string] = ["db", "DB 정보"];
const BIG_TRACK: [BigTabKey, string] = ["track", "컨설팅 업무 현황"];
const BIG_RECOMMEND: [BigTabKey, string] = ["recommend", "추천 정책"];

const BAR_WIDE = "flex gap-1.5 px-5 py-2 border-b border-wedly-bd/60 bg-white flex-shrink-0";
const BAR_NARROW = "flex gap-1 p-2 border-b border-wedly-bd/60 bg-white flex-shrink-0";
const TAB_SEL = "bg-wedly-accent text-white";
const TAB_UNSEL = "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1";
const TAB_WIDE =
  "inline-flex items-center gap-[7px] rounded-[10px] px-3.5 py-2 text-[14px] font-bold whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ";
const TAB_NARROW =
  "flex-1 inline-flex items-center justify-center gap-[5px] rounded-xl px-1 py-2 text-[13px] font-bold whitespace-normal break-keep text-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ";

describe("bigTabList — DB 정보가 먼저, 그 뒤에 앱이 선언한 보기", () => {
  it("안 주면 DB 정보 · 컨설팅 업무 현황 두 개", () => {
    expect(bigTabList()).toEqual([BIG_DB, BIG_TRACK]);
    expect(bigTabList(undefined)).toEqual([BIG_DB, BIG_TRACK]);
  });

  it("track · recommend 를 주면 세 개가 그 순서대로", () => {
    expect(bigTabList(["track", "recommend"])).toEqual([BIG_DB, BIG_TRACK, BIG_RECOMMEND]);
  });

  it("recommend 만 주면 DB 정보 · 추천 정책", () => {
    expect(bigTabList(["recommend"])).toEqual([BIG_DB, BIG_RECOMMEND]);
  });

  it("주어진 순서를 따른다(recommend 가 먼저면 추천 정책이 앞)", () => {
    expect(bigTabList(["recommend", "track"])).toEqual([BIG_DB, BIG_RECOMMEND, BIG_TRACK]);
  });

  it("중복과 모르는 값(db 포함)은 버린다", () => {
    expect(bigTabList(["track", "track", "recommend", "recommend"])).toEqual([BIG_DB, BIG_TRACK, BIG_RECOMMEND]);
    expect(bigTabList(["foo", "track", "bar"])).toEqual([BIG_DB, BIG_TRACK]);
    expect(bigTabList(["db", "recommend"])).toEqual([BIG_DB, BIG_RECOMMEND]);
  });

  it("빈 목록이나 모르는 값뿐이면 업무 현황 하나로 되돌린다", () => {
    expect(bigTabList([])).toEqual([BIG_DB, BIG_TRACK]);
    expect(bigTabList(["foo", "db"])).toEqual([BIG_DB, BIG_TRACK]);
  });

  it("어댑터 선언 타입(WideCenterView)을 그대로 받는다", () => {
    const views: ReadonlyArray<WideCenterView> = ["track", "recommend"];
    expect(bigTabList(views).map(([k]) => k)).toEqual(["db", "track", "recommend"]);
  });

  it("DB 정보는 항상 맨 앞이다", () => {
    for (const views of [undefined, [], ["track"], ["recommend"], ["recommend", "track"]]) {
      expect(bigTabList(views)[0]).toEqual(BIG_DB);
    }
  });
});

describe("bigTabBarClass / bigTabClass — 계약 문자열", () => {
  it("탭 줄 className 두 가지", () => {
    expect(bigTabBarClass(false)).toBe(BAR_WIDE);
    expect(bigTabBarClass(true)).toBe(BAR_NARROW);
  });

  it("넓은 화면 탭 — 고른 것·안 고른 것", () => {
    expect(bigTabClass(false, true)).toBe(TAB_WIDE + TAB_SEL);
    expect(bigTabClass(false, false)).toBe(TAB_WIDE + TAB_UNSEL);
  });

  it("좁은 화면 탭 — 고른 것·안 고른 것", () => {
    expect(bigTabClass(true, true)).toBe(TAB_NARROW + TAB_SEL);
    expect(bigTabClass(true, false)).toBe(TAB_NARROW + TAB_UNSEL);
  });

  it("좁은 화면 탭은 줄바꿈을 허용하고(whitespace-nowrap 없음), 넓은 화면 탭은 한 줄 고정이다", () => {
    for (const selected of [true, false]) {
      expect(bigTabClass(true, selected)).not.toContain("whitespace-nowrap");
      expect(bigTabClass(true, selected)).toContain("whitespace-normal break-keep");
      expect(bigTabClass(false, selected)).toContain("whitespace-nowrap");
    }
  });

  it("고른 탭은 파랑 바탕 흰 글씨이고, 안 고른 탭에는 그 바탕이 없다", () => {
    for (const narrow of [true, false]) {
      expect(bigTabClass(narrow, true)).toContain(TAB_SEL);
      expect(bigTabClass(narrow, false)).not.toContain("bg-wedly-accent");
      expect(bigTabClass(narrow, false)).toContain("hover:bg-wedly-bg-gray");
    }
  });

  it("WEDLY 토큰만 쓴다 — 원색 눈금(bg-blue-500 등)이나 16진수가 없다", () => {
    for (const cls of [bigTabBarClass(true), bigTabBarClass(false), bigTabClass(true, true), bigTabClass(false, false)]) {
      expect(cls).not.toMatch(/\b(?:bg|text|border|ring)-(?:blue|gray|slate|red|green|indigo|zinc|neutral)-\d/);
      expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

// 감춘 큰 탭(display:none)은 브라우저가 안쪽 스크롤 위치를 0 으로 되돌리므로, 적어 두고 되돌리는 순수 함수 둘을 잰다.
describe("큰 탭 스크롤 기억", () => {
  type FakeScroller = { scrollTop: number; scrollHeight: number; clientHeight: number; isConnected: boolean };
  // 레이아웃이 없는 환경이라 스크롤 수치만 가진 가짜 칸을 쓴다(높이 1000, 보이는 높이 200 → 맨 아래 scrollTop 은 800).
  const fake = (init: Partial<FakeScroller> = {}): FakeScroller => ({
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 200,
    isConnected: true,
    ...init,
  });
  const asEl = (f: FakeScroller) => f as unknown as Element;
  const newMemos = () => new Map<Element, ScrollMemo>();

  describe("noteScroll", () => {
    it("중간쯤이면 위치와 함께 atBottom:false 로 적는다", () => {
      const memos = newMemos();
      const el = fake({ scrollTop: 300 });
      noteScroll(memos, asEl(el));
      expect(memos.size).toBe(1);
      expect(memos.get(asEl(el))).toEqual({ top: 300, atBottom: false });
    });

    it("맨 아래에서 2px 안이면 atBottom:true, 3px 떨어지면 false", () => {
      const memos = newMemos();
      const exact = fake({ scrollTop: 800 });
      const twoPx = fake({ scrollTop: 798 });
      const fraction = fake({ scrollTop: 799.5 });
      const threePx = fake({ scrollTop: 797 });
      for (const el of [exact, twoPx, fraction, threePx]) noteScroll(memos, asEl(el));
      expect(memos.get(asEl(exact))).toEqual({ top: 800, atBottom: true });
      expect(memos.get(asEl(twoPx))).toEqual({ top: 798, atBottom: true });
      expect(memos.get(asEl(fraction))).toEqual({ top: 799.5, atBottom: true });
      expect(memos.get(asEl(threePx))).toEqual({ top: 797, atBottom: false });
    });

    it("같은 칸을 다시 적으면 새 위치로 바뀌고, 칸마다 따로 적는다", () => {
      const memos = newMemos();
      const a = fake({ scrollTop: 100 });
      const b = fake({ scrollTop: 800 });
      noteScroll(memos, asEl(a));
      noteScroll(memos, asEl(b));
      a.scrollTop = 450;
      noteScroll(memos, asEl(a));
      expect(memos.size).toBe(2);
      expect(memos.get(asEl(a))).toEqual({ top: 450, atBottom: false });
      expect(memos.get(asEl(b))).toEqual({ top: 800, atBottom: true });
    });

    it("맨 위(0)로 돌아온 칸은 지운다", () => {
      const memos = newMemos();
      const el = fake({ scrollTop: 300 });
      noteScroll(memos, asEl(el));
      expect(memos.has(asEl(el))).toBe(true);
      el.scrollTop = 0;
      noteScroll(memos, asEl(el));
      expect(memos.has(asEl(el))).toBe(false);
      expect(memos.size).toBe(0);
    });

    it("적은 적 없는 칸이 0 이면 아무것도 만들지 않는다", () => {
      const memos = newMemos();
      noteScroll(memos, asEl(fake({ scrollTop: 0 })));
      expect(memos.size).toBe(0);
    });
  });

  describe("restoreScrolls", () => {
    it("적어 둔 위치로 scrollTop 을 돌린다", () => {
      const memos = newMemos();
      const el = fake({ scrollTop: 300 });
      noteScroll(memos, asEl(el));
      el.scrollTop = 0; // display:none 에서 브라우저가 하는 일
      restoreScrolls(memos);
      expect(el.scrollTop).toBe(300);
      // 되돌려도 적어 둔 것은 남는다 — 탭을 또 오가도 쓴다.
      expect(memos.get(asEl(el))).toEqual({ top: 300, atBottom: false });
    });

    it("맨 아래였던 칸은 내용이 늘어도 새 맨 아래(scrollHeight)로 간다", () => {
      const memos = newMemos();
      const el = fake({ scrollTop: 800 });
      noteScroll(memos, asEl(el));
      el.scrollTop = 0;
      el.scrollHeight = 1200; // 감춰 둔 사이 기록이 더 쌓였다
      restoreScrolls(memos);
      expect(el.scrollTop).toBe(1200);
    });

    it("맨 아래가 아니었던 칸은 내용이 늘어도 적어 둔 위치 그대로다", () => {
      const memos = newMemos();
      const el = fake({ scrollTop: 300 });
      noteScroll(memos, asEl(el));
      el.scrollTop = 0;
      el.scrollHeight = 1200;
      restoreScrolls(memos);
      expect(el.scrollTop).toBe(300);
    });

    it("화면에서 빠진 칸은 건드리지 않고 목록에서 지우며, 남은 칸은 계속 돌린다", () => {
      const memos = newMemos();
      const gone = fake({ scrollTop: 300 });
      const kept = fake({ scrollTop: 500 });
      noteScroll(memos, asEl(gone));
      noteScroll(memos, asEl(kept));
      gone.scrollTop = 7;
      gone.isConnected = false;
      kept.scrollTop = 0;
      restoreScrolls(memos);
      expect(gone.scrollTop).toBe(7);
      expect(memos.has(asEl(gone))).toBe(false);
      expect(kept.scrollTop).toBe(500);
      expect(memos.has(asEl(kept))).toBe(true);
    });

    it("적어 둔 것이 없으면 아무 일도 없다", () => {
      expect(() => restoreScrolls(newMemos())).not.toThrow();
    });
  });
});

describe("adapter-types — 큰 탭 선언", () => {
  const src = readFileSync(join(DIR, "adapter-types.ts"), "utf8");

  it("WideCenterView 를 내보내고 wideCenterViews 로 받는다", () => {
    expect(src).toContain('export type WideCenterView = "track" | "recommend";');
    expect(src).toContain("wideCenterViews?: ReadonlyArray<WideCenterView>;");
  });

  it("trackRailBadge 가 selected 를 받는다", () => {
    expect(src).toContain(
      "trackRailBadge?: React.ComponentType<{ primaryRow: Record<string, unknown>; selected?: boolean }>;",
    );
  });

  it("SectionPanelProps 에 view 와 onViewChange 가 선택 항목으로 붙는다(옛 구현은 그대로 컴파일)", () => {
    expect(src).toContain("view?: WideCenterView;");
    expect(src).toContain("onViewChange?: (view: WideCenterView) => void;");
  });
});
