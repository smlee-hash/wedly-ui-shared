// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type {
  FieldOptionsBundle,
  SectionPanelProps,
  UnifiedDetailAdapter,
  UnifiedDetailApi,
} from "./adapter-types";
import { useDetailLoadState } from "./detail-load-state";
import type { CustomerDetailLite } from "./lib/customer-detail";
import { narrowPaneTabs } from "./three-pane-layout";
import UnifiedDetailView from "./UnifiedDetailView";

// 상세창이 "분야 행 목록을 못 불러왔다"를 아래 패널(정부지원금)까지 나르는지 실제 화면으로 잰다.
//
// 결함: 3분할(wide) 반환에는 FieldOptionsProvider 만 있고 DetailLoadStateProvider 가 없어,
// wide 에서 목록을 못 불러와도 패널은 늘 기본값 { rowsLoadFailed: false } 를 받았다.
// "행이 0건"과 구분이 안 되니 첫 메모 입력칸이 열리고, 거기 저장하면 새 계약 줄이 생긴다.
// compact 반환은 상자를 감싸고 있어 정상이었다.
//
// 진짜 UnifiedDetailView 와 진짜 useDetailLoadState 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한
// 곁가지(배럴 ../index, 편집기·히스토리처럼 무거운 자식)뿐이다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    // 상호명 저장 통로(saveName)만 누를 수 있게 단추 하나를 둔다 — 실제 편집 부품의 입력 흐름은 이 시험과 무관.
    EditableTitle: ({ onSave }: { onSave: (next: string) => void }) =>
      createElement(
        "button",
        { type: "button", "data-probe-rename": "", onClick: () => onSave("새 가상 상호") },
        "상호명 바꾸기",
      ),
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

const syntheticDetail = (status = "진행중"): CustomerDetailLite => ({
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
      status,
      partner: "가상 파트너",
      row: { _id: "gs-1" },
    },
  ],
});

// 정부지원금 패널 자리에 들어가는 탐침 — 진짜 useDetailLoadState 가 돌려주는 값을 그대로 찍고,
// 호스트가 준 onSaved 를 부르는 단추를 둔다(패널이 저장했을 때와 같은 통로).
function LoadStateProbe({ onSaved }: SectionPanelProps) {
  const { rowsLoadFailed } = useDetailLoadState();
  return (
    <div>
      <span data-probe="rows-load-failed">{String(rowsLoadFailed)}</span>
      <button type="button" data-probe-refresh="" onClick={() => onSaved?.()}>
        저장됨
      </button>
    </div>
  );
}

type Outcome = "ok" | "fail";

type HostCase = {
  name: string;
  layout: "wide" | "compact";
  /** 화면 폭이 1024px 이상인가(wide 의 3분할 동시보기) — false 면 휴대폰 전환식. */
  desktop: boolean;
  /** 패널을 오른쪽 「정보」 칸에 둔다(widePanelPlacement). 이 칸은 불러오기 오류 중에도 패널을 그린다. */
  infoPane: boolean;
};

