// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.543 — ERP 「컨설팅 업무 현황」 정책별 고객사 목록에서 상호명을 누르면 상세창이 「컨설팅 업무 현황」을 펼친 채로 열린다
// (initialTrackRailOpen). 안 넘기면 지금처럼 접힌 채로 연다(사장님 2026-08-27 「기본적으로는 접힌 상태」 — 하이브·일루아·ERP 다른 화면 그대로).
// 첫 값만 정한다 — 연 뒤 「접기」를 누르면 그대로 접힌다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    EditableTitle: () => createElement("span", null, "상호명"),
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
vi.mock("./editors", () => ({ EditableFieldRow: () => null, BasicScopeBadge: () => null }));
vi.mock("./BasicFilesField", () => ({ default: () => null }));
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const OWN_DOMAIN = "tax-amendment";

function TrackStub() {
  return <div data-track-stub="" />;
}

function detailOf(): CustomerDetailLite {
  return {
    key: "i:tax-amendment:row-1",
    bizno: "",
    company: "가상 주식회사",
    ceo: "가상 대표",
    phone: "",
    domainRows: [{ domain: OWN_DOMAIN, domainLabel: "경정청구", entryId: "ta-1", row: { _id: "ta-1" } }],
  };
}

function buildAdapter(trackRail: boolean, loadFails = false): UnifiedDetailAdapter {
  const components: UnifiedDetailAdapter["components"] = {
    SettlementInfoTab: () => null,
    MeetingsTab: () => null,
    ErpFilesPanel: () => null,
    SectionSettlementTab: () => null,
  };
  if (trackRail) components.wideCenterPanel = TrackStub;
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: OWN_DOMAIN,
    ownColumns: [],
    configScope: "initial-track-rail",
    domains: [{ key: OWN_DOMAIN, label: "경정청구", domains: [OWN_DOMAIN] }],
    api: {
      loadDomainRows: async () => {
        if (loadFails) throw new Error("가상 불러오기 실패");
        return detailOf();
      },
      getCachedDomainRows: () => null,
      loadTabConfig: async () => ({ data: {} }),
      saveTabConfig: async () => {},
      loadColumnConfig: async () => ({ data: {} }),
      saveColumnConfig: async () => {},
      loadManagers: async () => [],
      loadBasicStore: async () => null,
      saveOwnField: async () => {},
    } as Partial<UnifiedDetailApi> as UnifiedDetailApi,
    fieldOptions: {} as FieldOptionsBundle,
    ownTieredFieldsPath: () => "synthetic://contract-fields",
    components,
    ownFileFields: [],
    getAllFiles: () => [],
  };
  return adapter as UnifiedDetailAdapter;
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let savedMatchMedia: PropertyDescriptor | undefined;
let savedActEnv: boolean | undefined;
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

// 창 폭 흉내 — resize 로 넓음/좁음을 바꾸면 듣고 있는 쪽에 알린다.
let viewportWide = true;
const viewportListeners = new Set<() => void>();

function setViewport(desktop: boolean) {
  viewportWide = desktop;
  viewportListeners.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return viewportWide;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => viewportListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => viewportListeners.delete(listener),
      addListener: (listener: () => void) => viewportListeners.add(listener),
      removeListener: (listener: () => void) => viewportListeners.delete(listener),
      dispatchEvent: () => false,
    }),
  });
}

