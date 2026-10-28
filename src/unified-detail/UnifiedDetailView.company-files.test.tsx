// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, FileMetaLite, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.611 §5 — 같은 업체의 다른 줄(정부지원·하이브 줄 등)에 붙은 리포트도 상세창 파일 목록에 함께 보이도록,
// 상세창이 불러온 업체 묶음(detail)을 앱의 getAllFiles 로 넘기고, 그 결과(회사 전체 목록)를 파일 패널에 allFiles 로 준다.
//  - 기본정보 「파일」 칸: getAllFiles(row, detail) → 팝업의 파일 패널 allFiles 와 같은 목록
//  - 넓은 화면 오른쪽 파일 칸: 같은 getAllFiles(row, detail) 결과를 allFiles 로
// 진짜 UnifiedDetailView·BasicFilesField 를 쓰고, 무관한 곁가지만 탐침으로 바꾼다.
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
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const OWN_REPORT: FileMetaLite = { name: "내 줄 리포트.pdf", url: "https://files.example/own.pdf" };
const SIBLING_REPORT: FileMetaLite = { name: "다른 줄 리포트.pdf", url: "https://files.example/sibling.pdf" };

const siblingRow = { _id: "row-2", 리포트: [{ name: SIBLING_REPORT.name, url: SIBLING_REPORT.url }] };

const companyDetail = (): CustomerDetailLite => ({
  key: "i:tax-amendment:row-1",
  bizno: "",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [{ domain: "gov-support", label: "정부지원", row: siblingRow }] as unknown as CustomerDetailLite["domainRows"],
});

function makeRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표", 리포트: [OWN_REPORT] } as unknown as RowData;
}

type PanelProps = { allFiles?: FileMetaLite[]; includeSharedFiles?: boolean };

function buildAdapter(panelCalls: PanelProps[], getAllFiles: UnifiedDetailAdapter["getAllFiles"]): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => companyDetail(),
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
      // 파일 패널 대신: 받은 props 를 적어 두는 탐침.
      ErpFilesPanel: (props: PanelProps) => {
        panelCalls.push(props);
        return null;
      },
      SectionSettlementTab: () => null,
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [{ key: "리포트", label: "리포트" }] as UnifiedDetailAdapter["ownFileFields"],
    getAllFiles,
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

async function mountView(adapter: UnifiedDetailAdapter, layout: "compact" | "wide") {
  setViewport(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<UnifiedDetailView row={makeRow()} onClose={() => {}} adapter={adapter} layout={layout} />);
  });
  await settle();
  return container;
}

// 앱 쪽 합치기를 흉내: detail 이 오면 다른 줄의 파일까지 더한다(세 앱 어댑터가 하는 일).
const companyGetAllFiles = vi.fn<UnifiedDetailAdapter["getAllFiles"]>((row, detail) => {
  const own = (row["리포트"] as FileMetaLite[] | undefined) ?? [];
  const others = (detail?.domainRows ?? []).flatMap((d) => ((d.row as Record<string, unknown>)["리포트"] as FileMetaLite[] | undefined) ?? []);
  return [...own, ...others];
});

beforeEach(() => {
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  companyGetAllFiles.mockClear();
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

describe("UnifiedDetailView — 같은 업체 모든 줄의 파일(NO.611 §5)", () => {
  it("기본정보 파일 칸이 불러온 업체 묶음(detail)을 getAllFiles 에 넘기고, 다른 줄 리포트도 보인다", async () => {
    const panelCalls: PanelProps[] = [];
    const container = await mountView(buildAdapter(panelCalls, companyGetAllFiles), "compact");

    const withDetail = companyGetAllFiles.mock.calls.filter(([, d]) => d?.domainRows?.length);
    expect(withDetail.length).toBeGreaterThan(0);
    expect(withDetail.at(-1)?.[0]).toMatchObject({ _id: "row-1" });
    expect(container.textContent).toContain(OWN_REPORT.name);
    expect(container.textContent).toContain(SIBLING_REPORT.name);
  });

  it("파일 칸 팝업의 파일 패널은 회사 전체 목록을 allFiles 로 받는다", async () => {
    const panelCalls: PanelProps[] = [];
    const container = await mountView(buildAdapter(panelCalls, companyGetAllFiles), "compact");

    const addButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "파일 추가");
    expect(addButton).toBeTruthy();
    await act(async () => {
      addButton!.click();
    });

    const last = panelCalls.at(-1);
    expect(last?.allFiles?.map((f) => f.url)).toEqual([OWN_REPORT.url, SIBLING_REPORT.url]);
  });

  it("넓은 화면 오른쪽 파일 칸도 같은 회사 전체 목록을 allFiles 로 받는다", async () => {
    const panelCalls: PanelProps[] = [];
    const container = await mountView(buildAdapter(panelCalls, companyGetAllFiles), "wide");

    // 오른쪽 칸 기본은 히스토리 — 「파일」 단추로 바꾼다.
    const filesTab = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "파일");
    expect(filesTab).toBeTruthy();
    await act(async () => {
      filesTab!.click();
    });

    const wide = panelCalls.filter((p) => p.includeSharedFiles);
    expect(wide.length).toBeGreaterThan(0);
    expect(wide.at(-1)?.allFiles?.map((f) => f.url)).toEqual([OWN_REPORT.url, SIBLING_REPORT.url]);
  });
});
