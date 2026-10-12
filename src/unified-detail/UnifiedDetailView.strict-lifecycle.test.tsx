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
import UnifiedDetailView from "./UnifiedDetailView";

// 상세창의 mountedRef 가 StrictMode(개발 모드 마운트 효과 "실행 → 정리 → 재실행")를 견디는지 실제 화면으로 잰다.
//
// 결함: mountedRef 를 정리(cleanup)에서만 false 로 만들고 재실행에서 true 로 되돌리지 않아, StrictMode 에서는
// 첫 마운트 직후 영영 false 로 굳는다. 그러면 loadDetail 의 응답 가드가 모든 응답을 버린다 —
// 처음 불러오기(스피너가 안 걷힘·분야 자료가 안 들어옴)도, 저장 뒤 조용한 새로고침(상태점이 안 바뀜·실패 기억 못 함)도,
// 상호명 저장 실패 안내(alert)와 되돌리기도. StrictMode 없이 쓰면 멀쩡해서 일반 시험에서는 안 드러난다.
//
// 진짜 UnifiedDetailView 와 진짜 useDetailLoadState 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한
// 곁가지(배럴 ../index, 편집기·히스토리·파일칸처럼 무거운 자식)와 서비스 호출(adapter.api)뿐이다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    // 상호명 저장 통로(saveName)만 누를 수 있게 단추를 두고, 호스트가 내려준 제목 값을 그대로 찍는다 —
    // 실제 편집 부품의 입력 흐름은 이 시험과 무관.
    EditableTitle: ({ value, onSave }: { value: string; onSave: (next: string) => void }) =>
      createElement(
        "div",
        null,
        createElement("span", { "data-probe": "title" }, value),
        createElement(
          "button",
          { type: "button", "data-probe-rename": "", onClick: () => onSave("새 가상 상호") },
          "상호명 바꾸기",
        ),
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
vi.mock("./BasicFilesField", () => ({ default: () => null }));

// ── 고정 가짜 자료 (서비스 호출 없음) ──
const ROW = { _id: "row-1", "02상호명": "가상 주식회사" } as RowData;
const ORIGINAL_TITLE = "가상 주식회사";
const RENAMED_TITLE = "새 가상 상호";
const LOADING_TEXT = "불러오는 중...";
const LOAD_ERROR_TEXT = "정보를 불러오지 못했습니다. 다시 시도해 주세요.";

const syntheticDetail = (status = "진행중"): CustomerDetailLite => ({
  key: "i:tax-amendment:row-1",
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

function buildAdapter(
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
    appName: "HIVE",
    ownDomain: "tax-amendment",
    ownColumns: [],
    configScope: "tax-amendment",
    domains: [],
    api: api as UnifiedDetailApi,
    ownTieredFieldsPath: () => "",
    sectionSettlementBase: "",
    fieldOptions: {} as FieldOptionsBundle,
    components: {
      SettlementInfoTab: () => null,
      MeetingsTab: () => null,
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
      sectionPanels: { "government-subsidy": LoadStateProbe },
    },
    ownFileFields: [],
    ownFileCategoryKey: "",
    getAllFiles: () => [],
  };
  return adapter as UnifiedDetailAdapter;
}

// ── 화면 도구 ──
const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let savedActEnv: boolean | undefined;
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

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

// 지금 그려진 탐침들이 찍은 값(중복 제거). 패널이 안 그려져 있으면 빈 배열.
function probeStates(): string[] {
  const texts = Array.from(document.querySelectorAll("[data-probe=rows-load-failed]"), (el) => el.textContent ?? "");
  return Array.from(new Set(texts));
}

// 지금 그려진 분야 탭 상태점의 title(중복 제거). 모두 호스트가 받은 분야 자료에서 나온다.
function statusDots(): string[] {
  const titles = Array.from(document.querySelectorAll<HTMLElement>("span.w-2.h-2.rounded-full[title]"), (el) => el.title);
  return Array.from(new Set(titles));
}

// 머리의 "불러오는 중..." 표시나 본문 스피너가 떠 있는가 — 처음 불러오기가 끝나지 않으면 계속 true.
function isLoading(): boolean {
  return (document.body.textContent ?? "").includes(LOADING_TEXT);
}

function hasLoadError(): boolean {
  return (document.body.textContent ?? "").includes(LOAD_ERROR_TEXT);
}

function titleText(): string {
  return document.querySelector("[data-probe=title]")?.textContent ?? "";
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
};

async function mountHost(outcomes: Outcome[], opts: HostOptions) {
  let calls = 0;
  const loadDomainRows = vi.fn((): Promise<CustomerDetailLite | null> => {
    // StrictMode 는 처음 불러오기 효과를 한 번 더 돌려 첫 호출이 두 번 나간다 — 둘 다 첫 결과로 친다.
    const n = opts.strict ? Math.max(0, calls++ - 1) : calls++;
    return outcomes[n] === "fail"
      ? Promise.reject(new Error("synthetic load failure"))
      : Promise.resolve(syntheticDetail(opts.statuses?.[n]));
  });
  const onSaved = vi.fn();
  const adapter = buildAdapter(loadDomainRows, opts.saveOwnField);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  // initialView="history": 목록 말풍선으로 여는 정식 진입 — 메인 분야(경정청구) 탭으로 시작해
  // 무거운 기본정보 패널을 띄우지 않는다(이 시험과 무관). 분야 자료에 경정청구 행이 없어 그 탭은 빈 안내만 그린다.
  const view = (
    <UnifiedDetailView row={ROW} onClose={vi.fn()} onSaved={onSaved} adapter={adapter} initialView="history" />
  );
  await act(async () => {
    root.render(opts.strict ? <StrictMode>{view}</StrictMode> : view);
  });
  await settle();

  return {
    loadDomainRows,
    onSaved,
    /** 마운트 직후 처음 불러오기가 나간 횟수 — StrictMode 가 실제로 효과를 재실행했는지도 함께 가린다. */
    initialLoads: opts.strict ? 2 : 1,
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
    // 정부지원금 분야 탭을 연다 — 어댑터가 넣은 탐침 패널이 이 탭 본문에 그려진다.
    async openSubsidyTab() {
      await click(buttonByText("정부지원금"));
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
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  // 호스트의 운영자 확인(/api/auth/me) — 운영자가 아닌 응답으로 고정.
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
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

// 같은 흐름을 StrictMode 없이도 한 번 잰다 — 일반 마운트는 결함과 무관하게 통과해야 하므로,
// StrictMode 쪽만 실패한다면 원인이 시험 도구가 아니라 마운트 효과의 정리/재실행임을 가려 준다.
describe.each([
  { mode: "일반 마운트", strict: false },
  { mode: "StrictMode", strict: true },
])("상세창 비동기 응답 반영 · $mode", ({ strict }) => {
  it("처음 불러오기 성공 자료가 스피너를 걷고 분야 상태점과 패널 탐침에 반영된다", async () => {
    const host = await mountHost(["ok"], { strict });
    expect(isLoading()).toBe(false);
    expect(hasLoadError()).toBe(false);
    expect(statusDots()).toEqual(["진행중"]);

    await host.openSubsidyTab();
    expect(isLoading()).toBe(false);
    expect(probeStates()).toEqual(["false"]);

    expect(host.loadDomainRows).toHaveBeenCalledTimes(host.initialLoads);
    expect(host.onSaved).not.toHaveBeenCalled();
  });

  it("처음 불러오기가 실패하면 스피너를 걷고 오류 안내를 보인다", async () => {
    const host = await mountHost(["fail"], { strict });
    expect(isLoading()).toBe(false);
    expect(hasLoadError()).toBe(true);
    expect(statusDots()).toEqual([]);
    // 오류 중에는 분야 본문(패널)을 그리지 않는다.
    expect(probeStates()).toEqual([]);

    expect(host.loadDomainRows).toHaveBeenCalledTimes(host.initialLoads);
  });

  it("저장 뒤 새로고침 성공은 행을 새 자료로 바꾸고, 실패는 true(행은 그대로), 다음 성공이 false 로 되돌린다", async () => {
    // 논리 순서: 처음 · 새로고침 성공 · 새로고침 실패(진행상태는 쓰이지 않음) · 새로고침 성공
    const host = await mountHost(["ok", "ok", "fail", "ok"], {
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

    // 조용한 새로고침은 스피너·오류 안내를 띄우지 않는다.
    expect(isLoading()).toBe(false);
    expect(hasLoadError()).toBe(false);
    expect(host.loadDomainRows).toHaveBeenCalledTimes(host.initialLoads + 3);
    expect(host.onSaved).toHaveBeenCalledTimes(3);
  });

  // 닫힘 가드는 상호명 저장(saveName)으로 잰다 — 닫힌 창에 늦게 도착한 응답은 화면 상태를 건드려도
  // 눈에 보이는 흔적이 없지만, 저장 실패 안내(alert)는 흔적이 남는다.
  // 닫지 않은 쌍 시험이 같은 흐름에서 안내가 실제로 뜨는 것을 보여, 아래 "안 뜸"이 빈 시험이 아님을 받친다.
  it("창이 열려 있으면 늦게 도착한 상호명 저장 실패를 안내하고 제목을 되돌린다", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(["ok"], { strict, saveOwnField });
    expect(titleText()).toBe(ORIGINAL_TITLE);

    await host.renameTitle();
    expect(saveOwnField).toHaveBeenCalledTimes(1);
    expect(titleText()).toBe(RENAMED_TITLE);
    expect(alertSpy).not.toHaveBeenCalled();

    await act(async () => {
      save.reject(new Error("synthetic save failure"));
    });
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith("synthetic save failure");
    expect(titleText()).toBe(ORIGINAL_TITLE);
  });

  it("실제로 닫힌 뒤 늦게 도착한 상호명 저장 실패는 안내하지 않는다", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    const save = deferred<void>();
    const saveOwnField = vi.fn(() => save.promise);
    const host = await mountHost(["ok"], { strict, saveOwnField });

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
