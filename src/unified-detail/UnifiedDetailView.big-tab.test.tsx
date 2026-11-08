// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, SectionPanelProps, UnifiedDetailAdapter, UnifiedDetailApi, WideCenterView } from "./adapter-types";
import { DOMAIN_GROUPS } from "./lib/domain-config";
import { bigTabBarClass } from "./three-pane-layout";
import UnifiedDetailView from "./UnifiedDetailView";

// 2026-11-09 사장님 승인 시안 「상세창 큰 탭」을 실제 화면으로 잰다.
// 헤더 아래 큰 탭 한 줄(DB 정보 · 컨설팅 업무 현황 · 추천 정책)이 그려지고, 업무 현황 조각은 한 벌로 붙어 view 만 바뀌는지 본다.
//
// 진짜 UnifiedDetailView 를 쓰고, 가짜로 바꾼 것은 UnifiedDetailView.key-change.test.tsx 와 같은 곁가지
// (배럴 ../index, 칸 편집기, 히스토리 패널)와 앱이 꽂는 조각(가운데 조각·배지)뿐이다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    EditableTitle: () => createElement("span", null, "제목"),
    DraggableFieldsSection: () => null,
    DEFAULT_COLUMN_TYPE_OPTIONS: [],
    getCachedCommonOverride: () => override,
    fetchCommonFieldsOverride: async () => override,
    refreshCommonFieldsOverride: async () => override,
    resolveCommonFieldId: () => "",
    fetchHiddenBasicColumns: async () => hiddenColumns,
    isBasicColumnHidden: () => false,
    subscribeHiddenBasicColumns: () => () => {},
  };
});
vi.mock("./editors", async () => {
  const { createElement } = await import("react");
  return {
    EditableFieldRow: ({ col }: { col: { key: string; label?: string } }) =>
      createElement("span", { "data-probe-field": col.key }, col.label ?? col.key),
    BasicScopeBadge: () => null,
  };
});
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const ROW = { _id: "row-1", "02상호명": "가상 주식회사" } as RowData;

// ── 앱이 꽂는 가짜 조각 ──
// 마운트·언마운트 횟수와 받은 view 를 센다 — 같은 인스턴스가 유지되는지 보려는 장치.
const panelLog = { mounts: 0, unmounts: 0, views: [] as Array<WideCenterView | undefined> };

function CenterStub(props: SectionPanelProps) {
  useEffect(() => {
    panelLog.mounts += 1;
    return () => {
      panelLog.unmounts += 1;
    };
  }, []);
  panelLog.views.push(props.view);
  return (
    <div data-probe="center-stub" data-view={props.view}>
      <button type="button" data-probe="go-track" onClick={() => props.onViewChange?.("track")}>
        업무 현황으로
      </button>
    </div>
  );
}

function BadgeStub({ selected }: { primaryRow: Record<string, unknown>; selected?: boolean }) {
  return (
    <span data-probe="badge" data-selected={String(selected)}>
      3
    </span>
  );
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let savedActEnv: boolean | undefined;

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await settle();
}

/** 키를 누른다. 반환값 = 브라우저 기본 동작이 살아 있는가(preventDefault 안 불렀으면 true). */
async function press(el: HTMLElement, key: string): Promise<boolean> {
  let notPrevented = true;
  await act(async () => {
    notPrevented = el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
  await settle();
  return notPrevented;
}

const tabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const panels = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
const selectedFlags = () => tabs().map((t) => t.getAttribute("aria-selected"));
const stub = () => document.querySelector<HTMLElement>('[data-probe="center-stub"]');
const modalBox = () => document.querySelector<HTMLElement>(".animate-modal-in");
const hasButtonText = (text: string) =>
  Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === text);

function makeAdapter(components: Record<string, unknown>, ownDomain = "tax-amendment"): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    // 끝나지 않는 불러오기 — 분야 패널까지 그리지 않고 큰 탭만 잰다.
    loadDomainRows: () => new Promise(() => {}),
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    loadBasicStore: async () => null,
    saveBasicField: async () => null,
    saveOwnField: async () => {},
  };
  return {
    appName: "ILLUA",
    ownDomain,
    ownColumns: [],
    configScope: "unified-collab",
    domains: [],
    api: api as UnifiedDetailApi,
    fieldOptions: {} as FieldOptionsBundle,
    components: {
      SettlementInfoTab: () => null,
      MeetingsTab: () => null,
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
      ...components,
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
  } as unknown as UnifiedDetailAdapter;
}

