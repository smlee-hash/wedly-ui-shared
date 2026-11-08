import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  basicPaneClass,
  bigTabBarClass,
  bigTabClass,
  bigTabList,
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

  it("업무 현황 조각은 오류가 없고 한 번 보인 뒤에만 붙이고, 그 뒤엔 hidden 으로만 감춘다", () => {
    const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");
    expect(src).toContain("!error && WideCenterPanel && trackEverShown");
    expect(src).toContain('const trackVisible = shownBigTab !== "db";');
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
    expect(src).toContain('className={shownBigTab !== "db" ? "flex-1 min-w-0 min-h-0 overflow-y-auto" : "hidden"}');
    // 손잡이가 없으니 레일 여닫기 상태·창이 넓어질 때 레일을 여는 효과도 없다.
    expect(src).not.toContain("setTrackRailOpen");
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

describe("상세창 큰 탭 — 손잡이·레일 안 작은 탭·휴대폰 3단추를 대신한다 (2026-11-09 사장님 승인 시안)", () => {
  const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");

  // 소스 한 덩어리를 시작 글자부터 끝 글자까지 잘라 온다 — 다른 자리의 같은 글자와 헷갈리지 않게 범위를 좁힌다.
  const sliceBetween = (from: string, to: string): string => {
    const i = src.indexOf(from);
    expect(i).toBeGreaterThan(-1);
    const j = src.indexOf(to, i);
    expect(j).toBeGreaterThan(i);
    return src.slice(i, j);
  };

  it("손잡이와 레일 여닫기 상태가 소스에서 사라졌다", () => {
    expect(src).not.toContain("aria-expanded={trackRailOpen}");
    expect(src).not.toContain("trackRailOpen");
    expect(src).not.toContain("setTrackRailOpen");
    expect(src).not.toContain('<span className="sr-only">펼치기</span>');
    expect(src).not.toContain("컨설팅 업무 현황 펼치기");
    expect(src).not.toContain("눌러서 펼치기");
    expect(src).not.toMatch(/bg-blue-\d/);
  });

  it("styles.css 의 wedly-nudge 키프레임은 지우지 않는다(이제 안 쓰이지만 이 갈래 소관이 아니다)", () => {
    const css = readFileSync(join(DIR, "../styles.css"), "utf8");
    expect(css).toContain("@keyframes wedly-nudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-3px); } }");
  });

  it("큰 탭 줄은 tablist · tab · aria-selected · aria-controls · tabIndex 로 이어진다", () => {
    expect(src).toContain('role="tablist" aria-label="상세창 탭"');
    expect(src).toContain("className={bigTabBarClass(narrowSwitch)}");
    expect(src).toContain("onKeyDown={onBigTabKeyDown}");
    const tab = sliceBetween("{bigTabs.map(([key, label], i) => (", "</button>");
    expect(tab).toContain('role="tab"');
    expect(tab).toContain("id={tabId(key)}");
    expect(tab).toContain("aria-selected={shownBigTab === key}");
    expect(tab).toContain("aria-controls={panelId(key)}");
    expect(tab).toContain("tabIndex={shownBigTab === key ? 0 : -1}");
    expect(tab).toContain("onClick={() => selectBigTab(key)}");
    expect(tab).toContain("className={bigTabClass(narrowSwitch, shownBigTab === key)}");
    expect(tab).toContain("{!narrowSwitch && <BigTabIcon tab={key} />}");
    expect(tab).toContain('selected={shownBigTab === "track"}');
  });

  it("탭 목록·보이는 탭·고르기는 순수 함수와 같은 렌더 갱신을 쓴다", () => {
    expect(src).toContain("const bigTabs = bigTabList(adapter.components.wideCenterViews);");
    expect(src).toContain('const [bigTab, setBigTab] = useState<BigTabKey>("db");');
    expect(src).toContain('const shownBigTab: BigTabKey = bigTabs.some(([k]) => k === bigTab) ? bigTab : "db";');
    const select = sliceBetween("const selectBigTab = useCallback(", "}, []);");
    expect(select).toContain("setBigTab(key);");
    expect(select).toContain('if (key !== "db") setTrackEverShown(true);');
    // 업무 현황·추천 정책은 조각 하나를 가리키므로 패널 id 가 같아야 한다.
    expect(src).toContain('const panelId = (key: BigTabKey) => `${bigTabBaseId}-panel-${key === "db" ? "db" : "work"}`;');
    expect(src).toContain("const bigTabBaseId = useId();");
    expect(src).toMatch(/import \{[^}]*\buseId\b[^}]*\} from "react";/);
  });

  it("방향키·Home·End 는 이동한 탭을 고르고 포커스하며, 그 네 키만 preventDefault 한다", () => {
    const handler = sliceBetween("const onBigTabKeyDown = (", "const bigTabBar = (");
    expect(handler).toContain('case "ArrowRight"');
    expect(handler).toContain('case "ArrowLeft"');
    expect(handler).toContain('case "Home"');
    expect(handler).toContain('case "End"');
    expect(handler).toContain("default: return;");
    expect(handler).toContain("selectBigTab(bigTabs[next][0]);");
    expect(handler).toContain("bigTabRefs.current[next]?.focus();");
    // preventDefault 는 키를 가린 뒤(default 로 빠져나간 뒤)에만 한 번 부른다.
    expect(handler.match(/preventDefault\(\)/g)).toHaveLength(1);
    expect(handler.indexOf("default: return;")).toBeLessThan(handler.indexOf("e.preventDefault();"));
  });

  it("모달 상자는 DB 정보면 716 상자, 업무 현황·추천 정책이면 96vw 상자다", () => {
    expect(src).toContain('modalBoxClass(narrowSwitch, mergeBasic, shownBigTab !== "db")');
    expect(modalBoxClass(false, true, false)).toContain("sm:max-w-[716px]");
    expect(modalBoxClass(false, true, true)).toContain("sm:w-[96vw]");
    expect(modalBoxClass(false, true, true)).toContain("sm:max-w-[1680px]");
  });

  it("휴대폰도 합친 DB 띠를 쓴다 — mergeBasic 에 좁은 화면 조건이 없다", () => {
    expect(src).toContain("const mergeBasic = threePane && Boolean(adapter.components.wideCenterPanel);");
    expect(src).not.toContain("const mergeBasic = threePane && !narrowSwitch");
    // 합친 띠에 기본정보가 들어가 있으니 기본정보를 첫 분야로 밀어내는 효과는 mergeBasic 이면 멈춘다.
    expect(src).toContain("if (!threePane || mergeBasic) return;");
  });

  it("업무 현황 조각은 한 벌(key=wide-center)로 view 만 바꾸고, 오류 문구는 두 패널 위에 있다", () => {
    const content = sliceBetween("const bigTabContent = (", "return (\n      <DetailLoadStateProvider");
    expect(content).toContain("{errorBlock}");
    expect(content).toContain("!error && WideCenterPanel && trackEverShown");
    expect(content).toContain('key="wide-center"');
    expect(content).toContain('view={shownBigTab === "recommend" ? "recommend" : "track"}');
    expect(content).toContain("onViewChange={selectBigTab}");
    expect(content).toContain('role="tabpanel"');
    expect(content).toContain('id={panelId("db")}');
    expect(content).toContain('aria-labelledby={tabId("db")}');
    expect(content).toContain('id={panelId("track")}');
    expect(content).toContain('aria-labelledby={tabId(shownBigTab === "recommend" ? "recommend" : "track")}');
    expect(content).toContain('className={shownBigTab === "db" ? "flex flex-1 min-h-0 flex-col" : "hidden"}');
    expect(content).toContain("{sideContent}");
    // 오류 문구 → DB 패널 → 업무 현황 패널 순서, 조각 element 는 하나뿐이다.
    expect(content.indexOf("{errorBlock}")).toBeLessThan(content.indexOf('id={panelId("db")}'));
    expect(content.indexOf('id={panelId("db")}')).toBeLessThan(content.indexOf('id={panelId("track")}'));
    expect(content.match(/<WideCenterPanel/g)).toHaveLength(1);
  });

  it("분야 탭으로 가는 통로는 DB 정보 탭으로 돌아온다 — openGroupTab · 히스토리로 열기", () => {
    const group = sliceBetween("const openGroupTab = useCallback(", "}, []);");
    expect(group).toContain("setActiveTab(groupKey);");
    expect(group).toContain('setNarrowPane("center");');
    expect(group).toContain('setBigTab("db");');

    const history = sliceBetween("if (!openOnHistory || didInitHistoryRef.current || !detail) return;", "}, [openOnHistory, detail,");
    expect(history).toContain("setActiveTab(target);");
    expect(history).toContain('setSubTab("history");');
    expect(history).toContain('setNarrowPane(threePane && adapter.components.wideCenterPanel ? "center" : "side");');
    expect(history).toContain('setBigTab("db");');
  });

  it("업무 현황 조각이 없는 앱은 지금 3분할 그대로 — 3단추와 ThreePaneShell, 레일은 닫힘 고정", () => {
    const noRail = sliceBetween("{mergeBasic ? (", "</FieldOptionsProvider>");
    expect(noRail).toContain("narrowPaneTabs(hasTrackRail)");
    expect(noRail).toContain("<ThreePaneShell");
    expect(noRail).toContain("railOpen={false}");
    expect(noRail).toContain("trackPane={null}");
    expect(noRail).toContain("railHandle={null}");
    expect(noRail).toContain("plainCenterPane={centerContent}");
    expect(noRail).toContain("{bigTabBar}");
    expect(noRail).toContain("{bigTabContent}");
    // 큰 탭 줄은 레일 있는 앱 갈래에만 있고 3단추·ThreePaneShell 은 그 반대 갈래에만 있다.
    expect(noRail.indexOf("{bigTabContent}")).toBeLessThan(noRail.indexOf("narrowPaneTabs(hasTrackRail)"));
    expect(noRail.indexOf("{bigTabContent}")).toBeLessThan(noRail.indexOf("<ThreePaneShell"));
  });

  it("배지는 앱이 주고, 큰 탭 「컨설팅 업무 현황」 옆에서만 selected 를 받는다", () => {
    expect(src).toContain("const TrackRailBadge = adapter.components.trackRailBadge");
    expect(src).toContain(
      '{key === "track" && TrackRailBadge && <TrackRailBadge primaryRow={row as Record<string, unknown>} selected={shownBigTab === "track"} />}',
    );
    expect(src).not.toContain("{TrackRailBadge && <TrackRailBadge primaryRow={row as Record<string, unknown>} />}");
  });

  it("아이콘은 인라인 SVG 이고 아이콘 묶음을 가져오지 않는다", () => {
    expect(src).toContain("function BigTabIcon({ tab }: { tab: BigTabKey })");
    expect(src).not.toMatch(/from "lucide-react"/);
    const icon = sliceBetween("function BigTabIcon(", "function Spinner(");
    expect(icon).toContain('width="16"');
    expect(icon).toContain('height="16"');
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('strokeWidth="2.2"');
    expect(icon).toContain('aria-hidden="true"');
    expect(icon).toContain('className="flex-shrink-0"');
    expect(icon).toContain('d="M6 17c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 14h4"');
    expect(icon).toContain('d="m9 14 2 2 4-4"');
    expect(icon).toContain('d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"');
  });

  it("어댑터 자료형에 큰 탭용 항목이 있다", () => {
    const types = readFileSync(join(DIR, "adapter-types.ts"), "utf8");
    expect(types).toContain('export type WideCenterView = "track" | "recommend";');
    expect(types).toContain("wideCenterViews?: ReadonlyArray<WideCenterView>;");
    expect(types).toContain("trackRailBadge?: React.ComponentType<{ primaryRow: Record<string, unknown>; selected?: boolean }>;");
    expect(types).toContain("view?: WideCenterView;");
    expect(types).toContain("onViewChange?: (view: WideCenterView) => void;");
  });

  it("분야 탭 줄·기본정보 머리 줄 높이가 h-12 로 같다 — 왼쪽(3분할)·가운데 분야 탭", () => {
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

  it("탭을 고르는 같은 렌더에서 조각도 붙이고, 효과 래치는 그대로 둔다", () => {
    expect(src).toContain('if (key !== "db") setTrackEverShown(true);');
    expect(src).toContain("if (trackVisible && !trackEverShown) setTrackEverShown(true)");
  });
});

describe("bigTabList — 큰 탭 목록", () => {
  const DB: [string, string] = ["db", "DB 정보"];
  const TRACK: [string, string] = ["track", "컨설팅 업무 현황"];
  const RECOMMEND: [string, string] = ["recommend", "추천 정책"];

  it("안 주면 DB 정보 · 컨설팅 업무 현황 두 탭이다", () => {
    expect(bigTabList()).toEqual([DB, TRACK]);
    expect(bigTabList(undefined)).toEqual([DB, TRACK]);
  });

  it("track · recommend 를 주면 세 탭이 그 순서로 나온다", () => {
    expect(bigTabList(["track", "recommend"])).toEqual([DB, TRACK, RECOMMEND]);
    expect(bigTabList(["recommend", "track"])).toEqual([DB, RECOMMEND, TRACK]);
  });

  it("recommend 만 주면 DB 정보 · 추천 정책이다", () => {
    expect(bigTabList(["recommend"])).toEqual([DB, RECOMMEND]);
  });

  it("중복과 모르는 값(db 포함)은 버린다", () => {
    expect(bigTabList(["track", "track", "recommend", "recommend"])).toEqual([DB, TRACK, RECOMMEND]);
    expect(bigTabList(["foo", "track", "bar"])).toEqual([DB, TRACK]);
    expect(bigTabList(["db", "recommend"])).toEqual([DB, RECOMMEND]);
    expect(bigTabList(["recommend", "unknown", "recommend"])).toEqual([DB, RECOMMEND]);
  });

  it("빈 목록이거나 남는 것이 없으면 track 하나로 돌아간다", () => {
    expect(bigTabList([])).toEqual([DB, TRACK]);
    expect(bigTabList(["foo", "db"])).toEqual([DB, TRACK]);
  });

  it("DB 정보가 항상 맨 앞이고, 부를 때마다 새 배열이다(안 건드려도 되게)", () => {
    for (const views of [undefined, [], ["recommend"], ["track", "recommend"]]) {
      expect(bigTabList(views)[0]).toEqual(DB);
    }
    expect(bigTabList()).not.toBe(bigTabList());
  });
});

describe("bigTabBarClass · bigTabClass — 큰 탭 줄 문자열", () => {
  const SEL = "bg-wedly-accent text-white";
  const UNSEL = "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1";
  const WIDE_BASE =
    "inline-flex items-center gap-[7px] rounded-[10px] px-3.5 py-2 text-[14px] font-bold whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ";
  const NARROW_BASE =
    "flex-1 inline-flex items-center justify-center gap-[5px] rounded-xl px-1 py-2 text-[13px] font-bold whitespace-normal break-keep text-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ";

  it("탭 줄 className 이 넓은 화면·좁은 화면 각각 정확히 같다", () => {
    expect(bigTabBarClass(false)).toBe("flex gap-1.5 px-5 py-2 border-b border-wedly-bd/60 bg-white flex-shrink-0");
    expect(bigTabBarClass(true)).toBe("flex gap-1 p-2 border-b border-wedly-bd/60 bg-white flex-shrink-0");
  });

  it("탭 단추 className 이 두 크기 · 두 상태 모두 정확히 같다", () => {
    expect(bigTabClass(false, true)).toBe(WIDE_BASE + SEL);
    expect(bigTabClass(false, false)).toBe(WIDE_BASE + UNSEL);
    expect(bigTabClass(true, true)).toBe(NARROW_BASE + SEL);
    expect(bigTabClass(true, false)).toBe(NARROW_BASE + UNSEL);
  });

  it("좁은 화면 탭은 줄이 꺾여도 되고(whitespace-nowrap 없음), 넓은 화면 탭은 한 줄 고정이다", () => {
    for (const selected of [true, false]) {
      expect(bigTabClass(true, selected)).not.toContain("whitespace-nowrap");
      expect(bigTabClass(true, selected)).toContain("whitespace-normal");
      expect(bigTabClass(false, selected)).toContain("whitespace-nowrap");
    }
  });

  it("고른 탭만 진한 파랑 바탕이고, 키보드 포커스 고리가 있다", () => {
    for (const narrow of [true, false]) {
      expect(bigTabClass(narrow, true)).toContain("bg-wedly-accent text-white");
      expect(bigTabClass(narrow, false)).not.toContain("bg-wedly-accent");
      for (const selected of [true, false]) {
        expect(bigTabClass(narrow, selected)).toContain("focus-visible:ring-2 focus-visible:ring-wedly-accent");
      }
    }
  });

  it("WEDLY 토큰 클래스만 쓴다 — 기본 색 눈금·16진 색이 없다", () => {
    const all = [
      bigTabBarClass(false),
      bigTabBarClass(true),
      ...[true, false].flatMap((n) => [bigTabClass(n, true), bigTabClass(n, false)]),
    ].join(" ");
    // 앞이 글자·하이픈이 아닐 때만 — wedly-bg-gray 안의 bg-gray 를 색 눈금으로 잘못 잡지 않게.
    expect(all).not.toMatch(/(?<![\w-])(?:bg|text|border|ring)-(?:blue|gray|slate|zinc|red|green|amber|indigo)-\d{2,3}\b/);
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}/);
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
