// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import type { ReportRegenStatus } from "./ReportRegenerateControl";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.611 — 기본정보 「리포트」 칸 아래에 「리포트 최신 버전으로 재생성」 단추가 붙는 자리를 잰다.
//  - adapter.reportRegenerate 가 없으면 단추도, 상태 읽기도 없다(하이브·일루아 불변).
//  - 있으면 「리포트」 칸(파일 칸) 바로 아래에 한 번만, 다른 파일 칸·신규 등록 화면에는 붙지 않는다.
//  - 재생성이 끝나면 상세창의 onSaved(파일 칸이 저장 뒤 다시 읽을 때 쓰는 것과 같은 콜백)가 한 번 불린다.
// 진짜 UnifiedDetailView·BasicInfoPanel·ReportRegenerateControl 을 쓰고, 이 시험과 무관한 곁가지(배럴 ../index, 히스토리 패널,
// 값 입력기)와 파일 칸 본체(BasicFilesField)만 탐침으로 바꾼다.
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

const BUTTON_TEXT = "리포트 최신 버전으로 재생성";
const OTHER_FILE = "서류";

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

function makeRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표", 리포트: [] } as unknown as RowData;
}

function buildAdapter(reportRegenerate?: UnifiedDetailAdapter["reportRegenerate"], extraFileColumn = false): UnifiedDetailAdapter {
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
    ...(reportRegenerate ? { reportRegenerate } : {}),
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

async function mountView(adapter: UnifiedDetailAdapter, opts: { isNew?: boolean; onSaved?: () => void } = {}) {
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
        onSaved={opts.onSaved}
        adapter={adapter}
        isNew={opts.isNew}
        layout="compact"
      />,
    );
  });
  await settle();
  return container;
}

const regenButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === BUTTON_TEXT);

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

describe("UnifiedDetailView — 리포트 재생성 단추 자리", () => {
  it("adapter.reportRegenerate 가 없으면 단추가 그려지지 않는다(파일 칸은 그대로)", async () => {
    const container = await mountView(buildAdapter());

    expect(container.querySelectorAll('[data-probe="files"]').length).toBe(1);
    expect(regenButtons(container).length).toBe(0);
    expect(container.textContent).not.toContain("오늘 남은 횟수");
  });

  it("adapter.reportRegenerate 가 있으면 「리포트」 칸 파일 목록 바로 아래에 한 번 그려지고 상태를 읽는다", async () => {
    const load = vi.fn<NonNullable<UnifiedDetailAdapter["reportRegenerate"]>["load"]>(async () => idleStatus());
    const container = await mountView(buildAdapter({ load, start: vi.fn() }));

    const buttons = regenButtons(container);
    expect(buttons.length).toBe(1);
    expect(buttons[0].disabled).toBe(false);
    expect(container.textContent).toContain("오늘 남은 횟수 2/2");
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.[0]).toMatchObject({ _id: "row-1" });

    // 같은 칸(값 쪽 세로 묶음) 안에서 파일 목록 뒤에 온다.
    const files = container.querySelector('[data-probe="files"]') as HTMLElement;
    expect(files.parentElement?.contains(buttons[0])).toBe(true);
    expect(files.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("「리포트」가 아닌 다른 파일 칸 아래에는 붙지 않는다", async () => {
    const container = await mountView(buildAdapter({ load: vi.fn(async () => idleStatus()), start: vi.fn() }, true));

    expect(container.querySelectorAll('[data-probe="files"]').length).toBe(2); // 리포트 칸 + 서류 칸
    expect(regenButtons(container).length).toBe(1);
  });

  it("신규 등록 화면에는 붙지 않고 상태도 읽지 않는다", async () => {
    const load = vi.fn(async () => idleStatus());
    const container = await mountView(buildAdapter({ load, start: vi.fn() }), { isNew: true });

    expect(regenButtons(container).length).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("재생성이 끝나면 상세창의 onSaved 가 한 번 불린다", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const running = {
        ...idleStatus(),
        remaining: 1,
        used: 1,
        running: { id: "r1", phase: "p", phaseLabel: "만드는 중", startedAt: new Date().toISOString(), app: "erp" as const, actorName: "홍길동" },
      };
      const done: ReportRegenStatus = {
        ...idleStatus(),
        remaining: 1,
        used: 1,
        last: { id: "r1", status: "success", reason: null, finishedAt: new Date().toISOString() },
      };
      const load = vi.fn<NonNullable<UnifiedDetailAdapter["reportRegenerate"]>["load"]>().mockResolvedValueOnce(running).mockResolvedValue(done);
      const onSaved = vi.fn();
      await mountView(buildAdapter({ load, start: vi.fn() }), { onSaved });
      expect(onSaved).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(onSaved).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
