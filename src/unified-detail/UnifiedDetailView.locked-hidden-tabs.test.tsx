// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 하이브 NO.771 후속 — 앱이 늘 숨기는 분야 탭(adapter.lockedHiddenTabs).
//  - 하이브 서버는 노무·기업인증·특허를 탭 설정 숨김 목록에 늘 넣고, 그 분야 저장을 403 으로 막는다.
//  - 그런데 관리자가 탭 편집의 「보임」·「초기화」를 누르면 화면 상태만 바뀌어 그 탭이 되살아났다(저장하면 403).
//  - lockedHiddenTabs 로 넘긴 분야는 위쪽 탭·탭 편집·기본정보 「전체 영역 현황」 표 어디에도 그리지 않는다.
//  - 순서를 바꿔도 그 분야는 3앱 공통 순서의 제자리를 지킨다(ERP 탭 순서가 하이브 편집 때문에 바뀌지 않게).
//  - 넘기지 않은 앱(ERP·일루아)은 예전 그대로다.
// 진짜 UnifiedDetailView·BasicInfoPanel 을 쓰고, 이 시험과 무관한 곁가지만 탐침으로 바꾼다.
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
vi.mock("./editors", async () => {
  const { createElement } = await import("react");
  return {
    EditableFieldRow: ({ col }: { col: { key: string } }) => createElement("div", { "data-probe-row": col.key }),
    BasicScopeBadge: () => null,
  };
});
vi.mock("./BasicFilesField", () => ({ default: () => null }));
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const LOCKED = ["labor-subsidy", "cert", "patent"];
const LOCKED_LABELS = ["노무", "기업인증", "특허"];

const syntheticDetail = (): CustomerDetailLite => ({
  key: "i:tax-amendment:row-1",
  bizno: "",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [],
});

function makeRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표" } as unknown as RowData;
}

type TabCfg = { topOrder?: string[]; topHidden?: string[] };

function buildAdapter(opts: { locked?: string[]; cfg?: TabCfg; saveTabConfig?: (cfg: unknown) => Promise<void> } = {}): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => syntheticDetail(),
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ success: true, data: opts.cfg ?? {} }),
    saveTabConfig: opts.saveTabConfig ?? (async () => {}),
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField: async () => {},
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "HIVE",
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
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
    ...(opts.locked ? { lockedHiddenTabs: opts.locked } : {}),
  };
  return adapter as UnifiedDetailAdapter;
}

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

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mountView(adapter: UnifiedDetailAdapter) {
  setViewport(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<UnifiedDetailView row={makeRow()} onClose={() => {}} adapter={adapter} />);
  });
  await settle();
  return container;
}

async function click(el: Element | undefined | null) {
  if (!el) throw new Error("누를 단추를 찾지 못했습니다");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

const buttonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text);
/** 위쪽 탭 줄에 그려진 분야 탭 이름(편집 모드가 아닐 때). 기본정보 현황표의 이름은 단추가 아니라 칸이라 섞이지 않는다. */
const tabLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")).map((b) => (b.textContent ?? "").trim());
/** 탭 편집 모드의 이름 입력칸 값 = 편집 줄에 나온 분야. */
const editLabels = (container: HTMLElement) => Array.from(container.querySelectorAll("input")).map((i) => i.value);
/** 기본정보 「전체 영역 현황」 표의 영역 이름. */
const overviewLabels = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("tbody tr td:first-child")).map((td) => (td.textContent ?? "").trim());

beforeEach(() => {
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  // /api/auth/me 가 운영자(ADMIN)라고 답해야 「탭 편집」이 보인다.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes("/api/auth/me") ? { role: "ADMIN" } : { success: true, data: {} }),
    })),
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

