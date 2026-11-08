// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type {
  FieldOptionsBundle,
  SectionPanelProps,
  UnifiedDetailAdapter,
  UnifiedDetailApi,
  WideCenterView,
} from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import { bigTabBarClass, bigTabClass, narrowPaneTabs } from "./three-pane-layout";
import UnifiedDetailView from "./UnifiedDetailView";

// 상세창 큰 탭(2026-11-09 사장님 승인 시안 「상세창 큰 탭」)을 진짜 UnifiedDetailView 로 잰다.
// 가짜로 바꾼 것은 이 시험과 무관한 곁가지(배럴 ../index, 편집기·히스토리처럼 무거운 자식)뿐이다 —
// UnifiedDetailView.load-state.test.tsx 와 같은 가짜를 쓴다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    EditableTitle: () => createElement("span", null, "상호"),
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
vi.mock("./editors", () => ({
  EditableFieldRow: () => null,
  BasicScopeBadge: () => null,
}));
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

// ── 고정 가짜 자료 (서비스 호출 없음) ──
const ROW = { _id: "row-1", "02상호명": "가상 주식회사" } as RowData;

const DETAIL: CustomerDetailLite = {
  key: "i:tax-amendment:row-1",
  bizno: "",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [
    {
      domain: "government-subsidy",
      domainLabel: "정부지원금",
      entryId: "gs-1",
      status: "진행중",
      partner: "가상 파트너",
      row: { _id: "gs-1" },
    },
  ],
};

// 업무 현황 조각 자리의 탐침 — 마운트·언마운트 횟수를 세고, 받은 view 를 화면에 찍는다.
// 「기업상태표 열기」 단추는 조각 안에서 다른 보기로 옮기는 통로(onViewChange)다.
const stats = { mounts: 0, unmounts: 0 };
function WorkProbe({ view, onViewChange }: SectionPanelProps) {
  useEffect(() => {
    stats.mounts += 1;
    return () => {
      stats.unmounts += 1;
    };
  }, []);
  return (
    <div data-work-probe="" data-view={view}>
      <button type="button" data-probe-open-track="" onClick={() => onViewChange?.("track")}>
        기업상태표 열기
      </button>
    </div>
  );
}

function GroupProbe() {
  return <div data-group-probe="">분야 패널</div>;
}

function BadgeProbe({ selected }: { primaryRow: Record<string, unknown>; selected?: boolean }) {
  return <span data-badge={String(selected)}>3</span>;
}

type HostOptions = {
  /** 화면 폭이 1024px 이상인가 — false 면 휴대폰. */
  desktop?: boolean;
  /** 업무 현황 조각(wideCenterPanel)을 가진 앱인가. false 면 하이브·일루아 같은 레일 없는 앱. */
  rail?: boolean;
  views?: ReadonlyArray<WideCenterView>;
  badge?: boolean;
};

function buildAdapter(o: HostOptions): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => DETAIL,
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField: async () => {},
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: "tax-amendment",
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
      sectionPanels: { "government-subsidy": GroupProbe },
      ...(o.rail
        ? {
            wideCenterPanel: WorkProbe,
            ...(o.views ? { wideCenterViews: o.views } : {}),
            ...(o.badge ? { trackRailBadge: BadgeProbe } : {}),
          }
        : {}),
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
  };
  return adapter as UnifiedDetailAdapter;
}

// ── 화면 도구 ──
const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let savedMatchMedia: PropertyDescriptor | undefined;
let savedActEnv: boolean | undefined;
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

function setViewport(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// 마운트 효과의 promise 사슬과 그 결과로 생긴 상태 갱신까지 비운다.
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

async function keyDown(el: HTMLElement, key: string) {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    el.dispatchEvent(ev);
  });
  await settle();
  return ev;
}

async function mountView(o: HostOptions = {}) {
  setViewport(o.desktop ?? true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <UnifiedDetailView
        row={ROW}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        adapter={buildAdapter({ rail: true, ...o })}
        initialTab="government-subsidy"
        layout="wide"
      />,
    );
  });
  await settle();
}

