// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import type { ReportRegenStatus } from "./ReportRegenerateControl";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.818 — 기본정보 「리포트」 칸 아래에 「기업인증 리포트」 단추가 붙는 자리를 잰다.
//  - adapter.certReport 가 없으면 단추가 없다(재생성 단추만 쓰는 앱은 불변).
//  - 있으면 「리포트」 칸(파일 칸) 아래에 한 번만, 다른 파일 칸·신규 등록 화면에는 붙지 않는다.
//  - 재생성 통로와 함께 오면 재생성 단추 아래에, 혼자 와도(재생성 없이) 붙는다.
//  - 누르면 어댑터 download(row) 가 한 번 불린다.
// 진짜 UnifiedDetailView·BasicInfoPanel·CertReportButton·ReportRegenerateControl 을 쓰고, 이 시험과 무관한 곁가지(배럴 ../index,
// 히스토리 패널, 값 입력기)와 파일 칸 본체(BasicFilesField)만 탐침으로 바꾼다.
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
vi.mock("./BasicFilesField", async () => {
  const { createElement } = await import("react");
  return {
    // 파일 칸 본체 대신: 그려졌다는 것만 알리는 탐침.
    default: () => createElement("span", { "data-probe": "files" }),
  };
});
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const CERT_TEXT = "기업인증 리포트";
const REGEN_TEXT = "리포트 최신 버전으로 재생성";
const OTHER_FILE = "서류";

type CertAdapter = NonNullable<UnifiedDetailAdapter["certReport"]>;
type RegenAdapter = NonNullable<UnifiedDetailAdapter["reportRegenerate"]>;

const syntheticDetail = (): CustomerDetailLite => ({
  key: "i:tax-amendment:row-1",
  bizno: "",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [],
});

const idleStatus = (): ReportRegenStatus => ({
  limit: 2,
  used: 0,
  remaining: 2,
  running: null,
  last: null,
  logs: [],
  disabledReason: null,
});

const okDownload = (): CertAdapter["download"] =>
  vi.fn(async () => ({ ok: true as const, blob: new Blob(["%PDF-1.4"]), filename: "기업인증리포트_가상 주식회사.pdf" }));

function makeRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표", 리포트: [] } as unknown as RowData;
}

function buildAdapter(
  extra: { certReport?: CertAdapter; reportRegenerate?: RegenAdapter } = {},
  extraFileColumn = false,
): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => syntheticDetail(),
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: extraFileColumn ? { basicAddedColumns: [OTHER_FILE] } : {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField: async () => {},
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: "tax-amendment",
    ownColumns: extraFileColumn ? [{ key: OTHER_FILE, label: OTHER_FILE, type: "file", defaultVisible: true }] : [],
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
    ...(extra.reportRegenerate ? { reportRegenerate: extra.reportRegenerate } : {}),
    ...(extra.certReport ? { certReport: extra.certReport } : {}),
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

async function mountView(adapter: UnifiedDetailAdapter, opts: { isNew?: boolean } = {}) {
  setViewport(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <UnifiedDetailView
        row={opts.isNew ? ({} as RowData) : makeRow()}
        onClose={() => {}}
        adapter={adapter}
        isNew={opts.isNew}
        layout="compact"
      />,
    );
  });
  await settle();
  return container;
}

const buttonsOf = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === text);

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
  vi.unstubAllGlobals();
  if (savedMatchMedia) Object.defineProperty(window, "matchMedia", savedMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("UnifiedDetailView — 기업인증 리포트 단추 자리", () => {
  it("adapter.certReport 가 없으면 단추가 그려지지 않는다(파일 칸은 그대로)", async () => {
    const container = await mountView(buildAdapter());

    expect(container.querySelectorAll('[data-probe="files"]').length).toBe(1);
    expect(buttonsOf(container, CERT_TEXT).length).toBe(0);
  });

  it("재생성 통로만 있고 certReport 가 없으면 재생성 단추만 그려진다", async () => {
    const container = await mountView(buildAdapter({ reportRegenerate: { load: vi.fn(async () => idleStatus()), start: vi.fn() } }));

    expect(buttonsOf(container, REGEN_TEXT).length).toBe(1);
    expect(buttonsOf(container, CERT_TEXT).length).toBe(0);
  });

  it("adapter.certReport 가 있으면 「리포트」 칸 파일 목록 바로 아래에 한 번 그려지고, 누르기 전엔 받지 않는다", async () => {
    const download = okDownload();
    const container = await mountView(buildAdapter({ certReport: { download } }));

    const buttons = buttonsOf(container, CERT_TEXT);
    expect(buttons.length).toBe(1);
    expect(buttons[0].disabled).toBe(false);
    expect(download).not.toHaveBeenCalled();

    // 같은 칸(값 쪽 세로 묶음) 안에서 파일 목록 뒤에 온다.
    const files = container.querySelector('[data-probe="files"]') as HTMLElement;
    expect(files.parentElement?.contains(buttons[0])).toBe(true);
    expect(files.compareDocumentPosition(buttons[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // 재생성 통로가 없으니 재생성 단추는 없다.
    expect(buttonsOf(container, REGEN_TEXT).length).toBe(0);
  });

  it("재생성 통로와 함께 오면 재생성 단추 아래에 붙는다", async () => {
    const container = await mountView(
      buildAdapter({
        reportRegenerate: { load: vi.fn(async () => idleStatus()), start: vi.fn() },
        certReport: { download: okDownload() },
      }),
    );

    const regen = buttonsOf(container, REGEN_TEXT);
    const cert = buttonsOf(container, CERT_TEXT);
    expect(regen.length).toBe(1);
    expect(cert.length).toBe(1);
    expect(regen[0].compareDocumentPosition(cert[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("「리포트」가 아닌 다른 파일 칸 아래에는 붙지 않는다", async () => {
    const container = await mountView(buildAdapter({ certReport: { download: okDownload() } }, true));

    expect(container.querySelectorAll('[data-probe="files"]').length).toBe(2); // 리포트 칸 + 서류 칸
    expect(buttonsOf(container, CERT_TEXT).length).toBe(1);
  });

  it("신규 등록 화면에는 붙지 않는다", async () => {
    const container = await mountView(buildAdapter({ certReport: { download: okDownload() } }), { isNew: true });

    expect(buttonsOf(container, CERT_TEXT).length).toBe(0);
  });

  it("누르면 그 줄(row)로 download 가 한 번 불린다", async () => {
    const download = okDownload();
    const container = await mountView(buildAdapter({ certReport: { download } }));
    const createObjectURL = vi.fn(() => "blob:cert");
    const savedCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const savedRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await act(async () => {
        buttonsOf(container, CERT_TEXT)[0].click();
      });
      await settle();

      expect(download).toHaveBeenCalledTimes(1);
      expect(vi.mocked(download).mock.calls[0]?.[0]).toMatchObject({ _id: "row-1" });
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      click.mockRestore();
      if (savedCreate) Object.defineProperty(URL, "createObjectURL", savedCreate);
      else delete (URL as { createObjectURL?: unknown }).createObjectURL;
      if (savedRevoke) Object.defineProperty(URL, "revokeObjectURL", savedRevoke);
      else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });
});
