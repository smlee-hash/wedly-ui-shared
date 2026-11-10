// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi, UnsavedBridge } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 경정청구 패널(TaxAmendmentPanel)이 저장 뒤 다시 읽은 서버 행을 차수 카드에 넣는지 잰다.
//
// 결함(2026-11-11 정산 요청 2 QA): 패널은 처음 받은 행을 한 번만 복사해 두고, 저장 뒤 조용히 다시 읽은 행
// (서버가 다시 계산한 서월·하이브·위들리 배분)을 받아들이지 않았다. 수수료 3,000,000 을 넣으면 배분이 옛 값으로 남고
// 새로고침해야 1,200,000 / 0 / 1,800,000 이 보였다.
//
// 진짜 UnifiedDetailView·GroupDomainPanel·TaxAmendmentPanel 을 쓴다. 가짜로 바꾼 것은 이 시험과 무관한 곁가지
// (배럴 ../index, 기본정보 편집기·첨부·히스토리)와 앱이 주는 두 자식뿐이다.
//   - SettlementInfoTab: 받은 rawValue 를 찍고, 단추의 data-next 글자로 onSave 를 부르는 탐침.
//   - MeetingsTab: 다른 칸 저장(미팅정보)을 일으키는 단추.
// 서버는 가짜 저장소 하나(server)다. 저장하면 서버가 "|배분" 을 붙여 다시 계산한 것처럼 값을 바꾼다.
//
// 고치기 전 실패해야 하는 시험: "저장 뒤 다시 읽은 서버 값", "저장 중 도착한 행"의 마지막 동기화,
// "잠깐 실패"의 되돌리기·다시 저장 뒤 동기화. 저장 중 입력을 지키는 단계는 고치기 전에도 통과한다(덮지 않으므로)
// — 고친 뒤에 깨지면 안 되는 보호선이다.
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

const CONTRACT = "계약정보_차수";
const MEETINGS = "_meetings";
const ENTRY = "ta-1";

type Server = Record<string, unknown>;

function detailOf(server: Server): CustomerDetailLite {
  // 부를 때마다 새 객체 — ERP 가 다시 읽은 응답과 같다.
  return {
    key: "i:tax-amendment:row-1",
    bizno: "",
    company: "가상 주식회사",
    ceo: "가상 대표",
    phone: "",
    domainRows: [{ domain: "tax-amendment", domainLabel: "경정청구", entryId: ENTRY, row: { _id: ENTRY, ...server } }],
  };
}

function primaryRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표" } as unknown as RowData;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