async function resize(desktop: boolean) {
  viewportWide = desktop;
  await act(async () => {
    for (const listener of [...viewportListeners]) listener();
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

type MountOpts = { desktop?: boolean; trackRail?: boolean; initialTrackRailOpen?: boolean; loadFails?: boolean };

async function mountView(opts: MountOpts = {}) {
  setViewport(opts.desktop ?? true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <UnifiedDetailView
        row={{ _id: "row-1", "02상호명": "가상 주식회사" } as unknown as RowData}
        onClose={() => {}}
        adapter={buildAdapter(opts.trackRail ?? true, opts.loadFails)}
        layout="wide"
        {...(opts.initialTrackRailOpen === undefined ? {} : { initialTrackRailOpen: opts.initialTrackRailOpen })}
      />,
    );
  });
  await settle();
  return container;
}

const railHandle = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button")).find((b) => (b.getAttribute("title") ?? "").startsWith("컨설팅 업무 현황"));
// 업무 현황 내용이 붙어 있고, 감춘 칸(hidden) 안에 있지 않은가.
const trackShown = (c: HTMLElement) => {
  const stub = c.querySelector("[data-track-stub]");
  return stub !== null && stub.closest(".hidden") === null;
};
// 좁은 화면 위쪽 전환 단추 중 켜진 것의 글자.
const activeNarrowButtons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button"))
    .filter((b) => b.className.includes("bg-wedly-bg-blue") && ["기본정보", "정보 · 기록", "업무 현황"].includes(b.textContent?.trim() ?? ""))
    .map((b) => b.textContent?.trim());

beforeEach(() => {
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
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  if (savedMatchMedia) Object.defineProperty(window, "matchMedia", savedMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("UnifiedDetailView — 「컨설팅 업무 현황」 펼친 채로 열기(initialTrackRailOpen, NO.543)", () => {
  it("안 넘기면 지금처럼 접힌 채로 연다", async () => {
    const c = await mountView();
    expect(railHandle(c)?.getAttribute("aria-expanded")).toBe("false");
    expect(railHandle(c)?.getAttribute("title")).toBe("컨설팅 업무 현황 펼치기");
    expect(c.querySelector("[data-track-stub]")).toBeNull();
  });

  it("넘기면 넓은 화면에서 업무 현황을 펼친 채로 연다", async () => {
    const c = await mountView({ initialTrackRailOpen: true });
    expect(railHandle(c)?.getAttribute("aria-expanded")).toBe("true");
    expect(trackShown(c)).toBe(true);
  });

  it("연 뒤 「접기」를 누르면 그대로 접힌다(첫 값만 정한다)", async () => {
    const c = await mountView({ initialTrackRailOpen: true });
    await act(async () => {
      railHandle(c)?.click();
    });
    await settle();
    expect(railHandle(c)?.getAttribute("aria-expanded")).toBe("false");
    expect(trackShown(c)).toBe(false);
  });

  it("좁은 화면에서는 「업무 현황」 칸으로 시작한다", async () => {
    const c = await mountView({ desktop: false, initialTrackRailOpen: true });
    expect(activeNarrowButtons(c)).toEqual(["업무 현황"]);
    expect(trackShown(c)).toBe(true);
  });

  it("넓은 화면에서 펼쳐 연 뒤 접고 창을 좁혔다 넓혀도 접힌 그대로다", async () => {
    const c = await mountView({ initialTrackRailOpen: true });
    await act(async () => {
      railHandle(c)?.click();
    });
    await settle();
    await resize(false);
    expect(activeNarrowButtons(c)).toEqual(["기본정보"]);
    await resize(true);
    expect(railHandle(c)?.getAttribute("aria-expanded")).toBe("false");
    expect(trackShown(c)).toBe(false);
  });

  it("좁은 화면에서 펼쳐 열다 불러오기가 실패하면 오류가 보이는 칸으로 옮긴다", async () => {
    const c = await mountView({ desktop: false, initialTrackRailOpen: true, loadFails: true });
    expect(activeNarrowButtons(c)).toEqual(["정보 · 기록"]);
    const errorText = Array.from(c.querySelectorAll("div")).find((d) => d.firstChild?.textContent === "정보를 불러오지 못했습니다. 다시 시도해 주세요.");
    expect(errorText?.closest(".hidden") ?? "보임").toBe("보임");
  });

  it("좁은 화면에서 안 넘기면 지금처럼 「기본정보」 칸으로 시작한다", async () => {
    const c = await mountView({ desktop: false });
    expect(activeNarrowButtons(c)).toEqual(["기본정보"]);
  });

  it("업무 현황 조각이 없는 앱(하이브·일루아)은 넘겨도 화면이 그대로다", async () => {
    const c = await mountView({ desktop: false, trackRail: false, initialTrackRailOpen: true });
    expect(activeNarrowButtons(c)).toEqual(["기본정보"]);
    expect(railHandle(c)).toBeUndefined();
  });
});
