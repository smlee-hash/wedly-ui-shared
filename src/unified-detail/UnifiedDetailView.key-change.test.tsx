// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import { useDetailLoadState } from "./detail-load-state";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 회사 조회 기준(사업자번호·연락처)이 바뀌었을 때 상세창이 새 기준으로 다시 불러오는지,
// 그리고 저장하는 사이 탭을 옮겨도 저장 뒤 마무리(상세창 새로고침)가 끝까지 되는지 실제 화면으로 잰다.
//
// 10/15 사고: 새 업체의 연락처를 저장하자 조회 기준이 바뀌었는데 상세창은 옛 기준으로 다시 불러와 실패했고,
// 그 사이 사용자가 정부지원금 탭으로 옮기자 저장 뒤 새로고침이 건너뛰어졌다. 그래서 계약 목록이 비어 보였다.
//
// 진짜 UnifiedDetailView 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한 곁가지(배럴 ../index, 무거운 자식)와,
// 기본정보 칸을 누를 수 있게 한 단추 하나(EditableFieldRow)뿐이다.
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
    // 기본정보 칸 하나를 누르면 그 칸에 값을 저장하는 통로(onUpdate = handleBasicUpdate)를 부른다.
    EditableFieldRow: ({ col, onUpdate }: { col: { key: string; label?: string }; onUpdate: (key: string, value: string) => unknown }) =>
      createElement(
        "button",
        { type: "button", "data-probe-field": col.key, onClick: () => { void onUpdate(col.key, "010-1111-2222"); } },
        col.label ?? col.key,
      ),
    BasicScopeBadge: () => null,
  };
});
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

// ── 고정 가짜 자료 (서비스 호출 없음) ──
const ROW_A = { _id: "row-1", "02상호명": "가상 주식회사" } as RowData;
const ROW_A_PHONE = { ...ROW_A, "04연락처": "010-1111-2222" } as RowData;
const ROW_B = { _id: "row-2", "02상호명": "다른 가상 회사" } as RowData;
const KEY_A = "i:tax-amendment:row-1";
const KEY_PHONE = "p:01011112222";
const KEY_B = "i:tax-amendment:row-2";

