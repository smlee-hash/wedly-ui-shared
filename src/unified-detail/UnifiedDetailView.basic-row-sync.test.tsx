// @vitest-environment jsdom
// 기본정보 칸 행 동기화·저장 순서 — UnifiedDetailView 를 실제로 그려(입력→저장→실패→다시 저장→창 닫기→회사 전환) 확인한다.
// 이 패키지 버전의 상세창은 compact 한 모양뿐이라(wide 변형 없음) 그 한 가지 모양을 그대로 검증한다.
// 사업자번호는 가짜 값만 쓰고, 보관소 기록의 칸 이름은 실제 라벨 매핑(공통 라벨·커스텀 칸 라벨)을 그대로 탄다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import UnifiedDetailView from "./UnifiedDetailView";
import type { BasicRecord, BasicRecovery, BasicRestoreOriginal, UnifiedDetailAdapter } from "./adapter-types";
import { customerKeyFromTaxRow } from "./lib/customer-detail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T = void>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** 어댑터가 던지는 저장 실패 — transient 는 앱 저장 실패 막대로, 그 외(permanent)는 되돌리기+경고창으로 간다. */
function failure(message: string, kind: "transient" | "permanent"): Error {
  return Object.assign(new Error(message), kind === "transient" ? { saveFailureKind: "transient" } : {});
}

type Report = Parameters<NonNullable<UnifiedDetailAdapter["unsaved"]>["report"]>[0];
// 앱 Provider의 기본정보 merge 분기: 첫 confirmed 기준과 새 apply를 연결한다.
function mergeHostEntry(prev: Report[], entry: Report): Report[] {
  const old = prev.find((e) => e.id === entry.id);
  const rest = prev.filter((e) => e.id !== entry.id);
  if (entry.basicRestore) {
    const original = old ? old.basicRestore?.original : entry.basicRestore.original;
    const apply = entry.basicRestore.apply;
    const applyToTable = entry.basicRestore.applyToTable ?? old?.basicRestore?.applyToTable;
    const basicRestore = Object.assign(entry.basicRestore, { original, applyToTable });
    return [...rest, { ...entry, basicRestore, revert: original === undefined ? undefined : () => { if (basicRestore.original) apply(basicRestore.original); } }];
  }
  return [...rest, old ? { ...entry, revert: old.revert } : entry];
}
type RowCall = { entryId: string; key: string; value: unknown; d: Deferred<void> };
type StoreCall = { bizno: string; app: string; fieldId: string; value: unknown; d: Deferred<BasicRecord | null> };
type ReadCall = { bizno: string; d: Deferred<BasicRecord | null> };
type Detail = Awaited<ReturnType<UnifiedDetailAdapter["api"]["loadDomainRows"]>>;
type DetailRead = { key: string; d: Deferred<Detail> };

function domainDetail(row: Parameters<typeof customerKeyFromTaxRow>[0], status: string): NonNullable<Detail> {
  return {
    key: customerKeyFromTaxRow(row), bizno: "", company: String(row["02상호명"]), ceo: "", phone: "",
    domainRows: [{ domain: "tax-amendment", domainLabel: "경정청구", entryId: String(row._id), status, row }],
  };
}

const FIELD_OPTIONS = {
  READONLY_TYPES: new Set(["last_edited_time", "last_edited_by", "auto_increment_id", "formula"]),
  getFieldOptions: () => [],
  addCustomOption: () => {},
  removeCustomOption: () => {},
  setOptionColor: () => {},
  getOptionColorClass: () => "",
  OPTION_COLOR_FAMILIES: [],
  OPTION_COLOR_PALETTE: [],
  STATUS_COLORS: {},
  SELECT_BADGE_COLORS: {},
  isReadonlyPerson: () => false,
};

const OWN_COLUMNS = [
  { key: "03대표자명", label: "대표자명", type: "text", defaultVisible: true },
  { key: "53이메일", label: "이메일", type: "email", defaultVisible: true },
  { key: "15사업자번호", label: "사업자번호", type: "text", defaultVisible: true },
];
// 커스텀 체크박스 칸 — false 가 진짜 값인지 확인하는 데 쓴다. 공통 라벨이 아니라 보관소 칸 이름은 그 칸의 라벨("확인")이 된다.
const FLAG_COLUMN = { key: "custom_flag", label: "확인", type: "checkbox" };

const BIZNO_A = "9990000001";
const BIZNO_B = "9990000002";

let seq = 0;

function record(fields: Record<string, unknown>): BasicRecord {
  return {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { value: v, updatedAt: "2026-10-14T00:00:00Z", updatedByApp: "erp", updatedByUser: "tester" }]),
    ),
    log: [],
  };
}

function makeHarness(opts: { holdRows?: boolean; holdStores?: boolean; holdReads?: boolean; holdDomainReads?: boolean; flagColumn?: boolean; progressColumn?: boolean } = {}) {
  seq += 1;
  // 항목 id 는 테스트마다 다르게 — 저장 줄(모듈 단위)이 테스트 사이에 이어지지 않게.
  const idA = `recA-${seq}`;
  const idB = `recB-${seq}`;
  const log: string[] = [];
  const rows: RowCall[] = [];
  const stores: StoreCall[] = [];
  const reads: ReadCall[] = [];
  const detailReads: DetailRead[] = [];
  const bar = { entries: [] as Report[] };
  const edits = new Map<string, { valid: boolean; supersede: () => void; recovery?: BasicRecovery }>();
  const updateBar = (next: Report[]) => {
    const previous = bar.entries;
    bar.entries = next;
    for (const old of previous) {
      const current = next.find((e) => e.id === old.id);
      if (!current || current.onDiscard !== old.onDiscard) old.onDiscard?.();
    }
  };
  const getBasicRecovery = (id: string) => {
    const entry = bar.entries.find((e) => e.id === id);
    return entry ? entry.basicRestore ?? {} : edits.get(id)?.recovery;
  };
  const beginBasicEdit = (id: string, supersede: () => void, recovery?: BasicRecovery) => {
    const old = edits.get(id);
    const lease = { valid: true, supersede, recovery };
    edits.set(id, lease);
    if (old) { old.valid = false; old.supersede(); }
    return {
      isCurrent: () => lease.valid && edits.get(id) === lease,
      release: () => { lease.valid = false; if (edits.get(id) === lease) edits.delete(id); },
    };
  };
  const h = {
    holdRows: opts.holdRows ?? false,
    holdStores: opts.holdStores ?? false,
    holdReads: opts.holdReads ?? false,
    idA,
    idB,
    log,
    rows,
    stores,
    reads,
    detailReads,
    bar,
    reports: [] as Report[],
    onSaved: vi.fn(() => { log.push("onSaved"); }),
    unsavedResolve: vi.fn((id: string) => { updateBar(bar.entries.filter((e) => e.id !== id)); }),
    alertSpy: vi.fn(),
    adapter: null as unknown as UnifiedDetailAdapter,
    rowA: (over: Record<string, unknown> = {}) => ({
      _id: idA, "02상호명": "에이상사", "15사업자번호": "999-00-00001", "03대표자명": "원본대표", "53이메일": "a@a.a", ...over,
    }),
    rowB: (over: Record<string, unknown> = {}) => ({
      _id: idB, "02상호명": "비상사", "15사업자번호": "999-00-00002", "03대표자명": "비대표", "53이메일": "b@b.b", ...over,
    }),
    /** 행·보관소 저장만(onSaved 제외) 부른 순서. */
    ops: () => log.filter((s) => s !== "onSaved"),
    opsFor: (needle: string) => log.filter((s) => s !== "onSaved" && s.includes(needle)),
    settleAll: () => {
      for (const r of rows) r.d.resolve();
      for (const s of stores) s.d.resolve(null);
      for (const r of reads) r.d.resolve(null);
      for (const r of detailReads) r.d.resolve(null);
    },
  };
  h.adapter = {
    appName: "HIVE",
    ownDomain: "tax-amendment",
    ownColumns: opts.progressColumn
      ? [...OWN_COLUMNS, { key: "05진행상태", label: "진행상태", type: "text", defaultVisible: true }]
      : OWN_COLUMNS,
    configScope: "unified-collab",
    domains: [],
    api: {
      loadDomainRows: vi.fn((key: string) => {
        const d = deferred<Detail>();
        detailReads.push({ key, d });
        if (!opts.holdDomainReads) d.resolve(null);
        return d.promise;
      }),
      getCachedDomainRows: vi.fn(() => null),
      saveOwnField: vi.fn((entryId: string, key: string, value: unknown) => {
        const d = deferred<void>();
        rows.push({ entryId, key, value, d });
        log.push(`row ${entryId} ${key}=${String(value)}`);
        if (!h.holdRows) d.resolve();
        return d.promise;
      }),
      loadColumnConfig: vi.fn(async () => (
        opts.flagColumn ? { data: { customColumns: [FLAG_COLUMN], basicAddedColumns: [FLAG_COLUMN.key] } } : {}
      )),
      saveColumnConfig: vi.fn(async () => {}),
      loadManagers: vi.fn(async () => []),
      loadTabConfig: vi.fn(async () => ({})),
      saveTabConfig: vi.fn(async () => {}),
      loadComments: vi.fn(async () => []),
      loadBasicStore: vi.fn((bizno: string) => {
        const d = deferred<BasicRecord | null>();
        reads.push({ bizno, d });
        if (!h.holdReads) d.resolve(null);
        return d.promise;
      }),
      saveBasicField: vi.fn((bizno: string, app: string, fieldId: string, value: unknown) => {
        const d = deferred<BasicRecord | null>();
        stores.push({ bizno, app, fieldId, value, d });
        log.push(`store ${bizno} ${app} ${fieldId}=${String(value)}`);
        if (!h.holdStores) d.resolve(null);
        return d.promise;
      }),
    },
    unsaved: {
      scope: "test",
      makeId: (scope: string, rowId: string, fieldKey: string) => `${scope}:${rowId}:${fieldKey}`,
      report: (e: Report) => { h.reports.push(e); updateBar(mergeHostEntry(bar.entries, e)); },
      resolve: h.unsavedResolve, getBasicRecovery, beginBasicEdit,
    },
    ownTieredFieldsPath: () => "",
    sectionSettlementBase: "",
    fieldOptions: FIELD_OPTIONS,
    components: { SettlementInfoTab: () => null, MeetingsTab: () => null, ErpFilesPanel: () => null, SectionSettlementTab: () => null },
    ownFileFields: [],
    ownFileCategoryKey: "",
    getAllFiles: () => [],
  } as unknown as UnifiedDetailAdapter;
  return h;
}
type Harness = ReturnType<typeof makeHarness>;

