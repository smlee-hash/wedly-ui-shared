// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { ExtraTopTab, ExtraTopTabProps, FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import { DOMAIN_GROUPS } from "./lib/domain-config";
import UnifiedDetailView from "./UnifiedDetailView";

// NO.735 — 공용 상세창 위쪽 탭 줄에 앱이 더하는 「추가 위쪽 탭」(adapter.components.extraTopTabs) 자리를 잰다.
//  - 넓은 3칸 화면(layout="wide", 신규 아님)에서만 붙는다. 2분할(기본정보를 탭 줄에 합친 화면)이면 「기본정보」 바로 뒤,
//    아니면(좁은 화면 전환·가운데 고정 조각 없는 앱) 분야 알약 맨 앞.
//  - 눌렀을 때만 그 탭 내용을 그리고(다른 탭으로 가면 내려간다), 없으면 지금 화면 그대로다(하이브·일루아 불변).
// 진짜 UnifiedDetailView 를 쓰고, 이 시험과 무관한 곁가지(배럴 ../index, 히스토리 패널, 값 입력기, 파일 칸)만 비운다.
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

const EXTRA_LABEL = "리포트·택스봇";
const OWN_DOMAIN = "tax-amendment";
const GROUP_LABELS = DOMAIN_GROUPS.map((g) => g.label);

// 추가 탭 내용 탐침 — 그려진 횟수(mount)와 마지막으로 받은 props 를 남긴다.
const probe: { mounts: number; unmounts: number; last: ExtraTopTabProps | null } = { mounts: 0, unmounts: 0, last: null };
function Probe(props: ExtraTopTabProps) {
  useEffect(() => {
    probe.last = props;
  });
  useEffect(() => {
    probe.mounts += 1;
    return () => {
      probe.unmounts += 1;
    };
  }, []);
  return <div data-extra-probe="">{`탐침 ${props.entryId}`}</div>;
}
const EXTRA: ExtraTopTab = { key: "rt", label: EXTRA_LABEL, Component: Probe };

function CenterStub() {
  return <div data-center-stub="" />;
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

function makeRow(id = "row-1"): RowData {
  return { _id: id, "02상호명": "가상 주식회사", "03대표자명": "가상 대표" } as unknown as RowData;
}

type AdapterOpts = {
  extraTopTabs?: ExtraTopTab[];
  /** 가운데 고정 조각(업무 현황) 유무 — 있어야 넓은 화면이 2분할(기본정보를 탭 줄에 합침)이 된다. 기본 있음. */
  centerPanel?: boolean;
};

function buildAdapter(opts: AdapterOpts = {}): UnifiedDetailAdapter {
  const components: UnifiedDetailAdapter["components"] = {
    SettlementInfoTab: () => null,
    MeetingsTab: () => null,
    ErpFilesPanel: () => null,
    SectionSettlementTab: () => null,
  };
  if (opts.centerPanel !== false) components.wideCenterPanel = CenterStub;
  if (opts.extraTopTabs) components.extraTopTabs = opts.extraTopTabs;
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: OWN_DOMAIN,
    ownColumns: [],
    configScope: "extra-top-tabs",
    domains: [{ key: OWN_DOMAIN, label: "경정청구", domains: [OWN_DOMAIN] }],
    api: {
      loadDomainRows: async () => detailOf(),
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

// 운영자 여부는 상세창이 /api/auth/me 로 직접 묻는다 — 그 답만 시험이 정한다.
function stubFetch(admin: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => ({
      ok: true,
      status: 200,
      json: async () => (url === "/api/auth/me" ? { role: admin ? "ADMIN" : "USER" } : { success: true, data: {} }),
    })),
  );
}

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

type MountOpts = { layout?: "wide" | "compact"; desktop?: boolean; isNew?: boolean; admin?: boolean };

async function mountView(adapter: UnifiedDetailAdapter, opts: MountOpts = {}) {
  setViewport(opts.desktop ?? true);
  stubFetch(opts.admin ?? false);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const row = opts.isNew ? ({} as RowData) : makeRow();
  const view = (nextRow: RowData, nextAdapter: UnifiedDetailAdapter) => (
    <UnifiedDetailView
      row={nextRow}
      onClose={() => {}}
      adapter={nextAdapter}
      isNew={opts.isNew}
      layout={opts.layout ?? "wide"}
    />
  );
  await act(async () => {
    root.render(view(row, adapter));
  });
  await settle();
  return {
    container,
    row,
    /** 같은 상세창에 다른 row·어댑터를 다시 넘긴다(업체가 바뀐 경우·어댑터가 바뀐 경우). */
    async rerender(nextRow: RowData, nextAdapter: UnifiedDetailAdapter) {
      await act(async () => {
        root.render(view(nextRow, nextAdapter));
      });
      await settle();
    },
  };
}

const buttonsByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === text);