const detailOf = (key: string, status: string): CustomerDetailLite => ({
  key,
  bizno: "",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [
    { domain: "government-subsidy", domainLabel: "정부지원금", entryId: "gs-1", status, partner: "가상 파트너", row: { _id: "gs-1" } },
  ],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// 정부지원금 패널 자리에 들어가는 탐침 — 진짜 useDetailLoadState 가 돌려주는 값을 그대로 찍는다.
function LoadStateProbe() {
  const { rowsLoadFailed } = useDetailLoadState();
  return <span data-probe="rows-load-failed">{String(rowsLoadFailed)}</span>;
}

type Call = { key: string; d: ReturnType<typeof deferred<CustomerDetailLite | null>> };

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

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === text);
  if (found.length !== 1) throw new Error(`"${text}" 단추가 ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

function statusDots(): string[] {
  const titles = Array.from(document.querySelectorAll<HTMLElement>("span.w-2.h-2.rounded-full[title]"), (el) => el.title);
  return Array.from(new Set(titles));
}

function probeStates(): string[] {
  const texts = Array.from(document.querySelectorAll("[data-probe=rows-load-failed]"), (el) => el.textContent ?? "");
  return Array.from(new Set(texts));
}

/** 상세창을 compact 로 연다. 불러오기는 부를 때마다 직접 끝낼 수 있게 줄로 쌓는다. */
async function mountHost(opts: { initialTab?: string } = {}) {
  const calls: Call[] = [];
  const loadDomainRows = vi.fn((key: string): Promise<CustomerDetailLite | null> => {
    const d = deferred<CustomerDetailLite | null>();
    calls.push({ key, d });
    return d.promise;
  });
  const saves: Array<ReturnType<typeof deferred<void>>> = [];
  const saveOwnField = vi.fn(() => {
    const d = deferred<void>();
    saves.push(d);
    return d.promise;
  });
  const onSaved = vi.fn();
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows,
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    loadBasicStore: async () => null,
    saveBasicField: async () => null,
    saveOwnField,
  };
  const adapter = {
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
      sectionPanels: { "government-subsidy": LoadStateProbe },
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
  } as unknown as UnifiedDetailAdapter;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const view = (row: RowData) => (
    <UnifiedDetailView
      row={row}
      onClose={vi.fn()}
      onSaved={onSaved}
      adapter={adapter}
      initialTab={opts.initialTab}
      layout="compact"
    />
  );
  const render = async (row: RowData) => {
    await act(async () => {
      root.render(view(row));
    });
    await settle();
  };
  await render(ROW_A);
  // 96377b3 의 호스트에는 initialTab 이 없다 — 시작 탭이 안 먹으면 단추로 정부지원금 탭을 연다(시험 장치만 맞춤).
  if (opts.initialTab === "government-subsidy" && probeStates().length === 0) {
    await click(buttonByText("정부지원금"));
  }

  return {
    calls,
    loadDomainRows,
    saveOwnField,
    saves,
    onSaved,
    render,
    // 불러오기 n번째를 성공/실패로 끝낸다.
    async finishLoad(index: number, status: string) {
      const call = calls[index];
      if (!call) throw new Error(`불러오기 ${index + 1}번째가 아직 나가지 않았다 (지금 ${calls.length}번)`);
      await act(async () => {
        call.d.resolve(detailOf(call.key, status));
      });
      await settle();
    },
    async failLoad(index: number) {
      const call = calls[index];
      if (!call) throw new Error(`불러오기 ${index + 1}번째가 아직 나가지 않았다 (지금 ${calls.length}번)`);
      await act(async () => {
        call.d.reject(new Error("synthetic load failure"));
      });
      await settle();
    },
    keys: () => calls.map((c) => c.key),
    // 기본정보 탭에서 연락처 칸 저장을 시작한다(저장은 아직 끝나지 않음).
    async startContactSave() {
      const field = document.querySelector<HTMLElement>('[data-probe-field="04연락처"]');
      if (!field) throw new Error("연락처 칸 단추가 그려져 있지 않다");
      await click(field);
    },
    async openGovTab() {
      await click(buttonByText("정부지원금"));
    },
    async finishSave(index = 0) {
      await act(async () => {
        saves[index].resolve();
      });
      await settle();
    },
    async failSave(index = 0) {
      await act(async () => {
        saves[index].reject(new Error("synthetic save failure"));
      });
      await settle();
    },
  };
}

beforeEach(() => {
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
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

describe("조회 기준이 바뀌면 상세창이 새 기준으로 다시 불러온다", () => {
  it("연락처가 들어와 조회 기준이 바뀌면 새 기준으로 한 번 더 부른다", async () => {
    const host = await mountHost({ initialTab: "government-subsidy" });
    await host.finishLoad(0, "진행중");
    expect(host.keys()).toEqual([KEY_A]);

    await host.render(ROW_A_PHONE);
    expect(host.keys()).toEqual([KEY_A, KEY_PHONE]);
  });

  it("조회 기준이 같은 채 행 객체만 새로 와도 다시 부르지 않는다", async () => {
    const host = await mountHost({ initialTab: "government-subsidy" });
    await host.finishLoad(0, "진행중");

    await host.render({ ...ROW_A, "02상호명": "이름만 바뀜" } as RowData);
    expect(host.keys()).toEqual([KEY_A]);
  });

  it("★기준이 바뀐 뒤 늦게 도착한 옛 기준의 성공 응답은 화면에 반영하지 않는다", async () => {
    const host = await mountHost({ initialTab: "government-subsidy" });
    await host.render(ROW_A_PHONE);
    await host.finishLoad(1, "검토중");
    expect(statusDots()).toEqual(["검토중"]);

    await host.finishLoad(0, "진행중"); // 옛 기준(KEY_A)의 응답이 뒤늦게 도착
    expect(statusDots()).toEqual(["검토중"]);
    expect(probeStates()).toEqual(["false"]);
  });

  it("★기준이 바뀐 뒤 늦게 도착한 옛 기준의 실패 응답은 「못 불러옴」으로 바꾸지 않는다", async () => {
    const host = await mountHost({ initialTab: "government-subsidy" });
    await host.render(ROW_A_PHONE);
    await host.finishLoad(1, "검토중");
    expect(probeStates()).toEqual(["false"]);

    await host.failLoad(0); // 옛 기준(KEY_A)의 실패가 뒤늦게 도착
    expect(probeStates()).toEqual(["false"]);
    expect(statusDots()).toEqual(["검토중"]);
  });

  it("처음 불러오기가 실패해 오류가 떠 있어도, 새 기준으로 불러오면 오류가 걷힌다", async () => {
    const host = await mountHost({ initialTab: "government-subsidy" });
    await host.failLoad(0);
    expect(document.body.textContent).toContain("정보를 불러오지 못했습니다");

    await host.render(ROW_A_PHONE);
    await host.finishLoad(1, "진행중");
    expect(document.body.textContent).not.toContain("정보를 불러오지 못했습니다");
    expect(statusDots()).toEqual(["진행중"]);
    expect(probeStates()).toEqual(["false"]);
  });
});

describe("저장하는 사이 탭을 옮겨도 저장 뒤 마무리는 끝까지 된다", () => {
  it("(대조) 탭을 옮기지 않으면 저장 뒤 상세창을 새로 불러오고 표 새로고침도 부른다", async () => {
    const host = await mountHost();
    await host.finishLoad(0, "진행중");

    await host.startContactSave();
    expect(host.saveOwnField).toHaveBeenCalledTimes(1);
    await host.finishSave();

    expect(host.onSaved).toHaveBeenCalledTimes(1);
    expect(host.keys()).toEqual([KEY_A, KEY_A]);
  });

  it("★저장하는 사이 정부지원금 탭으로 옮겨도 저장이 끝나면 상세창을 새로 불러오고 표 새로고침을 한 번 부른다", async () => {
    const host = await mountHost();
    await host.finishLoad(0, "진행중");

    await host.startContactSave();
    await host.openGovTab();
    expect(host.onSaved).not.toHaveBeenCalled();
    await host.finishSave();

    expect(host.onSaved).toHaveBeenCalledTimes(1);
    expect(host.keys()).toEqual([KEY_A, KEY_A]);
  });

  it("저장이 실패하면 탭을 옮겼어도 마무리(새로고침)를 하지 않는다", async () => {
    const host = await mountHost();
    await host.finishLoad(0, "진행중");

    await host.startContactSave();
    await host.openGovTab();
    await host.failSave();

    expect(host.onSaved).not.toHaveBeenCalled();
    expect(host.keys()).toEqual([KEY_A]);
  });

  it("★저장하는 사이 탭을 옮기고 조회 기준도 바뀌면, 옛 저장의 마무리가 옛 기준으로 다시 부르지 않고 표 새로고침은 한 번 부른다", async () => {
    const host = await mountHost();
    await host.finishLoad(0, "진행중");

    await host.startContactSave();
    await host.openGovTab();
    await host.render(ROW_A_PHONE); // 연락처가 저장돼 조회 기준이 바뀜 → 새 기준으로 다시 부름
    await host.finishLoad(1, "검토중");
    await host.finishSave();

    // 새 기준 조회는 기준이 바뀔 때의 한 번뿐이다 — 옛 저장의 마무리가 옛 기준(KEY_A)으로 또 부르면 안 된다.
    expect(host.keys()).toEqual([KEY_A, KEY_PHONE]);
    expect(host.onSaved).toHaveBeenCalledTimes(1);
    expect(statusDots()).toEqual(["검토중"]);
  });

  it("★(회귀 방어) 저장하는 사이 다른 회사로 바뀌면, 옛 저장의 마무리는 새 회사 화면에 적용하지 않는다", async () => {
    const host = await mountHost();
    await host.finishLoad(0, "진행중");

    await host.startContactSave();
    await host.openGovTab();
    await host.render(ROW_B); // 다른 회사(_id 가 다름)로 바뀜
    const before = host.keys().length;
    await host.finishSave();

    expect(host.keys().length).toBe(before); // 옛 저장 때문에 더 부르지 않는다
    expect(host.keys()).not.toContain(KEY_PHONE);
    // 새 회사 응답이 왔다면(재조회가 있을 때) 그 화면이 그대로여야 한다.
    if (host.keys().includes(KEY_B)) {
      await host.finishLoad(host.keys().indexOf(KEY_B), "완료");
      expect(statusDots()).toEqual(["완료"]);
    }
  });
});
