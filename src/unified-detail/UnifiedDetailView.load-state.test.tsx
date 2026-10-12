// @vitest-environment jsdom
import { act } from "react";
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
vi.mock("../index", () => {
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    EditableTitle: () => null,
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

function buildAdapter(c: HostCase, loadDomainRows: UnifiedDetailApi["loadDomainRows"]): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows,
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

async function mountHost(c: HostCase, outcomes: Outcome[]) {
  setViewport(c.desktop);
  let calls = 0;
  const loadDomainRows = vi.fn((): Promise<CustomerDetailLite | null> =>
    outcomes[calls++] === "fail"
      ? Promise.reject(new Error("synthetic load failure"))
      : Promise.resolve(syntheticDetail()),
  );
  const onSaved = vi.fn();
  const adapter = buildAdapter(c, loadDomainRows);

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <UnifiedDetailView
        row={ROW}
        onClose={vi.fn()}
        onSaved={onSaved}
        adapter={adapter}
        initialTab="government-subsidy"
        layout={c.layout}
      />,
    );
  });
  await settle();

  return {
    loadDomainRows,
    onSaved,
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
