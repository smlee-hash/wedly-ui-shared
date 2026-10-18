// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type {
  BasicRecord,
  FieldOptionsBundle,
  UnifiedDetailAdapter,
  UnifiedDetailApi,
  UnsavedBridge,
} from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 같은 회사의 "새 row 객체"가 도착했을 때 기본정보 칸(BasicInfoPanel)이 사용자의 낙관적 입력을 어떻게 다루는지 잰다.
//
// 결함: BasicInfoPanel 은 row 가 다른 객체가 되기만 하면 basicRow 를 통째로 복사한다. 저장 중이거나 방금 저장한
// 해피콜 체크(true)가, 해피콜 값은 그대로(옛 false)이고 첨부만 바뀐 새 row 에 덮여 화면 false / DB true 가 된다.
// (브라우저 재현: 저장 true 뒤 첫 첨부 보강 응답 도착, 초기 캐시 false 상세 뒤 최신 목록 도착.)
//
// 진짜 UnifiedDetailView 와 진짜 BasicInfoPanel·handleBasicUpdate 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한 곁가지
// (배럴 ../index, 히스토리 패널)와 두 자식뿐이다.
//   - EditableFieldRow: 값 입력 UI 대신, 받은 value 를 찍고 받은 onUpdate 를 부르는 탐침(입력 방식은 이 시험과 무관).
//   - BasicFilesField: 새 row 의 첨부 개수만 찍는 탐침 — 새 row 가 실제로 화면까지 도착했는지 확인하는 용도.
// 제품의 복사·병합 함수는 시험에서 다시 만들지 않는다. 기대값은 전부 화면에 찍힌 값이다.
//
// 구현 전 main 에서 실패해야 하는 시험: "낙관적 입력이 값이 같은 새 row 로 되돌려지지 않는다"(전부),
// "다른 칸 변경은 반영하고 해피콜 입력은 지킨다", "저장 중인 칸은 새 row 가 다른 값을 줘도 현재 입력을 지킨다".
// 나머지(저장 기준선, 실제 변경 반영, 다른 회사 전환, 늦은 실패)는 지금도 통과해야 하며, 고친 뒤에도 깨지면 안 되는 보호선이다.
//
// 같은 칸 연속 저장(v3) 시험은 두 저장소(행 saveOwnField + 공용 보관함 saveBasicField)를 한 시간표(calls)로 잰다.
// row 에 합성 사업자번호가 있어야 saveBasicField 가 실제로 출발하고, 공용 칸 식별자는 진짜 칸 라벨 지도(해피콜·대표자명)에서 나온다.
// 구현 전 실패해야 하는 시험: "같은 칸 연속 저장"의 순서·오래된 실패·셋 쌓임·공용 기록 실패·다른 칸 병렬(같은 칸 둘째가 새면 어긋남)·
// 오래된 재시도 시험, "저장 중 칸 보호"의 앞 두 시험, "닫힘·회사 전환 뒤의 받아들인 저장"의 닫힘/전환·다시 연 상세창 시험.
// 가장 최근 입력의 재시도·회사 전환 때 보호 해제·이전 회사의 늦은 실패 차단은 지금도 통과하는 보호선이다.
// 닫히지 않은 요청이 모듈 전체의 칸별 저장 줄을 붙잡지 않도록 afterEach 가 남은 pending 을 모두 닫는다.
//
// v4 보정 시험: "보관함 재시도 — 두 저장소와 onSaved"(재시도가 행만 다시 쓰던 v3 에서는 공용 기록·onSaved 가 빠져 실패),
// "같은 row 객체의 소유자 전환"(row 참조만 비교하던 v3 에서는 이전 입력이 남아 실패),
// "늦은 공용 보관함 조회"의 비우기 두 시험(v3 에서는 늦은 옛 조회가 비운 칸을 다시 채워 실패 — 비우지 않은 칸 채움은 그대로 통과).
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
    // 호스트가 준 onUpdate 가 실제 handleBasicUpdate 다. 단추의 data-next(JSON)를 새 값으로 넘긴다.
    EditableFieldRow: ({
      col,
      value,
      onUpdate,
    }: {
      col: { key: string };
      value: unknown;
      onUpdate: (key: string, next: string | number | boolean | null) => void;
    }) =>
      createElement(
        "div",
        { "data-probe-row": col.key },
        createElement("span", { "data-probe-value": col.key }, String(value)),
        createElement(
          "button",
          {
            type: "button",
            "data-probe-edit": col.key,
            onClick: (e: { currentTarget: HTMLElement }) =>
              onUpdate(col.key, JSON.parse(e.currentTarget.dataset.next ?? "null")),
          },
          "편집",
        ),
      ),
    BasicScopeBadge: () => null,
  };
});
vi.mock("./BasicFilesField", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ row }: { row: Record<string, unknown> }) =>
      createElement("span", { "data-probe": "files" }, String(Array.isArray(row["리포트"]) ? row["리포트"].length : 0)),
  };
});
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", () => ({ default: () => null }));
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

// ── 고정 가짜 자료 (서비스 호출 없음) ──
const FLAG = "해피콜";
const REPRESENTATIVE = "03대표자명";
const withReport = { 리포트: [{ name: "가상 보고서.pdf", url: "synthetic://report-1" }] };

// 해피콜은 기본 사양에 없는 칸이라 ownColumns 에 두고 loadColumnConfig 의 basicAddedColumns 로 기본정보에 올린다
// (표에서 끌어온 칸이 상세 기본정보에 나타나는 실제 경로).
function makeRow(over: Record<string, unknown> = {}): RowData {
  return {
    _id: "row-1",
    "02상호명": "가상 주식회사",
    [REPRESENTATIVE]: "가상 대표",
    [FLAG]: false,
    리포트: [],
    ...over,
  } as unknown as RowData;
}

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

type HostCase = {
  name: string;
  layout: "wide" | "compact";
  /** 처음 열 탭. compact 는 기본정보 탭(미지정), wide 는 기본정보가 왼쪽 고정이라 가운데는 분야 탭. */
  initialTab?: string;
};

// 기본정보 칸은 compact 의 기본정보 탭과 wide 의 왼쪽 칸에서 같은 BasicInfoPanel 로 그려진다.
const HOSTS: HostCase[] = [
  { name: "compact", layout: "compact" },
  { name: "wide 데스크톱", layout: "wide", initialTab: "government-subsidy" },
];