describe("UnifiedDetailView — 앱이 늘 숨기는 분야 탭(lockedHiddenTabs)", () => {
  it("위쪽 탭과 기본정보 「전체 영역 현황」 표에 그리지 않는다", async () => {
    const container = await mountView(buildAdapter({ locked: LOCKED, cfg: { topHidden: LOCKED } }));

    const tabs = tabLabels(container);
    expect(tabs).toContain("경정청구");
    expect(tabs).toContain("정부지원금");
    for (const label of LOCKED_LABELS) expect(tabs).not.toContain(label);

    const overview = overviewLabels(container);
    expect(overview).toEqual(["경정청구", "정부지원금"]);
  });

  it("★탭 편집에도 나오지 않아 「보임」으로 되살릴 수 없다", async () => {
    const container = await mountView(buildAdapter({ locked: LOCKED, cfg: { topHidden: LOCKED } }));

    await click(buttonByText(container, "탭 편집"));
    expect(editLabels(container)).toEqual(["경정청구", "정부지원금"]);
    expect(buttonByText(container, "보임")).toBeUndefined();

    await click(buttonByText(container, "완료"));
    for (const label of LOCKED_LABELS) expect(tabLabels(container)).not.toContain(label);
  });

  it("★서버 숨김 목록에 없어도(저장값만 지워져도) 늘 숨긴다", async () => {
    const container = await mountView(buildAdapter({ locked: LOCKED, cfg: { topHidden: [] } }));

    for (const label of LOCKED_LABELS) expect(tabLabels(container)).not.toContain(label);
  });

  it("★「초기화」를 눌러도 되살아나지 않는다", async () => {
    const saveTabConfig = vi.fn(async () => {});
    const container = await mountView(buildAdapter({ locked: LOCKED, cfg: { topHidden: LOCKED }, saveTabConfig }));

    await click(buttonByText(container, "탭 편집"));
    await click(buttonByText(container, "초기화"));

    expect(saveTabConfig).toHaveBeenCalledWith({ op: "reset", which: "top" });
    for (const label of LOCKED_LABELS) expect(tabLabels(container)).not.toContain(label);
    expect(overviewLabels(container)).toEqual(["경정청구", "정부지원금"]);
  });

  it("★순서를 바꿔도 늘 숨기는 분야는 3앱 공통 순서의 제자리를 지킨다", async () => {
    const saveTabConfig = vi.fn(async () => {});
    const container = await mountView(
      buildAdapter({
        locked: LOCKED,
        cfg: { topOrder: ["tax-amendment", "labor-subsidy", "government-subsidy", "cert", "patent"], topHidden: LOCKED },
        saveTabConfig,
      }),
    );

    await click(buttonByText(container, "탭 편집"));
    const pill = Array.from(container.querySelectorAll("input")).find((i) => i.value === "경정청구")?.parentElement;
    const right = pill?.querySelector('button[title="오른쪽으로"]') as HTMLButtonElement | null;
    expect(right?.disabled).toBe(false);
    await click(right);

    expect(saveTabConfig).toHaveBeenCalledWith({
      op: "order",
      which: "top",
      order: ["government-subsidy", "labor-subsidy", "tax-amendment", "cert", "patent"],
    });
    expect(editLabels(container)).toEqual(["정부지원금", "경정청구"]);
    // 보이는 마지막 분야의 ▶ 는 막힌다(뒤에 숨은 분야가 있어도).
    const lastPill = Array.from(container.querySelectorAll("input")).find((i) => i.value === "경정청구")?.parentElement;
    expect((lastPill?.querySelector('button[title="오른쪽으로"]') as HTMLButtonElement | null)?.disabled).toBe(true);
  });

  it("lockedHiddenTabs 를 넘기지 않으면 예전 그대로 — 숨긴 탭도 탭 편집에 보이고 「보임」으로 다시 켤 수 있다", async () => {
    const saveTabConfig = vi.fn(async () => {});
    const container = await mountView(buildAdapter({ cfg: { topHidden: ["cert"] }, saveTabConfig }));

    expect(tabLabels(container)).not.toContain("기업인증");
    expect(overviewLabels(container)).toEqual(["경정청구", "정부지원금", "노무", "기업인증", "특허"]);

    await click(buttonByText(container, "탭 편집"));
    expect(editLabels(container)).toEqual(["경정청구", "정부지원금", "노무", "기업인증", "특허"]);
    await click(buttonByText(container, "보임"));
    expect(saveTabConfig).toHaveBeenCalledWith({ op: "hidden", which: "top", hidden: [] });

    await click(buttonByText(container, "완료"));
    expect(tabLabels(container)).toContain("기업인증");
  });
});