function only(selector: string, what: string): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(selector);
  if (found.length !== 1) throw new Error(`${what}이(가) ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

function buildAdapter(api: Partial<UnifiedDetailApi>, unsaved?: UnsavedBridge): UnifiedDetailAdapter {
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: "tax-amendment",
    ownColumns: [],
    configScope: "tax-panel-sync",
    domains: [{ key: "tax-amendment", label: "경정청구", domains: ["tax-amendment"] }],
    api: {
      getCachedDomainRows: () => null,
      loadTabConfig: async () => ({ data: {} }),
      saveTabConfig: async () => {},
      loadColumnConfig: async () => ({ data: {} }),
      saveColumnConfig: async () => {},
      loadManagers: async () => [],
      loadBasicStore: async () => null,
      ...api,
    } as UnifiedDetailApi,
    fieldOptions: {} as FieldOptionsBundle,
    ownTieredFieldsPath: () => "synthetic://contract-fields",
    components: {
      SettlementInfoTab: ({ rawValue, onSave }: { rawValue: unknown; onSave: (json: string) => unknown }) => (
        <div>
          <output data-tax-raw="">{String(rawValue)}</output>
          <button
            type="button"
            data-tax-save=""
            onClick={(e) => { void onSave(e.currentTarget.dataset.next ?? ""); }}
          >
            차수 저장
          </button>
        </div>
      ),
      MeetingsTab: ({ onSave }: { onSave: (json: string) => unknown }) => (
        <button type="button" data-meetings-save="" onClick={() => { void onSave("합성 미팅"); }}>미팅 저장</button>
      ),
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
      sectionPanels: {},
    } as unknown as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
    ...(unsaved ? { unsaved } : {}),
  };
  return adapter as UnifiedDetailAdapter;
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let savedMatchMedia: PropertyDescriptor | undefined;
let savedActEnv: boolean | undefined;
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

type Host = { name: string; layout: "wide" | "compact"; strictMode?: boolean };
const HOSTS: Host[] = [
  { name: "compact", layout: "compact" },
  { name: "wide 데스크톱", layout: "wide" },
  { name: "compact StrictMode", layout: "compact", strictMode: true },
];

async function mount(host: Host, adapter: UnifiedDetailAdapter) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const view = (
    <UnifiedDetailView
      row={primaryRow()}
      onClose={() => {}}
      onSaved={() => {}}
      adapter={adapter}
      initialTab="tax-amendment"
      layout={host.layout}
    />
  );
  await act(async () => {
    root.render(host.strictMode ? <StrictMode>{view}</StrictMode> : view);
  });
  await settle();
  const subTab = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent === label);
  async function open(label: string) {
    const tabs = subTab(label);
    if (tabs.length === 0) throw new Error(`「${label}」 하위 탭이 없음 — 화면 구성이 바뀌었는지 확인`);
    await click(tabs[0]);
  }
  await open("계약정보");
  return {
    /** 차수 카드가 받은 rawValue. */
    raw: () => only("[data-tax-raw]", "차수 카드").textContent ?? "",
    async saveContract(next: string) {
      const button = only("[data-tax-save]", "차수 저장 단추");
      button.dataset.next = next;
      await click(button);
    },
    async saveMeetings() {
      await open("미팅정보");
      await click(only("[data-meetings-save]", "미팅 저장 단추"));
      await open("계약정보");
    },
  };
}

beforeEach(() => {
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) })));
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

describe.each(HOSTS)("경정청구 패널 — 다시 읽은 서버 행 반영 ($name)", (host) => {
  it("저장 뒤 다시 읽은 서버 값(다시 계산한 배분)이 새로고침 없이 차수 카드에 들어온다", async () => {
    const server: Server = { [CONTRACT]: "A" };
    const loadDomainRows = vi.fn(async () => detailOf(server));
    const saveOwnField = vi.fn(async (_id: string, key: string, value: unknown) => {
      server[key] = `${String(value)}|배분`;
    });
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }));
    expect(h.raw()).toBe("A");

    await h.saveContract("B");

    expect(saveOwnField).toHaveBeenCalledWith(ENTRY, CONTRACT, "B");
    expect(h.raw()).toBe("B|배분");
  });

  it("저장 중 도착한 옛 행은 입력을 덮지 않고, 저장이 끝나 다시 읽으면 서버 값으로 맞춘다", async () => {
    const server: Server = { [CONTRACT]: "A" };
    const loads: Array<ReturnType<typeof deferred<CustomerDetailLite | null>>> = [];
    // 처음 여는 조회(StrictMode 는 두 번)는 바로 답하고, 그 뒤 다시 읽기만 시험이 시점을 정한다.
    let holdLoads = false;
    const loadDomainRows = vi.fn(() => {
      if (!holdLoads) return Promise.resolve(detailOf(server));
      const load = deferred<CustomerDetailLite | null>();
      loads.push(load);
      return load.promise;
    });
    const saves: Array<{ value: unknown; done: ReturnType<typeof deferred<void>> }> = [];
    const saveOwnField = vi.fn((_id: string, key: string, value: unknown) => {
      const done = deferred<void>();
      saves.push({ value, done });
      return done.promise.then(() => { server[key] = `${String(value)}|배분`; });
    });
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }));
    holdLoads = true;

    await h.saveContract("B");
    await act(async () => { saves[0].done.resolve(); });
    await settle();
    expect(loads).toHaveLength(1);
    const staleForB = detailOf(server); // 첫 저장 직후 서버 = "B|배분"

    await h.saveContract("C");
    expect(h.raw()).toBe("C");
    await act(async () => { loads[0].resolve(staleForB); });
    await settle();
    // 둘째 저장이 아직 끝나지 않았다 — 첫 저장의 다시 읽기가 지금 입력을 덮으면 안 된다.
    expect(h.raw()).toBe("C");

    await act(async () => { saves[1].done.resolve(); });
    await settle();
    expect(loads).toHaveLength(2);
    await act(async () => { loads[1].resolve(detailOf(server)); });
    await settle();
    expect(h.raw()).toBe("C|배분");
  });

  it("영구 실패로 되돌릴 때, 저장 중 서버가 바뀌었으면 옛 입력 대신 최신 서버 값을 보인다", async () => {
    const server: Server = { [CONTRACT]: "A" };
    const loads: Array<ReturnType<typeof deferred<CustomerDetailLite | null>>> = [];
    // 처음 여는 조회(StrictMode 는 두 번)는 바로 답하고, 그 뒤 다시 읽기만 시험이 시점을 정한다.
    let holdLoads = false;
    const loadDomainRows = vi.fn(() => {
      if (!holdLoads) return Promise.resolve(detailOf(server));
      const load = deferred<CustomerDetailLite | null>();
      loads.push(load);
      return load.promise;
    });
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    const saveOwnField = vi.fn((_id: string, key: string, value: unknown) => {
      const done = deferred<void>();
      saves.push(done);
      return done.promise.then(() => { server[key] = `${String(value)}|배분`; });
    });
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }));
    holdLoads = true;

    await h.saveContract("B");
    await act(async () => { saves[0].resolve(); });
    await settle();
    await h.saveContract("C");
    await act(async () => { loads[0].resolve(detailOf(server)); });
    await settle();
    expect(h.raw()).toBe("C");

    await act(async () => { saves[1].reject(new Error("규칙상 저장할 수 없는 값")); });
    await settle();
    expect(alertSpy).toHaveBeenCalledWith("규칙상 저장할 수 없는 값");
    expect(h.raw()).toBe("B|배분");
  });

  it("잠깐 실패로 보관함에 담긴 입력은 다른 칸 저장의 다시 읽기가 덮지 않고, 다시 저장이 성공하면 서버 값으로 맞춘다", async () => {
    const server: Server = { [CONTRACT]: "A", [MEETINGS]: "" };
    const loadDomainRows = vi.fn(async () => detailOf(server));
    let failContract = true;
    const saveOwnField = vi.fn(async (_id: string, key: string, value: unknown) => {
      if (key === CONTRACT && failContract) {
        failContract = false;
        throw Object.assign(new Error("잠깐 끊김"), { saveFailureKind: "transient" });
      }
      server[key] = key === CONTRACT ? `${String(value)}|배분` : value;
      // 미팅 저장이 서버의 차수 배분을 다시 계산한 것처럼(영업담당·DB분류 변경 때와 같은 경로) 바꾼다.
      if (key === MEETINGS) server[CONTRACT] = "A|서버 재계산";
    });
    const reports: Array<Parameters<UnsavedBridge["report"]>[0]> = [];
    const unsaved: UnsavedBridge = {
      scope: "tax-panel-sync",
      makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
      report: (entry) => { reports.push(entry); },
      resolve: () => {},
    };
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }, unsaved));

    await h.saveContract("B");
    expect(reports).toHaveLength(1);
    expect(h.raw()).toBe("B");

    await h.saveMeetings();
    expect(server[CONTRACT]).toBe("A|서버 재계산");
    expect(h.raw()).toBe("B");

    let ok = false;
    await act(async () => { ok = await reports[0].retry(); });
    await settle();
    expect(ok).toBe(true);
    expect(h.raw()).toBe("B|배분");
  });

  it("잠깐 실패를 되돌리면 그동안 바뀐 최신 서버 값을 보이고, 그 뒤 다시 읽기도 따라간다", async () => {
    const server: Server = { [CONTRACT]: "A", [MEETINGS]: "" };
    const loadDomainRows = vi.fn(async () => detailOf(server));
    let recomputed = 0;
    const saveOwnField = vi.fn(async (_id: string, key: string, value: unknown) => {
      if (key === CONTRACT) throw Object.assign(new Error("잠깐 끊김"), { saveFailureKind: "transient" });
      server[key] = value;
      if (key === MEETINGS) server[CONTRACT] = `A|서버 재계산 ${++recomputed}`;
    });
    const reports: Array<Parameters<UnsavedBridge["report"]>[0]> = [];
    const unsaved: UnsavedBridge = {
      scope: "tax-panel-sync",
      makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
      report: (entry) => { reports.push(entry); },
      resolve: () => {},
    };
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }, unsaved));

    await h.saveContract("B");
    await h.saveMeetings();
    expect(h.raw()).toBe("B");

    await act(async () => { reports[0].revert?.(); });
    await settle();
    expect(h.raw()).toBe("A|서버 재계산 1");

    await h.saveMeetings();
    expect(h.raw()).toBe("A|서버 재계산 2");
  });

  it("잠깐 실패 알림만 지운 뒤에는, 지키는 동안 서버가 바꾼 값을 다음 다시 읽기에서 받는다", async () => {
    const server: Server = { [CONTRACT]: "A", [MEETINGS]: "" };
    const loadDomainRows = vi.fn(async () => detailOf(server));
    const saveOwnField = vi.fn(async (_id: string, key: string, value: unknown) => {
      if (key === CONTRACT) throw Object.assign(new Error("잠깐 끊김"), { saveFailureKind: "transient" });
      server[key] = value;
      // 서버가 차수를 다시 계산해도 값은 늘 같다 — 알림을 지운 뒤의 다시 읽기는 차수 칸이 "달라지지 않은" 행을 받는다.
      if (key === MEETINGS) server[CONTRACT] = "A|서버 재계산";
    });
    const reports: Array<Parameters<UnsavedBridge["report"]>[0]> = [];
    const unsaved: UnsavedBridge = {
      scope: "tax-panel-sync",
      makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
      report: (entry) => { reports.push(entry); },
      resolve: () => {},
    };
    const h = await mount(host, buildAdapter({ loadDomainRows, saveOwnField }, unsaved));

    await h.saveContract("B");
    await h.saveMeetings();
    expect(h.raw()).toBe("B");

    // ERP 저장 알림 막대의 「알림 지우기」 — 항목만 빼고(onCleanup) 값은 되돌리지 않는다.
    await act(async () => { reports[0].onCleanup?.(); });
    await settle();
    expect(h.raw()).toBe("B");

    await h.saveMeetings();
    expect(h.raw()).toBe("A|서버 재계산");
  });

  // 같은 칸 저장이 겹치는 경로(독립 리뷰 P3, 2026-11-11): 차수 카드는 칸 하나(JSON)라 카드 안 두 칸을 잇달아 고치면
  // 같은 칸 저장 두 개가 함께 떠 있게 된다. 다시 읽기는 저장이 끝날 때만 보낸다.
  function overlapRig(applyOnCall: boolean) {
    const server: Server = { [CONTRACT]: "A" };
    const loads: Array<ReturnType<typeof deferred<CustomerDetailLite | null>>> = [];
    let holdLoads = false;
    const loadDomainRows = vi.fn(() => {
      if (!holdLoads) return Promise.resolve(detailOf(server));
      const load = deferred<CustomerDetailLite | null>();
      loads.push(load);
      return load.promise;
    });
    const saves: Array<ReturnType<typeof deferred<void>>> = [];
    const saveOwnField = vi.fn((_id: string, key: string, value: unknown) => {
      const done = deferred<void>();
      saves.push(done);
      // applyOnCall: 서버가 받은 순서대로 넣고 응답만 늦는다. 아니면 응답이 오는 순간 넣는다.
      if (applyOnCall) server[key] = `${String(value)}|배분`;
      return done.promise.then(() => { if (!applyOnCall) server[key] = `${String(value)}|배분`; });
    });
    return { server, loads, saves, loadDomainRows, saveOwnField, startHolding: () => { holdLoads = true; } };
  }

  it("같은 칸 저장 둘이 겹쳐 둘 다 거절되면, 저장 안 된 첫 입력이 아니라 처음 값으로 돌아간다", async () => {
    const rig = overlapRig(false);
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const h = await mount(host, buildAdapter({ loadDomainRows: rig.loadDomainRows, saveOwnField: rig.saveOwnField }));
    rig.startHolding();

    await h.saveContract("B");
    await h.saveContract("C");
    expect(h.raw()).toBe("C");

    // 앞 저장이 먼저 거절돼도 뒤 저장이 아직 떠 있다 — 그 입력(C)을 그대로 둔다.
    await act(async () => { rig.saves[0].reject(new Error("규칙상 저장할 수 없는 값")); });
    await settle();
    expect(h.raw()).toBe("C");

    await act(async () => { rig.saves[1].reject(new Error("규칙상 저장할 수 없는 값")); });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(h.raw()).toBe("A");
    expect(rig.loads).toHaveLength(0);
  });

  it("같은 칸 저장 둘이 겹쳐 뒤 저장만 거절되면, 아직 떠 있는 앞 저장의 입력을 보이고 그 저장이 끝나면 서버 값으로 맞춘다", async () => {
    const rig = overlapRig(false);
    vi.stubGlobal("alert", vi.fn());
    const h = await mount(host, buildAdapter({ loadDomainRows: rig.loadDomainRows, saveOwnField: rig.saveOwnField }));
    rig.startHolding();

    await h.saveContract("B");
    await h.saveContract("C");
    await act(async () => { rig.saves[1].reject(new Error("규칙상 저장할 수 없는 값")); });
    await settle();
    expect(h.raw()).toBe("B");

    await act(async () => { rig.saves[0].resolve(); });
    await settle();
    expect(rig.loads).toHaveLength(1);
    await act(async () => { rig.loads[0].resolve(detailOf(rig.server)); });
    await settle();
    expect(h.raw()).toBe("B|배분");
  });

  it("같은 칸 저장 둘이 겹쳐 앞 저장은 들어가고 뒤 저장이 거절되면, 다시 읽기가 오기 전에도 들어간 값으로 돌아간다", async () => {
    const rig = overlapRig(false);
    vi.stubGlobal("alert", vi.fn());
    const h = await mount(host, buildAdapter({ loadDomainRows: rig.loadDomainRows, saveOwnField: rig.saveOwnField }));
    rig.startHolding();

    await h.saveContract("B");
    await h.saveContract("C");
    await act(async () => { rig.saves[0].resolve(); });
    await settle();
    expect(rig.loads).toHaveLength(1);
    await act(async () => { rig.saves[1].reject(new Error("규칙상 저장할 수 없는 값")); });
    await settle();
    // 서버에는 B 가 들어갔다 — 처음 값(A)으로 돌아가면 저장된 입력이 사라진 것처럼 보인다.
    expect(h.raw()).toBe("B");

    await act(async () => { rig.loads[0].resolve(detailOf(rig.server)); });
    await settle();
    expect(h.raw()).toBe("B|배분");
  });

  it("같은 칸 저장 둘이 겹치면 두 저장이 다 끝날 때까지 입력을 지키고, 마지막 다시 읽기에서 서버 값을 받는다", async () => {
    for (const lateFirst of [false, true]) {
      const rig = overlapRig(lateFirst);
      const h = await mount(host, buildAdapter({ loadDomainRows: rig.loadDomainRows, saveOwnField: rig.saveOwnField }));
      rig.startHolding();

      await h.saveContract("B");
      await h.saveContract("C");
      // lateFirst: 뒤 저장(C)이 먼저 끝나고 앞 저장(B)의 응답이 늦게 온다. 아니면 앞 저장부터 끝난다.
      const [early, late] = lateFirst ? [rig.saves[1], rig.saves[0]] : [rig.saves[0], rig.saves[1]];
      await act(async () => { early.resolve(); });
      await settle();
      expect(rig.loads).toHaveLength(1);
      await act(async () => { rig.loads[0].resolve(detailOf(rig.server)); });
      await settle();
      // 한 저장이 아직 떠 있다 — 먼저 끝난 저장의 다시 읽기가 지금 입력(C)을 덮으면 안 된다.
      expect(h.raw()).toBe("C");

      await act(async () => { late.resolve(); });
      await settle();
      expect(rig.loads).toHaveLength(2);
      await act(async () => { rig.loads[1].resolve(detailOf(rig.server)); });
      await settle();
      expect(h.raw()).toBe(String(rig.server[CONTRACT]));
      expect(h.raw()).toBe("C|배분");

      for (const { root, container } of mounted.splice(0)) {
        await act(async () => { root.unmount(); });
        container.remove();
      }
    }
  });
});
