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
  UnsavedBridge,
} from "./adapter-types";
import { useDetailLoadState } from "./detail-load-state";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 개발 모드(StrictMode)는 마운트 효과를 "실행 → 정리 → 재실행" 한다. 상세창의 mountedRef 가 정리에서만 false 로
// 바뀌고 재실행에서 true 로 돌아오지 않으면, 재실행 뒤에 도착하는 비동기 응답이 전부 버려진다:
//   · 처음 불러오기 — 스피너("불러오는 중...")가 안 걷히고 분야 패널이 안 그려진다(실패해도 오류 안내가 안 뜬다).
//   · 저장 뒤 조용한 새로고침(onSaved) — 현황 점·패널의 rowsLoadFailed 가 갱신되지 않는다.
//   · 상호명 저장 실패 — 안내(alert)와 되돌리기가 사라진다.
// 반대로 창이 실제로 닫힌 뒤(진짜 unmount) 늦게 도착한 응답은 여전히 버려져야 한다.
//
// 진짜 UnifiedDetailView 와 진짜 useDetailLoadState 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한
// 곁가지(배럴 ../index, 편집기·히스토리처럼 무거운 자식)와 어댑터 API 뿐이다.
// 일루아 변형이라 initialTab 이 없다 — 윗줄 분야 탭을 눌러 정부지원금으로 간다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    // 상호명 저장 통로(saveName)만 누를 수 있게 단추 하나를 둔다 — 지금 제목 값도 속성으로 노출한다.
    EditableTitle: ({ value, onSave }: { value: string; onSave: (next: string) => void }) =>
      createElement(
        "button",
        { type: "button", "data-probe-rename": "", "data-title-value": value, onClick: () => onSave("새 가상 상호") },
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
const ORIGINAL_TITLE = "가상 주식회사";
const RENAMED_TITLE = "새 가상 상호";
const LOAD_ERROR = "정보를 불러오지 못했습니다";
// 일루아는 정부지원금이 자기 분야다 — 목록 조회 열쇠에 자기 분야 이름이 들어간다.
const DETAIL_KEY = "i:government-subsidy:row-1";

const syntheticDetail = (status = "진행중"): CustomerDetailLite => ({
  key: DETAIL_KEY,
  bizno: "",
  company: ORIGINAL_TITLE,
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
  saveOwnField: UnifiedDetailApi["saveOwnField"],
  unsaved: UnsavedBridge | undefined,
): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows,
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    loadBasicStore: async () => null,
    saveOwnField,
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ILLUA",
    ownDomain: "government-subsidy",
    ownColumns: [],
    configScope: "unified-collab",
    domains: [],
    api: api as UnifiedDetailApi,
    ...(unsaved ? { unsaved } : {}),
    ownTieredFieldsPath: () => "",
    sectionSettlementBase: "",
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
    ownFileCategoryKey: "첨부파일",
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

// 윗줄 분야 탭 단추 — 색점(StatusDot)을 품은 단추만 센다. 오른쪽 줄의 같은 이름 「정보」 단추나
// 현황표의 분야 글자(단추 아님)와 헷갈리지 않게.
function groupTabButton(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).filter(
    (b) => b.textContent?.trim() === label && b.querySelector("span.w-2.h-2.rounded-full"),
  );
  if (found.length !== 1) throw new Error(`"${label}" 분야 탭이 ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

// 호스트의 "불러오는 중..." 표시(머리·패널 자리·현황표) 중 하나라도 떠 있는가.
function loadingShown(): boolean {
  return (document.body.textContent ?? "").includes("불러오는 중");
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

function titleValue(): string | null {
  return document.querySelector("[data-probe-rename]")?.getAttribute("data-title-value") ?? null;
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
  strict: boolean;
  /** n번째(논리 순서) 불러오기가 성공할 때 돌려줄 진행상태 — 행이 새 자료로 바뀌었는지 가린다. 없으면 "진행중". */
  statuses?: string[];
  saveOwnField?: UnifiedDetailApi["saveOwnField"];
  unsaved?: UnsavedBridge;
};

async function mountHost(c: HostCase, outcomes: Outcome[], opts: HostOptions) {
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
  const adapter = buildAdapter(c, loadDomainRows, opts.saveOwnField ?? (async () => {}), opts.unsaved);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const view = (
    <UnifiedDetailView row={ROW} onClose={vi.fn()} onSaved={onSaved} adapter={adapter} layout={c.layout} />
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
    // 윗줄 분야 탭에서 정부지원금을 연다 — 일루아 변형엔 initialTab 이 없다.
    // wide 는 이때 휴대폰이면 오른쪽 칸으로, 「정보」 배치면 오른쪽 「정보」 칸이 열린다.
    async openSubsidyTab() {
      await click(groupTabButton("정부지원금"));
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

const CASES: HostCase[] = [
  { name: "wide 데스크톱 · 가운데 칸", layout: "wide", desktop: true, infoPane: false },
  { name: "wide 데스크톱 · 오른쪽 정보 칸", layout: "wide", desktop: true, infoPane: true },
  { name: "wide 모바일 · 가운데 칸", layout: "wide", desktop: false, infoPane: false },
  { name: "wide 모바일 · 오른쪽 정보 칸", layout: "wide", desktop: false, infoPane: true },
  { name: "compact", layout: "compact", desktop: true, infoPane: false },
];

// 가운데 칸·compact 는 불러오기 오류 때 패널을 아예 안 그린다(오류 문구로 대체). 처음부터 실패하는 경우에도
// 패널을 그리는 곳은 오른쪽 정보 칸뿐이라, 패널 탐침으로 재는 시험은 거기서만 한다.
const INFO_PANE_CASES = CASES.filter((c) => c.layout === "wide" && c.infoPane);

// 닫힘 가드는 같은 mountedRef 를 쓰는 saveName 으로 잰다 — 닫힌 창에 늦게 도착한 응답은 화면 상태를
// 건드려도 눈에 보이는 흔적이 없지만, 저장 실패 안내(alert)는 흔적이 남는다. 머리(제목)는 어느 배치든 같다.
const TITLE_CASES = CASES.filter((c) => c.desktop && !c.infoPane);

// 같은 흐름을 StrictMode 없이도 한 번 돌려 "시험 장치가 멀쩡하다"를 받친다 — 이쪽은 고치기 전에도 통과해야 하고,
// StrictMode 쪽만 고치기 전에 실패해야 원인이 mountedRef 재실행으로 좁혀진다.
describe.each([
  { mode: "대조 · StrictMode 없음", strict: false },
  { mode: "StrictMode", strict: true },
])("상세창 비동기 응답 반영 — $mode", ({ strict }) => {
  const initialCalls = strict ? 2 : 1;

  it.each(CASES)("$name: 처음 불러오기 성공 자료가 스피너를 걷고 행(상태점)과 패널 탐침에 반영된다", async (c) => {
    const host = await mountHost(c, ["ok"], { strict });
    expect(loadingShown()).toBe(false);

    await host.openSubsidyTab();
    expect(loadingShown()).toBe(false);
    expect(statusDots()).toEqual(["진행중"]);
    expect(probeStates()).toEqual(["false"]);

    expect(host.loadDomainRows).toHaveBeenCalledTimes(initialCalls);
    expect(host.loadDomainRows).toHaveBeenCalledWith(DETAIL_KEY);
    expect(host.onSaved).not.toHaveBeenCalled();
  });

  it.each(CASES)("$name: 처음 불러오기가 실패하면 스피너가 걷히고 오류 안내가 뜬다", async (c) => {
    const host = await mountHost(c, ["fail"], { strict });
    expect(loadingShown()).toBe(false);
    expect(document.body.textContent).toContain(LOAD_ERROR);

    expect(host.loadDomainRows).toHaveBeenCalledTimes(initialCalls);
    expect(host.onSaved).not.toHaveBeenCalled();
  });

  it.each(CASES)(
    "$name: 저장 뒤 새로고침 성공은 행을 새 자료로 바꾸고, 실패는 true(행은 그대로), 다음 성공이 false 로 되돌린다",
    async (c) => {
      // 논리 순서: 처음 · 새로고침 성공 · 새로고침 실패(진행상태는 쓰이지 않음) · 새로고침 성공
      const host = await mountHost(c, ["ok", "ok", "fail", "ok"], {
        strict,
        statuses: ["진행중", "검토중", "진행중", "완료"],
      });
      await host.openSubsidyTab();
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

      expect(host.loadDomainRows).toHaveBeenCalledTimes(initialCalls + 3);
      expect(host.onSaved).toHaveBeenCalledTimes(3);
    },
  );

  it.each(INFO_PANE_CASES)(
    "$name: 처음 불러오기가 실패하면 패널이 true 를 보고, 다음 성공이 행을 그리며 false 로 되돌린다",
    async (c) => {
      const host = await mountHost(c, ["fail", "ok"], { strict });
      await host.openSubsidyTab();
      expect(loadingShown()).toBe(false);
      expect(statusDots()).toEqual([]);
      expect(probeStates()).toEqual(["true"]);

      await host.refreshFromPanel();
      expect(statusDots()).toEqual(["진행중"]);
      expect(probeStates()).toEqual(["false"]);

      expect(host.loadDomainRows).toHaveBeenCalledTimes(initialCalls + 1);
      expect(host.onSaved).toHaveBeenCalledTimes(1);
    },
  );
});

// 상호명 저장 실패 — 창이 열려 있으면 안내·되돌리기가 보이고, 실제로 닫힌 뒤에는 아무것도 하지 않는다.
// "닫힌 뒤" 시험은 고치기 전에도 통과한다(항상 버려지므로) — 고치면서 닫힘 가드까지 지워버리는 과교정을 잡는 용도.
describe.each([
  { mode: "대조 · StrictMode 없음", strict: false },
  { mode: "StrictMode", strict: true },
])("상호명 저장 실패 가드 — $mode", ({ strict }) => {
  it.each(TITLE_CASES)("$name: 창이 열려 있으면 늦게 도착한 저장 실패를 안내하고 제목을 되돌린다", async (c) => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(c, ["ok"], { strict, saveOwnField });

    await host.renameTitle();
    expect(saveOwnField).toHaveBeenCalledTimes(1);
    expect(saveOwnField).toHaveBeenCalledWith("row-1", "02상호명", RENAMED_TITLE);
    expect(titleValue()).toBe(RENAMED_TITLE);
    expect(alertSpy).not.toHaveBeenCalled();

    await act(async () => {
      save.reject(new Error("synthetic save failure"));
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("synthetic save failure");
    expect(titleValue()).toBe(ORIGINAL_TITLE);
  });

  it.each(TITLE_CASES)("$name: 일시 저장 실패는 보관함에 담고, 창이 열려 있으면 되돌리기가 제목을 원래대로 돌린다", async (c) => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const reports: Array<Parameters<UnsavedBridge["report"]>[0]> = [];
    const unsaved: UnsavedBridge = {
      scope: "illua",
      makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
      report: (entry) => {
        reports.push(entry);
      },
      resolve: vi.fn(),
    };
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(c, ["ok"], { strict, saveOwnField, unsaved });

    await host.renameTitle();
    expect(titleValue()).toBe(RENAMED_TITLE);

    await act(async () => {
      save.reject(Object.assign(new Error("synthetic transient failure"), { saveFailureKind: "network" }));
    });
    await settle();
    expect(reports).toHaveLength(1);
    expect(reports[0].fieldKey).toBe("02상호명");
    expect(reports[0].error).toBe("synthetic transient failure");
    // 일시 실패는 친 이름을 지우지 않고 막대에 담는다 — 경고창은 없다.
    expect(alertSpy).not.toHaveBeenCalled();
    expect(titleValue()).toBe(RENAMED_TITLE);

    await act(async () => {
      reports[0].revert?.();
    });
    expect(titleValue()).toBe(ORIGINAL_TITLE);
  });

  it.each(TITLE_CASES)("$name: 실제로 닫힌 뒤 늦게 도착한 저장 실패는 안내하지 않는다", async (c) => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(c, ["ok"], { strict, saveOwnField });

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