function buildAdapter(
  c: HostCase,
  loadDomainRows: UnifiedDetailApi["loadDomainRows"],
  saveOwnField: UnifiedDetailApi["saveOwnField"] = async () => {},
): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows,
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField,
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
      sectionPanels: { "government-subsidy": LoadStateProbe },
      ...(c.infoPane ? { widePanelPlacement: { "government-subsidy": "right" as const } } : {}),
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

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent?.trim() === text);
  if (found.length !== 1) throw new Error(`"${text}" 단추가 ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

// 지금 그려진 탐침들이 찍은 값(중복 제거). 하나라도 어긋나면 값이 둘 이상 나온다.
function probeStates(): string[] {
  const texts = Array.from(document.querySelectorAll("[data-probe=rows-load-failed]"), (el) => el.textContent ?? "");
  return Array.from(new Set(texts));
}

// 지금 그려진 상태점(분야 탭·현황표 행)들의 title(중복 제거). 모두 호스트가 받은 분야 자료에서 나온다.
function statusDots(): string[] {
  const titles = Array.from(document.querySelectorAll<HTMLElement>("span.w-2.h-2.rounded-full[title]"), (el) => el.title);
  return Array.from(new Set(titles));
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

type HostOptions = {
  /** StrictMode 로 감싼다 — 개발 모드의 마운트 효과 "정리 → 재실행"을 그대로 겪는다. */
  strict?: boolean;
  /** n번째(논리 순서) 불러오기가 성공할 때 돌려줄 진행상태 — 행이 새 자료로 바뀌었는지 가린다. 없으면 "진행중". */
  statuses?: string[];
  saveOwnField?: UnifiedDetailApi["saveOwnField"];
};

async function mountHost(c: HostCase, outcomes: Outcome[], opts: HostOptions = {}) {
  setViewport(c.desktop);
  let calls = 0;
  const loadDomainRows = vi.fn((): Promise<CustomerDetailLite | null> => {
    // StrictMode 는 처음 불러오기 효과를 한 번 더 돌려 첫 호출이 두 번 나간다 — 둘 다 첫 결과로 친다.
    const n = opts.strict ? Math.max(0, calls++ - 1) : calls++;
    return outcomes[n] === "fail"
      ? Promise.reject(new Error("synthetic load failure"))
      : Promise.resolve(syntheticDetail(opts.statuses?.[n]));
  });
  const onSaved = vi.fn();
  const adapter = buildAdapter(c, loadDomainRows, opts.saveOwnField);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const view = (
    <UnifiedDetailView
      row={ROW}
      onClose={vi.fn()}
      onSaved={onSaved}
      adapter={adapter}
      initialTab="government-subsidy"
      layout={c.layout}
    />
  );
  await act(async () => {
    root.render(opts.strict ? <StrictMode>{view}</StrictMode> : view);
  });
  await settle();

  return {
    loadDomainRows,
    onSaved,
    // 진짜 닫힘 — 이후 도착하는 응답은 닫힌 창에 대한 것이다.
    async unmount() {
      const at = mounted.findIndex((m) => m.root === root);
      const [entry] = mounted.splice(at, 1);
      await act(async () => {
        entry.root.unmount();
      });
      entry.container.remove();
    },
    // 상호명을 고쳐 저장한다 — 호스트의 saveName → adapter.api.saveOwnField 통로.
    async renameTitle() {
      const button = document.querySelector<HTMLElement>("[data-probe-rename]");
      if (!button) throw new Error("상호명 탐침이 그려져 있지 않다");
      await click(button);
    },
    // 오른쪽 「정보」 칸 패널은 평범한 단추로 연다 — 휴대폰이면 「정보 · 기록」 전환 단추부터.
    async openInfoPane() {
      if (!c.infoPane) return;
      if (!c.desktop) {
        const side = narrowPaneTabs(false).find(([pane]) => pane === "side");
        if (!side) throw new Error("narrowPaneTabs 에 side 칸이 없다");
        await click(buttonByText(side[1]));
      }
      await click(buttonByText("계약정보"));
    },
    // 패널이 저장했다고 알린 것과 같은 통로: 호스트가 준 onSaved → 호스트의 조용한 새로고침.
    async refreshFromPanel() {
      const buttons = document.querySelectorAll<HTMLElement>("[data-probe-refresh]");
      if (buttons.length === 0) throw new Error("패널 탐침이 그려져 있지 않다");
      await click(buttons[buttons.length - 1]);
    },
  };
}

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

const REFRESH_CASES: HostCase[] = [
  { name: "wide 데스크톱 · 가운데 칸", layout: "wide", desktop: true, infoPane: false },
  { name: "wide 데스크톱 · 오른쪽 정보 칸", layout: "wide", desktop: true, infoPane: true },
  { name: "wide 모바일 · 가운데 칸", layout: "wide", desktop: false, infoPane: false },
  { name: "wide 모바일 · 오른쪽 정보 칸", layout: "wide", desktop: false, infoPane: true },
  { name: "compact", layout: "compact", desktop: true, infoPane: false },
];

// 가운데 칸은 불러오기 오류 때 패널을 아예 안 그린다(오류 문구로 대체). 처음부터 실패하는 경우는
// 오류 중에도 패널을 그리는 오른쪽 정보 칸에서만 잴 수 있다.
const INITIAL_FAILURE_CASES = REFRESH_CASES.filter((c) => c.layout === "wide" && c.infoPane);

describe("상세창 → 분야 패널 불러오기 실패 전달 (rowsLoadFailed)", () => {
  it.each(REFRESH_CASES)(
    "$name: 성공 뒤 조용한 새로고침이 실패하면 패널이 true 를 보고, 다음 성공이 false 로 되돌린다",
    async (c) => {
      const host = await mountHost(c, ["ok", "fail", "ok"]);
      await host.openInfoPane();
      expect(probeStates()).toEqual(["false"]);

      await host.refreshFromPanel();
      expect(probeStates()).toEqual(["true"]);

      await host.refreshFromPanel();
      expect(probeStates()).toEqual(["false"]);

      expect(host.loadDomainRows).toHaveBeenCalledTimes(3);
      expect(host.onSaved).toHaveBeenCalledTimes(2);
    },
  );

  it.each(INITIAL_FAILURE_CASES)(
    "$name: 처음 불러오기가 실패하면 떠 있는 패널이 정상 자료(false)가 아니라 true 를 본다",
    async (c) => {
      const host = await mountHost(c, ["fail", "ok"]);
      await host.openInfoPane();
      expect(probeStates()).toEqual(["true"]);

      await host.refreshFromPanel();
      expect(probeStates()).toEqual(["false"]);

      expect(host.loadDomainRows).toHaveBeenCalledTimes(2);
      expect(host.onSaved).toHaveBeenCalledTimes(1);
    },
  );
});

// ── StrictMode ──
// 개발 모드(StrictMode)는 마운트 효과를 "실행 → 정리 → 재실행" 한다. mountedRef 를 정리에서만 false 로 만들고
// 재실행에서 true 로 되돌리지 않으면, 재실행 뒤의 비동기 응답(처음 불러오기·저장 뒤 새로고침·저장 실패 안내)이
// 전부 버려진다 — 스피너가 안 걷히고, 패널은 true/false 를 영영 못 받는다.
// 위 표준 시험은 StrictMode 없이 그대로 두고, 같은 진짜 호스트·같은 탐침을 StrictMode 로 한 번 더 잰다.
// 처음 불러오기는 효과 재실행 때문에 두 번 나간다(mountHost 가 둘 다 첫 결과로 친다).
describe("StrictMode 재실행 뒤에도 비동기 응답이 반영된다", () => {
  it.each(REFRESH_CASES)("$name: 처음 불러오기 성공 자료가 행(상태점)과 패널 탐침에 반영된다", async (c) => {
    const host = await mountHost(c, ["ok"], { strict: true });
    await host.openInfoPane();
    expect(statusDots()).toEqual(["진행중"]);
    expect(probeStates()).toEqual(["false"]);

    expect(host.loadDomainRows).toHaveBeenCalledTimes(2);
    expect(host.onSaved).not.toHaveBeenCalled();
  });

  it.each(REFRESH_CASES)(
    "$name: 저장 뒤 새로고침 성공은 행을 새 자료로 바꾸고, 실패는 true(행은 그대로), 다음 성공이 false 로 되돌린다",
    async (c) => {
      // 논리 순서: 처음 · 새로고침 성공 · 새로고침 실패(진행상태는 쓰이지 않음) · 새로고침 성공
      const host = await mountHost(c, ["ok", "ok", "fail", "ok"], {
        strict: true,
        statuses: ["진행중", "검토중", "진행중", "완료"],
      });
      await host.openInfoPane();
      expect(statusDots()).toEqual(["진행중"]);
      expect(probeStates()).toEqual(["false"]);

      await host.refreshFromPanel();
      expect(statusDots()).toEqual(["검토중"]);
      expect(probeStates()).toEqual(["false"]);

      await host.refreshFromPanel();
      expect(statusDots()).toEqual(["검토중"]);
      expect(probeStates()).toEqual(["true"]);

      await host.refreshFromPanel();
      expect(statusDots()).toEqual(["완료"]);
      expect(probeStates()).toEqual(["false"]);

      expect(host.loadDomainRows).toHaveBeenCalledTimes(5);
      expect(host.onSaved).toHaveBeenCalledTimes(3);
    },
  );

  it.each(INITIAL_FAILURE_CASES)(
    "$name: 처음 불러오기가 실패하면 패널이 true 를 보고, 다음 성공이 행을 그리며 false 로 되돌린다",
    async (c) => {
      const host = await mountHost(c, ["fail", "ok"], { strict: true });
      await host.openInfoPane();
      expect(statusDots()).toEqual([]);
      expect(probeStates()).toEqual(["true"]);

      await host.refreshFromPanel();
      expect(statusDots()).toEqual(["진행중"]);
      expect(probeStates()).toEqual(["false"]);

      expect(host.loadDomainRows).toHaveBeenCalledTimes(3);
      expect(host.onSaved).toHaveBeenCalledTimes(1);
    },
  );

  // 닫힘 가드는 같은 mountedRef 를 쓰는 saveName 으로 잰다 — 닫힌 창에 늦게 도착한 응답은 화면 상태를
  // 건드려도 눈에 보이는 흔적이 없지만, 저장 실패 안내(alert)는 흔적이 남는다.
  // 닫지 않은 쌍 시험이 같은 흐름에서 안내가 실제로 뜨는 것을 보여, 아래 "안 뜸"이 빈 시험이 아님을 받친다.
  const SAVE_CASES = REFRESH_CASES.filter((c) => c.desktop && !c.infoPane);

  it.each(SAVE_CASES)("$name: 재실행 뒤 창이 열려 있으면 늦게 도착한 저장 실패를 안내한다", async (c) => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(c, ["ok"], { strict: true, saveOwnField });

    await host.renameTitle();
    expect(saveOwnField).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    await act(async () => {
      save.reject(new Error("synthetic save failure"));
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("synthetic save failure");
  });

  it.each(SAVE_CASES)("$name: 실제로 닫힌 뒤 늦게 도착한 저장 실패는 안내하지 않는다", async (c) => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(c, ["ok"], { strict: true, saveOwnField });

    await host.renameTitle();
    expect(saveOwnField).toHaveBeenCalledTimes(1);

    await host.unmount();
    await act(async () => {
      save.reject(new Error("synthetic save failure"));
    });
    await settle();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
