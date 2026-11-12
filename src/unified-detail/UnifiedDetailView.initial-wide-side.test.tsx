// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.732 — 알림의 「상세창 파일 탭 열기」 주소로 열면 넓은 화면 오른쪽 칸이 「파일」로 시작해야 한다(initialWideSide).
// 안 넘기면 지금처럼 「히스토리」(또는 오른쪽 「정보」 배치가 있으면 「정보」)로 시작한다 — 하이브·일루아 동작 그대로.
// 오른쪽 「정보」 배치가 있는 분야는 분야 자료가 온 뒤 보정 효과가 칸을 「정보」로 바꾸므로, 그 보정이 파일 의도를 지키는지도 잰다.
vi.mock("../index", async () => {
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
vi.mock("./editors", () => ({
  EditableFieldRow: () => null,
  BasicScopeBadge: () => null,
}));
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const ROW = { _id: "row-1", "02상호명": "가상 주식회사" } as RowData;

const syntheticDetail = (): CustomerDetailLite => ({
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
});

// 넓은 화면 오른쪽 파일 칸(includeSharedFiles)만 표식을 그린다 — 지금 화면에 붙어 있는지로 칸을 잰다.
function FilesProbe({ includeSharedFiles }: { includeSharedFiles?: boolean }) {
  return includeSharedFiles ? createElement("div", { "data-probe-wide-files": "" }) : null;
}

function buildAdapter(infoPane: boolean): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => syntheticDetail(),
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
      ErpFilesPanel: FilesProbe,
      SectionSettlementTab: () => null,
      sectionPanels: { "government-subsidy": () => createElement("div", { "data-probe-info-panel": "" }) },
      ...(infoPane ? { widePanelPlacement: { "government-subsidy": "right" as const } } : {}),
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [{ key: "첨부파일", label: "첨부파일" }] as UnifiedDetailAdapter["ownFileFields"],
    getAllFiles: () => [],
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

type ViewProps = Partial<Parameters<typeof UnifiedDetailView>[0]>;

async function mountView(infoPane: boolean, extra: ViewProps = {}) {
  setViewport(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <UnifiedDetailView
        row={ROW}
        onClose={() => {}}
        adapter={buildAdapter(infoPane)}
        layout="wide"
        // 오른쪽 「정보」 배치는 그 분야 탭이 열려 있을 때만 — 정보 배치 경우는 정부지원금 탭으로 연다.
        {...(infoPane ? { initialTab: "government-subsidy" } : {})}
        {...extra}
      />,
    );
  });
  await settle();
  return container;
}

const wideFilesShown = (c: HTMLElement) => c.querySelector("[data-probe-wide-files]") !== null;
// 오른쪽 칸 단추 중 켜진 것(굵은 파란 바탕)의 글자.
const activeSideButtons = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button"))
    .filter((b) => b.className.includes("bg-wedly-bg-blue") && ["정보", "히스토리", "파일"].includes(b.textContent?.trim() ?? ""))
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

describe("UnifiedDetailView — 처음 열 오른쪽 칸(initialWideSide, NO.732)", () => {
  it("안 넘기면 지금처럼 히스토리로 시작한다(파일 칸 없음)", async () => {
    const c = await mountView(false);
    expect(wideFilesShown(c)).toBe(false);
    expect(activeSideButtons(c)).toEqual(["히스토리"]);
  });

  it("files 면 누르지 않아도 오른쪽 파일 칸으로 시작한다", async () => {
    const c = await mountView(false, { initialWideSide: "files" });
    expect(wideFilesShown(c)).toBe(true);
    expect(activeSideButtons(c)).toEqual(["파일"]);
  });

  it("오른쪽 「정보」 배치 분야 — 안 넘기면 분야 자료가 온 뒤 정보 칸(지금 동작 그대로)", async () => {
    const c = await mountView(true);
    expect(wideFilesShown(c)).toBe(false);
    expect(c.querySelectorAll("[data-probe-info-panel]").length).toBeGreaterThan(0);
    expect(activeSideButtons(c)).toEqual([]);
  });

  it("오른쪽 「정보」 배치 분야 — files 면 분야 자료가 온 뒤에도 파일 칸을 지킨다", async () => {
    const c = await mountView(true, { initialWideSide: "files" });
    expect(wideFilesShown(c)).toBe(true);
    expect(activeSideButtons(c)).toEqual(["파일"]);
  });

  it("오른쪽 「정보」 배치 분야 — history 를 넘기면 분야 자료가 온 뒤에도 히스토리 칸을 지킨다", async () => {
    const c = await mountView(true, { initialWideSide: "history" });
    expect(wideFilesShown(c)).toBe(false);
    expect(activeSideButtons(c)).toEqual(["히스토리"]);
  });

  it("목록 말풍선(openOnHistory)이 함께 오면 히스토리가 앞선다", async () => {
    const c = await mountView(false, { initialWideSide: "files", openOnHistory: true });
    expect(wideFilesShown(c)).toBe(false);
  });

  it("처음 열린 뒤 「히스토리」 단추를 누르면 그대로 바뀐다(첫 값만 정한다)", async () => {
    const c = await mountView(true, { initialWideSide: "files" });
    const history = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.trim() === "히스토리");
    await act(async () => {
      history?.click();
    });
    await settle();
    expect(wideFilesShown(c)).toBe(false);
    expect(activeSideButtons(c)).toEqual(["히스토리"]);
  });
});