function only(container: HTMLElement, text: string): HTMLButtonElement {
  const found = buttonsByText(container, text);
  if (found.length !== 1) throw new Error(`「${text}」 단추가 ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

const extraButtons = (container: HTMLElement) => buttonsByText(container, EXTRA_LABEL);
const probeNodes = (container: HTMLElement) => container.querySelectorAll("[data-extra-probe]");

/** 2분할(기본정보를 합친) 위쪽 탭 줄 — 「분야」 구분 표식의 부모. */
function mergedTabRow(container: HTMLElement): HTMLElement {
  const row = container.querySelector('span[title="분야"]')?.parentElement;
  if (!row) throw new Error("위쪽 탭 줄(분야 구분 표식)이 없음 — 화면 구성이 바뀌었는지 확인");
  return row;
}
const rowButtons = (row: HTMLElement) =>
  Array.from(row.children).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
const rowLabels = (container: HTMLElement) => rowButtons(mergedTabRow(container)).map((b) => b.textContent ?? "");

const ACTIVE = "bg-wedly-bg-blue";

beforeEach(() => {
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  probe.mounts = 0;
  probe.unmounts = 0;
  probe.last = null;
  stubFetch(false);
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

describe("UnifiedDetailView — 추가 위쪽 탭 자리", () => {
  it("a. 넓은 화면(가운데 고정 조각 있음)에서 「기본정보」 단추 바로 다음 형제가 추가 탭이고, 처음에는 내용을 그리지 않는다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }));

    const basic = only(h.container, "기본정보");
    const extra = basic.nextElementSibling;
    expect(extra).toBeInstanceOf(HTMLButtonElement);
    expect(extra?.textContent).toBe(EXTRA_LABEL);
    expect(extra?.getAttribute("type")).toBe("button");
    // 기본정보 → 추가 탭 → 분야 구분 표식 → 분야 알약 순서.
    expect(extra?.nextElementSibling?.getAttribute("title")).toBe("분야");
    expect(rowLabels(h.container)).toEqual(["기본정보", EXTRA_LABEL, ...GROUP_LABELS]);

    expect(probeNodes(h.container)).toHaveLength(0);
    expect(probe.mounts).toBe(0);
  });

  it.each([false, true])("b. 단추를 누르면 내용이 한 번 그려지고 받은 값이 맞고 단추가 켜진다 (운영자=%s)", async (admin) => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }), { admin });
    expect(only(h.container, EXTRA_LABEL).className).not.toContain(ACTIVE);

    await click(only(h.container, EXTRA_LABEL));

    expect(probeNodes(h.container)).toHaveLength(1);
    expect(probe.mounts).toBe(1);
    expect(probe.last?.primaryRow).toBe(h.row);
    expect(probe.last?.entryId).toBe("row-1");
    expect(probe.last?.isAdmin).toBe(admin);
    expect(only(h.container, EXTRA_LABEL).className).toContain(ACTIVE);
    expect(only(h.container, "기본정보").className).not.toContain(ACTIVE);
  });

  it("c. 기본정보를 누르면 내용이 내려가고 기본정보 단추가 다시 켜진다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }));
    await click(only(h.container, EXTRA_LABEL));
    expect(probeNodes(h.container)).toHaveLength(1);

    await click(only(h.container, "기본정보"));

    expect(probeNodes(h.container)).toHaveLength(0);
    expect(probe.unmounts).toBe(1);
    expect(only(h.container, "기본정보").className).toContain(ACTIVE);
    expect(only(h.container, EXTRA_LABEL).className).not.toContain(ACTIVE);
  });

  it("c. 분야 탭을 누르면 내용이 내려가고, 켜져 있는 동안은 히스토리·파일 줄을 그리지 않는다", async () => {
    const ownLabel = DOMAIN_GROUPS.find((g) => g.key === OWN_DOMAIN)?.label;
    if (!ownLabel) throw new Error(`분야 목록에 ${OWN_DOMAIN} 이 없음`);
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }));

    await click(only(h.container, ownLabel));
    expect(buttonsByText(h.container, "히스토리").length).toBeGreaterThan(0);
    expect(buttonsByText(h.container, "파일").length).toBeGreaterThan(0);

    await click(only(h.container, EXTRA_LABEL));
    expect(probeNodes(h.container)).toHaveLength(1);
    expect(buttonsByText(h.container, "히스토리")).toHaveLength(0);
    expect(buttonsByText(h.container, "파일")).toHaveLength(0);
    expect(only(h.container, ownLabel).className).not.toContain(ACTIVE);

    await click(only(h.container, ownLabel));
    expect(probeNodes(h.container)).toHaveLength(0);
    expect(probe.unmounts).toBe(1);
    expect(only(h.container, ownLabel).className).toContain(ACTIVE);
    expect(buttonsByText(h.container, "히스토리").length).toBeGreaterThan(0);
  });

  it.each([
    ["없음", undefined],
    ["빈 목록", []],
  ] as Array<[string, ExtraTopTab[] | undefined]>)("d. extraTopTabs 가 %s 이면 추가 탭 단추가 없고 탭 줄 글자 목록이 그대로다", async (_name, tabs) => {
    const h = await mountView(buildAdapter({ extraTopTabs: tabs }));

    expect(extraButtons(h.container)).toHaveLength(0);
    expect(rowLabels(h.container)).toEqual(["기본정보", ...GROUP_LABELS]);
    expect(probeNodes(h.container)).toHaveLength(0);
  });

  it("e. compact 화면에서는 extraTopTabs 가 있어도 단추도 내용도 없다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }), { layout: "compact" });

    expect(extraButtons(h.container)).toHaveLength(0);
    expect(probeNodes(h.container)).toHaveLength(0);
    expect(probe.mounts).toBe(0);
  });

  it("e. 신규 등록 화면(넓은 화면 포함)에서도 단추가 없다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }), { isNew: true });

    expect(extraButtons(h.container)).toHaveLength(0);
    expect(probeNodes(h.container)).toHaveLength(0);
  });

  it("가운데 고정 조각이 없는 앱은 분야 알약 맨 앞에 붙고, 누르면 내용이 그려진다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA], centerPanel: false }));

    const extra = only(h.container, EXTRA_LABEL);
    expect(extra.previousElementSibling).toBeNull();
    expect(extra.nextElementSibling?.textContent).toBe(GROUP_LABELS[0]);

    await click(extra);
    expect(probeNodes(h.container)).toHaveLength(1);
    expect(probe.last?.entryId).toBe("row-1");
    expect(only(h.container, EXTRA_LABEL).className).toContain(ACTIVE);
  });

  it("좁은 화면 전환(휴대폰 폭)에서도 분야 알약 맨 앞에 붙고, 누르면 「정보 · 기록」 칸으로 맞춘다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }), { desktop: false });

    const extra = only(h.container, EXTRA_LABEL);
    expect(extra.previousElementSibling).toBeNull();
    expect(extra.nextElementSibling?.textContent).toBe(GROUP_LABELS[0]);
    expect(only(h.container, "정보 · 기록").className).not.toContain(ACTIVE);

    await click(extra);

    expect(probeNodes(h.container)).toHaveLength(1);
    expect(only(h.container, "정보 · 기록").className).toContain(ACTIVE);
    expect(only(h.container, "기본정보").className).not.toContain(ACTIVE);
  });

  it("다른 업체로 바뀌면 같은 탭 내용을 새로 그려 새 entryId 를 받는다", async () => {
    const adapter = buildAdapter({ extraTopTabs: [EXTRA] });
    const h = await mountView(adapter);
    await click(only(h.container, EXTRA_LABEL));
    expect(probe.mounts).toBe(1);
    expect(probe.last?.entryId).toBe("row-1");

    const nextRow = makeRow("row-2");
    await h.rerender(nextRow, adapter);

    expect(probeNodes(h.container)).toHaveLength(1);
    expect(probe.mounts).toBe(2);
    expect(probe.unmounts).toBe(1);
    expect(probe.last?.entryId).toBe("row-2");
    expect(probe.last?.primaryRow).toBe(nextRow);
  });

  it("켜 둔 탭이 어댑터에서 사라지면 분야 탭처럼 다뤄지지 않고 기본정보로 돌아간다", async () => {
    const h = await mountView(buildAdapter({ extraTopTabs: [EXTRA] }));
    await click(only(h.container, EXTRA_LABEL));
    expect(probeNodes(h.container)).toHaveLength(1);

    await h.rerender(h.row, buildAdapter());

    expect(extraButtons(h.container)).toHaveLength(0);
    expect(probeNodes(h.container)).toHaveLength(0);
    expect(only(h.container, "기본정보").className).toContain(ACTIVE);
  });
});