// ── 화면 도우미 ──
async function settle() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

type View = { container: HTMLElement; render: (row: Record<string, unknown>) => Promise<void>; unmount: () => Promise<void> };
const views: View[] = [];

async function mount(h: Harness, row: Record<string, unknown>, strict = false): Promise<View> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  let mounted = true;
  const view: View = {
    container,
    render: async (r) => {
      await act(async () => {
        const detail = createElement(UnifiedDetailView, { row: r, onClose: () => {}, onSaved: h.onSaved, adapter: h.adapter } as never);
        root.render(strict ? createElement(StrictMode, null, detail) : detail);
      });
      await settle();
    },
    unmount: async () => {
      if (!mounted) return;
      mounted = false;
      await act(async () => { root.unmount(); });
    },
  };
  views.push(view);
  await view.render(row);
  return view;
}

function rowFor(view: View, label: string): HTMLElement {
  for (const s of Array.from(view.container.querySelectorAll("span"))) {
    if (s.textContent !== label) continue;
    const r = s.closest(".group");
    if (r) return r as HTMLElement;
  }
  throw new Error(`기본정보 칸을 찾지 못했습니다: ${label}`);
}

async function clickButton(view: View, label: string) {
  const button = Array.from(view.container.querySelectorAll("button")).find((b) => b.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => { button!.click(); });
  await settle();
}

/** 칸의 값 영역에 보이는 글자(편집 중이 아닐 때). */
function valueOf(view: View, label: string): string {
  return rowFor(view, label).children[1].textContent ?? "";
}