const railAdapter = (views?: ReadonlyArray<WideCenterView>) =>
  makeAdapter({ wideCenterPanel: CenterStub, wideCenterViews: views, trackRailBadge: BadgeStub });

/** layout="wide" 로 연다. wideViewport=true 면 넓은 화면, false 면 휴대폰 폭. */
async function mountWide(adapter: UnifiedDetailAdapter, wideViewport: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wideViewport,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<UnifiedDetailView row={ROW} onClose={vi.fn()} adapter={adapter} layout="wide" />);
  });
  await settle();
}

beforeEach(() => {
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  panelLog.mounts = 0;
  panelLog.unmounts = 0;
  panelLog.views = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) })),
  );
  vi.stubGlobal("alert", vi.fn());
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.unstubAllGlobals();
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("큰 탭 — 넓은 화면", () => {
  it("탭 줄이 헤더 아래에 DB 정보 · 컨설팅 업무 현황 · 추천 정책 순서로 그려지고 DB 정보가 먼저 골라져 있다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);

    const list = document.querySelector('[role="tablist"]');
    expect(list).not.toBeNull();
    expect(list?.getAttribute("aria-label")).toBe("상세창 탭");
    expect(list?.className).toBe(bigTabBarClass(false));

    expect(tabs().map((t) => t.textContent)).toEqual(["DB 정보", "컨설팅 업무 현황3", "추천 정책"]);
    expect(selectedFlags()).toEqual(["true", "false", "false"]);
    // 방향키 이동용 — 고른 탭만 Tab 키로 들어간다.
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    // 넓은 화면에는 앞 아이콘이 있다.
    expect(tabs().every((t) => t.querySelector("svg") !== null)).toBe(true);
    // 업무 현황 조각은 아직 안 붙었다(처음 고를 때 붙는다).
    expect(panels()).toHaveLength(1);
    expect(stub()).toBeNull();
    expect(panelLog.mounts).toBe(0);
    // DB 정보 상자 폭(716px).
    expect(modalBox()?.className).toContain("sm:max-w-[716px]");
  });

  it("옛 세로 손잡이는 없다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    expect(document.querySelector('[title="컨설팅 업무 현황 펼치기"]')).toBeNull();
    expect(document.querySelector('[title="컨설팅 업무 현황 접기"]')).toBeNull();
    expect(document.querySelector('[style*="vertical-rl"]')).toBeNull();
  });

  it("컨설팅 업무 현황을 누르면 같은 렌더에서 조각이 붙고 view 는 track, 상자는 96vw 로 넓어진다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[1]);

    expect(selectedFlags()).toEqual(["false", "true", "false"]);
    expect(panelLog.mounts).toBe(1);
    expect(stub()?.getAttribute("data-view")).toBe("track");
    expect(modalBox()?.className).toContain("sm:w-[96vw]");
    expect(modalBox()?.className).toContain("sm:max-w-[1680px]");

    const [dbPanel, workPanel] = panels();
    expect(dbPanel.className).toBe("hidden");
    expect(workPanel.className).toContain("flex-1");
    expect(workPanel.className).not.toBe("hidden");
    // 탭 ↔ 패널 연결
    expect(tabs()[1].getAttribute("aria-controls")).toBe(workPanel.id);
    expect(workPanel.getAttribute("aria-labelledby")).toBe(tabs()[1].id);
    expect(tabs()[0].getAttribute("aria-controls")).toBe(dbPanel.id);
    expect(dbPanel.getAttribute("aria-labelledby")).toBe(tabs()[0].id);
  });

  it("추천 정책을 누르면 같은 인스턴스에 view 만 recommend 로 바뀐다(다시 마운트되지 않는다)", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[1]);
    await click(tabs()[2]);

    expect(selectedFlags()).toEqual(["false", "false", "true"]);
    expect(panelLog.mounts).toBe(1);
    expect(panelLog.unmounts).toBe(0);
    expect(stub()?.getAttribute("data-view")).toBe("recommend");
    expect(panelLog.views[panelLog.views.length - 1]).toBe("recommend");

    // 업무 현황·추천 정책 두 탭이 한 패널을 같이 제어하고, 이름표는 지금 고른 탭이다.
    const workPanel = panels()[1];
    expect(tabs()[1].getAttribute("aria-controls")).toBe(workPanel.id);
    expect(tabs()[2].getAttribute("aria-controls")).toBe(workPanel.id);
    expect(workPanel.getAttribute("aria-labelledby")).toBe(tabs()[2].id);

    await click(tabs()[1]);
    expect(panelLog.mounts).toBe(1);
    expect(stub()?.getAttribute("data-view")).toBe("track");
  });

  it("추천 정책을 첫 선택으로 눌러도 조각이 그 자리에서 붙고 view 는 recommend 다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[2]);

    expect(panelLog.mounts).toBe(1);
    expect(stub()?.getAttribute("data-view")).toBe("recommend");
  });

  it("DB 정보로 돌아가도 조각은 붙어 있고(감춰질 뿐), 상자는 다시 좁아진다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[1]);
    await click(tabs()[0]);

    expect(selectedFlags()).toEqual(["true", "false", "false"]);
    expect(panelLog.mounts).toBe(1);
    expect(panelLog.unmounts).toBe(0);
    expect(stub()).not.toBeNull();
    const [dbPanel, workPanel] = panels();
    expect(dbPanel.className).not.toBe("hidden");
    expect(workPanel.className).toBe("hidden");
    expect(modalBox()?.className).toContain("sm:max-w-[716px]");
  });

  it("조각 안에서 onViewChange 로 다른 보기를 부르면 큰 탭이 따라 움직인다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[2]);
    expect(selectedFlags()).toEqual(["false", "false", "true"]);

    await click(document.querySelector<HTMLElement>('[data-probe="go-track"]')!);
    expect(selectedFlags()).toEqual(["false", "true", "false"]);
    expect(stub()?.getAttribute("data-view")).toBe("track");
    expect(panelLog.mounts).toBe(1);
  });

  it("배지는 컨설팅 업무 현황 탭 안에만 있고, 그 탭이 골라졌을 때 selected 를 받는다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    const badges = () => Array.from(document.querySelectorAll<HTMLElement>('[data-probe="badge"]'));
    expect(badges()).toHaveLength(1);
    expect(tabs()[1].contains(badges()[0])).toBe(true);
    expect(badges()[0].getAttribute("data-selected")).toBe("false");

    await click(tabs()[1]);
    expect(badges()[0].getAttribute("data-selected")).toBe("true");

    await click(tabs()[2]);
    expect(badges()[0].getAttribute("data-selected")).toBe("false");
  });

  it("보기 목록을 안 주면 DB 정보 · 컨설팅 업무 현황 두 개뿐이다", async () => {
    await mountWide(railAdapter(undefined), true);
    expect(tabs().map((t) => t.textContent)).toEqual(["DB 정보", "컨설팅 업무 현황3"]);
    expect(hasButtonText("추천 정책")).toBe(false);

    await click(tabs()[1]);
    expect(stub()?.getAttribute("data-view")).toBe("track");
  });

  it("→ 키는 다음 탭을 고르고 그 탭에 포커스를 준다(끝에서는 처음으로 돈다)", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    tabs()[0].focus();

    expect(await press(tabs()[0], "ArrowRight")).toBe(false);
    expect(selectedFlags()).toEqual(["false", "true", "false"]);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(stub()?.getAttribute("data-view")).toBe("track");

    await press(tabs()[1], "ArrowRight");
    expect(selectedFlags()).toEqual(["false", "false", "true"]);
    expect(document.activeElement).toBe(tabs()[2]);
    expect(stub()?.getAttribute("data-view")).toBe("recommend");

    await press(tabs()[2], "ArrowRight");
    expect(selectedFlags()).toEqual(["true", "false", "false"]);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it("← 키는 이전 탭(처음에서는 끝으로), Home 은 첫 탭, End 는 끝 탭이다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    tabs()[0].focus();

    await press(tabs()[0], "ArrowLeft");
    expect(selectedFlags()).toEqual(["false", "false", "true"]);
    expect(document.activeElement).toBe(tabs()[2]);

    await press(tabs()[2], "ArrowLeft");
    expect(selectedFlags()).toEqual(["false", "true", "false"]);

    await press(tabs()[1], "Home");
    expect(selectedFlags()).toEqual(["true", "false", "false"]);
    expect(document.activeElement).toBe(tabs()[0]);

    await press(tabs()[0], "End");
    expect(selectedFlags()).toEqual(["false", "false", "true"]);
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it("다른 키는 건드리지 않는다(preventDefault 안 부름)", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    tabs()[0].focus();

    expect(await press(tabs()[0], "ArrowDown")).toBe(true);
    expect(await press(tabs()[0], "Enter")).toBe(true);
    expect(await press(tabs()[0], "a")).toBe(true);
    expect(selectedFlags()).toEqual(["true", "false", "false"]);
  });

  // ── 스크롤 위치 기억 ──
  // 감춘 패널(hidden = display:none)은 브라우저가 안쪽 스크롤 위치를 0 으로 되돌린다. jsdom 에는 레이아웃이 없으니
  // 칸 하나(인스턴스)에만 스크롤 수치를 달아 주고, 「감춰지면 0 이 된다」는 것은 시험이 직접 흉내 낸다.
  const giveScrollMetrics = (el: HTMLElement, metrics: { scrollHeight: number; clientHeight: number }) => {
    let top = 0;
    Object.defineProperty(el, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v;
      },
    });
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
  };

  /** 사용자가 칸을 끌어 top 으로 옮긴 것 — scroll 이벤트는 브라우저처럼 거품 없이 칸에서 떠난다. */
  const scrollTo = async (el: HTMLElement, top: number) => {
    el.scrollTop = top;
    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
  };

  /** DB 정보 패널 안의 칸 하나(분야 탭 줄 — 탭을 오가도 같은 노드로 남는다)를 스크롤되는 목록처럼 꾸민다. */
  const dbScroller = (metrics: { scrollHeight: number; clientHeight: number }) => {
    const el = panels()[0].firstElementChild as HTMLElement | null;
    expect(el).not.toBeNull();
    giveScrollMetrics(el!, metrics);
    return el!;
  };

  it("DB 정보 — 목록을 중간까지 올려 읽다가 컨설팅 업무 현황에 갔다 오면 그 자리로 돌아온다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    const list = dbScroller({ scrollHeight: 1000, clientHeight: 200 });
    await scrollTo(list, 300);

    await click(tabs()[1]);
    expect(panels()[0].className).toBe("hidden");
    list.scrollTop = 0; // display:none 에서 브라우저가 하는 일

    await click(tabs()[0]);
    expect(panels()[0].className).not.toBe("hidden");
    expect(list.scrollTop).toBe(300);
  });

  it("DB 정보 — 맨 아래에 있던 목록은 감춰 둔 사이 내용이 늘어도 새 맨 아래로 돌아온다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    const metrics = { scrollHeight: 1000, clientHeight: 200 };
    const list = dbScroller(metrics);
    await scrollTo(list, 800); // 1000 - 800 - 200 = 0 → 맨 아래

    await click(tabs()[1]);
    list.scrollTop = 0;
    metrics.scrollHeight = 1200; // 감춰 둔 사이 기록이 더 쌓였다

    await click(tabs()[0]);
    expect(list.scrollTop).toBe(1200);
  });

  it("업무 현황 패널 — 컨설팅 업무 현황과 추천 정책이 각자 위치를 기억하고, DB 정보를 다녀와도 돌려 놓는다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), true);
    await click(tabs()[1]);
    // 업무 현황·추천 정책이 같이 쓰는 패널이 스스로 스크롤되는 칸이다.
    const workPanel = panels()[1];
    giveScrollMetrics(workPanel, { scrollHeight: 1000, clientHeight: 200 });
    await scrollTo(workPanel, 300);

    // 추천 정책으로 — 패널은 그대로 보이고 새 내용이 다른 자리에서 읽힌다.
    await click(tabs()[2]);
    expect(workPanel.className).not.toBe("hidden");
    await scrollTo(workPanel, 500);

    await click(tabs()[1]);
    expect(workPanel.scrollTop).toBe(300);
    await click(tabs()[2]);
    expect(workPanel.scrollTop).toBe(500);

    // DB 정보를 다녀오면 패널이 감춰져 0 이 되지만 각 탭 자리가 돌아온다.
    await click(tabs()[0]);
    expect(workPanel.className).toBe("hidden");
    workPanel.scrollTop = 0;
    await click(tabs()[2]);
    expect(workPanel.scrollTop).toBe(500);

    await click(tabs()[0]);
    workPanel.scrollTop = 0;
    await click(tabs()[1]);
    expect(workPanel.scrollTop).toBe(300);
  });
});