function buildAdapter(
  saveOwnField: UnifiedDetailApi["saveOwnField"],
  unsaved?: UnsavedBridge,
  store: Partial<UnifiedDetailApi> = {},
): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => syntheticDetail(),
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: { basicAddedColumns: [FLAG] } }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField,
    ...store,
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "ERP",
    ownDomain: "tax-amendment",
    ownColumns: [{ key: FLAG, label: "해피콜", type: "checkbox", defaultVisible: true }],
    configScope: "unified-collab",
    domains: [],
    api: api as UnifiedDetailApi,
    fieldOptions: {} as FieldOptionsBundle,
    components: {
      SettlementInfoTab: () => null,
      MeetingsTab: () => null,
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
      sectionPanels: { "government-subsidy": () => null },
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
    ...(unsaved ? { unsaved } : {}),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// 정확히 하나 그려진 탐침만 돌려준다 — 화면 구성이 바뀌면 조용히 통과하지 않고 여기서 멈춘다.
function probe(selector: string, what: string): HTMLElement {
  const found = document.querySelectorAll<HTMLElement>(selector);
  if (found.length !== 1) throw new Error(`${what}이(가) ${found.length}개 — 화면 구성이 바뀌었는지 확인`);
  return found[0];
}

// pending saveOwnField — 호출마다 하나씩 쌓이고, 시험이 원하는 때 성공/실패로 닫는다.
type PendingSave = { resolve: () => void; reject: (reason: unknown) => void };

// 같은 회사·같은 칸의 저장 줄은 모듈 전체에서 하나라, 닫히지 않은 요청이 다음 시험의 같은 칸 저장을 막을 수 있다.
// 시험이 만든 pending 은 전부 여기 등록해 두고 afterEach 에서 모두 성공으로 닫는다(이미 닫힌 것은 그대로).
const pendingLists: PendingSave[][] = [];

function saveQueue() {
  const saves: PendingSave[] = [];
  pendingLists.push(saves);
  const saveOwnField = vi.fn(() => {
    const save = deferred<void>();
    saves.push({ resolve: () => save.resolve(), reject: save.reject });
    return save.promise;
  });
  return { saveOwnField, saves };
}

// 행 저장(saveOwnField)과 공용 보관함 기록(saveBasicField) 두 저장소를 한 시간표(calls)에 적는다 — 둘 다 pending 으로 시작한다.
function twoStores() {
  const calls: string[] = [];
  const rows: PendingSave[] = [];
  const stores: PendingSave[] = [];
  pendingLists.push(rows, stores);
  const saveOwnField = vi.fn((rowId: string, key: string, value: unknown) => {
    calls.push(`row ${rowId} ${key}=${String(value)}`);
    const save = deferred<void>();
    rows.push({ resolve: () => save.resolve(), reject: save.reject });
    return save.promise;
  });
  const saveBasicField = vi.fn(async (bizno: string, app: string, fieldId: string, value: unknown) => {
    calls.push(`store ${bizno} ${app} ${fieldId}=${String(value)}`);
    const write = deferred<null>();
    stores.push({ resolve: () => write.resolve(null), reject: write.reject });
    return write.promise;
  });
  const loadBasicStore = vi.fn(async () => null);
  return { calls, rows, stores, saveOwnField, saveBasicField, api: { saveBasicField, loadBasicStore } as Partial<UnifiedDetailApi> };
}

async function respond(save: PendingSave, failure?: unknown) {
  await act(async () => {
    if (failure === undefined) save.resolve();
    else save.reject(failure);
  });
  await settle();
}

async function mountHost(
  c: HostCase,
  initial: RowData,
  saveOwnField: UnifiedDetailApi["saveOwnField"] = async () => {},
  unsaved?: UnsavedBridge,
  store?: Partial<UnifiedDetailApi>,
) {
  setViewport(true);
  const onSaved = vi.fn();
  const onClose = vi.fn();
  let adapter = buildAdapter(saveOwnField, unsaved, store);
  let currentRow = initial;

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  // adapter·콜백은 그대로 두고 row 만 바꿔 다시 그린다 — ERP 가 같은 열린 창에 새 행 객체를 내려주는 것과 같다.
  const view = (row: RowData) => (
    <UnifiedDetailView
      row={row}
      onClose={onClose}
      onSaved={onSaved}
      adapter={adapter}
      initialTab={c.initialTab}
      layout={c.layout}
    />
  );
  await act(async () => {
    root.render(view(initial));
  });
  await settle();

  return {
    onSaved,
    /** 상세창을 닫는다(언마운트). 이미 받아들인 저장은 이 뒤에도 끝까지 가야 한다. */
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      await settle();
    },
    /** 열린 창이 받은 row 를 새 객체로 바꾼다. */
    async rerender(next: RowData) {
      currentRow = next;
      await act(async () => {
        root.render(view(next));
      });
      await settle();
    },
    /** row 객체는 그대로 두고 어댑터(저장 함수·보관함 api)만 새로 갈아 끼운다 — 소유자(어댑터·저장 함수)만 바뀐 경우. */
    async swapAdapter(nextSave: UnifiedDetailApi["saveOwnField"], nextStore?: Partial<UnifiedDetailApi>) {
      adapter = buildAdapter(nextSave, unsaved, nextStore);
      await act(async () => {
        root.render(view(currentRow));
      });
      await settle();
    },
    /** 칸이 화면에 찍은 값(String(value)). */
    value(key: string): string {
      return probe(`[data-probe-value="${key}"]`, `「${key}」 칸`).textContent ?? "";
    },
    /** 새 row 의 첨부 개수. */
    files(): string {
      return probe("[data-probe=files]", "첨부 탐침").textContent ?? "";
    },
    /** 사용자가 칸을 고쳐 저장한 것과 같은 통로: 탐침 → 호스트의 handleBasicUpdate → adapter.api.saveOwnField. */
    async edit(key: string, next: string | number | boolean | null) {
      const button = probe(`[data-probe-edit="${key}"]`, `「${key}」 편집 단추`);
      button.dataset.next = JSON.stringify(next);
      await click(button);
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
  // 닫히지 않은 요청이 모듈 전체의 칸별 저장 줄을 붙잡아 다음 시험을 막지 않게, 남은 pending 을 모두 성공으로 닫는다.
  // 닫으면 줄에서 기다리던 다음 요청이 출발해 새 pending 이 생기므로, 더 생기지 않을 때까지 되풀이한다.
  const created = () => pendingLists.reduce((count, list) => count + list.length, 0);
  for (let round = 0; round < 8; round++) {
    const before = created();
    for (const list of pendingLists) for (const pending of list) pending.resolve();
    await settle();
    if (created() === before) break;
  }
  pendingLists.length = 0;
  vi.unstubAllGlobals();
  if (savedMatchMedia) Object.defineProperty(window, "matchMedia", savedMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

// ── 표 ──
const DIRECTIONS = [
  { label: "체크", from: false, to: true },
  { label: "체크 해제", from: true, to: false },
];
const ARRIVALS = [
  { label: "동일값 새 row", extra: {} as Record<string, unknown>, files: "0" },
  { label: "첨부만 바뀐 새 row", extra: withReport as Record<string, unknown>, files: "1" },
];
const TIMINGS = [
  { label: "저장 중", when: "pending" as const },
  { label: "저장 성공 뒤", when: "saved" as const },
];

// 방향 × 새 row 종류 × 시점. 새 row 는 해피콜을 "옛 값(from)" 그대로 싣는다 — 목록·보강 응답이 아직 저장을 모르는 상태.
const STALE_ROW_CASES = DIRECTIONS.flatMap((d) =>
  ARRIVALS.flatMap((a) =>
    TIMINGS.map((t) => ({
      name: `${d.label} · ${t.label} · ${a.label}`,
      from: d.from,
      to: d.to,
      extra: a.extra,
      files: a.files,
      when: t.when,
    })),
  ),
);

// ── 두 저장소(행 + 공용 보관함) 시험용 자료 ──
// 합성 사업자번호가 row 에 있어야 공용 보관함 기록(saveBasicField)이 실제로 출발한다(없으면 행 저장만 한다).
const BIZNO = "123-45-67890";
const BIZNO_DIGITS = "1234567890";
const OTHER_BIZNO = "987-65-43210";
// 공용 칸 식별자는 진짜 칸 라벨 지도에서 나온다 — 해피콜은 ownColumns 라벨, 대표자명은 표준 사양 라벨(배럴의 resolveCommonFieldId 는 비어 있다).
const FLAG_FIELD_ID = "해피콜";
const REPRESENTATIVE_FIELD_ID = "대표자명";

const companyRow = (over: Record<string, unknown> = {}) => makeRow({ "15사업자번호": BIZNO, ...over });
const otherCompanyRow = (over: Record<string, unknown> = {}) =>
  makeRow({ _id: "row-2", "02상호명": "다른 가상 회사", [REPRESENTATIVE]: "다른 대표", "15사업자번호": OTHER_BIZNO, ...over });

const rowCall = (key: string, value: unknown, rowId = "row-1") => `row ${rowId} ${key}=${String(value)}`;
const storeCall = (fieldId: string, value: unknown, bizno = BIZNO_DIGITS) => `store ${bizno} erp ${fieldId}=${String(value)}`;
const transientFailure = () => Object.assign(new Error("synthetic transient failure"), { saveFailureKind: "transient" });

// 앱의 저장 실패 보관함 가짜 — report 로 담긴 항목의 retry 를 시험이 직접 누른다.
function failureBridge() {
  const report = vi.fn();
  const resolve = vi.fn();
  const unsaved: UnsavedBridge = {
    scope: "synthetic",
    makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
    report,
    resolve,
  };
  return { unsaved, report, resolve };
}

// 공용 보관함 조회(loadBasicStore)를 시험이 원하는 때 응답한다. 칸 정의가 도착하면 조회가 다시 나갈 수 있어,
// 마운트가 끝난 뒤 가장 최근 것이 지금 화면의 조회다 — 그 조회를 붙잡아 두었다가 입력 뒤에 늦게 응답한다.
function lateStoreReads() {
  const reads: Array<(rec: BasicRecord | null) => void> = [];
  const loadBasicStore = vi.fn(() => new Promise<BasicRecord | null>((resolve) => { reads.push(resolve); }));
  return { loadBasicStore, latest: () => reads[reads.length - 1] };
}

const storeRecord = (values: Record<string, unknown>): BasicRecord => ({
  fields: Object.fromEntries(
    Object.entries(values).map(([label, value]) => [
      label,
      { value, updatedAt: "2026-10-14T00:00:00Z", updatedByApp: "hive", updatedByUser: "synthetic" },
    ]),
  ),
  log: [],
});

async function answerRead(read: (rec: BasicRecord | null) => void, rec: BasicRecord | null) {
  await act(async () => {
    read(rec);
  });
  await settle();
}

type Host = Awaited<ReturnType<typeof mountHost>>;
// 받아들인 입력을 낸 뒤 상세창을 떠나는 두 방법.
const LEAVES: Array<{ label: string; leave: (h: Host) => Promise<void> }> = [
  { label: "상세창 닫힘", leave: (h) => h.unmount() },
  { label: "다른 회사로 전환", leave: (h) => h.rerender(otherCompanyRow()) },
];

describe.each(HOSTS)("상세창 기본정보 칸 ↔ 새 row 동기화 — $name", (host) => {
  const mount = (
    row: RowData,
    save?: UnifiedDetailApi["saveOwnField"],
    unsaved?: UnsavedBridge,
    store?: Partial<UnifiedDetailApi>,
  ) => mountHost(host, row, save, unsaved, store);

  // ── 기존 저장 동작(true/false·실패)이 그대로임을 보는 기준선 ──
  describe("저장 기준선", () => {
    it("해피콜 체크는 저장 중에도 true 로 보이고, 성공해도 true 로 남는다", async () => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);
      expect(h.value(FLAG)).toBe("false");

      await h.edit(FLAG, true);
      expect(saveOwnField).toHaveBeenCalledTimes(1);
      expect(saveOwnField).toHaveBeenCalledWith("row-1", FLAG, true);
      expect(h.value(FLAG)).toBe("true");
      expect(h.onSaved).not.toHaveBeenCalled();

      await respond(saves[0]);
      expect(h.value(FLAG)).toBe("true");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("해피콜 체크 해제는 저장 중에도 false 로 보이고, 성공해도 false 로 남는다", async () => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow({ [FLAG]: true }), saveOwnField);
      expect(h.value(FLAG)).toBe("true");

      await h.edit(FLAG, false);
      expect(saveOwnField).toHaveBeenCalledWith("row-1", FLAG, false);
      expect(h.value(FLAG)).toBe("false");

      await respond(saves[0]);
      expect(h.value(FLAG)).toBe("false");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("규칙상 저장할 수 없는 실패는 이전 값으로 되돌리고 사유를 안내한다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);

      await h.edit(FLAG, true);
      expect(h.value(FLAG)).toBe("true");
      expect(alertSpy).not.toHaveBeenCalled();

      await respond(saves[0], new Error("synthetic save failure"));
      expect(h.value(FLAG)).toBe("false");
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith("synthetic save failure");
      expect(h.onSaved).not.toHaveBeenCalled();
    });

    it("잠깐 실패는 입력을 지우지 않고 앱의 저장 실패 보관함에 넘긴다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const report = vi.fn();
      const unsaved: UnsavedBridge = {
        scope: "synthetic",
        makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
        report,
        resolve: vi.fn(),
      };
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField, unsaved);

      await h.edit(FLAG, true);
      const transient = Object.assign(new Error("synthetic transient failure"), { saveFailureKind: "transient" });
      await respond(saves[0], transient);

      expect(h.value(FLAG)).toBe("true");
      expect(alertSpy).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toMatchObject({ rowId: "row-1", fieldKey: FLAG, value: true, kind: "transient" });
    });
  });

  // ── 핵심 결함: 값이 그대로인 칸을 새 row 가 덮어쓴다 ──
  describe("같은 회사 새 row 도착", () => {
    it.each(STALE_ROW_CASES)("$name: 낙관적 입력이 값이 같은 새 row 로 되돌려지지 않는다", async (c) => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow({ [FLAG]: c.from }), saveOwnField);
      expect(h.value(FLAG)).toBe(String(c.from));

      await h.edit(FLAG, c.to);
      expect(saveOwnField).toHaveBeenCalledTimes(1);
      expect(saveOwnField).toHaveBeenCalledWith("row-1", FLAG, c.to);
      expect(h.value(FLAG)).toBe(String(c.to));

      const arrive = () => h.rerender(makeRow({ [FLAG]: c.from, ...c.extra }));
      const answer = () => respond(saves[0]);
      for (const step of c.when === "pending" ? [arrive, answer] : [answer, arrive]) {
        await step();
        expect(h.value(FLAG)).toBe(String(c.to));
      }
      // 새 row 는 실제로 화면까지 도착했다 — 위 단언이 "새 row 가 안 그려져서" 통과한 것이 아니다.
      expect(h.files()).toBe(c.files);
    });

    it.each(TIMINGS)("$label: 다른 칸 변경은 반영하고 해피콜 입력은 지킨다", async ({ when }) => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);
      expect(h.value(REPRESENTATIVE)).toBe("가상 대표");

      await h.edit(FLAG, true);
      if (when === "saved") await respond(saves[0]);

      await h.rerender(makeRow({ [REPRESENTATIVE]: "바뀐 대표", ...withReport }));
      expect(h.value(REPRESENTATIVE)).toBe("바뀐 대표");
      expect(h.files()).toBe("1");
      expect(h.value(FLAG)).toBe("true");

      if (when === "pending") await respond(saves[0]);
      expect(h.value(REPRESENTATIVE)).toBe("바뀐 대표");
      expect(h.value(FLAG)).toBe("true");
    });

    it("저장 중인 칸은 새 row 가 다른 값을 줘도 현재 입력을 지키고, 같은 새 row 의 다른 칸 변경은 반영한다", async () => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);

      await h.edit(REPRESENTATIVE, "내 입력");
      expect(saveOwnField).toHaveBeenCalledWith("row-1", REPRESENTATIVE, "내 입력");
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");

      await h.rerender(makeRow({ [REPRESENTATIVE]: "남의 입력", [FLAG]: true }));
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      expect(h.value(FLAG)).toBe("true");

      await respond(saves[0]);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      expect(h.value(FLAG)).toBe("true");
    });
  });

  // ── 실제로 달라진 값은 정상 반영된다(보호가 새 값까지 막으면 안 된다) ──
  describe("실제 변경은 정상 반영", () => {
    it("캐시 false 로 연 뒤 새 row 가 true 를 주면 true 로 갱신된다", async () => {
      const h = await mount(makeRow());
      expect(h.value(FLAG)).toBe("false");

      await h.rerender(makeRow({ [FLAG]: true, ...withReport }));
      expect(h.value(FLAG)).toBe("true");
      expect(h.files()).toBe("1");
    });

    it("true 로 열린 뒤 새 row 가 명시 false 를 주면 false 로 갱신된다", async () => {
      const h = await mount(makeRow({ [FLAG]: true }));
      expect(h.value(FLAG)).toBe("true");

      await h.rerender(makeRow({ [FLAG]: false, ...withReport }));
      expect(h.value(FLAG)).toBe("false");
      expect(h.files()).toBe("1");
    });

    it("내가 true 를 저장하고 새 row 가 true 로 따라온 뒤, 다른 사용자의 명시 false 는 false 로 반영된다", async () => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);

      await h.edit(FLAG, true);
      await respond(saves[0]);
      expect(h.value(FLAG)).toBe("true");

      await h.rerender(makeRow({ [FLAG]: true }));
      expect(h.value(FLAG)).toBe("true");

      await h.rerender(makeRow({ [FLAG]: false, ...withReport }));
      expect(h.value(FLAG)).toBe("false");
      expect(h.files()).toBe("1");
    });
  });

  // ── 다른 회사로 바뀌면 이전 회사의 입력·보호가 새 회사에 새지 않는다 ──
  describe("다른 회사 전환", () => {
    // 새 회사의 해피콜도 false 라서, "값이 안 달라졌으니 건드리지 않는다"만 구현하면 이전 회사의 true 가 새 회사에 샌다.
    const other = () =>
      makeRow({ _id: "row-2", "02상호명": "다른 가상 회사", [REPRESENTATIVE]: "다른 대표", ...withReport });

    it.each(TIMINGS)("$label: 이전 회사의 낙관적 true 를 버리고 새 회사 값(false)을 보인다", async ({ when }) => {
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);

      await h.edit(FLAG, true);
      if (when === "saved") await respond(saves[0]);
      expect(h.value(FLAG)).toBe("true");

      await h.rerender(other());
      expect(h.value(FLAG)).toBe("false");
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표");
      expect(h.files()).toBe("1");

      // 이전 회사의 늦은 응답은 새 회사 화면을 건드리지 않는다.
      if (when === "pending") await respond(saves[0]);
      expect(h.value(FLAG)).toBe("false");
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표");
      expect(saveOwnField).toHaveBeenCalledTimes(1);
    });
  });

  // ── 새 row 가 온 뒤에도 실패는 여전히 이전 값으로 되돌린다 ──
  describe("늦은 응답", () => {
    it("새 row 가 온 뒤 늦게 도착한 저장 실패는 입력을 이전 값으로 되돌리고 안내한다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField);

      await h.edit(FLAG, true);
      await h.rerender(makeRow(withReport));
      expect(h.files()).toBe("1");

      await respond(saves[0], new Error("synthetic save failure"));
      expect(h.value(FLAG)).toBe("false");
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith("synthetic save failure");
    });
  });

  // ══ 같은 칸 연속 저장 — 순서·최신 입력 (실제 두 저장소: 행 saveOwnField + 공용 보관함 saveBasicField) ══
  //
  // 브라우저 실증: 첫 true PATCH 를 서버 도착 전에 지연시키고 둘째 false PATCH 가 먼저 저장된 뒤 첫 true 를 풀면 최종 DB/화면이 true.
  // 마지막 입력(false)과 어긋난다. 같은 회사·같은 칸의 저장은 행 저장 → 공용 기록까지 한 줄로 끝낸 뒤 다음 입력을 보낸다.
  describe("같은 칸 연속 저장", () => {
    it("둘째 저장은 첫 행 저장과 공용 기록이 모두 끝난 뒤에 출발하고, 마지막 입력 false 가 두 저장소에 남는다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);
      expect(h.value(FLAG)).toBe("false");

      await h.edit(FLAG, true);
      await h.edit(FLAG, false);
      // 화면은 마지막 입력을 바로 보이지만, 둘째 요청은 아직 서버로 가지 않는다.
      expect(h.value(FLAG)).toBe("false");
      expect(s.calls).toEqual([rowCall(FLAG, true)]);

      await respond(s.rows[0]);
      // 첫 행 저장이 끝나도 같은 칸의 공용 기록이 끝나기 전에는 둘째가 출발하지 않는다.
      expect(s.calls).toEqual([rowCall(FLAG, true), storeCall(FLAG_FIELD_ID, true)]);
      expect(h.value(FLAG)).toBe("false");

      await respond(s.stores[0]);
      expect(s.calls).toEqual([rowCall(FLAG, true), storeCall(FLAG_FIELD_ID, true), rowCall(FLAG, false)]);

      await respond(s.rows[1]);
      await respond(s.stores[1]);
      expect(s.calls).toEqual([
        rowCall(FLAG, true),
        storeCall(FLAG_FIELD_ID, true),
        rowCall(FLAG, false),
        storeCall(FLAG_FIELD_ID, false),
      ]);
      expect(h.value(FLAG)).toBe("false");
      expect(h.onSaved).toHaveBeenCalledTimes(1); // 새 입력 뒤 이전 완료는 현재 화면 갱신을 부르지 않는다.
    });

    it("오래된 저장 실패는 더 새 입력을 되돌리거나 알리지 않고, 새 입력은 이어서 그대로 저장된다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);

      await h.edit(REPRESENTATIVE, "첫 입력");
      await h.edit(REPRESENTATIVE, "둘째 입력");
      await respond(s.rows[0], new Error("synthetic save failure"));

      // 첫 입력의 실패가 둘째 화면을 첫 입력 직전 값("가상 대표")으로 되돌리거나 알림을 띄우지 않는다.
      expect(h.value(REPRESENTATIVE)).toBe("둘째 입력");
      expect(alertSpy).not.toHaveBeenCalled();
      // 실패한 첫 입력은 공용 기록으로 가지 않고, 둘째가 이어서 출발한다.
      expect(s.calls).toEqual([rowCall(REPRESENTATIVE, "첫 입력"), rowCall(REPRESENTATIVE, "둘째 입력")]);

      await respond(s.rows[1]);
      await respond(s.stores[0]);
      expect(s.calls).toEqual([
        rowCall(REPRESENTATIVE, "첫 입력"),
        rowCall(REPRESENTATIVE, "둘째 입력"),
        storeCall(REPRESENTATIVE_FIELD_ID, "둘째 입력"),
      ]);
      expect(h.value(REPRESENTATIVE)).toBe("둘째 입력");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("같은 칸에 입력이 셋 쌓여도 중간 입력을 건너뛰거나 순서를 바꾸지 않는다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);
      await h.edit(REPRESENTATIVE, "하나");
      await h.edit(REPRESENTATIVE, "둘");
      await h.edit(REPRESENTATIVE, "셋");
      for (let step = 0; step < 3; step++) {
        await respond(s.rows[step]);
        await respond(s.stores[step]);
      }
      expect(s.calls).toEqual([
        rowCall(REPRESENTATIVE, "하나"), storeCall(REPRESENTATIVE_FIELD_ID, "하나"),
        rowCall(REPRESENTATIVE, "둘"), storeCall(REPRESENTATIVE_FIELD_ID, "둘"),
        rowCall(REPRESENTATIVE, "셋"), storeCall(REPRESENTATIVE_FIELD_ID, "셋"),
      ]);
      expect(h.value(REPRESENTATIVE)).toBe("셋");
    });

    it("공용 기록이 실패해도 행 저장은 성공으로 남고 다음 입력이 이어서 출발한다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);
      await h.edit(FLAG, true);
      await h.edit(FLAG, false);

      await respond(s.rows[0]);
      await respond(s.stores[0], new Error("synthetic store failure"));
      expect(s.calls).toEqual([rowCall(FLAG, true), storeCall(FLAG_FIELD_ID, true), rowCall(FLAG, false)]);
      expect(h.value(FLAG)).toBe("false");
      expect(h.onSaved).not.toHaveBeenCalled(); // 이전 응답은 최신 입력의 화면 갱신을 부르지 않는다.
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it("다른 칸 저장은 같은 칸 줄에 막히지 않고 바로 출발한다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);

      await h.edit(FLAG, true);
      await h.edit(REPRESENTATIVE, "내 입력");
      await h.edit(FLAG, false);
      expect(s.calls).toEqual([rowCall(FLAG, true), rowCall(REPRESENTATIVE, "내 입력")]);

      // 다른 칸이 먼저 끝나도 해피콜 줄(첫 요청 대기)은 그대로 기다린다.
      await respond(s.rows[1]);
      expect(s.calls).toEqual([rowCall(FLAG, true), rowCall(REPRESENTATIVE, "내 입력"), storeCall(REPRESENTATIVE_FIELD_ID, "내 입력")]);
      expect(h.value(FLAG)).toBe("false");
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
    });

    it("보관함에 담긴 오래된 재시도·되돌리기는 더 새 입력이 생기면 아무것도 보내거나 바꾸지 않는다", async () => {
      const report = vi.fn();
      const unsaved: UnsavedBridge = {
        scope: "synthetic",
        makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
        report,
        resolve: vi.fn(),
      };
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);

      await h.edit(REPRESENTATIVE, "첫 입력");
      await respond(s.rows[0], transientFailure());
      expect(report).toHaveBeenCalledTimes(1);
      const stale = report.mock.calls[0][0];
      expect(h.value(REPRESENTATIVE)).toBe("첫 입력");

      // 줄이 비어 있으니 둘째 입력은 바로 출발한다. 이제 첫 입력의 보관함 항목은 오래된 것이다.
      await h.edit(REPRESENTATIVE, "둘째 입력");
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);

      expect(await stale.retry()).toBe(false);
      stale.revert();
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);
      expect(h.value(REPRESENTATIVE)).toBe("둘째 입력");

      await respond(s.rows[1]);
      await respond(s.stores[0]);
      expect(s.calls.at(-1)).toBe(storeCall(REPRESENTATIVE_FIELD_ID, "둘째 입력"));
      expect(h.value(REPRESENTATIVE)).toBe("둘째 입력");
    });

    it("가장 최근 입력의 보관함 재시도는 같은 칸 줄을 타고 그 값을 행에 다시 저장한다", async () => {
      const report = vi.fn();
      const unsaved: UnsavedBridge = {
        scope: "synthetic",
        makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
        report,
        resolve: vi.fn(),
      };
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];

      let retried: boolean | undefined;
      const pending = entry.retry().then((ok: boolean) => { retried = ok; });
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);
      expect(s.saveOwnField).toHaveBeenLastCalledWith("row-1", REPRESENTATIVE, "내 입력");
      expect(retried).toBeUndefined();

      await respond(s.rows[1]);
      expect(retried).toBeUndefined();
      await respond(s.stores[0]);
      await pending;
      expect(retried).toBe(true);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
    });
  });

  // ── 저장 중인 칸의 보호 범위 — 행 저장 + 공용 기록이 끝날 때까지, 실패 보관 중에도 ──
  describe("저장 중 칸 보호", () => {
    it("행 저장이 끝나도 공용 기록이 끝나기 전까지는 보호하고, 끝나면 실제로 달라진 값을 반영한다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0]);
      await h.rerender(companyRow({ [REPRESENTATIVE]: "남의 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");

      await respond(s.stores[0]);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");

      await h.rerender(companyRow({ [REPRESENTATIVE]: "또 다른 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("또 다른 입력");
    });

    it("보관함에 담긴(재시도 대기) 입력도 새 row 가 다른 값을 줘도 지킨다", async () => {
      const unsaved: UnsavedBridge = {
        scope: "synthetic",
        makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
        report: vi.fn(),
        resolve: vi.fn(),
      };
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField, unsaved);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(saves[0], transientFailure());
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");

      await h.rerender(makeRow({ [REPRESENTATIVE]: "남의 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
    });

    it("다른 회사로 바꾸면 이전 회사의 저장 중 보호는 새 회사에 이어지지 않는다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);

      await h.edit(REPRESENTATIVE, "이전 회사 입력");
      await h.rerender(otherCompanyRow());
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표");

      // 이전 회사의 같은 칸 저장이 아직 끝나지 않았어도 새 회사의 실제 변경은 바로 반영된다.
      await h.rerender(otherCompanyRow({ [REPRESENTATIVE]: "다른 대표 수정" }));
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표 수정");
    });
  });

  // ── 받아들인 입력은 화면을 떠나도 끝까지: 닫힘·회사 전환은 화면 갱신만 막는다 ──
  describe("닫힘·회사 전환 뒤의 받아들인 저장", () => {
    it.each(LEAVES)("$label: 받아들인 두 입력(true→false)이 이전 회사의 두 저장소에 끝까지 저장되고, 원래 부모에 알리며 새 화면은 건드리지 않는다", async ({ label, leave }) => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);

      await h.edit(FLAG, true);
      await h.edit(FLAG, false);
      await leave(h);
      const switched = label === "다른 회사로 전환";
      if (switched) expect(h.value(FLAG)).toBe("false");
      // 둘째 입력은 아직 줄에서 기다린다 — 닫아도 취소되지 않는다.
      expect(s.calls).toEqual([rowCall(FLAG, true)]);

      // 둘째 요청은 앞 요청이 끝난 뒤에야 만들어지므로, 만들어지는 순서대로 하나씩 닫는다.
      const steps = [() => s.rows[0], () => s.stores[0], () => s.rows[1], () => s.stores[1]];
      for (const [index, next] of steps.entries()) {
        const pending = next();
        expect(pending, `${index}번째 요청이 만들어졌다`).toBeDefined();
        await respond(pending);
        if (switched) expect(h.value(FLAG)).toBe("false");
      }
      // 이전 회사(row-1·사업자번호)의 두 저장소에, 마지막 입력 false 가 마지막 쓰기로 남는다.
      expect(s.calls).toEqual([
        rowCall(FLAG, true),
        storeCall(FLAG_FIELD_ID, true),
        rowCall(FLAG, false),
        storeCall(FLAG_FIELD_ID, false),
      ]);
      // 최신 입력 성공은 원래 부모에 한 번 알리고, 새 회사 상세 상태는 건드리지 않는다.
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
      if (switched) expect(h.value(REPRESENTATIVE)).toBe("다른 대표");
    });

    it("닫았다 다시 연 상세창의 같은 칸 저장은 이전 상세창의 아직 끝나지 않은 요청을 앞지르지 못한다", async () => {
      const first = twoStores();
      const second = twoStores();
      const a = await mount(companyRow(), first.saveOwnField, undefined, first.api);
      await a.edit(REPRESENTATIVE, "옛 입력");
      await a.unmount();

      const b = await mount(companyRow(), second.saveOwnField, undefined, second.api);
      await b.edit(REPRESENTATIVE, "새 입력");
      expect(b.value(REPRESENTATIVE)).toBe("새 입력");
      expect(second.saveOwnField).not.toHaveBeenCalled();

      await respond(first.rows[0]);
      // 옛 행 저장이 끝나도 옛 공용 기록이 남아 있는 동안은 새 요청이 출발하지 않는다.
      expect(second.saveOwnField).not.toHaveBeenCalled();
      await respond(first.stores[0]);
      expect(second.saveOwnField).toHaveBeenCalledTimes(1);
      expect(second.saveOwnField).toHaveBeenCalledWith("row-1", REPRESENTATIVE, "새 입력");

      await respond(second.rows[0]);
      await respond(second.stores[0]);
      expect(second.calls).toEqual([rowCall(REPRESENTATIVE, "새 입력"), storeCall(REPRESENTATIVE_FIELD_ID, "새 입력")]);
      expect(b.value(REPRESENTATIVE)).toBe("새 입력");
    });

    it.each([
      { kind: "영구 실패", failure: () => new Error("synthetic save failure") },
      { kind: "잠깐 실패", failure: transientFailure },
    ])("회사를 바꾼 뒤 이전 회사의 늦은 $kind는 새 화면·알림에 닿지 않고 잠깐 실패만 앱 보관함에 남긴다", async ({ kind, failure }) => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const report = vi.fn();
      const unsaved: UnsavedBridge = {
        scope: "synthetic",
        makeId: (scope, rowId, fieldKey) => `${scope}:${rowId}:${fieldKey}`,
        report,
        resolve: vi.fn(),
      };
      const { saveOwnField, saves } = saveQueue();
      const h = await mount(makeRow(), saveOwnField, unsaved);

      await h.edit(REPRESENTATIVE, "이전 회사 입력");
      await h.rerender(otherCompanyRow());
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표");

      await respond(saves[0], failure());
      expect(h.value(REPRESENTATIVE)).toBe("다른 대표");
      expect(alertSpy).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledTimes(kind === "잠깐 실패" ? 1 : 0);
      expect(h.onSaved).not.toHaveBeenCalled();
    });
  });

  // ══ v4 보정 1 — 비주소 보관함 재시도도 최초 저장과 같은 경로(행 저장 → 공용 기록 → onSaved)를 같은 칸 줄에서 탄다 ══
  describe("보관함 재시도 — 두 저장소와 onSaved", () => {
    it("재시도 성공은 행 저장 뒤 공용 기록과 onSaved 까지 실행하고, 끝나면 칸 보호를 푼다", async () => {
      const { unsaved, report, resolve } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0], transientFailure());
      expect(report).toHaveBeenCalledTimes(1);
      expect(h.onSaved).not.toHaveBeenCalled();
      expect(s.calls).toEqual([rowCall(REPRESENTATIVE, "내 입력")]);

      let retried: boolean | undefined;
      const pending = report.mock.calls[0][0].retry().then((ok: boolean) => { retried = ok; });
      await settle();
      expect(s.calls).toEqual([rowCall(REPRESENTATIVE, "내 입력"), rowCall(REPRESENTATIVE, "내 입력")]);
      expect(retried).toBeUndefined();

      await respond(s.rows[1]);
      expect(retried).toBeUndefined();
      await respond(s.stores[0]);
      await pending;
      expect(retried).toBe(true);
      expect(s.calls).toEqual([
        rowCall(REPRESENTATIVE, "내 입력"),
        rowCall(REPRESENTATIVE, "내 입력"),
        storeCall(REPRESENTATIVE_FIELD_ID, "내 입력"),
      ]);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith("synthetic:row-1:" + REPRESENTATIVE);

      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      // 공용 기록까지 끝났으니 칸 보호가 풀려, 실제로 달라진 새 row 값은 반영된다.
      await h.rerender(companyRow({ [REPRESENTATIVE]: "남의 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("남의 입력");
    });

    it("재시도의 공용 기록이 실패해도 성공한 행 저장은 유지되고 새 알림·보관함 항목은 없다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0], transientFailure());

      let retried: boolean | undefined;
      const pending = report.mock.calls[0][0].retry().then((ok: boolean) => { retried = ok; });
      await settle();
      await respond(s.rows[1]);
      await respond(s.stores[0], new Error("synthetic store failure"));
      await pending;

      expect(retried).toBe(true);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledTimes(1);
    });

    it("재시도 중 더 새 입력이 생겨도 중복 재시도는 추가 요청을 만들지 않는다", async () => {
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];

      // 첫 재시도가 줄을 잡고 있는 동안 같은 항목의 둘째 재시도는 바로 거절된다.
      const first = entry.retry();
      await settle();
      let second: boolean | undefined;
      const queued = entry.retry().then((ok: boolean) => { second = ok; });
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);

      // 줄에서 기다리는 중 더 새 입력이 생긴다.
      await h.edit(REPRESENTATIVE, "새 입력");
      expect(h.value(REPRESENTATIVE)).toBe("새 입력");

      await respond(s.rows[1]);
      await queued;
      // 중복 재시도는 false. 첫 재시도의 행 저장은 실제로 됐으니 공용 기록도 그 값으로 맞춘 뒤 새 입력이 출발한다(v10).
      expect(second).toBe(false);
      expect(s.calls).toEqual([
        rowCall(REPRESENTATIVE, "내 입력"),
        rowCall(REPRESENTATIVE, "내 입력"),
        storeCall(REPRESENTATIVE_FIELD_ID, "내 입력"),
      ]);
      expect(h.value(REPRESENTATIVE)).toBe("새 입력");
      await respond(s.stores[0]);
      expect(await first).toBe(false);
      expect(s.calls.at(-1)).toBe(rowCall(REPRESENTATIVE, "새 입력"));

      await respond(s.rows[2]);
      await respond(s.stores[1]);
      expect(s.calls.at(-1)).toBe(storeCall(REPRESENTATIVE_FIELD_ID, "새 입력"));
      expect(h.value(REPRESENTATIVE)).toBe("새 입력");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });
  });

  // v5: 상세 화면 owner와 앱 전체 미저장 항목의 수명은 다르다. 새 입력만 옛 복구를 취소한다.
  describe("v5 앱 보관함 수명과 새 조회", () => {
    it.each(LEAVES)("$label 뒤 현재 실패 항목은 원래 회사의 두 저장소로 다시 저장한다", async ({ leave }) => {
      const { unsaved, report } = failureBridge();
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(REPRESENTATIVE, "보존할 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];
      await leave(h);
      const retry = entry.retry();
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);
      expect(s.saveOwnField).toHaveBeenLastCalledWith("row-1", REPRESENTATIVE, "보존할 입력");
      await respond(s.rows[1]);
      expect(s.calls.at(-1)).toBe(storeCall(REPRESENTATIVE_FIELD_ID, "보존할 입력"));
      await respond(s.stores[0]);
      expect(await retry).toBe(true);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it.each(LEAVES)("$label 뒤 도착한 최신 잠깐 실패도 앱 보관함에서 복구한다", async ({ leave }) => {
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(REPRESENTATIVE, "늦게 실패한 입력");
      await leave(h);
      await respond(s.rows[0], transientFailure());
      expect(report).toHaveBeenCalledTimes(1);
      const retry = report.mock.calls[0][0].retry();
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);
      await respond(s.rows[1]);
      await respond(s.stores[0]);
      expect(await retry).toBe(true);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it.each(LEAVES)("$label: 중복 재시도는 거절하고 첫 실패 뒤 새로 누른 현재 재시도는 계속한다", async ({ leave }) => {
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(REPRESENTATIVE, "현재 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];
      const first = entry.retry();
      await settle();
      expect(await entry.retry()).toBe(false);
      await leave(h);
      await respond(s.rows[1], transientFailure());
      expect(await first).toBe(false);
      const resumed = entry.retry();
      await settle();
      expect(s.saveOwnField).toHaveBeenCalledTimes(3);
      await respond(s.rows[2]);
      await respond(s.stores[0]);
      expect(await resumed).toBe(true);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("행 재시도가 성공해도 공용 기록이 끝날 때까지 중복 재시도를 받아들이지 않는다", async () => {
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(REPRESENTATIVE, "한 번 복구할 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];
      const first = entry.retry();
      await settle();
      expect(await entry.retry()).toBe(false);
      await respond(s.rows[1]);
      // 앱 막대 재시도의 결과와 자리는 공용 기록이 끝날 때까지 유지한다.
      let duplicated: boolean | undefined;
      const pending = entry.retry().then((ok: boolean) => { duplicated = ok; });
      await settle();
      expect(duplicated).toBe(false);
      expect(s.saveOwnField).toHaveBeenCalledTimes(2);
      await respond(s.stores[0]);
      expect(await first).toBe(true);
      await pending;
      expect(await entry.retry()).toBe(false); // 성공한 의도는 정리되어 다시 살아나지 않는다.
    });

    it("다시 연 상세창에서 새 입력을 받으면 옛 항목의 직접 재시도와 되돌림은 영구 차단된다", async () => {
      const { unsaved, report } = failureBridge();
      const first = twoStores();
      const a = await mount(companyRow(), first.saveOwnField, unsaved, first.api);
      await a.edit(REPRESENTATIVE, "옛 실패 입력");
      await respond(first.rows[0], transientFailure());
      const stale = report.mock.calls[0][0];
      await a.unmount();
      const second = twoStores();
      const b = await mount(companyRow(), second.saveOwnField, unsaved, second.api);
      await b.edit(REPRESENTATIVE, "새 입력");
      expect(await stale.retry()).toBe(false);
      stale.revert();
      await settle();
      expect(first.saveOwnField).toHaveBeenCalledTimes(1);
      expect(b.value(REPRESENTATIVE)).toBe("새 입력");
      await respond(second.rows[0]);
      await respond(second.stores[0]);
      expect(await stale.retry()).toBe(false);
    });

    it("중복 재시도는 닫힘·재개방·새 입력에도 추가 전송을 만들지 않는다", async () => {
      const { unsaved, report } = failureBridge();
      const first = twoStores();
      const a = await mount(companyRow(), first.saveOwnField, unsaved, first.api);
      await a.edit(REPRESENTATIVE, "옛 실패 입력");
      await respond(first.rows[0], transientFailure());
      const stale = report.mock.calls[0][0];
      const running = stale.retry();
      await settle();
      const queued = stale.retry();
      await a.unmount();
      const second = twoStores();
      const b = await mount(companyRow(), second.saveOwnField, unsaved, second.api);
      await b.edit(REPRESENTATIVE, "새 입력");
      await respond(first.rows[1]);
      expect(await queued).toBe(false);
      // 성공한 옛 재시도는 공용 기록도 맞춘다(v10). 새 입력은 그 기록이 끝난 뒤 출발한다.
      expect(first.calls.at(-1)).toBe(storeCall(REPRESENTATIVE_FIELD_ID, "옛 실패 입력"));
      expect(second.saveOwnField).not.toHaveBeenCalled();
      await respond(first.stores[0]);
      expect(await running).toBe(false);
      expect(first.saveOwnField).toHaveBeenCalledTimes(2);
      expect(second.saveOwnField).toHaveBeenCalledTimes(1);
      await respond(second.rows[0]);
      await respond(second.stores[0]);
    });

    it("보호 중 건너뛴 값은 완료 직후 적용하지 않고 같은 값을 싣는 이후 새 row에서 적용한다", async () => {
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, undefined, s.api);
      await h.edit(REPRESENTATIVE, "내 입력");
      await respond(s.rows[0]);
      await h.rerender(companyRow({ [REPRESENTATIVE]: "남의 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      await respond(s.stores[0]);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      await h.rerender(companyRow({ [REPRESENTATIVE]: "남의 입력" }));
      expect(h.value(REPRESENTATIVE)).toBe("남의 입력");
    });
  });

  describe("v5 보호 중 false·null·삭제 비교 기준", () => {
    it.each([
      { label: "false", from: null, value: false, remove: false, expected: "false" },
      { label: "null", from: false, value: null, remove: false, expected: "null" },
      { label: "삭제", from: false, value: null, remove: true, expected: "null" },
    ])("$label도 완료 후 같은 값을 싣는 새 row에서 반영된다", async ({ from, value, remove, expected }) => {
      const s = twoStores();
      const h = await mount(companyRow({ [FLAG]: from }), s.saveOwnField, undefined, s.api);
      await h.edit(FLAG, true);
      await respond(s.rows[0]);
      const fresh = () => {
        const incoming = companyRow({ [FLAG]: value });
        if (remove) delete incoming[FLAG];
        return incoming;
      };
      await h.rerender(fresh());
      expect(h.value(FLAG)).toBe("true");
      await respond(s.stores[0]);
      expect(h.value(FLAG)).toBe("true");
      await h.rerender(fresh());
      expect(h.value(FLAG)).toBe(expected);
    });
  });

  // ══ v4 보정 2 — row 참조가 그대로여도 소유자(어댑터·저장 함수)가 바뀌면 이전 소유자의 입력·보호를 버린다 ══
  describe("같은 row 객체의 소유자 전환", () => {
    it("어댑터가 바뀌면 이전 소유자의 낙관적 입력을 버리고 row 값을 보이며, 이전 소유자의 늦은 응답은 닿지 않는다", async () => {
      const first = twoStores();
      const second = twoStores();
      const row = companyRow();
      const h = await mount(row, first.saveOwnField, undefined, first.api);

      await h.edit(REPRESENTATIVE, "내 입력");
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");
      // 같은 소유자·같은 row 를 다시 그리는 것은 입력을 건드리지 않는다.
      await h.rerender(row);
      expect(h.value(REPRESENTATIVE)).toBe("내 입력");

      await h.swapAdapter(second.saveOwnField, second.api);
      expect(h.value(REPRESENTATIVE)).toBe("가상 대표");

      await respond(first.rows[0]);
      await respond(first.stores[0]);
      expect(h.value(REPRESENTATIVE)).toBe("가상 대표");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(second.saveOwnField).not.toHaveBeenCalled();
    });
  });

  // ══ v4 보정 3 — 늦게 도착한 옛 공용 보관함 조회가 의도적으로 비운 칸을 다시 채우지 않는다 ══
  describe("늦은 공용 보관함 조회", () => {
    const CLEARS = [
      { label: "빈 문자열", next: "", shown: "" },
      { label: "null", next: null, shown: "null" },
    ];
    // 해피콜은 row 에서 비워 두어(null), 조회가 채워야 하는 "관련 없는 빈 칸"으로 쓴다.
    const OLD_STORE = () => storeRecord({ 대표자명: "옛 보관 대표", [FLAG_FIELD_ID]: true });
    const mountWithLateRead = async (save: UnifiedDetailApi["saveOwnField"], store: Partial<UnifiedDetailApi>) => {
      const reads = lateStoreReads();
      const h = await mount(companyRow({ [FLAG]: null }), save, undefined, { ...store, loadBasicStore: reads.loadBasicStore });
      // 입력 전에 출발해 아직 대기 중인 조회를 붙잡아 둔다.
      return { h, read: reads.latest() };
    };

    it.each(CLEARS)("저장 중인 $label 비우기는 늦은 옛 조회가 다시 채우지 않고, 관련 없는 빈 칸은 채운다", async ({ next, shown }) => {
      const s = twoStores();
      const { h, read } = await mountWithLateRead(s.saveOwnField, s.api);

      await h.edit(REPRESENTATIVE, next);
      expect(s.calls).toEqual([rowCall(REPRESENTATIVE, next)]);
      expect(h.value(REPRESENTATIVE)).toBe(shown);

      await answerRead(read, OLD_STORE());
      expect(h.value(REPRESENTATIVE)).toBe(shown);
      expect(h.value(FLAG)).toBe("true");
    });

    it.each(CLEARS)("저장이 끝난 $label 비우기도 그 전에 출발한 늦은 옛 조회가 다시 채우지 않고, 관련 없는 빈 칸은 채운다", async ({ next, shown }) => {
      const s = twoStores();
      const { h, read } = await mountWithLateRead(s.saveOwnField, s.api);

      await h.edit(REPRESENTATIVE, next);
      await respond(s.rows[0]);
      await respond(s.stores[0]);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(h.value(REPRESENTATIVE)).toBe(shown);

      await answerRead(read, OLD_STORE());
      expect(h.value(REPRESENTATIVE)).toBe(shown);
      expect(h.value(FLAG)).toBe("true");
    });

    it("입력이 없던 칸은 늦은 조회로 기존대로 채워진다", async () => {
      const s = twoStores();
      const { h, read } = await mountWithLateRead(s.saveOwnField, s.api);
      // 대표자명은 row 값("가상 대표")이 있어 보호되고, 비어 있던 해피콜만 채워진다.
      await answerRead(read, OLD_STORE());
      expect(h.value(REPRESENTATIVE)).toBe("가상 대표");
      expect(h.value(FLAG)).toBe("true");
    });
  });

  // v10: 독립 리뷰(review-26c8f49b) P2 재현 — 앞 저장 성공 뒤 마지막 입력 실패, 다시 연 창, 첫 조회 중 대상 전환.
  describe("v10 앞 저장 성공 뒤 마지막 입력 실패", () => {
    it("더 새 입력이 생긴 재시도의 성공도 확정값·공용 기록에 남아, 새 입력이 영구 실패하면 그 값으로 되돌린다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(REPRESENTATIVE, "첫 입력");
      await respond(s.rows[0], transientFailure());
      const retry = report.mock.calls[0][0].retry();
      await settle();
      await h.edit(REPRESENTATIVE, "둘째 입력");
      await respond(s.rows[1]);
      expect(await Promise.race([retry, Promise.resolve("대기")])).toBe("대기");
      expect(s.calls).toEqual([
        rowCall(REPRESENTATIVE, "첫 입력"),
        rowCall(REPRESENTATIVE, "첫 입력"),
        storeCall(REPRESENTATIVE_FIELD_ID, "첫 입력"),
      ]);
      await respond(s.stores[0]);
      expect(await retry).toBe(false);
      expect(s.calls.at(-1)).toBe(rowCall(REPRESENTATIVE, "둘째 입력"));
      expect(h.onSaved).not.toHaveBeenCalled();
      await respond(s.rows[2], new Error("synthetic permanent failure"));
      expect(h.value(REPRESENTATIVE)).toBe("첫 입력");
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it.each([
      { kind: "영구 실패", failure: () => new Error("synthetic permanent failure"), reports: 0 },
      { kind: "잠깐 실패", failure: transientFailure, reports: 1 },
    ])("닫은 뒤 앞 입력이 저장되고 마지막 입력이 $kind하면 부모에 한 번 알린다", async ({ failure, reports }) => {
      vi.stubGlobal("alert", vi.fn());
      const { unsaved, report } = failureBridge();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, unsaved, s.api);
      await h.edit(FLAG, true);
      await h.edit(FLAG, false);
      await h.unmount();
      await respond(s.rows[0]);
      await respond(s.stores[0]);
      expect(h.onSaved).not.toHaveBeenCalled();
      await respond(s.rows[1], failure());
      expect(report).toHaveBeenCalledTimes(reports);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("닫았다 다시 연 창의 입력이 영구 실패하면 이전 창의 성공한 저장값으로 되돌린다", async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal("alert", alertSpy);
      const first = twoStores();
      const second = twoStores();
      const a = await mount(companyRow(), first.saveOwnField, undefined, first.api);
      await a.edit(REPRESENTATIVE, "첫 입력");
      await a.unmount();
      const b = await mount(companyRow(), second.saveOwnField, undefined, second.api);
      expect(b.value(REPRESENTATIVE)).toBe("가상 대표");
      await b.edit(REPRESENTATIVE, "둘째 입력");
      await respond(first.rows[0]);
      await respond(first.stores[0]);
      expect(second.saveOwnField).toHaveBeenCalledTimes(1);
      await respond(second.rows[0], new Error("synthetic permanent failure"));
      expect(b.value(REPRESENTATIVE)).toBe("첫 입력");
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });
  });

  // review-f96e3682 W2: 상세에서 처음 실패한 값은 앱이 재조회 때 표에 얹는다. 되돌리기가 상세만 고치면 표에 실패값이 남는다.
  describe("v10 앱 표 되돌리기 통로", () => {
    it("상세에서 처음 실패한 값을 되돌리면 앱 표의 같은 칸도 확정값으로 되돌린다", async () => {
      const { unsaved, report } = failureBridge();
      const applyToTable = vi.fn();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, { ...unsaved, applyToTable }, s.api);
      await h.edit(REPRESENTATIVE, "실패 입력");
      await respond(s.rows[0], transientFailure());
      const entry = report.mock.calls[0][0];
      expect(entry.basicRestore.applyToTable).toBeTypeOf("function");
      entry.revert();
      await settle();
      expect(applyToTable).toHaveBeenCalledTimes(1);
      expect(applyToTable).toHaveBeenCalledWith("row-1", REPRESENTATIVE, { value: "가상 대표", present: true });
      expect(h.value(REPRESENTATIVE)).toBe("가상 대표");
    });

    // review-09cd2c02 새 P2: 이어받은 저장 묶음은 지금 화면(표)의 되돌리기 통로를 써야 한다.
    it.each([
      { label: "통로가 없던 이전 창", before: () => undefined },
      { label: "다른 통로를 쓰던 이전 창", before: () => vi.fn() },
    ])("$label의 입력을 이어받은 새 창이 실패를 되돌리면 새 창의 표 통로로 확정값을 돌린다", async ({ before }) => {
      const { unsaved, report } = failureBridge();
      const previous = before();
      const applyToTable = vi.fn();
      const first = twoStores();
      const second = twoStores();
      const a = await mount(companyRow(), first.saveOwnField, { ...unsaved, applyToTable: previous }, first.api);
      await a.edit(REPRESENTATIVE, "첫 입력");
      await a.unmount();
      const b = await mount(companyRow(), second.saveOwnField, { ...unsaved, applyToTable }, second.api);
      await b.edit(REPRESENTATIVE, "둘째 입력");
      await respond(first.rows[0]);
      await respond(first.stores[0]);
      await respond(second.rows[0], transientFailure());
      report.mock.calls.at(-1)![0].revert();
      await settle();
      expect(applyToTable).toHaveBeenCalledTimes(1);
      expect(applyToTable).toHaveBeenCalledWith("row-1", REPRESENTATIVE, { value: "첫 입력", present: true });
      if (previous) expect(previous).not.toHaveBeenCalled();
      expect(b.value(REPRESENTATIVE)).toBe("첫 입력");
    });
  });

  // review-0e8838f2 P2: 앱 보관함의 복구 정보에 남은 옛 표 통로(페이지 재진입 전)보다 지금 화면의 표 통로를 쓴다.
  describe("v11 복구 정보의 옛 표 통로", () => {
    it("남은 실패 항목의 옛 표 통로 대신 새로 연 화면의 표 통로로 되돌린다", async () => {
      const { unsaved, report } = failureBridge();
      const stale = vi.fn();
      const applyToTable = vi.fn();
      const recovery = { original: { value: "가상 대표", present: true }, applyToTable: stale };
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, { ...unsaved, applyToTable, getBasicRecovery: () => recovery }, s.api);
      await h.edit(REPRESENTATIVE, "새 입력");
      await respond(s.rows[0], transientFailure());
      report.mock.calls.at(-1)![0].revert();
      await settle();
      expect(stale).not.toHaveBeenCalled();
      expect(applyToTable).toHaveBeenCalledWith("row-1", REPRESENTATIVE, { value: "가상 대표", present: true });
    });

    // review-0e8838f2 P2: 같은 칸 저장 줄을 쓰는 앱 표가 복원 기준을 서버가 받은 상세 값으로 맞출 수 있게 알린다.
    it("행 저장을 서버가 받으면 그 값을 앱에 알리고, 실패한 입력은 알리지 않는다", async () => {
      const { unsaved } = failureBridge();
      const noteBasicServerValue = vi.fn();
      const s = twoStores();
      const h = await mount(companyRow(), s.saveOwnField, { ...unsaved, noteBasicServerValue }, s.api);
      await h.edit(REPRESENTATIVE, "받은 입력");
      expect(noteBasicServerValue).not.toHaveBeenCalled();
      await respond(s.rows[0]);
      expect(noteBasicServerValue).toHaveBeenCalledTimes(1);
      expect(noteBasicServerValue).toHaveBeenCalledWith(`synthetic:row-1:${REPRESENTATIVE}`, { value: "받은 입력", present: true });
      await respond(s.stores[0]);
      await h.edit(REPRESENTATIVE, "실패 입력");
      await respond(s.rows[1], transientFailure());
      expect(noteBasicServerValue).toHaveBeenCalledTimes(1);
    });
  });

  // review-09cd2c02 #2는 반영하지 않는다: 저장 뒤 비교 기준을 확정값으로 옮기면 저장 전 값을 싣고 늦게 온 옛 응답이
  // 체크를 되돌린다(이 파일의 "같은 회사 새 row 도착" 10건이 실패 — 해피콜 초기화 원래 결함). 값만으로는 늦은 옛 응답과
  // 다른 사용자의 되돌림을 구분할 수 없어, 원래 결함 차단을 우선한다. 되돌린 뒤의 기준만 보호선으로 둔다.
  describe("v11 보호 완료 뒤 비교 기준", () => {
    it("행 저장이 확인된 값을 보호 중 받았으면 이후 다른 사용자의 변경을 반영한다", async () => {
      const s = twoStores();
      const row = (value: boolean) => companyRow({ _id: "row-confirmed-observation", [FLAG]: value });
      const h = await mount(row(false), s.saveOwnField, undefined, s.api);
      await h.edit(FLAG, true);
      await respond(s.rows[0]);
      await h.rerender(row(true)); // 행 저장 성공, 공용 기록은 아직 대기 중
      expect(h.value(FLAG)).toBe("true");
      await respond(s.stores[0]);
      await h.rerender(row(false)); // 다른 사용자가 이후 해제한 최신 조회
      expect(h.value(FLAG)).toBe("false");
    });

    it("영구 실패로 되돌린 뒤에는 되돌린 값이 기준이라, 서버가 다른 값을 주면 반영한다", async () => {
      vi.stubGlobal("alert", vi.fn());
      // 앞 시험이 row-1 해피콜 입력을 열어 둔 채 끝나므로(모듈 단위 입력 장부) 다른 행으로 고립한다.
      const s = twoStores();
      const h = await mount(companyRow({ _id: "row-v11", [FLAG]: false }), s.saveOwnField, undefined, s.api);
      await h.edit(FLAG, true);
      await h.rerender(companyRow({ _id: "row-v11", [FLAG]: true }));
      await respond(s.rows[0], new Error("synthetic permanent failure"));
      expect(h.value(FLAG)).toBe("false");
      await h.rerender(companyRow({ _id: "row-v11", [FLAG]: true }));
      expect(h.value(FLAG)).toBe("true");
    });
  });

  describe("v10 첫 조회 중 대상 전환", () => {
    it("첫 분야 조회가 끝나기 전에 다른 회사로 바꾸면 새 회사를 다시 불러와 '불러오는 중'에 멈추지 않는다", async () => {
      const held = deferred<CustomerDetailLite>();
      const loadDomainRows = vi.fn()
        .mockImplementationOnce(() => held.promise)
        .mockResolvedValue(syntheticDetail());
      const h = await mount(companyRow(), async () => {}, undefined, { loadDomainRows, loadBasicStore: async () => null });
      expect(loadDomainRows).toHaveBeenCalledTimes(1);
      await h.rerender(otherCompanyRow());
      await act(async () => { held.resolve(syntheticDetail()); });
      await settle();
      expect(loadDomainRows).toHaveBeenCalledTimes(2);
      expect(document.body.textContent ?? "").not.toContain("불러오는 중");
    });
  });
});


describe("v9 상세 조회 응답의 원래 회사 소유권", () => {
  it.each(["resolve", "reject"])("구회사 조회 시작 뒤 같은 상세 instance를 바꾸면 옛 %s는 현재 상태에 닿지 않는다", async outcome => {
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { useDetailLoadState } = await import("./detail-load-state");
    type Detail = Awaited<ReturnType<UnifiedDetailAdapter["api"]["loadDomainRows"]>>;
    const detail = (status: string) => ({ key: "b:1234567890", bizno: "1234567890", company: "합성 회사", ceo: "", phone: "", domainRows: [{ domain: "government-subsidy", domainLabel: "정부지원금", entryId: "gov-1", status, row: { _id: "gov-1" } }] }) as Detail;
    let resolveOld!: (value: Detail) => void;
    let rejectOld!: (error: Error) => void;
    const oldRead = new Promise<Detail>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const load = vi.fn().mockResolvedValueOnce(detail("원래 현황")).mockImplementationOnce(() => oldRead).mockResolvedValue(detail("새 회사 현황"));
    function Probe({ rows, onSaved }: { rows: Array<{ status?: string }>; onSaved?: () => void }) {
      const { rowsLoadFailed } = useDetailLoadState();
      return React.createElement("div", {},
        React.createElement("output", { "data-v9-read-state": "" }, `${rows.map(item => item.status).join(",")}|${String(rowsLoadFailed)}`),
        React.createElement("button", { "data-v9-read-refresh": "", onClick: () => onSaved?.() }, "시험 저장 완료"));
    }
    const adapter = {
      appName: "ERP", ownDomain: "tax-amendment", ownColumns: [], configScope: "v9-read-owner", domains: [{ key: "government-subsidy", label: "정부지원금", domains: ["government-subsidy"] }],
      api: { loadDomainRows: load, getCachedDomainRows: () => null, loadTabConfig: async () => ({ data: {} }), saveTabConfig: async () => {}, loadColumnConfig: async () => ({ data: {} }), saveColumnConfig: async () => {}, loadManagers: async () => [], saveOwnField: async () => {}, loadBasicStore: async () => null },
      fieldOptions: { READONLY_TYPES: new Set(), getFieldOptions: () => [], addCustomOption: () => {}, removeCustomOption: () => {}, setOptionColor: () => {}, getOptionColorClass: () => "", OPTION_COLOR_FAMILIES: [], OPTION_COLOR_PALETTE: [], STATUS_COLORS: {}, SELECT_BADGE_COLORS: {}, isReadonlyPerson: () => false },
      components: { SettlementInfoTab: () => null, MeetingsTab: () => null, ErpFilesPanel: () => null, SectionSettlementTab: () => null, sectionPanels: { "government-subsidy": Probe } }, ownFileFields: [], getAllFiles: () => [],
    } as unknown as UnifiedDetailAdapter;
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    const first = { _id: "v9-read-a", "02상호명": "원래 회사", "15사업자번호": "1234567890" };
    const second = { _id: "v9-read-b", "02상호명": "새 회사", "15사업자번호": "0987654321" };
    const settleRead = async () => { for (let i = 0; i < 3; i++) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
    const render = async (row: typeof first) => { await React.act(async () => { root.render(React.createElement(UnifiedDetailView, { row: row as never, adapter, onClose: () => {}, initialTab: "government-subsidy" })); }); await settleRead(); };
    const refresh = async () => { const button = container.querySelector<HTMLButtonElement>("button[data-v9-read-refresh]"); expect(button, "실제 주입 패널의 저장 통지 단추").not.toBeNull(); await React.act(async () => { button!.click(); }); await settleRead(); };
    try {
      await render(first);
      if (!container.querySelector("button[data-v9-read-refresh]")) {
        const tab = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("정부지원금"));
        expect(tab, "실제 정부지원금 분야 탭").toBeDefined();
        await React.act(async () => { tab!.click(); }); await settleRead();
      }
      await refresh(); // A 조회가 출발하고 응답은 보류한다.
      expect(load).toHaveBeenCalledTimes(2);
      await render(second); // key를 바꾸지 않으므로 같은 mounted UDV다.
      await refresh(); // 현재 회사 B 조회가 먼저 끝나 실제 panel에 보인다.
      expect(container.querySelector("[data-v9-read-state]")?.textContent).toBe("새 회사 현황|false");
      await React.act(async () => { if (outcome === "resolve") resolveOld(detail("옛 회사 늦은 현황")); else rejectOld(new Error("옛 회사 늦은 조회 실패")); });
      await settleRead();
      expect(container.querySelector("[data-v9-read-state]")?.textContent).toBe("새 회사 현황|false");
    } finally {
      resolveOld(detail("정리"));
      await React.act(async () => { root.unmount(); }); container.remove();
    }
  });
});