function setInputValue(input: HTMLInputElement, v: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 칸을 눌러 값을 치고 Enter — 값이 있던 칸이면 뜨는 '수정 확인' 창의 저장 버튼까지 누른다. */
async function editText(view: View, label: string, text: string) {
  await act(async () => { (rowFor(view, label).querySelector(".cursor-pointer") as HTMLElement).click(); });
  const input = rowFor(view, label).querySelector("input") as HTMLInputElement;
  await act(async () => { setInputValue(input, text); });
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  const save = Array.from(rowFor(view, label).querySelectorAll("button")).find((b) => b.textContent === "저장");
  if (save) await act(async () => { save.click(); });
  await settle();
}

function isChecked(view: View, label: string): boolean {
  return rowFor(view, label).querySelector("button svg") !== null;
}

async function clickCheckbox(view: View, label: string) {
  await act(async () => { (rowFor(view, label).querySelector("button") as HTMLElement).click(); });
  await settle();
}

describe("기본정보 칸 행 동기화·저장 (compact)", () => {
  let current: Harness | null = null;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null })));
  });

  afterEach(async () => {
    // 붙잡아 둔 저장이 남아 있으면 모듈 단위 저장 줄이 다음 테스트까지 이어지므로 모두 풀어 준다.
    if (current) {
      current.holdRows = false;
      current.holdStores = false;
      current.holdReads = false;
      current.settleAll();
      await settle(); // 실패 시험을 정리하며 줄에서 새로 출발한 호출도 자동 완료시킨다
    }
    current = null;
    for (const v of views.splice(0)) await v.unmount();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function setup(opts: Parameters<typeof makeHarness>[0] = {}): Harness {
    const h = makeHarness(opts);
    vi.stubGlobal("alert", h.alertSpy);
    current = h;
    return h;
  }

  it.each([false, true])("표가 이어받은 뒤 최초/재시도(%s) ACK도 성공값을 표 복원 통로에 전달한다", async (retry) => {
    const h = setup({ holdRows: true });
    const note = vi.fn();
    Object.assign(h.adapter.unsaved!, { noteBasicServerValue: note });
    const view = await mount(h, h.rowA());
    await editText(view, "대표자명", "저장된 A");
    let pending: Promise<boolean> | undefined;
    if (retry) {
      await act(async () => { h.rows[0].d.reject(failure("일시 실패", "transient")); });
      await settle();
      await act(async () => { pending = h.bar.entries[0].retry(); });
      await settle();
    }
    await view.unmount();
    h.adapter.unsaved!.beginBasicEdit!(`test:${h.idA}:03대표자명`, () => {});
    await act(async () => { h.rows[retry ? 1 : 0].d.resolve(); });
    await settle();
    expect(note).toHaveBeenCalledExactlyOnceWith(`test:${h.idA}:03대표자명`, { value: "저장된 A", present: true });
    expect(h.onSaved).toHaveBeenCalledTimes(retry ? 0 : 1);
    expect(h.stores).toHaveLength(retry ? 0 : 1);
    if (pending) expect(await pending).toBe(false);
  });

  describe("hx6 표·상세 확정값 객체 인계", () => {
    // 표의 진행 중 PATCH와 Provider의 칸별 저장 줄. 실제 상세를 마운트하고 같은 객체를 인계한다.
    function startTable(h: Harness, original: BasicRestoreOriginal | undefined, key = "03대표자명", value: string | boolean = "표 A") {
      const bridge = h.adapter.unsaved!;
      const tails = new Map<string, Promise<unknown>>();
      bridge.runBasicWrite = <T,>(id: string, task: () => Promise<T>) => {
        const job = (tails.get(id) ?? Promise.resolve()).then(task);
        const tail = job.catch(() => {});
        tails.set(id, tail);
        void tail.then(() => { if (tails.get(id) === tail) tails.delete(id); });
        return job;
      };
      const id = bridge.makeId(bridge.scope, h.idA, key);
      const applyToTable = vi.fn();
      const recovery: BasicRecovery = { original, applyToTable };
      const lease = bridge.beginBasicEdit!(id, () => {}, recovery);
      const d = deferred();
      const done = bridge.runBasicWrite(id, async () => {
        await d.promise;
        recovery.original = { value, present: true };
      }).catch(() => {}).finally(lease.release);
      return { id, recovery, applyToTable, done, d };
    }

    async function completeTable(table: ReturnType<typeof startTable>, accepted: boolean) {
      await act(async () => {
        if (accepted) table.d.resolve();
        else table.d.reject(failure("표 A 거절", "permanent"));
        await table.done;
      });
      await settle();
    }

    async function failDetail(h: Harness, kind: "permanent" | "transient") {
      expect(h.rows).toHaveLength(1);
      await act(async () => { h.rows[0].d.reject(failure("상세 B 실패", kind)); });
      await settle();
      if (kind === "transient") {
        expect(h.bar.entries).toHaveLength(1);
        await act(async () => {
          const entry = h.bar.entries[0];
          entry.revert?.();
          h.adapter.unsaved!.resolve(entry.id); // Provider의 되돌리기 버튼이 끝난 항목을 제거한다.
        });
        await settle();
      }
    }

    for (const accepted of [false, true]) for (const beforeInput of [false, true]) {
      it.each(["permanent", "transient"] as const)(`표 A ${accepted ? "성공" : "실패"}, ${beforeInput ? "첫 입력 전" : "B 수락 후"} 완료, 상세 B %s는 실제 확정값으로 복원한다`, async (kind) => {
        const h = setup({ holdRows: true });
        const table = startTable(h, { value: "확정 대표", present: true });
        const view = await mount(h, h.rowA({ "03대표자명": "표 A" }));
        if (beforeInput) await completeTable(table, accepted);
        await editText(view, "대표자명", "상세 B");
        if (!beforeInput) {
          expect(h.rows).toHaveLength(0); // 이미 수락한 B는 A 완료 뒤에 전송한다.
          await completeTable(table, accepted);
        }
        await failDetail(h, kind);
        expect(valueOf(view, "대표자명")).toBe(accepted ? "표 A" : "확정 대표");
        expect(table.applyToTable).toHaveBeenCalledExactlyOnceWith({ value: accepted ? "표 A" : "확정 대표", present: true });
        expect(h.bar.entries).toHaveLength(0);
        expect(h.stores).toHaveLength(0);
      });
    }

    for (const accepted of [false, true]) for (const beforeInput of [false, true]) {
      it.each(["permanent", "transient"] as const)(`unknown 원본, 표 성공(${accepted}), 첫 입력 전 완료(${beforeInput}), B %s는 실제 ACK만 복원값으로 쓴다`, async (kind) => {
        const h = setup({ holdRows: true });
        const table = startTable(h, undefined);
        const view = await mount(h, h.rowA({ "03대표자명": "표 A" }));
        expect(table.recovery.original).toBeUndefined();
        if (beforeInput) await completeTable(table, accepted);
        await editText(view, "대표자명", "상세 B");
        expect(h.adapter.unsaved!.getBasicRecovery!(table.id)).toBe(table.recovery);
        if (!beforeInput) {
          expect(table.recovery.original).toBeUndefined();
          await completeTable(table, accepted);
        }
        await act(async () => { h.rows[0].d.reject(failure("B 실패", kind)); });
        await settle();
        expect(table.recovery.original).toEqual(accepted ? { value: "표 A", present: true } : undefined);
        if (kind === "transient") {
          const entry = h.bar.entries[0];
          expect(entry.basicRestore).toBe(table.recovery);
          if (accepted) await act(async () => { entry.revert?.(); });
          else expect(entry.revert).toBeUndefined();
        } else expect(h.bar.entries).toHaveLength(0);
        expect(valueOf(view, "대표자명")).toBe(accepted ? "표 A" : "상세 B");
        if (!accepted) expect(table.applyToTable).not.toHaveBeenCalled();
      });
    }

    it.each([
      { name: "false", key: "custom_flag", original: { value: false, present: true }, value: true },
      { name: "null", key: "03대표자명", original: { value: null, present: true }, value: "표 A" },
      { name: "키 부재", key: "03대표자명", original: { value: null, present: false }, value: "표 A" },
    ])("표 실패 후 $name 복원 기준을 값·존재 여부까지 보존한다", async ({ key, original, value }) => {
      const h = setup({ holdRows: true, flagColumn: true });
      const table = startTable(h, original, key, value);
      const view = await mount(h, h.rowA({ [key]: value }));
      if (key === "custom_flag") await clickCheckbox(view, "확인");
      else await editText(view, "대표자명", "상세 B");
      await completeTable(table, false);
      await failDetail(h, "transient");
      expect(table.applyToTable).toHaveBeenCalledExactlyOnceWith(original);
      if (key === "custom_flag") expect(isChecked(view, "확인")).toBe(false);
      else expect(valueOf(view, "대표자명")).toBe("-");
    });

    it.each(["새 행", "보관소"])("첫 입력 전 %s가 실제 적용되면 상속한 표 기준을 교체한다", async (source) => {
      const h = setup({ holdRows: true, holdReads: true });
      const table = startTable(h, { value: "옛 원본", present: true });
      const view = await mount(h, h.rowA({ "03대표자명": "표 A" }));
      await completeTable(table, true);
      if (source === "새 행") await view.render(h.rowA({ "03대표자명": "새 서버값" }));
      else {
        await view.render(h.rowA({ "03대표자명": "" }));
        await act(async () => { h.reads.at(-1)!.d.resolve(record({ "대표자명": "새 서버값" })); });
        await settle();
      }
      await editText(view, "대표자명", "상세 B");
      await failDetail(h, "permanent");
      expect(valueOf(view, "대표자명")).toBe("새 서버값");
    });

    it.each(["새 행", "보관소"])("표가 아직 진행 중이어도 실제 적용된 %s가 다음 입력의 새 기준이다", async (source) => {
      const h = setup({ holdRows: true, holdReads: true });
      const table = startTable(h, { value: "옛 원본", present: true });
      const view = await mount(h, h.rowA({ "03대표자명": "표 A" }));
      if (source === "새 행") await view.render(h.rowA({ "03대표자명": "새 서버값" }));
      else {
        await view.render(h.rowA({ "03대표자명": "" }));
        await act(async () => { h.reads.at(-1)!.d.resolve(record({ "대표자명": "새 서버값" })); });
        await settle();
      }
      expect(valueOf(view, "대표자명")).toBe("새 서버값");
      await editText(view, "대표자명", "상세 B");
      await completeTable(table, false);
      await failDetail(h, "permanent");
      expect(valueOf(view, "대표자명")).toBe("새 서버값");
      expect(table.applyToTable).toHaveBeenCalledExactlyOnceWith({ value: "새 서버값", present: true });
    });

    it("첫 입력 때 현재 Provider의 표 복원 통로가 예전 통로보다 우선한다", async () => {
      const h = setup({ holdRows: true });
      const table = startTable(h, { value: "확정 대표", present: true });
      const view = await mount(h, h.rowA({ "03대표자명": "표 A" }));
      await completeTable(table, false);
      const currentApply = vi.fn();
      h.adapter.unsaved!.getBasicRecovery = () => ({ original: table.recovery.original, applyToTable: currentApply });
      await editText(view, "대표자명", "상세 B");
      await failDetail(h, "permanent");
      expect(currentApply).toHaveBeenCalledExactlyOnceWith({ value: "확정 대표", present: true });
      expect(table.applyToTable).not.toHaveBeenCalled();
      expect(valueOf(view, "대표자명")).toBe("확정 대표");
    });

    it("행에 없는 동적 칸도 정의가 도착하면 첫 입력 전에 표 객체를 붙잡는다", async () => {
      const h = setup({ holdRows: true });
      const config = deferred<unknown>();
      h.adapter.api.loadColumnConfig = vi.fn(() => config.promise);
      const table = startTable(h, { value: false, present: true }, "custom_flag", true);
      const view = await mount(h, h.rowA());
      await act(async () => { config.resolve({ data: { customColumns: [FLAG_COLUMN], basicAddedColumns: [FLAG_COLUMN.key] } }); });
      await settle();
      await completeTable(table, false);
      await clickCheckbox(view, "확인");
      await failDetail(h, "permanent");
      expect(table.applyToTable).toHaveBeenCalledExactlyOnceWith({ value: false, present: true });
      expect(isChecked(view, "확인")).toBe(false);
    });

    it.each([false, true])("상세 최초/취소 retry(%s)의 이미 전송된 ACK는 같은 표 객체만 갱신하고 후속 쓰기를 막는다", async (retry) => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "상세 A");
      const bridge = h.adapter.unsaved!;
      const id = bridge.makeId(bridge.scope, h.idA, "03대표자명");
      const recovery = bridge.getBasicRecovery!(id);
      expect(recovery).toBeDefined();
      let pending: Promise<boolean> | undefined;
      if (retry) {
        await act(async () => { h.rows[0].d.reject(failure("A 일시 실패", "transient")); });
        await settle();
        await act(async () => { pending = h.bar.entries[0].retry(); });
        await settle();
      }
      const applyToTable = vi.fn();
      recovery!.applyToTable = applyToTable;
      const lease = bridge.beginBasicEdit!(id, () => {}, recovery);
      bridge.resolve(id);
      await act(async () => { h.rows[retry ? 1 : 0].d.resolve(); });
      await settle();
      expect(bridge.getBasicRecovery!(id)).toBe(recovery);
      expect(recovery!.original).toEqual({ value: "상세 A", present: true });
      expect(h.stores).toHaveLength(retry ? 0 : 1);
      expect(h.onSaved).toHaveBeenCalledTimes(retry ? 0 : 1);
      expect(applyToTable).not.toHaveBeenCalled();
      if (pending) expect(await pending).toBe(false);
      lease.release();
    });
  });

  describe("hx4 리뷰 회사 소유권·요청 최신성", () => {
    function contractProbe(h: Harness, committed: string[] = []) {
      h.adapter.components.SettlementInfoTab = ({ row, onSave }) => createElement("button", {
        "data-contract-owner": String(row._id),
        ref: (node: HTMLButtonElement | null) => { if (node) committed.push(String(row._id)); },
        onClick: () => { void onSave("계약 수정"); },
      }, "계약 시험 저장");
    }

    it("회사를 바꾼 첫 화면부터 이전 계약의 편집 경로를 제거한다", async () => {
      const h = setup({ holdDomainReads: true });
      const committed: string[] = [];
      contractProbe(h, committed);
      const view = await mount(h, h.rowA());
      await act(async () => { h.detailReads[0].d.resolve(domainDetail(h.rowA(), "A현황")); });
      await clickButton(view, "경정청구");
      await clickButton(view, "계약정보");
      expect(view.container.querySelector("[data-contract-owner]")?.getAttribute("data-contract-owner")).toBe(h.idA);
      committed.length = 0;
      await view.render(h.rowB());
      expect(committed).not.toContain(h.idA);
      expect(view.container.querySelector("[data-contract-owner]")).toBeNull();
      expect(h.rows).toHaveLength(0);
    });

    it("새 회사 조회가 null이면 옛 계약을 남기지 않고, 같은 회사의 null 새 조회도 자료를 비운다", async () => {
      const h = setup({ holdDomainReads: true });
      contractProbe(h);
      const view = await mount(h, h.rowA());
      await act(async () => { h.detailReads[0].d.resolve(domainDetail(h.rowA(), "A현황")); });
      await clickButton(view, "경정청구");
      await clickButton(view, "계약정보");
      await view.render(h.rowB());
      await act(async () => { h.detailReads[1].d.resolve(null); });
      await settle();
      expect(view.container.querySelector("[data-contract-owner]")).toBeNull();
      expect(view.container.textContent).toContain("경정청구 데이터가 없습니다");
      await view.render(h.rowA());
      await act(async () => { h.detailReads[2].d.resolve(domainDetail(h.rowA(), "A현황")); });
      await clickButton(view, "계약 시험 저장");
      expect(h.rows[0]).toMatchObject({ entryId: h.idA, key: "계약정보_차수" });
      await act(async () => { h.detailReads[3].d.resolve(null); });
      await settle();
      expect(view.container.querySelector("[data-contract-owner]")).toBeNull();
    });

    it.each(["resolve", "reject"])("최신 silent 조회가 처음 조회보다 먼저 끝나면 로딩을 마치고 옛 %s를 무시한다", async (outcome) => {
      const h = setup({ holdDomainReads: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");
      expect(h.detailReads).toHaveLength(2);
      await act(async () => { h.detailReads[1].d.resolve(domainDetail(h.rowA(), "최신현황")); });
      await settle();
      expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
      expect(view.container.querySelector('[title="최신현황"]')).not.toBeNull();
      await act(async () => {
        if (outcome === "resolve") h.detailReads[0].d.resolve(domainDetail(h.rowA(), "옛현황"));
        else h.detailReads[0].d.reject(new Error("옛 조회 실패"));
      });
      await settle();
      expect(view.container.querySelector('[title="최신현황"]')).not.toBeNull();
      expect(view.container.textContent).not.toContain("정보를 불러오지 못했습니다");
    });

    it("사업자번호가 없으면 변경한 연락처로 다시 조회하고 옛 연락처 응답은 버린다", async () => {
      const h = setup({ holdDomainReads: true });
      const first = h.rowA({ "15사업자번호": "", "04연락처": "010-9999-0001" });
      const next = { ...first, "04연락처": "010-9999-0002" };
      const view = await mount(h, first);
      await editText(view, "연락처", "010-9999-0002");
      await view.render(next);
      expect(h.detailReads.map((r) => r.key)).toContain("p:01099990002");
      await act(async () => {
        h.detailReads.at(-1)!.d.resolve(domainDetail(next, "새연락처현황"));
      });
      await settle();
      await act(async () => {
        for (const read of h.detailReads.slice(0, -1)) read.d.resolve(domainDetail(first, "옛연락처현황"));
      });
      await settle();
      expect(view.container.querySelector('[title="새연락처현황"]')).not.toBeNull();
      expect(view.container.querySelector('[title="옛연락처현황"]')).toBeNull();
    });

    it("StrictMode 두 번째 조회 성공 뒤 첫 번째 실패가 정상 화면을 덮지 않는다", async () => {
      const h = setup({ holdDomainReads: true });
      const view = await mount(h, h.rowA(), true);
      expect(h.detailReads).toHaveLength(2);
      await act(async () => { h.detailReads[1].d.resolve(domainDetail(h.rowA(), "최신현황")); });
      await settle();
      expect(view.container.querySelector('[title="최신현황"]')).not.toBeNull();
      await act(async () => { h.detailReads[0].d.reject(new Error("첫 조회 실패")); });
      await settle();
      expect(view.container.textContent).not.toContain("정보를 불러오지 못했습니다");
      expect(view.container.querySelector('[title="최신현황"]')).not.toBeNull();
    });
  });

  describe("hx4 리뷰 재열기 확정 기준", () => {
    it("재열기 후 이전 저장이 새 입력 전에 끝나도 다음 실패를 A로 복원한다", async () => {
      const h = setup({ holdRows: true });
      let view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A");
      await view.unmount();
      view = await mount(h, h.rowA());
      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      await editText(view, "대표자명", "B");
      await act(async () => { h.rows[1].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("A");
    });

    it("재열기에서 ACK 전에 관측한 A는 옛 owner ACK 뒤 비교 기준으로 쓰여 다음 서버 원본을 받는다", async () => {
      const h = setup({ holdRows: true });
      let view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A");
      await view.unmount();
      view = await mount(h, h.rowA());
      await editText(view, "대표자명", "B");
      await view.render(h.rowA({ "03대표자명": "A" }));
      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      await act(async () => { h.rows[1].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("A");
      await view.render(h.rowA());
      expect(valueOf(view, "대표자명")).toBe("원본대표");
    });

    it.each(["관측 없음", "새 행 적용", "보관소 적용"])("재열기 확정값의 수명: %s", async (observed) => {
      const h = setup({ holdRows: true, holdReads: true });
      let view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A");
      await view.unmount();
      view = await mount(h, h.rowA());
      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      if (observed === "새 행 적용") await view.render(h.rowA({ "03대표자명": "서버최신" }));
      if (observed === "보관소 적용") {
        await view.render(h.rowA({ "03대표자명": "" }));
        await act(async () => { h.reads.at(-1)!.d.resolve(record({ "대표자명": "서버최신" })); });
        await settle();
      }
      await editText(view, "대표자명", "B");
      await act(async () => { h.rows[1].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe(observed === "관측 없음" ? "A" : "서버최신");
      if (observed === "관측 없음") {
        await view.render(h.rowA());
        expect(valueOf(view, "대표자명")).toBe("A"); // 성공만으로 비교 기준을 A로 옮기지 않는다.
      }
    });
  });

  describe("같은 회사 새 행 병합", () => {
    it("서버 값이 그대로인 칸은 입력을 지키고, 바뀐 칸만 갱신하며, null·키 삭제도 실제 값으로 반영한다", async () => {
      const h = setup();
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");
      expect(valueOf(view, "대표자명")).toBe("새대표");

      // 새 행 객체 — 대표자명은 서버에서 그대로(아직 새 값이 반영되기 전), 이메일만 바뀜.
      await view.render(h.rowA({ "53이메일": "b@b.b" }));
      expect(valueOf(view, "대표자명")).toBe("새대표");
      expect(valueOf(view, "이메일")).toBe("b@b.b");

      // 키가 사라진 것도 실제 변화 — 화면에서 비워진다.
      const withoutEmail = h.rowA();
      delete (withoutEmail as Record<string, unknown>)["53이메일"];
      await view.render(withoutEmail);
      expect(valueOf(view, "대표자명")).toBe("새대표");
      expect(valueOf(view, "이메일")).toBe("-");

      await view.render(h.rowA({ "53이메일": "c@c.c" }));
      expect(valueOf(view, "이메일")).toBe("c@c.c");

      // null 로의 변화도 실제 값.
      await view.render(h.rowA({ "53이메일": null }));
      expect(valueOf(view, "이메일")).toBe("-");
      expect(valueOf(view, "대표자명")).toBe("새대표");

      // 서버가 대표자명을 바꾸면(저장이 끝난 칸) 그 값이 보인다.
      await view.render(h.rowA({ "03대표자명": "서버대표", "53이메일": null }));
      expect(valueOf(view, "대표자명")).toBe("서버대표");
    });

    it("false 는 빈 값이 아니라 실제 값이다 — 서버가 true→false 로 바꾸면 반영, 로컬 입력은 서버 값이 그대로면 유지", async () => {
      const h = setup({ flagColumn: true });
      const view = await mount(h, h.rowA({ custom_flag: true }));
      expect(isChecked(view, "확인")).toBe(true);

      await view.render(h.rowA({ custom_flag: false }));
      expect(isChecked(view, "확인")).toBe(false);

      await clickCheckbox(view, "확인");
      expect(isChecked(view, "확인")).toBe(true);
      expect(h.rows.at(-1)).toMatchObject({ entryId: h.idA, key: "custom_flag", value: true });

      // 서버 값(false)은 그대로 — 다른 칸만 바뀐 새 행이 와도 방금 켠 값이 남는다.
      await view.render(h.rowA({ custom_flag: false, "53이메일": "z@z.z" }));
      expect(isChecked(view, "확인")).toBe(true);
      expect(valueOf(view, "이메일")).toBe("z@z.z");

      // 다시 끄면 false 가 그대로 두 저장소에 간다(null 로 뭉개지 않음).
      await clickCheckbox(view, "확인");
      expect(isChecked(view, "확인")).toBe(false);
      expect(h.rows.at(-1)).toMatchObject({ key: "custom_flag", value: false });
      expect(h.stores.at(-1)).toMatchObject({ bizno: BIZNO_A, app: "erp", fieldId: "확인", value: false });
    });

    it("저장 중인 칸은 새 행이 와도 화면 값을 지키고, 원래 기준값을 지킨 뒤 종료 후 새 행을 반영한다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "저장중");
      expect(h.rows).toHaveLength(1);

      await view.render(h.rowA({ "03대표자명": "서버새값", "53이메일": "c@c.c" }));
      expect(valueOf(view, "대표자명")).toBe("저장중");
      expect(valueOf(view, "이메일")).toBe("c@c.c");

      // 보호 중 incoming은 overlay일 수 있어 확정값이 아니다. 실패는 입력 시작 때의 확정값으로 복원한다.
      await act(async () => { h.rows[0].d.reject(failure("잠긴 칸입니다", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("원본대표");
      await view.render(h.rowA({ "03대표자명": "서버새값", "53이메일": "c@c.c" }));
      expect(valueOf(view, "대표자명")).toBe("서버새값");
    });
  });

  describe("같은 칸 저장 순서", () => {
    it("같은 칸은 입력 순서대로 '행 → 보관소' 한 줄로 가고, 다른 칸은 기다리지 않는다", async () => {
      const h = setup({ holdRows: true, holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "첫번째");
      await editText(view, "대표자명", "두번째");
      await editText(view, "이메일", "other@x.com");

      // 두 번째 입력은 줄을 서고, 다른 칸(이메일)은 바로 나간다.
      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=첫번째`,
        `row ${h.idA} 53이메일=other@x.com`,
      ]);
      expect(valueOf(view, "대표자명")).toBe("두번째");

      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      // 첫 입력의 행 저장이 끝나면 보관소 기록이 이어지고, 그게 끝나기 전엔 두 번째 행 저장이 시작되지 않는다.
      expect(h.opsFor("대표자명")).toEqual([
        `row ${h.idA} 03대표자명=첫번째`,
        `store ${BIZNO_A} erp 대표자명=첫번째`,
      ]);

      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      expect(h.opsFor("대표자명")).toEqual([
        `row ${h.idA} 03대표자명=첫번째`,
        `store ${BIZNO_A} erp 대표자명=첫번째`,
        `row ${h.idA} 03대표자명=두번째`,
      ]);

      const second = h.rows.find((r) => r.key === "03대표자명" && r.value === "두번째")!;
      await act(async () => { second.d.resolve(); });
      await settle();
      expect(h.opsFor("대표자명")).toEqual([
        `row ${h.idA} 03대표자명=첫번째`,
        `store ${BIZNO_A} erp 대표자명=첫번째`,
        `row ${h.idA} 03대표자명=두번째`,
        `store ${BIZNO_A} erp 대표자명=두번째`,
      ]);
      expect(valueOf(view, "대표자명")).toBe("두번째");
    });

    it("창을 닫아도(언마운트) 이미 받은 저장은 순서대로 끝까지 간다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "닫기전1");
      await editText(view, "대표자명", "닫기전2");
      await view.unmount();

      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      expect(h.rows).toHaveLength(2);
      await act(async () => { h.rows[1].d.resolve(); });
      await settle();

      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=닫기전1`,
        `store ${BIZNO_A} erp 대표자명=닫기전1`,
        `row ${h.idA} 03대표자명=닫기전2`,
        `store ${BIZNO_A} erp 대표자명=닫기전2`,
      ]);
      expect(h.alertSpy).not.toHaveBeenCalled();
      // 최신 저장 성공은 원래 부모에 알리고, 닫힌 상세의 내부 상태는 갱신하지 않는다.
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(h.reports).toHaveLength(0);
    });
  });

  describe("창 닫기", () => {
    it("닫은 뒤 최신 잠깐 실패는 앱 막대에 남기고 상세 경고·콜백은 부르지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "닫기전");
      await view.unmount();

      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(1);
      expect(h.alertSpy).not.toHaveBeenCalled();
      expect(h.onSaved).not.toHaveBeenCalled();
      expect(h.stores).toHaveLength(0);
    });

    it("닫은 뒤 옛 영구 실패도 경고창을 띄우지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "닫기전");
      await view.unmount();

      await act(async () => { h.rows[0].d.reject(failure("잠긴 칸입니다", "permanent")); });
      await settle();
      expect(h.alertSpy).not.toHaveBeenCalled();
      expect(h.reports).toHaveLength(0);
    });

    it("닫기 전에 담긴 최신 실패 막대는 닫은 뒤 원래 행·보관소로 다시 저장한다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "임시값");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);

      await view.unmount();
      h.holdRows = false;
      let ok: boolean | undefined;
      await act(async () => { ok = await h.reports[0].retry(); });
      await settle();
      expect(ok).toBe(true);
      await act(async () => { h.reports[0].revert?.(); });
      expect(h.rows).toHaveLength(2);
      expect(h.rows[1]).toMatchObject({ entryId: h.idA, key: "03대표자명", value: "임시값" });
      expect(h.stores).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(0);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("다시 저장이 줄에서 기다리는 사이 창을 닫으면, 이미 나간 다시 저장은 끝까지 가고 기다리던 것은 보내지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "임시값");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);

      // 다시 저장 두 번 — 첫 번째는 바로 나가 붙들리고, 두 번째는 그 뒤 줄에서 기다린다.
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => { first = h.reports[0].retry(); second = h.reports[0].retry(); });
      await settle();
      expect(h.rows).toHaveLength(2);

      await view.unmount();
      await act(async () => { h.rows[1].d.resolve(); });
      await settle();

      expect(await first).toBe(true);
      expect(await second).toBe(false);
      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=임시값`,
        `row ${h.idA} 03대표자명=임시값`,
        `store ${BIZNO_A} erp 대표자명=임시값`,
      ]);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });
  });

  describe("회사 전환", () => {
    it("전환 뒤 옛 회사의 저장이 끝나도 원래 부모에 알리고 새 회사 화면·보관소는 지킨다(저장 자체는 끝까지 간다)", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A수정");

      await view.render(h.rowB());
      expect(valueOf(view, "대표자명")).toBe("비대표");

      await act(async () => { h.rows[0].d.resolve(); });
      await settle();

      expect(valueOf(view, "대표자명")).toBe("비대표");
      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=A수정`,
        `store ${BIZNO_A} erp 대표자명=A수정`,
      ]);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });

    it("전환 뒤 연달아 받은 옛 회사의 저장은 순서대로 행→보관소까지 끝까지 가지만 원래 부모에 알리고 새 회사 화면은 건드리지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A수정1");
      await editText(view, "대표자명", "A수정2");
      await view.render(h.rowB());

      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      await act(async () => { h.rows[1].d.resolve(); });
      await settle();

      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=A수정1`,
        `store ${BIZNO_A} erp 대표자명=A수정1`,
        `row ${h.idA} 03대표자명=A수정2`,
        `store ${BIZNO_A} erp 대표자명=A수정2`,
      ]);
      expect(valueOf(view, "대표자명")).toBe("비대표");
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(h.alertSpy).not.toHaveBeenCalled();
    });

    it("전환 뒤 이전 회사의 최신 잠깐 실패는 앱 막대에 남고 새 회사 화면·경고는 건드리지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A수정");
      await editText(view, "이메일", "a2@x.com");
      await view.render(h.rowB());

      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      await act(async () => { h.rows[1].d.reject(failure("잠긴 칸입니다", "permanent")); });
      await settle();

      expect(h.reports).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(1);
      expect(h.alertSpy).not.toHaveBeenCalled();
      expect(valueOf(view, "대표자명")).toBe("비대표");
      expect(valueOf(view, "이메일")).toBe("b@b.b");
      expect(h.stores).toHaveLength(0);
      expect(h.onSaved).not.toHaveBeenCalled();
    });

    it("전환 뒤 최신 실패 막대는 이전 회사에 다시 저장하고 새 화면에는 반응하지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A수정");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);
      expect(h.reports[0]).toMatchObject({ rowId: h.idA, fieldKey: "03대표자명", value: "A수정", kind: "transient" });

      await view.render(h.rowB());
      h.holdRows = false;
      let ok: boolean | undefined;
      await act(async () => { ok = await h.reports[0].retry(); });
      await settle();
      expect(ok).toBe(true);
      await act(async () => { h.reports[0].revert?.(); });
      expect(valueOf(view, "대표자명")).toBe("비대표");

      // 같은 회사로 돌아오면 새 창구 — 옛 실패 막대는 되살아나지 않는다.
      await view.render(h.rowA());
      expect(valueOf(view, "대표자명")).toBe("원본대표");
      await act(async () => { ok = await h.reports[0].retry(); });
      await settle();
      expect(ok).toBe(false);
      await act(async () => { h.reports[0].revert?.(); });
      expect(valueOf(view, "대표자명")).toBe("원본대표");

      expect(h.rows).toHaveLength(2);
      expect(h.rows[1]).toMatchObject({ entryId: h.idA, key: "03대표자명", value: "A수정" });
      expect(h.stores).toHaveLength(1);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
    });
  });

  describe("저장 실패", () => {
    it("잠깐 실패는 입력을 남기고 저장 실패로 알리며, 다시 저장은 행→보관소 두 저장소를 같은 순서로 쓰고 행 성공 뒤 onSaved 를 부른다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "임시값");

      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("임시값");
      expect(h.reports).toHaveLength(1);
      expect(h.reports[0]).toMatchObject({
        id: `test:${h.idA}:03대표자명`, rowId: h.idA, fieldKey: "03대표자명", value: "임시값", kind: "transient", rowLabel: "에이상사",
      });
      expect(h.alertSpy).not.toHaveBeenCalled();
      expect(h.stores).toHaveLength(0);
      expect(h.onSaved).not.toHaveBeenCalled();

      // 앱 retry는 보관소 완료까지 실패 항목과 중복 gate를 유지한다.
      h.holdRows = false;
      h.holdStores = true;
      let retry!: Promise<boolean>;
      let done = false;
      await act(async () => { retry = h.reports[0].retry(); void retry.then(() => { done = true; }); });
      await settle();
      expect(done).toBe(false);
      expect(h.onSaved).not.toHaveBeenCalled();
      expect(h.bar.entries).toHaveLength(1);
      expect(h.ops()).toEqual([
        `row ${h.idA} 03대표자명=임시값`, `row ${h.idA} 03대표자명=임시값`, `store ${BIZNO_A} erp 대표자명=임시값`,
      ]);
      expect(h.stores[0]).toMatchObject({ bizno: BIZNO_A, app: "erp", fieldId: "대표자명", value: "임시값" });
      await act(async () => { h.stores[0].d.resolve(null); });
      expect(await retry).toBe(true);
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(h.bar.entries).toHaveLength(0);
      expect(valueOf(view, "대표자명")).toBe("임시값");
    });

    it("영구 실패는 마지막으로 확인된 값으로 되돌리고 사유를 알리며 보관소에는 쓰지 않는다", async () => {
      const h = setup();
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "성공값"); // 저장 성공 → 확인된 값
      expect(valueOf(view, "대표자명")).toBe("성공값");

      h.holdRows = true;
      await editText(view, "대표자명", "거부값");
      expect(valueOf(view, "대표자명")).toBe("거부값");
      const storesBefore = h.stores.length;
      await act(async () => { h.rows.at(-1)!.d.reject(failure("잠긴 칸입니다", "permanent")); });
      await settle();

      expect(valueOf(view, "대표자명")).toBe("성공값");
      expect(h.alertSpy).toHaveBeenCalledWith("잠긴 칸입니다");
      expect(h.reports).toHaveLength(0);
      expect(h.stores).toHaveLength(storesBefore);
    });

    it("그 사이 같은 칸에 새 입력이 들어갔다면 옛 실패는 아무것도 하지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "이메일", "A@x.com");
      await editText(view, "이메일", "B@x.com"); // 첫 저장 뒤에 줄을 선다
      expect(h.rows).toHaveLength(1);

      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(0);
      expect(h.alertSpy).not.toHaveBeenCalled();
      // 줄은 끊기지 않고 두 번째 입력이 이어서 나간다.
      expect(h.rows).toHaveLength(2);
      expect(h.rows[1]).toMatchObject({ key: "53이메일", value: "B@x.com" });

      await act(async () => { h.rows[1].d.resolve(); });
      await settle();
      expect(valueOf(view, "이메일")).toBe("B@x.com");
      // 실패한 첫 입력은 보관소에 가지 않고, 두 번째만 간다.
      expect(h.stores).toHaveLength(1);
      expect(h.stores[0]).toMatchObject({ fieldId: "이메일", value: "B@x.com" });
    });

    it("새 입력이 이미 저장된 뒤에는 옛 실패의 다시 저장·되돌리기가 아무 일도 하지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "이메일", "first@x.com");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);

      h.holdRows = false;
      await editText(view, "이메일", "second@x.com");
      expect(valueOf(view, "이메일")).toBe("second@x.com");
      expect(h.unsavedResolve).toHaveBeenCalledWith(`test:${h.idA}:53이메일`);

      const rowsBefore = h.rows.length;
      const storesBefore = h.stores.length;
      let ok: boolean | undefined;
      await act(async () => { ok = await h.reports[0].retry(); });
      await settle();
      expect(ok).toBe(false);
      expect(h.rows).toHaveLength(rowsBefore);
      expect(h.stores).toHaveLength(storesBefore);

      await act(async () => { h.reports[0].revert?.(); });
      expect(valueOf(view, "이메일")).toBe("second@x.com");
    });

    it("다시 저장이 줄에서 기다리는 사이 같은 칸에 새 입력이 들어오면 기다리던 다시 저장은 옛 값을 보내지 않고, 새 입력은 그대로 이어서 나간다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "이메일", "first@x.com");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);

      // 다시 저장 두 번 — 눌렀을 때는 아직 같은 입력이라 둘 다 받아들여지고, 두 번째는 첫 번째 뒤에서 기다린다.
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => { first = h.reports[0].retry(); second = h.reports[0].retry(); });
      await settle();
      expect(h.rows).toHaveLength(2);

      // 기다리는 사이 새 입력이 들어온다(이미 받은 입력이라 버려지지 않고 줄 맨 뒤에 선다).
      await editText(view, "이메일", "second@x.com");
      expect(h.rows).toHaveLength(2);

      await act(async () => { h.rows[1].d.resolve(); });
      await settle();
      expect(await first).toBe(false);
      expect(await second).toBe(false);
      // 두 번째 다시 저장은 시작하는 순간 옛 입력임을 알고 아무것도 보내지 않는다.
      expect(h.rows).toHaveLength(3);
      expect(h.rows[2]).toMatchObject({ key: "53이메일", value: "second@x.com" });

      await act(async () => { h.rows[2].d.resolve(); });
      await settle();
      expect(h.ops()).toEqual([
        `row ${h.idA} 53이메일=first@x.com`,
        `row ${h.idA} 53이메일=first@x.com`,
        `row ${h.idA} 53이메일=second@x.com`,
        `store ${BIZNO_A} erp 이메일=second@x.com`,
      ]);
      expect(valueOf(view, "이메일")).toBe("second@x.com");
    });
  });

  describe("저장 중 보호", () => {
    it("행 저장이 끝나도 보관소 기록이 끝나기 전에는 새 행이 입력을 덮지 않고, 끝난 뒤에는 서버 값을 반영한다", async () => {
      const h = setup({ holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");
      expect(h.rows).toHaveLength(1);
      expect(h.stores).toHaveLength(1);

      await view.render(h.rowA({ "03대표자명": "서버새값", "53이메일": "c@c.c" }));
      expect(valueOf(view, "대표자명")).toBe("새대표");
      expect(valueOf(view, "이메일")).toBe("c@c.c");

      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      await view.render(h.rowA({ "03대표자명": "서버또새값", "53이메일": "c@c.c" }));
      expect(valueOf(view, "대표자명")).toBe("서버또새값");
    });

    it("없는 칸의 복원 기준을 관측한 뒤에는 새 서버 값을 반영한다", async () => {
      const h = setup({ holdRows: true });
      const absent = h.rowA();
      delete absent["03대표자명"];
      let view = await mount(h, absent);
      await editText(view, "대표자명", "A");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      await view.unmount();
      view = await mount(h, h.rowA({ "03대표자명": "A" }));
      await editText(view, "대표자명", "B");
      await view.render({ ...absent });
      await act(async () => { h.rows[1].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("-");
      await view.render(h.rowA({ "03대표자명": "A" }));
      expect(valueOf(view, "대표자명")).toBe("A");
    });

    it("다시 연 뒤 이전 저장이 성공하고 다음 저장이 거절되면 실제 확정값으로 복원한다", async () => {
      const h = setup({ holdRows: true });
      let view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A");
      await view.unmount();
      view = await mount(h, h.rowA());
      await editText(view, "대표자명", "B");
      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      await act(async () => { h.rows[1].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("A");
    });

    it("전송한 재시도의 성공은 새 입력이 생겨도 다음 실패의 복원 기준이다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      let retry!: Promise<boolean>;
      await act(async () => { retry = h.reports[0].retry(); });
      await settle();
      await editText(view, "대표자명", "B");
      await act(async () => { h.rows[1].d.resolve(); });
      await settle();
      await retry;
      expect(h.stores).toHaveLength(0); // 무효 재시도는 추가 보관소 쓰기를 하지 않는다.
      await act(async () => { h.rows[2].d.reject(failure("권한 없음", "permanent")); });
      await settle();
      expect(valueOf(view, "대표자명")).toBe("A");
    });

    it("서버 값을 먼저 관측하고 행 저장이 뒤에 확인돼도 다음 서버 변경을 반영한다", async () => {
      const h = setup({ holdRows: true, holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");
      await view.render(h.rowA({ "03대표자명": "새대표" }));
      await act(async () => { h.rows[0].d.resolve(); });
      await settle();
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      await view.render(h.rowA());
      expect(valueOf(view, "대표자명")).toBe("원본대표");
    });

    it("첫 조회 중 사업자번호를 저장하면 새 번호로 다시 조회하고 로딩을 마친다", async () => {
      const h = setup();
      const reads: Array<{ key: unknown; d: Deferred<null> }> = [];
      h.adapter.api.loadDomainRows = vi.fn((key) => {
        const d = deferred<null>(); reads.push({ key, d }); return d.promise;
      });
      const view = await mount(h, h.rowA());
      await editText(view, "사업자번호", "999-00-00003");
      await view.render(h.rowA({ "15사업자번호": "999-00-00003" }));
      await act(async () => { for (const read of reads) read.d.resolve(null); });
      await settle();
      expect(JSON.stringify(reads.map(read => read.key))).toContain("9990000003");
      expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
    });

    it("StrictMode에서 첫 조회가 성공하면 영역 현황 로딩을 마친다", async () => {
      const h = setup();
      const view = await mount(h, h.rowA(), true);
      expect(h.adapter.api.loadDomainRows).toHaveBeenCalledTimes(2);
      expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
    });

    it("행 저장이 확인된 값을 보호 중 받았으면 이후 다른 사용자의 변경을 반영한다", async () => {
      const h = setup({ holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");
      expect(h.stores).toHaveLength(1);
      await view.render(h.rowA({ "03대표자명": "새대표" }));
      expect(valueOf(view, "대표자명")).toBe("새대표");
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      await view.render(h.rowA());
      expect(valueOf(view, "대표자명")).toBe("원본대표");
    });

    it("보관소 기록이 실패해도 보호는 풀린다(행 저장은 유지)", async () => {
      const h = setup({ holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "새대표");

      await act(async () => { h.stores[0].d.reject(new Error("보관소 장애")); });
      await settle();
      await view.render(h.rowA({ "03대표자명": "서버새값" }));
      expect(valueOf(view, "대표자명")).toBe("서버새값");
      expect(h.alertSpy).not.toHaveBeenCalled();
      expect(h.reports).toHaveLength(0);
    });

    it("보호 중 새 행은 입력과 원래 기준을 지키고 되돌린 뒤 후속 새 행을 반영한다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "임시값");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);

      await view.render(h.rowA({ "03대표자명": "서버값2" }));
      expect(valueOf(view, "대표자명")).toBe("임시값");

      await act(async () => { h.reports[0].revert?.(); });
      expect(valueOf(view, "대표자명")).toBe("원본대표");
      await view.render(h.rowA({ "03대표자명": "서버값2" }));
      expect(valueOf(view, "대표자명")).toBe("서버값2");
    });

    it("다시 저장도 행·보관소 기록이 모두 끝날 때까지 입력을 보호한다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "임시값");
      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();

      h.holdRows = false;
      h.holdStores = true;
      let result!: Promise<boolean>;
      let done = false;
      await act(async () => { result = h.reports[0].retry(); void result.then(() => { done = true; }); });
      await settle();
      expect(done).toBe(false);
      expect(h.bar.entries).toHaveLength(1);
      expect(h.stores).toHaveLength(1);

      await view.render(h.rowA({ "03대표자명": "서버값3" }));
      expect(valueOf(view, "대표자명")).toBe("임시값");

      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      expect(await result).toBe(true);
      await view.render(h.rowA({ "03대표자명": "서버값4" }));
      expect(valueOf(view, "대표자명")).toBe("서버값4");
    });
  });

  describe("앱 막대와 새 조회 계약", () => {
    it("retry는 보관소 기록까지 중복을 막고 실패가 끝난 뒤 다음 명시 재시도는 허용한다", async () => {
      const h = setup({ holdRows: true, holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "복구값");
      await act(async () => { h.rows[0].d.reject(failure("끊김", "transient")); });
      await settle();
      const report = h.bar.entries[0];
      let first!: Promise<boolean>;
      await act(async () => { first = report.retry(); });
      await act(async () => { h.rows[1].d.reject(failure("retry 끊김", "transient")); });
      expect(await first).toBe(false);
      h.holdRows = false;
      let next!: Promise<boolean>;
      await act(async () => { next = report.retry(); });
      await settle();
      expect(h.stores).toHaveLength(1);
      let duplicate: boolean | undefined;
      await act(async () => { void report.retry().then((value) => { duplicate = value; }); });
      await settle();
      expect(duplicate).toBe(false);
      expect(h.rows).toHaveLength(3);
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      expect(await next).toBe(true);
      expect(await report.retry()).toBe(false); // 성공한 입력은 이미 정리됐다
    });

    it("retry 두 번 뒤 표 저장이 막대를 제거하고 첫 retry가 실패해도 두번째 옛 요청은 나가지 않는다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A실패값");
      await act(async () => { h.rows[0].d.reject(failure("끊김", "transient")); });
      await settle();
      const old = h.bar.entries[0];
      let first!: Promise<boolean>;
      let secondDone = false;
      let secondResult: boolean | undefined;
      await act(async () => {
        first = old.retry();
        void old.retry().then((result) => { secondResult = result; secondDone = true; });
      });
      await settle();
      h.holdRows = false; // 옛 제품 실패 시 정리 중 만들어지는 잘못된 두번째 호출도 시험 밖에 남기지 않는다
      expect(secondDone).toBe(true);
      expect(secondResult).toBe(false);
      expect(h.rows).toHaveLength(2);
      h.unsavedResolve(old.id); // 실제 표의 B 저장 성공이 같은 id의 앱 막대를 지운다
      expect(h.bar.entries).toHaveLength(0);
      await act(async () => { h.rows[1].d.reject(failure("첫 retry 끊김", "transient")); });
      expect(await first).toBe(false);
      await settle();
      expect(h.rows).toHaveLength(2);
      const providerRetry = h.bar.entries.includes(old) ? await old.retry() : false;
      expect(providerRetry).toBe(false); // 제거된 구체 항목은 Provider도 실행하지 않는다
    });

    it.each(["transient", "permanent"] as const)("A 잠깐 실패 뒤 B %s: A 항목을 먼저 지우고 첫 확정값으로 돌아간다", async (kind) => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "A임시값");
      await act(async () => { h.rows[0].d.reject(failure("끊김", "transient")); });
      await settle();
      const old = h.bar.entries[0];
      expect(old).toBeDefined();
      await editText(view, "대표자명", "B임시값");
      expect(h.bar.entries).toHaveLength(0);
      await act(async () => { h.rows[1].d.reject(failure("B실패", kind)); });
      await settle();
      if (kind === "transient") {
        expect(h.bar.entries).toHaveLength(1);
        expect(h.bar.entries[0].revert).not.toBe(old.revert);
        await act(async () => { const current = h.bar.entries[0]; current.revert?.(); h.adapter.unsaved!.resolve(current.id); });
      }
      expect(valueOf(view, "대표자명")).toBe("원본대표");
      expect(h.bar.entries).toHaveLength(0);
      expect(await old.retry()).toBe(false);
      expect(h.rows).toHaveLength(2);
    });

    it("닫힌 뒤 인증 실패도 앱 막대에서 원래 대상에 다시 저장한다", async () => {
      const h = setup({ holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "복구값");
      await view.unmount();
      await act(async () => { h.rows[0].d.reject(Object.assign(new Error("로그인 만료"), { saveFailureKind: "auth" })); });
      await settle();
      expect(h.bar.entries).toHaveLength(1);
      h.holdRows = false;
      expect(await h.bar.entries[0].retry()).toBe(true);
      await settle();
      expect(h.rows[1]).toMatchObject({ entryId: h.idA, key: "03대표자명", value: "복구값" });
      expect(h.stores[0]).toMatchObject({ bizno: BIZNO_A, fieldId: "대표자명", value: "복구값" });
      expect(h.onSaved).toHaveBeenCalledTimes(1);
      expect(h.alertSpy).not.toHaveBeenCalled();
    });

    it("같은 회사를 다시 열어 새 입력을 끝내면 옛 실패의 retry·revert는 영구 무효다", async () => {
      const h = setup({ holdRows: true });
      const oldView = await mount(h, h.rowA());
      await editText(oldView, "대표자명", "옛입력");
      await act(async () => { h.rows[0].d.reject(failure("끊김", "transient")); });
      await settle();
      const old = h.bar.entries[0];
      await oldView.unmount();
      const fresh = await mount(h, h.rowA());
      h.holdRows = false;
      await editText(fresh, "대표자명", "새입력");
      expect(h.bar.entries).toHaveLength(0);
      expect(await old.retry()).toBe(false);
      await act(async () => { old.revert?.(); });
      expect(valueOf(fresh, "대표자명")).toBe("새입력");
      expect(h.rows).toHaveLength(2);
    });

    it("다시 연 회사의 새 입력은 줄에서 기다리던 옛 retry도 무효화하고 이미 출발한 저장은 끝까지 간다", async () => {
      const h = setup({ holdRows: true, holdStores: true });
      const view = await mount(h, h.rowA());
      await editText(view, "대표자명", "옛입력");
      await act(async () => { h.rows[0].d.reject(failure("끊김", "transient")); });
      await settle();
      const old = h.bar.entries[0];
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => { first = old.retry(); second = old.retry(); });
      await settle();
      expect(h.rows).toHaveLength(2);
      await view.unmount();
      const fresh = await mount(h, h.rowA());
      await editText(fresh, "대표자명", "새입력");
      await act(async () => { h.rows[1].d.resolve(); });
      await settle();
      expect(h.stores).toHaveLength(0);
      expect(await first).toBe(false);
      expect(await second).toBe(false);
      expect(h.rows).toHaveLength(3);
      expect(h.rows[2]).toMatchObject({ entryId: h.idA, key: "03대표자명", value: "새입력" });
      await act(async () => { h.rows[2].d.resolve(); });
      await settle();
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      expect(valueOf(fresh, "대표자명")).toBe("새입력");
      expect(await old.retry()).toBe(false);
    });

    it.each(["글자", "null", "삭제", "false"])("저장 중 보류한 %s 서버값은 완료 후 같은 값의 새 조회에서 적용한다", async (kind) => {
      const flag = kind === "false";
      const h = setup({ holdStores: true, flagColumn: flag });
      const view = await mount(h, h.rowA(flag ? { custom_flag: null } : {}));
      if (flag) await clickCheckbox(view, "확인");
      else await editText(view, "대표자명", "내입력");
      const next: Record<string, unknown> = h.rowA(flag ? { custom_flag: false } : { "03대표자명": kind === "글자" ? "서버값" : null });
      if (kind === "삭제") delete next["03대표자명"];
      await view.render(next);
      if (flag) expect(isChecked(view, "확인")).toBe(true);
      else expect(valueOf(view, "대표자명")).toBe("내입력");
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      if (flag) expect(isChecked(view, "확인")).toBe(true);
      else expect(valueOf(view, "대표자명")).toBe("내입력"); // 완료만으로 옛 보류 응답을 적용하지 않는다
      await view.render({ ...next });
      if (flag) expect(isChecked(view, "확인")).toBe(false);
      else expect(valueOf(view, "대표자명")).toBe(kind === "글자" ? "서버값" : "-");
    });
  });

  describe("보관소 읽기", () => {
    it("비움 저장 중 시작한 읽기는 행·보관소 저장이 끝난 뒤 도착해도 비운 칸을 다시 채우지 않는다", async () => {
      const h = setup();
      const view = await mount(h, h.rowA());
      h.holdStores = true;
      h.holdReads = true;

      await editText(view, "이메일", ""); // 행 저장은 완료, 보관소 비움 기록은 아직 저장 중
      expect(h.rows).toHaveLength(1);
      expect(h.rows[0]).toMatchObject({ entryId: h.idA, key: "53이메일", value: "" });
      expect(h.stores).toHaveLength(1);
      expect(h.stores[0]).toMatchObject({ bizno: BIZNO_A, fieldId: "이메일", value: "" });
      expect(valueOf(view, "이메일")).toBe("-");

      const previousReads = h.reads.length;
      await view.render(h.rowA({ "03대표자명": "서버새대표" })); // 새 행이 읽기를 다시 시작 — 이때 비움 저장이 진행 중
      const pendingReads = h.reads.slice(previousReads);
      expect(pendingReads.length).toBeGreaterThan(0);
      expect(pendingReads.every((r) => r.bizno === BIZNO_A)).toBe(true);

      await act(async () => { h.stores[0].d.resolve(null); }); // 보관소 비움 기록까지 완료
      await settle();
      expect(valueOf(view, "이메일")).toBe("-");
      await act(async () => {
        for (const r of pendingReads) r.d.resolve(record({ "이메일": "옛값@store.example", "연락처": "010-9999-0000" }));
      });
      await settle();
      expect(valueOf(view, "이메일")).toBe("-");
      expect(valueOf(view, "연락처")).toBe("010-9999-0000"); // 손대지 않은 칸은 읽기 결과가 실제로 반영된다
      expect(h.rows).toHaveLength(1);
      expect(h.stores).toHaveLength(1);
    });

    it("진행상태 저장 중 시작한 읽기는 완료 뒤에도 덮지 않고, 완료 후 시작한 새 읽기는 허용한다", async () => {
      const h = setup({ progressColumn: true });
      const view = await mount(h, h.rowA({ "05진행상태": "기준상태" }));
      h.holdStores = true;
      h.holdReads = true;
      await editText(view, "진행상태", "내상태");
      expect(h.rows[0]).toMatchObject({ entryId: h.idA, key: "05진행상태", value: "내상태" });
      expect(h.stores[0]).toMatchObject({ bizno: BIZNO_A, fieldId: "진행상태", value: "내상태" });

      const previousReads = h.reads.length;
      await view.render(h.rowA({ "05진행상태": "기준상태", "03대표자명": "서버새대표" }));
      const pendingReads = h.reads.slice(previousReads);
      expect(pendingReads.length).toBeGreaterThan(0);
      await act(async () => { h.stores[0].d.resolve(null); });
      await settle();
      await act(async () => { for (const r of pendingReads) r.d.resolve(record({ "진행상태": "옛상태" })); });
      await settle();
      expect(valueOf(view, "진행상태")).toBe("내상태");

      const freshStart = h.reads.length;
      await view.render(h.rowA({ "05진행상태": "기준상태", "03대표자명": "서버또새대표" }));
      const freshReads = h.reads.slice(freshStart);
      expect(freshReads.length).toBeGreaterThan(0);
      await act(async () => { for (const r of freshReads) r.d.resolve(record({ "진행상태": "보관소최신상태" })); });
      await settle();
      expect(valueOf(view, "진행상태")).toBe("보관소최신상태");
      expect(h.rows).toHaveLength(1);
      expect(h.stores).toHaveLength(1);
    });

    it("진행상태 실패 보관 중 시작한 읽기는 되돌리기로 보관이 풀린 뒤에도 옛 값으로 덮지 않는다", async () => {
      const h = setup({ progressColumn: true, holdRows: true });
      const view = await mount(h, h.rowA({ "05진행상태": "기준상태" }));
      await editText(view, "진행상태", "임시상태");
      await act(async () => { h.rows[0].d.reject(failure("통신 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);
      h.holdReads = true;
      const previousReads = h.reads.length;
      await view.render(h.rowA({ "05진행상태": "기준상태", "03대표자명": "서버새대표" }));
      const retainedReads = h.reads.slice(previousReads);
      expect(retainedReads.length).toBeGreaterThan(0);
      await act(async () => { h.reports[0].revert?.(); });
      expect(valueOf(view, "진행상태")).toBe("기준상태");
      await act(async () => { for (const r of retainedReads) r.d.resolve(record({ "진행상태": "옛상태" })); });
      await settle();
      expect(valueOf(view, "진행상태")).toBe("기준상태");
      expect(h.rows).toHaveLength(1);
      expect(h.stores).toHaveLength(0);
    });

    it("늦게 온 보관소 값은 사용자가 만진 칸(입력·비운 칸)을 덮거나 채우지 않고, 만지지 않은 빈 칸만 채운다", async () => {
      const h = setup({ holdReads: true });
      const view = await mount(h, h.rowA());
      expect(h.reads.length).toBeGreaterThan(0);

      await editText(view, "대표자명", "친값");
      await editText(view, "이메일", ""); // 일부러 비움
      expect(valueOf(view, "이메일")).toBe("-");

      const late = record({ "대표자명": "보관소값", "이메일": "store@x.com", "연락처": "010-9999-0000" });
      await act(async () => { for (const r of h.reads) r.d.resolve(late); });
      await settle();

      expect(valueOf(view, "대표자명")).toBe("친값");
      expect(valueOf(view, "이메일")).toBe("-");
      expect(valueOf(view, "연락처")).toBe("010-9999-0000");
    });

    it("읽는 동안 비운 칸은 비움 저장이 끝난 뒤에도(보관소 기록까지) 늦게 온 보관소 값으로 되채워지지 않는다", async () => {
      const h = setup({ holdReads: true });
      const view = await mount(h, h.rowA());
      await editText(view, "이메일", "");
      expect(valueOf(view, "이메일")).toBe("-");
      // 비움은 행·보관소 모두 끝났다 — 그래도 읽기를 시작한 뒤의 비움이라 늦게 온 옛 값으로 채우지 않는다.
      expect(h.rows).toHaveLength(1);
      expect(h.rows[0]).toMatchObject({ entryId: h.idA, key: "53이메일" });
      expect(h.stores).toHaveLength(1);
      expect(h.stores[0]).toMatchObject({ bizno: BIZNO_A, fieldId: "이메일" });

      await act(async () => { for (const r of h.reads) r.d.resolve(record({ "이메일": "store@x.com", "연락처": "010-9999-0000" })); });
      await settle();
      expect(valueOf(view, "이메일")).toBe("-");
      expect(valueOf(view, "연락처")).toBe("010-9999-0000");
    });

    it("읽는 동안 비운 칸이 아직 저장 중이거나 잠깐 실패로 남아 있어도 늦게 온 보관소 값으로 되채워지지 않는다", async () => {
      const h = setup({ holdReads: true, holdRows: true });
      const view = await mount(h, h.rowA());
      await editText(view, "이메일", "");
      expect(valueOf(view, "이메일")).toBe("-");

      await act(async () => { for (const r of h.reads) r.d.resolve(record({ "이메일": "store@x.com" })); });
      await settle();
      expect(valueOf(view, "이메일")).toBe("-");

      await act(async () => { h.rows[0].d.reject(failure("연결 끊김", "transient")); });
      await settle();
      expect(h.reports).toHaveLength(1);
      expect(valueOf(view, "이메일")).toBe("-");
    });

    it("회사가 바뀐 뒤 늦게 도착한 옛 회사 보관소 기록은 새 회사에 나타나지 않는다", async () => {
      const h = setup({ holdReads: true });
      const view = await mount(h, h.rowA());
      await view.render(h.rowB());

      const readsA = h.reads.filter((r) => r.bizno === BIZNO_A);
      const readsB = h.reads.filter((r) => r.bizno === BIZNO_B);
      expect(readsA.length).toBeGreaterThan(0);
      expect(readsB.length).toBeGreaterThan(0);

      await act(async () => { for (const r of readsA) r.d.resolve(record({ "연락처": "A-전화" })); });
      await settle();
      await act(async () => { for (const r of readsB) r.d.resolve(null); });
      await settle();

      expect(valueOf(view, "연락처")).toBe("-");
      expect(view.container.textContent).not.toContain("A-전화");
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
      appName: "HIVE", ownDomain: "tax-amendment", ownColumns: [], configScope: "v9-read-owner", domains: [{ key: "government-subsidy", label: "정부지원금", domains: ["government-subsidy"] }],
      api: { loadDomainRows: load, getCachedDomainRows: () => null, loadTabConfig: async () => ({ data: {} }), saveTabConfig: async () => {}, loadColumnConfig: async () => ({ data: {} }), saveColumnConfig: async () => {}, loadManagers: async () => [], saveOwnField: async () => {}, loadBasicStore: async () => null },
      fieldOptions: { READONLY_TYPES: new Set(), getFieldOptions: () => [], addCustomOption: () => {}, removeCustomOption: () => {}, setOptionColor: () => {}, getOptionColorClass: () => "", OPTION_COLOR_FAMILIES: [], OPTION_COLOR_PALETTE: [], STATUS_COLORS: {}, SELECT_BADGE_COLORS: {}, isReadonlyPerson: () => false },
      components: { SettlementInfoTab: () => null, MeetingsTab: () => null, ErpFilesPanel: () => null, SectionSettlementTab: () => null, sectionPanels: { "government-subsidy": Probe } }, ownFileFields: [], getAllFiles: () => [],
    } as unknown as UnifiedDetailAdapter;
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    const first = { _id: "v9-read-a", "02상호명": "원래 회사", "15사업자번호": "1234567890" };
    const second = { _id: "v9-read-b", "02상호명": "새 회사", "15사업자번호": "0987654321" };
    const settleRead = async () => { for (let i = 0; i < 3; i++) await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
    const render = async (row: typeof first) => { await React.act(async () => { root.render(React.createElement(UnifiedDetailView, { row: row as never, adapter, onClose: () => {} })); }); await settleRead(); };
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