describe("큰 탭 — 휴대폰 폭", () => {
  it("같은 탭 줄을 칸 나누기로 그리고(아이콘 없음) 옛 3단추는 없다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), false);

    expect(document.querySelector('[role="tablist"]')?.className).toBe(bigTabBarClass(true));
    expect(tabs().map((t) => t.textContent)).toEqual(["DB 정보", "컨설팅 업무 현황3", "추천 정책"]);
    expect(selectedFlags()).toEqual(["true", "false", "false"]);
    expect(tabs().every((t) => t.querySelector("svg") === null)).toBe(true);

    expect(hasButtonText("정보 · 기록")).toBe(false);
    expect(hasButtonText("업무 현황")).toBe(false);
    // 합친 DB 밴드 — 기본정보 알약이 분야 탭과 한 줄에 있다.
    expect(hasButtonText("기본정보")).toBe(true);
    // 휴대폰 상자는 클래스를 붙이지 않는다.
    expect(modalBox()?.className).not.toContain("sm:w-[96vw]");
    expect(modalBox()?.className).not.toContain("sm:max-w-[716px]");
  });

  it("휴대폰에서도 업무 현황·추천 정책을 같은 방식으로 고른다", async () => {
    await mountWide(railAdapter(["track", "recommend"]), false);
    await click(tabs()[1]);
    expect(panelLog.mounts).toBe(1);
    expect(stub()?.getAttribute("data-view")).toBe("track");

    await click(tabs()[2]);
    expect(panelLog.mounts).toBe(1);
    expect(stub()?.getAttribute("data-view")).toBe("recommend");
  });
});

describe("큰 탭 — 업무 현황 조각이 없는 앱", () => {
  it("탭 줄이 없고 옛 3칸 배치가 그대로다", async () => {
    // 첫 분야를 자기 분야로 두어 오른쪽 히스토리 칸이 빈 안내만 그리게 한다.
    await mountWide(makeAdapter({}, DOMAIN_GROUPS[0].key), true);

    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(tabs()).toHaveLength(0);
    expect(panels()).toHaveLength(0);
    // 3칸 껍데기(ThreePaneShell)가 그려진다.
    expect(document.querySelector("main")).not.toBeNull();
    expect(document.querySelector("aside")).not.toBeNull();
    // 상자는 늘 96vw.
    expect(modalBox()?.className).toContain("sm:w-[96vw]");
  });

  it("휴대폰 폭에서는 옛 3단추가 그대로 있다", async () => {
    await mountWide(makeAdapter({}, DOMAIN_GROUPS[0].key), false);

    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(hasButtonText("기본정보")).toBe(true);
    expect(hasButtonText("업무 현황")).toBe(true);
    expect(hasButtonText("정보 · 기록")).toBe(true);
  });
});