const tabs = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[aria-label="상세창 탭"] [role="tab"]'));
const tabLabels = () => tabs().map((t) => t.textContent?.replace(/\d+$/, "").trim());
const tabByLabel = (label: string) => {
  const found = tabs().find((t) => t.textContent?.replace(/\d+$/, "").trim() === label);
  if (!found) throw new Error(`"${label}" 탭이 없다 — 지금 탭: ${tabLabels().join(" / ")}`);
  return found;
};
const selectedLabels = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.textContent?.replace(/\d+$/, "").trim());
const workProbes = () => document.querySelectorAll<HTMLElement>("[data-work-probe]");
const workProbeView = () => workProbes()[0]?.getAttribute("data-view");
const modalBox = () => document.querySelector<HTMLElement>(".animate-modal-in");

beforeEach(() => {
  stats.mounts = 0;
  stats.unmounts = 0;
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) })),
  );
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.unstubAllGlobals();
  if (savedMatchMedia) Object.defineProperty(window, "matchMedia", savedMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("상세창 큰 탭 — 업무 현황 조각이 있는 앱", () => {
  it("탭 순서는 DB 정보 · 컨설팅 업무 현황 · 추천 정책이고, DB 정보가 먼저 골라져 있다", async () => {
    await mountView({ views: ["track", "recommend"] });
    expect(tabLabels()).toEqual(["DB 정보", "컨설팅 업무 현황", "추천 정책"]);
    expect(selectedLabels()).toEqual(["DB 정보"]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect(document.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("상세창 탭");
  });

  it("추천 정책을 선언하지 않은 앱은 탭이 둘이다", async () => {
    await mountView();
    expect(tabLabels()).toEqual(["DB 정보", "컨설팅 업무 현황"]);
    expect(selectedLabels()).toEqual(["DB 정보"]);
  });

  it("views 에 recommend 만 있으면 DB 정보 · 추천 정책이고, 그 탭은 조각을 view=recommend 로 붙인다", async () => {
    await mountView({ views: ["recommend"] });
    expect(tabLabels()).toEqual(["DB 정보", "추천 정책"]);
    await click(tabByLabel("추천 정책"));
    expect(workProbeView()).toBe("recommend");
    expect(stats.mounts).toBe(1);
  });

  it("DB 정보 탭에는 합친 DB 띠(기본정보 알약)가 있고, 업무 현황 조각은 아직 붙지 않았다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const db = document.querySelector('[role="tabpanel"]');
    expect(db?.textContent).toContain("기본정보");
    expect(workProbes()).toHaveLength(0);
    expect(stats.mounts).toBe(0);
  });

  it("컨설팅 업무 현황을 누르면 조각이 view=track 으로 한 번 붙고 DB 정보 패널은 hidden 이 된다", async () => {
    await mountView({ views: ["track", "recommend"] });
    await click(tabByLabel("컨설팅 업무 현황"));
    expect(selectedLabels()).toEqual(["컨설팅 업무 현황"]);
    expect(workProbes()).toHaveLength(1);
    expect(workProbeView()).toBe("track");
    expect(stats.mounts).toBe(1);
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    expect(panels).toHaveLength(2);
    expect(panels[0].className).toBe("hidden");
    expect(panels[1].className).toContain("overflow-y-auto");
    expect(panels[1].className).not.toContain("hidden");
  });

  it("추천 정책은 같은 조각에 view=recommend 만 바꿔 준다 — 다시 붙이지 않는다", async () => {
    await mountView({ views: ["track", "recommend"] });
    await click(tabByLabel("컨설팅 업무 현황"));
    const first = workProbes()[0];
    await click(tabByLabel("추천 정책"));
    expect(selectedLabels()).toEqual(["추천 정책"]);
    expect(workProbes()).toHaveLength(1);
    expect(workProbes()[0]).toBe(first);
    expect(workProbeView()).toBe("recommend");
    expect(stats.mounts).toBe(1);
    expect(stats.unmounts).toBe(0);

    // DB 정보로 갔다 와도 조각은 살아 있다.
    await click(tabByLabel("DB 정보"));
    expect(workProbes()[0]).toBe(first);
    await click(tabByLabel("컨설팅 업무 현황"));
    expect(workProbes()[0]).toBe(first);
    expect(workProbeView()).toBe("track");
    expect(stats.mounts).toBe(1);
    expect(stats.unmounts).toBe(0);
  });

  it("탭 ↔ 탭패널이 id 로 이어지고, 업무 현황·추천 정책은 같은 패널을 가리킨다", async () => {
    await mountView({ views: ["track", "recommend"] });
    await click(tabByLabel("추천 정책"));
    const [dbPanel, workPanel] = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
    const db = tabByLabel("DB 정보");
    const track = tabByLabel("컨설팅 업무 현황");
    const recommend = tabByLabel("추천 정책");
    expect(db.getAttribute("aria-controls")).toBe(dbPanel.id);
    expect(dbPanel.getAttribute("aria-labelledby")).toBe(db.id);
    expect(track.getAttribute("aria-controls")).toBe(workPanel.id);
    expect(recommend.getAttribute("aria-controls")).toBe(workPanel.id);
    expect(workPanel.getAttribute("aria-labelledby")).toBe(recommend.id);
    expect(new Set([db.id, track.id, recommend.id]).size).toBe(3);
    expect(dbPanel.id).not.toBe(workPanel.id);

    await click(track);
    expect(workPanel.getAttribute("aria-labelledby")).toBe(track.id);
  });

  it("조각 안에서 onViewChange 를 부르면 큰 탭이 따라간다(추천 카드의 「기업상태표 열기」)", async () => {
    await mountView({ views: ["track", "recommend"] });
    await click(tabByLabel("추천 정책"));
    expect(workProbeView()).toBe("recommend");
    await click(document.querySelector<HTMLElement>("[data-probe-open-track]")!);
    expect(selectedLabels()).toEqual(["컨설팅 업무 현황"]);
    expect(workProbeView()).toBe("track");
    expect(stats.mounts).toBe(1);
  });

  it("ArrowRight · ArrowLeft 는 돌아가며 옮기고 포커스도 따라온다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const ev1 = await keyDown(tabByLabel("DB 정보"), "ArrowRight");
    expect(ev1.defaultPrevented).toBe(true);
    expect(selectedLabels()).toEqual(["컨설팅 업무 현황"]);
    expect(document.activeElement).toBe(tabByLabel("컨설팅 업무 현황"));
    expect(workProbeView()).toBe("track");

    await keyDown(tabByLabel("컨설팅 업무 현황"), "ArrowRight");
    expect(selectedLabels()).toEqual(["추천 정책"]);
    expect(workProbeView()).toBe("recommend");

    // 끝에서 오른쪽 → 처음
    await keyDown(tabByLabel("추천 정책"), "ArrowRight");
    expect(selectedLabels()).toEqual(["DB 정보"]);
    expect(document.activeElement).toBe(tabByLabel("DB 정보"));

    // 처음에서 왼쪽 → 끝
    await keyDown(tabByLabel("DB 정보"), "ArrowLeft");
    expect(selectedLabels()).toEqual(["추천 정책"]);
    await keyDown(tabByLabel("추천 정책"), "ArrowLeft");
    expect(selectedLabels()).toEqual(["컨설팅 업무 현황"]);
    expect(stats.mounts).toBe(1);
  });

  it("Home · End 는 처음 · 끝 탭으로 가고, 다른 키는 가로채지 않는다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const end = await keyDown(tabByLabel("DB 정보"), "End");
    expect(end.defaultPrevented).toBe(true);
    expect(selectedLabels()).toEqual(["추천 정책"]);
    expect(document.activeElement).toBe(tabByLabel("추천 정책"));

    const home = await keyDown(tabByLabel("추천 정책"), "Home");
    expect(home.defaultPrevented).toBe(true);
    expect(selectedLabels()).toEqual(["DB 정보"]);

    for (const key of ["a", "Enter", "ArrowDown", "ArrowUp", "Tab", " "]) {
      const ev = await keyDown(tabByLabel("DB 정보"), key);
      expect(ev.defaultPrevented).toBe(false);
      expect(selectedLabels()).toEqual(["DB 정보"]);
    }
  });

  it("Alt 와 같이 누른 화살표(브라우저 뒤로가기 등)는 건드리지 않는다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const ev = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true, cancelable: true });
    await act(async () => {
      tabByLabel("DB 정보").dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(selectedLabels()).toEqual(["DB 정보"]);
  });

  it("모달 상자는 DB 정보면 716 상자, 업무 현황·추천 정책이면 96vw 상자다", async () => {
    await mountView({ views: ["track", "recommend"] });
    expect(modalBox()?.className).toContain("sm:max-w-[716px]");
    expect(modalBox()?.className).not.toContain("sm:w-[96vw]");
    await click(tabByLabel("컨설팅 업무 현황"));
    expect(modalBox()?.className).toContain("sm:w-[96vw]");
    expect(modalBox()?.className).toContain("sm:max-w-[1680px]");
    await click(tabByLabel("추천 정책"));
    expect(modalBox()?.className).toContain("sm:w-[96vw]");
    await click(tabByLabel("DB 정보"));
    expect(modalBox()?.className).toContain("sm:max-w-[716px]");
  });

  it("탭 단추 · 탭 줄 className 은 순수 함수가 만든 문자열이고, 넓은 화면 탭 앞에 아이콘이 있다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const bar = document.querySelector<HTMLElement>('[role="tablist"]')!;
    expect(bar.className).toBe(bigTabBarClass(false));
    expect(tabByLabel("DB 정보").className).toBe(bigTabClass(false, true));
    expect(tabByLabel("컨설팅 업무 현황").className).toBe(bigTabClass(false, false));
    for (const t of tabs()) {
      const icon = t.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("휴대폰도 같은 큰 탭 줄과 합친 DB 띠를 쓰고, 옛 3단추는 없다", async () => {
    await mountView({ desktop: false, views: ["track", "recommend"] });
    expect(tabLabels()).toEqual(["DB 정보", "컨설팅 업무 현황", "추천 정책"]);
    expect(document.querySelector('[role="tablist"]')?.className).toBe(bigTabBarClass(true));
    expect(tabByLabel("DB 정보").className).toBe(bigTabClass(true, true));
    expect(tabs().every((t) => t.querySelector("svg") === null)).toBe(true);
    expect(document.querySelector('[role="tabpanel"]')?.textContent).toContain("기본정보");

    // 「기본정보」 는 합친 DB 띠의 알약으로 남아 있으니 옛 단추 중 「정보 · 기록」·「업무 현황」 만 없는지 본다.
    const buttonTexts = Array.from(document.querySelectorAll("button"), (b) => b.textContent?.trim());
    for (const [pane, label] of narrowPaneTabs(true)) {
      if (pane !== "basic") expect(buttonTexts).not.toContain(label);
    }

    await click(tabByLabel("추천 정책"));
    expect(workProbeView()).toBe("recommend");
    // 휴대폰은 상자 폭 클래스를 안 붙인다(전체 화면).
    expect(modalBox()?.className).not.toContain("sm:max-w-[716px]");
  });

  it("배지는 컨설팅 업무 현황 탭 안에만 있고, 그 탭이 골라졌을 때만 selected=true 를 받는다", async () => {
    await mountView({ views: ["track", "recommend"], badge: true });
    const badges = () => Array.from(document.querySelectorAll<HTMLElement>("[data-badge]"));
    expect(badges()).toHaveLength(1);
    expect(tabByLabel("컨설팅 업무 현황").contains(badges()[0])).toBe(true);
    expect(badges()[0].getAttribute("data-badge")).toBe("false");

    await click(tabByLabel("컨설팅 업무 현황"));
    expect(badges()[0].getAttribute("data-badge")).toBe("true");

    await click(tabByLabel("추천 정책"));
    expect(badges()).toHaveLength(1);
    expect(badges()[0].getAttribute("data-badge")).toBe("false");
  });

  // ── 큰 탭을 오가도 스크롤 위치가 남는다 (독립 검토 지적 P3) ──
  // jsdom 에는 배치가 없어 scrollTop 이 늘 0 이다. 그래서 칸 하나(인스턴스)에만 숫자를 가진 척하는 접근자를 달고,
  // 브라우저가 display:none 에서 하는 일(위치를 0 으로)은 시험이 직접 한다. 칸은 마운트 해제와 함께 사라지므로 따로 되돌릴 것이 없다.
  const fakeScroller = (el: HTMLElement) => {
    const m = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
    Object.defineProperty(el, "scrollTop", { configurable: true, get: () => m.scrollTop, set: (v: number) => { m.scrollTop = v; } });
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => m.scrollHeight });
    Object.defineProperty(el, "clientHeight", { configurable: true, get: () => m.clientHeight });
    return m;
  };
  const scrolled = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(new Event("scroll"));
    });
  };
  const tabPanels = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

  it("DB 정보 → 컨설팅 업무 현황 → DB 정보: 안쪽 칸이 보던 자리(중간·맨 아래)로 돌아온다", async () => {
    await mountView({ views: ["track", "recommend"] });
    const dbPanel = tabPanels()[0];
    const list = dbPanel.firstElementChild as HTMLElement | null;
    if (!list) throw new Error("DB 정보 패널이 비어 있다");
    const m = fakeScroller(list);

    // 중간쯤에서 떠난다.
    m.scrollTop = 300;
    await scrolled(list);
    await click(tabByLabel("컨설팅 업무 현황"));
    expect(dbPanel.className).toBe("hidden");
    m.scrollTop = 0;
    await click(tabByLabel("DB 정보"));
    expect(dbPanel.contains(list)).toBe(true);
    expect(m.scrollTop).toBe(300);

    // 맨 아래(새 글이 쌓이는 곳)에서 떠나면, 감춰진 사이 길이가 늘어도 맨 아래로 돌아온다.
    m.scrollTop = 800;
    await scrolled(list);
    await click(tabByLabel("컨설팅 업무 현황"));
    m.scrollTop = 0;
    m.scrollHeight = 1200;
    await click(tabByLabel("DB 정보"));
    expect(m.scrollTop).toBe(1200);
  });

  it("업무 현황 칸은 컨설팅 업무 현황과 추천 정책의 자리를 따로 기억하고, DB 정보를 다녀와도 돌려 놓는다", async () => {
    await mountView({ views: ["track", "recommend"] });
    await click(tabByLabel("컨설팅 업무 현황"));
    const work = tabPanels()[1];
    const m = fakeScroller(work);

    m.scrollTop = 300;
    await scrolled(work);
    // 같은 칸에 view 만 바꾼다 — hidden 이 아니라 위치는 그대로 남아 있고, 추천 정책에서 새로 읽던 자리를 따로 적는다.
    await click(tabByLabel("추천 정책"));
    expect(work.className).not.toContain("hidden");
    m.scrollTop = 600;
    await scrolled(work);

    await click(tabByLabel("컨설팅 업무 현황"));
    expect(m.scrollTop).toBe(300);
    await click(tabByLabel("추천 정책"));
    expect(m.scrollTop).toBe(600);

    // DB 정보를 다녀오면 칸이 hidden 이 돼 위치가 0 이 되지만, 보던 보기의 자리로 돌아온다.
    await click(tabByLabel("DB 정보"));
    expect(work.className).toBe("hidden");
    m.scrollTop = 0;
    await click(tabByLabel("추천 정책"));
    expect(m.scrollTop).toBe(600);
  });
});

describe("상세창 큰 탭 — 업무 현황 조각이 없는 앱은 지금 모습 그대로", () => {
  it("넓은 화면: 큰 탭 줄이 없다", async () => {
    await mountView({ rail: false });
    expect(document.querySelector('[aria-label="상세창 탭"]')).toBeNull();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(0);
    expect(workProbes()).toHaveLength(0);
    // 96vw 상자 그대로(716 상자는 합친 DB 띠를 쓰는 앱 전용).
    expect(modalBox()?.className).toContain("sm:w-[96vw]");
  });

  it("휴대폰: 옛 3단추가 그대로 있고 큰 탭 줄은 없다", async () => {
    await mountView({ rail: false, desktop: false });
    expect(document.querySelector('[aria-label="상세창 탭"]')).toBeNull();
    const buttonTexts = Array.from(document.querySelectorAll("button"), (b) => b.textContent?.trim());
    for (const [, label] of narrowPaneTabs(false)) expect(buttonTexts).toContain(label);
  });
});
