// @vitest-environment jsdom
/**
 * 기본정보 칸 저장·동기화 — UnifiedDetailView 를 실제로 그려서(옛 HIVE compact · ILLUA compact · ILLUA wide) 확인한다.
 *  - 같은 회사에 새 행이 들어와도 안 바뀐 칸의 고친 값은 지켜지고, 서버에서 바뀐 칸만 갱신된다(false·null·삭제는 실제 값).
 *  - 회사+칸별 저장은 입력 순서대로 [행 → 보관소] 를 마친 뒤 다음 입력으로 넘어가고, 다른 칸은 병렬이다.
 *  - 창이 닫히거나 회사가 바뀌어도 받아들인 저장은 [행 → 보관소] 끝까지 가되, 원래 부모의 성공 통지와 현재 상세의 보관함·경고·되돌리기 보호는 구분한다.
 *  - 행 저장이 끝나도 보관소 기록까지 끝나야 입력 보호가 풀린다.
 *  - 재시도는 현재 주인의 가장 새 입력일 때만 — 누르는 때와 줄 차례가 실제로 오는 때 모두 — 보내고, 그 사이 닫힘·회사 전환·더 새 입력(끝난 것 포함)이 있으면 아무것도 보내지 않는다.
 *  - 재시도도 같은 [행 → 보관소] 두 곳 길을 쓰고, 행 저장 성공 직후 onSaved 가 불린다.
 *  - 보관소 읽기는 '읽기를 보낸 순간'의 입력 상태를 기준으로 가른다 — 그 뒤 손댄 칸·보낼 때 저장 중이던 칸만 건너뛰고,
 *    이미 끝난 입력 뒤에 새로 보낸 읽기(진행상태 최신값 덮어쓰기 포함)는 그대로 적용된다.
 * 행 저장(saveOwnField)·보관소 저장(saveBasicField)·보관소 읽기(loadBasicStore)는 시험이 손으로 성공/실패시킨다.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnifiedDetailView from "./UnifiedDetailView";
import type { BasicRecord, UnifiedDetailAdapter, UnsavedBridge } from "./adapter-types";
import { enqueueBasicFieldWrite, nextBasicIntentSeq } from "./lib/basic-field-sync";

// 이 패키지의 JSX 는 React 를 직접 import 하지 않는다 — classic 변환으로 돌려도 렌더가 되도록 전역에 둔다.
(globalThis as { React?: unknown }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 분야 탭을 비워 시험을 기본정보 칸에 집중시킨다(분야 패널·히스토리 패널은 이 시험과 무관).
vi.mock("./lib/domain-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/domain-config")>();
  return { ...actual, DOMAIN_GROUPS: [] };
});

// ── 시험 대상 변형 ──
type Variant = {
  name: string;
  appName: "HIVE" | "ILLUA";
  layout: "compact" | "wide";
  ownDomain: string;
  nameKey: string;
  emailKey: string;
};
const VARIANTS: Variant[] = [
  { name: "HIVE compact", appName: "HIVE", layout: "compact", ownDomain: "tax-amendment", nameKey: "03대표자명", emailKey: "53이메일" },
  { name: "ILLUA compact", appName: "ILLUA", layout: "compact", ownDomain: "government-subsidy", nameKey: "02대표자명", emailKey: "이메일" },
  { name: "ILLUA wide", appName: "ILLUA", layout: "wide", ownDomain: "government-subsidy", nameKey: "02대표자명", emailKey: "이메일" },
];
const AGREE_KEY = "custom_agree"; // 공통 추가 칸(체크박스) — 라벨 "동의여부" 가 보관소 칸 이름이 된다.
const PROGRESS_KEY = "05진행상태"; // 공통 칸 '진행상태' 의 후보 키 — progress 옵션을 줄 때만 글자 칸으로 보인다(보관소 최신값으로 덮어쓰는 칸).
const BIZNO_A = "0000000001"; // 합성 사업자번호 "000-00-00001" 의 숫자만

// ── 손으로 제어하는 비동기 호출 ──
type Call = { args: unknown[]; settled: boolean; resolve: (v?: unknown) => void; reject: (e: unknown) => void };
type Report = Parameters<UnsavedBridge["report"]>[0];
type Recovery = NonNullable<ReturnType<NonNullable<UnsavedBridge["getBasicRecovery"]>>>;
// 앱 Provider의 기본정보 merge 분기: 첫 confirmed 기준과 새 apply를 연결한다.
function mergeHostEntry(prev: Report[], entry: Report): Report[] {
  const old = prev.find((e) => e.id === entry.id);
  const rest = prev.filter((e) => e.id !== entry.id);
  if (entry.basicRestore) {
    const original = old ? old.basicRestore?.original : entry.basicRestore.original;
    const apply = entry.basicRestore.apply;
    const applyToTable = entry.basicRestore.applyToTable ?? old?.basicRestore?.applyToTable;
    const basicRestore = Object.assign(entry.basicRestore, { original, applyToTable });
    return [...rest, { ...entry, basicRestore, revert: original === undefined ? undefined : () => { apply(original); } }];
  }
  return [...rest, old ? { ...entry, revert: old.revert } : entry];
}

function makeHarness(v: Variant, opts: { bridge?: boolean; progress?: boolean } = {}) {
  const trace: string[] = [];
  const rowCalls: Call[] = [];
  const storeCalls: Call[] = [];
  const readCalls: Call[] = [];
  const domainCalls: Call[] = [];
  const reports: Report[] = [];
  const bar = { entries: [] as Report[] };
  const edits = new Map<string, { valid: boolean; supersede: () => void; recovery?: Recovery }>();
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
  const beginBasicEdit = (id: string, supersede: () => void, recovery?: Recovery) => {
    const old = edits.get(id);
    const lease = { valid: true, supersede, recovery };
    edits.set(id, lease);
    if (old) { old.valid = false; old.supersede(); }
    return {
      isCurrent: () => lease.valid && edits.get(id) === lease,
      release: () => { lease.valid = false; if (edits.get(id) === lease) edits.delete(id); },
    };
  };
  const resolvedIds: string[] = [];
  const alertMock = vi.fn();
  const auto = { row: false, store: false, read: true, domain: true };

  const controlled = (tag: string, calls: Call[], fmt: (args: unknown[]) => string | null, isAuto: () => boolean) =>
    vi.fn((...args: unknown[]) => new Promise<unknown>((resolve, reject) => {
      const label = fmt(args);
      if (label) trace.push(`${tag}:${label}`);
      const call: Call = {
        args,
        settled: false,
        resolve: (x) => { call.settled = true; resolve(x); },
        reject: (e) => { call.settled = true; reject(e); },
      };
      calls.push(call);
      if (isAuto()) call.resolve(null);
    }));

  const saveOwnField = controlled("row", rowCalls, (a) => `${a[1]}=${String(a[2])}`, () => auto.row);
  const saveBasicField = controlled("store", storeCalls, (a) => `${a[2]}=${String(a[3])}`, () => auto.store);
  const loadBasicStore = controlled("read", readCalls, () => null, () => auto.read);
  const loadDomainRows = controlled("domain", domainCalls, () => null, () => auto.domain);

  const unsaved: UnsavedBridge = {
    scope: "시험화면",
    makeId: (scope, rowId, fieldKey) => `${scope}|${rowId}|${fieldKey}`,
    report: (e) => { reports.push(e); updateBar(mergeHostEntry(bar.entries, e)); },
    resolve: (id) => { resolvedIds.push(id); updateBar(bar.entries.filter((e) => e.id !== id)); },
    getBasicRecovery, beginBasicEdit,
  };

  const noop = async () => undefined;
  const adapter = {
    appName: v.appName,
    ownDomain: v.ownDomain,
    ownColumns: [
      { key: v.nameKey, label: "대표자명", type: "text" },
      { key: v.emailKey, label: "이메일", type: "email" },
      { key: "15사업자번호", label: "사업자번호", type: "text" },
      ...(opts.progress ? [{ key: PROGRESS_KEY, label: "진행상태", type: "text" }] : []),
    ],
    configScope: "unified-collab",
    domains: [],
    api: {
      loadDomainRows,
      getCachedDomainRows: () => null,
      saveOwnField,
      createEntry: async () => ({ id: "new" }),
      loadColumnConfig: async () => ({}),
      saveColumnConfig: noop,
      loadTieredFields: async () => ({}),
      loadComments: async () => [],
      addComment: async () => [],
      loadManagers: async () => [],
      loadTabConfig: async () => ({}),
      saveTabConfig: noop,
      loadSettlementFields: async () => ({}),
      saveSettlement: noop,
      loadBasicStore,
      saveBasicField,
      loadCommonBasicFields: async () => [{ key: AGREE_KEY, label: "동의여부", type: "checkbox" }],
      loadSectionStore: async () => null,
      saveSectionStore: noop,
      currentUser: async () => null,
      uploadImage: async () => ({ url: "" }),
    },
    unsaved: opts.bridge === false ? undefined : unsaved,
    ownTieredFieldsPath: (kind: string) => `/api/test/${kind}`,
    sectionSettlementBase: "/api/test/settlement",
    fieldOptions: {
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
    },
    components: {
      SettlementInfoTab: () => null,
      MeetingsTab: () => null,
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
    },
    ownFileFields: [],
    ownFileCategoryKey: "files",
    getAllFiles: () => [],
  } as unknown as UnifiedDetailAdapter;

  return { trace, rowCalls, storeCalls, readCalls, domainCalls, reports, bar, resolvedIds, alertMock, auto, adapter };
}
type Harness = ReturnType<typeof makeHarness>;

const sleep = () => new Promise<void>((r) => setTimeout(r, 0));
const tick = () => act(async () => { await sleep(); });

type Mounted = {
  container: HTMLElement;
  onSaved: ReturnType<typeof vi.fn>;
  rerender: (row: Record<string, unknown>) => Promise<void>;
  unmount: () => Promise<void>;
};
const mounted: Array<{ unmount: () => Promise<void>; container: HTMLElement }> = [];

async function mount(v: Variant, h: Harness, row: Record<string, unknown>, strict = false): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const view = (r: Record<string, unknown>) => {
    const detail = React.createElement(UnifiedDetailView, { row: r as never, adapter: h.adapter, onClose, onSaved, layout: v.layout });
    return strict ? React.createElement(React.StrictMode, {}, detail) : detail;
  };
  let gone = false;
  const handle: Mounted = {
    container,
    onSaved,
    rerender: async (r) => { await act(async () => { root.render(view(r)); await sleep(); }); },
    unmount: async () => { if (gone) return; gone = true; await act(async () => { root.unmount(); }); },
  };
  mounted.push(handle);
  await act(async () => { root.render(view(row)); await sleep(); });
  await tick();
  return handle;
}

let rowSeq = 0;
function makeRow(v: Variant, extra: Record<string, unknown> = {}): Record<string, unknown> {
  rowSeq += 1;
  return {
    _id: `entry-${rowSeq}`,
    "02상호명": "테스트상사",
    "15사업자번호": "000-00-00001",
    [v.nameKey]: "",
    [v.emailKey]: "",
    ...extra,
  };
}

// ── 화면 조작·읽기 ──
function fieldRow(ctx: { container: HTMLElement }, label: string): HTMLElement {
  const span = Array.from(ctx.container.querySelectorAll("span")).find((s) => s.textContent === label);
  const row = span?.closest("div.group") as HTMLElement | null | undefined;
  if (!row) throw new Error(`기본정보 칸을 찾지 못함: ${label}`);
  return row;
}
const shownValue = (ctx: { container: HTMLElement }, label: string) =>
  (fieldRow(ctx, label).querySelector("div.cursor-pointer")?.textContent ?? "").trim();
const isChecked = (ctx: { container: HTMLElement }, label: string) => fieldRow(ctx, label).querySelector("button svg") !== null;

async function editText(ctx: { container: HTMLElement }, label: string, text: string) {
  const cell = fieldRow(ctx, label).querySelector("div.cursor-pointer") as HTMLElement;
  await act(async () => { cell.click(); });
  const input = fieldRow(ctx, label).querySelector("input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  // 값이 있던 칸을 고치면 '수정 확인' 창이 뜬다 — 저장을 누른다.
  const confirmBtn = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "저장");
  if (confirmBtn) await act(async () => { confirmBtn.click(); });
  await tick();
}
async function toggle(ctx: { container: HTMLElement }, label: string) {
  const btn = fieldRow(ctx, label).querySelector("button") as HTMLElement;
  await act(async () => { btn.click(); });
  await tick();
}
async function resolveCall(call: Call, value: unknown = null) {
  await act(async () => { call.resolve(value); await sleep(); });
}
async function rejectCall(call: Call, err: unknown) {
  await act(async () => { call.reject(err); await sleep(); });
}

const transient = (msg = "통신이 끊겼습니다") => Object.assign(new Error(msg), { saveFailureKind: "transient" });
const permanent = (msg = "저장할 수 없는 값입니다") => new Error(msg); // 종류가 없으면 permanent

const storeRecord = (fields: Record<string, string>): BasicRecord => ({
  fields: Object.fromEntries(
    Object.entries(fields).map(([label, value]) => [label, { value, updatedAt: "2026-01-01T00:00:00.000Z", updatedByApp: "erp", updatedByUser: "시험" }]),
  ),
  log: Object.entries(fields).map(([label, value]) => ({ fieldId: label, from: "", to: value, app: "erp", user: "시험", at: "2026-01-01T00:00:00.000Z" })),
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }),
  });
});

// 시험이 끝났는데 손으로 안 푼 호출이 남으면 모듈 단위 저장 줄이 다음 시험을 막지 않도록 풀어 준다.
const harnesses: Harness[] = [];
afterEach(async () => {
  for (const h of harnesses.splice(0)) {
    h.auto.row = true;
    h.auto.store = true;
    h.auto.read = true;
    h.auto.domain = true;
    await act(async () => {
      for (const c of [...h.rowCalls, ...h.storeCalls, ...h.readCalls, ...h.domainCalls]) if (!c.settled) c.resolve(null);
      await sleep();
    });
  }
  for (const m of mounted.splice(0)) {
    await m.unmount();
    m.container.remove();
  }
  vi.unstubAllGlobals();
});

describe.each(VARIANTS)("기본정보 칸 동기화 — $name", (v) => {
  it.each(["same", "different", "different-unknown", "missing", "legacy"])("note ownership: %s host only receives its own recovery ACK", async boundary => {
    const h = makeHarness(v);
    const row = makeRow(v, { _id: `note-owner-${v.name}-${boundary}`, [v.nameKey]: "confirmed A" });
    const previous = await mount(v, h, row);
    await editText(previous, "대표자명", "accepted B");
    const bridge = h.adapter.unsaved!;
    const id = bridge.makeId(bridge.scope, String(row._id), v.nameKey);
    const oldRecovery = bridge.getBasicRecovery!(id)!;
    expect(oldRecovery).toBeDefined();
    await previous.unmount();
    const currentRecovery: Recovery | undefined = boundary === "same" || boundary === "legacy" ? oldRecovery
      : boundary === "missing" ? undefined
      : { identity: oldRecovery.identity, ...(boundary === "different" ? { original: { value: "server C", present: true } } : {}) };
    const originalBefore = currentRecovery?.original;
    if (boundary === "legacy") delete bridge.getBasicRecovery;
    else bridge.getBasicRecovery = () => currentRecovery;
    const note = vi.fn<NonNullable<UnsavedBridge["noteBasicServerValue"]>>((_id, original) => {
      if (currentRecovery) currentRecovery.original = original;
    });
    bridge.noteBasicServerValue = note;
    await resolveCall(h.rowCalls[0]);
    expect(oldRecovery.original).toEqual({ value: "accepted B", present: true });
    if (boundary === "same" || boundary === "legacy") expect(note).toHaveBeenCalledExactlyOnceWith(id, { value: "accepted B", present: true });
    else {
      expect(note).not.toHaveBeenCalled();
      expect(currentRecovery?.original).toBe(originalBefore);
    }
    expect(h.storeCalls).toHaveLength(1);
    await resolveCall(h.storeCalls[0]);
  });

  it.each([false, true])("page inheritance: replacement=%s preserves the current page's draft and baseline", async replacement => {
    const h = makeHarness(v);
    const row = makeRow(v, { [v.nameKey]: "confirmed A" });
    const previous = await mount(v, h, row);
    await editText(previous, "대표자명", "accepted B");
    await resolveCall(h.rowCalls[0]);
    expect(h.storeCalls).toHaveLength(1);
    const bridge = h.adapter.unsaved!;
    const id = bridge.makeId(bridge.scope, String(row._id), v.nameKey);
    const oldRecovery = bridge.getBasicRecovery!(id);
    expect(oldRecovery).toBeDefined();
    await previous.unmount();
    if (replacement) {
      const currentRecovery = bridge.getBasicRecovery!;
      bridge.getBasicRecovery = key => {
        const recovery = currentRecovery(key);
        return recovery === oldRecovery ? undefined : recovery;
      };
    }
    const current = await mount(v, h, { ...row, [v.nameKey]: replacement ? "server C" : "accepted B" });
    expect(shownValue(current, "대표자명")).toBe(replacement ? "server C" : "accepted B");
    await editText(current, "대표자명", "failed D");
    await resolveCall(h.storeCalls[0]);
    expect(h.rowCalls).toHaveLength(2);
    await rejectCall(h.rowCalls[1], transient());
    const failed = h.bar.entries[0];
    expect(failed.basicRestore?.original).toEqual({ value: replacement ? "server C" : "accepted B", present: true });
    await act(async () => { failed.revert?.(); });
    await tick();
    expect(shownValue(current, "대표자명")).toBe(replacement ? "server C" : "accepted B");
  });

  const setup = async (opts: { bridge?: boolean; row?: Record<string, unknown>; holdReads?: boolean; progress?: boolean; holdDetails?: boolean; strict?: boolean } = {}) => {
    const h = makeHarness(v, { bridge: opts.bridge, progress: opts.progress });
    harnesses.push(h);
    vi.stubGlobal("alert", h.alertMock);
    if (opts.holdReads) h.auto.read = false; // 보관소 읽기를 마운트 전부터 보류
    if (opts.holdDetails) h.auto.domain = false;
    const row = opts.row ?? makeRow(v);
    const view = await mount(v, h, row, opts.strict);
    return { h, row, view };
  };

  describe("IX6 표·상세 확정값 객체 연결", () => {
    // 앱이 별도 소유한 표 경계: pending lease가 같은 객체를 내주고 실제 ACK만 original을 바꾼다.
    function startTable(h: Harness, row: Record<string, unknown>, key: string, original: Recovery["original"], ack: string | boolean) {
      const bridge = h.adapter.unsaved!;
      const id = bridge.makeId(bridge.scope, String(row._id), key);
      const applyToTable = vi.fn();
      const recovery: Recovery = { original, applyToTable };
      const begin = vi.spyOn(bridge, "beginBasicEdit");
      const lease = bridge.beginBasicEdit!(id, () => {}, recovery);
      let complete!: (success: boolean) => void;
      const result = new Promise<boolean>((resolve) => { complete = resolve; });
      const write = enqueueBasicFieldWrite(String(row._id), key, nextBasicIntentSeq(), async () => {
        const success = await result;
        if (success) recovery.original = { value: ack, present: true };
        lease.release();
      });
      return {
        recovery, applyToTable, begin,
        settle: async (success: boolean) => { await act(async () => { complete(success); await write; await sleep(); }); },
      };
    }

    const cases = [
      { name: "문자", original: { value: "서버원본", present: true }, key: v.nameKey, optimistic: "A미확정", ack: "A확정" },
      { name: "unknown", original: undefined, key: v.nameKey, optimistic: "A미확정", ack: "A확정" },
      { name: "null", original: { value: null, present: true }, key: v.nameKey, optimistic: "A미확정", ack: "A확정" },
      { name: "false", original: { value: false, present: true }, key: AGREE_KEY, optimistic: true, ack: true },
      { name: "키 부재·동적 칸", original: { value: null, present: false }, key: AGREE_KEY, optimistic: undefined, ack: true },
    ] as const;
    for (const c of cases) {
      for (const success of [true, false]) {
        for (const timing of ["B 입력 뒤", "재열기 첫 입력 전"]) {
          it.each(["permanent", "transient"])(`${c.name}: 표 A ${success ? "성공" : "실패"}(${timing}) 뒤 상세 B %s 복원`, async (kind) => {
            const h = makeHarness(v);
            harnesses.push(h);
            vi.stubGlobal("alert", h.alertMock);
            const row = makeRow(v, { [c.key]: c.optimistic });
            if (c.optimistic === undefined) delete row[c.key];
            const table = startTable(h, row, c.key, c.original && { ...c.original }, c.ack);
            let view = await mount(v, h, row);
            if (timing === "재열기 첫 입력 전") {
              await view.unmount();
              view = await mount(v, h, row);
              await table.settle(success);
            }
            const checkbox = c.key === AGREE_KEY;
            if (checkbox) await toggle(view, "동의여부");
            else await editText(view, "대표자명", "B미확정");
            if (timing === "B 입력 뒤") {
              expect(h.rowCalls).toHaveLength(0);
              await table.settle(success);
            }
            expect(h.rowCalls).toHaveLength(1);
            await rejectCall(h.rowCalls[0], kind === "permanent" ? permanent() : transient());
            const expected = success ? { value: c.ack, present: true } : c.original;
            if (kind === "transient") {
              expect(h.bar.entries).toHaveLength(1);
              expect(h.bar.entries[0].basicRestore?.original).toEqual(expected);
              if (expected) await act(async () => {
                const entry = h.bar.entries[0];
                entry.revert?.();
                h.adapter.unsaved!.resolve(entry.id); // 실제 막대의 되돌리기 소비 동작
                await sleep();
              });
              else expect(h.bar.entries[0].revert).toBeUndefined();
            }
            if (expected) {
              if (checkbox) expect(isChecked(view, "동의여부")).toBe(expected.present && expected.value === true);
              else expect(shownValue(view, "대표자명")).toBe(expected.value === null ? "-" : expected.value);
              expect(table.applyToTable).toHaveBeenCalledExactlyOnceWith(expected);
              expect(h.bar.entries).toHaveLength(0);
            } else {
              expect(shownValue(view, "대표자명")).toBe("B미확정");
              expect(table.applyToTable).not.toHaveBeenCalled();
            }
            expect(table.begin.mock.calls.at(-1)?.[2]).toBe(table.recovery);
            expect(h.storeCalls).toHaveLength(0);
          });
        }
      }
    }

    it.each(["행", "보관소"])("표 A 완료 뒤 실제 적용한 새 %s 값은 입력 전 상속 객체보다 우선한다", async (source) => {
      const h = makeHarness(v, { progress: true });
      harnesses.push(h);
      vi.stubGlobal("alert", h.alertMock);
      const row = makeRow(v, { [PROGRESS_KEY]: "A미확정" });
      const table = startTable(h, row, PROGRESS_KEY, { value: "첫원본", present: true }, "A확정");
      const view = await mount(v, h, row);
      await table.settle(true);
      if (source === "행") await view.rerender({ ...row, [PROGRESS_KEY]: "서버최신" });
      else {
        h.auto.read = false;
        await view.rerender({ ...row, [v.emailKey]: "fresh@example.test" });
        const reads = h.readCalls.filter(call => !call.settled);
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) await resolveCall(read, storeRecord({ 진행상태: "서버최신" }));
      }
      expect(shownValue(view, "진행상태")).toBe("서버최신");
      await editText(view, "진행상태", "B거절");
      await rejectCall(h.rowCalls[0], permanent());
      expect(shownValue(view, "진행상태")).toBe("서버최신");
    });

    it("늦게 받은 동적 칸 정의도 첫 입력 전에 표 객체를 붙잡는다", async () => {
      const h = makeHarness(v);
      harnesses.push(h);
      vi.stubGlobal("alert", h.alertMock);
      let definitions!: (fields: Array<{ key: string; label: string; type: string }>) => void;
      h.adapter.api.loadCommonBasicFields = () => new Promise(resolve => { definitions = resolve; });
      const row = makeRow(v);
      const table = startTable(h, row, AGREE_KEY, { value: false, present: true }, true);
      const view = await mount(v, h, row);
      await act(async () => { definitions([{ key: AGREE_KEY, label: "동의여부", type: "checkbox" }]); await sleep(); });
      await table.settle(true);
      await toggle(view, "동의여부");
      await rejectCall(h.rowCalls[0], permanent());
      expect(isChecked(view, "동의여부")).toBe(true);
      expect(table.begin.mock.calls.at(-1)?.[2]).toBe(table.recovery);
    });

    it("unknown인 실패 객체도 폐기된 retry ACK로 known이 되고 후속 B 실패는 그 값으로 복원한다", async () => {
      const { h, view } = await setup();
      const recovery: Recovery = {};
      const bridge = h.adapter.unsaved!;
      vi.spyOn(bridge, "getBasicRecovery").mockReturnValue(recovery);
      await editText(view, "대표자명", "A확정");
      await rejectCall(h.rowCalls[0], transient());
      const failed = h.bar.entries[0];
      expect(failed.basicRestore).toBe(recovery);
      expect(failed.basicRestore?.original).toBeUndefined();
      expect(failed.revert).toBeUndefined();
      let retry!: Promise<boolean>;
      await act(async () => { retry = failed.retry(); await sleep(); });
      await editText(view, "대표자명", "B거절");
      await resolveCall(h.rowCalls[1]);
      expect(await retry).toBe(false);
      expect(recovery.original).toEqual({ value: "A확정", present: true });
      expect(h.storeCalls).toHaveLength(0);
      expect(view.onSaved).not.toHaveBeenCalled();
      await rejectCall(h.rowCalls[2], permanent());
      expect(shownValue(view, "대표자명")).toBe("A확정");
      expect(await failed.retry()).toBe(false);
      expect(h.rowCalls).toHaveLength(3);
    });

    it.each(["B 입력 뒤", "첫 입력 전"])("같은 복구 객체를 가진 새 표 통로는 pending 기준을 이어받는다(%s 완료)", async (timing) => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "첫원본" }) });
      const oldApply = vi.fn();
      const recovery: Recovery = { original: { value: "첫원본", present: true }, applyToTable: oldApply };
      vi.spyOn(h.adapter.unsaved!, "getBasicRecovery").mockReturnValue(recovery);
      await editText(view, "대표자명", "A확정");
      await view.unmount();
      const provider = makeHarness(v);
      const newApply = vi.fn();
      recovery.applyToTable = newApply;
      Object.assign(provider.adapter.unsaved!, { getBasicRecovery: () => recovery });
      const begin = vi.spyOn(provider.adapter.unsaved!, "beginBasicEdit");
      h.adapter.unsaved = provider.adapter.unsaved;
      const fresh = await mount(v, h, row);
      if (timing === "첫 입력 전") {
        await resolveCall(h.rowCalls[0]);
        await resolveCall(h.storeCalls[0]);
      }
      await editText(fresh, "대표자명", "B거절");
      if (timing === "B 입력 뒤") {
        await resolveCall(h.rowCalls[0]);
        await resolveCall(h.storeCalls[0]);
      }
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "대표자명")).toBe("A확정");
      expect(newApply).toHaveBeenCalledExactlyOnceWith({ value: "A확정", present: true });
      expect(oldApply).not.toHaveBeenCalled();
      expect(begin.mock.calls[0][2]).toBe(recovery);
    });

    it.each(["B 입력 뒤", "첫 입력 전"])("다른 현재 복구 객체의 unknown 기준은 옛 pending ACK를 물려받지 않는다(%s 완료)", async timing => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "첫원본" }) });
      const oldApply = vi.fn();
      const recovery: Recovery = { original: { value: "첫원본", present: true }, applyToTable: oldApply };
      vi.spyOn(h.adapter.unsaved!, "getBasicRecovery").mockReturnValue(recovery);
      await editText(view, "대표자명", "A확정");
      await view.unmount();
      const provider = makeHarness(v);
      const newApply = vi.fn();
      const currentRecovery: Recovery = { applyToTable: newApply };
      Object.assign(provider.adapter.unsaved!, { getBasicRecovery: () => currentRecovery });
      const begin = vi.spyOn(provider.adapter.unsaved!, "beginBasicEdit");
      h.adapter.unsaved = provider.adapter.unsaved;
      const fresh = await mount(v, h, row);
      if (timing === "첫 입력 전") {
        await resolveCall(h.rowCalls[0]); await resolveCall(h.storeCalls[0]);
      }
      await editText(fresh, "대표자명", "B실패");
      if (timing === "B 입력 뒤") {
        await resolveCall(h.rowCalls[0]); await resolveCall(h.storeCalls[0]);
      }
      await rejectCall(h.rowCalls[1], transient());
      const failed = provider.bar.entries[0];
      expect(begin.mock.calls[0][2]).toBe(currentRecovery);
      expect(failed.basicRestore).toBe(currentRecovery);
      expect(currentRecovery.original).toBeUndefined();
      expect(failed.revert).toBeUndefined();
      expect(shownValue(fresh, "대표자명")).toBe("B실패");
      expect(newApply).not.toHaveBeenCalled();
      expect(oldApply).not.toHaveBeenCalled();
    });

    it("세번째 인수를 쓰지 않는 기존 두 인수 bridge도 상세 저장·복원을 유지한다", async () => {
      const { h, view } = await setup({ row: makeRow(v, { [v.nameKey]: "첫원본" }) });
      const bridge = h.adapter.unsaved!;
      const begin = bridge.beginBasicEdit!;
      bridge.beginBasicEdit = (id, supersede) => begin(id, supersede);
      await editText(view, "대표자명", "A확정");
      await editText(view, "대표자명", "B거절");
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(view, "대표자명")).toBe("A확정");
      expect(h.storeCalls).toHaveLength(1);
    });
  });

  describe("P2 리뷰 5결함 회귀", () => {
    it("다시 연 화면의 B 실패는 앞서 수락한 A 저장의 성공값으로 복원한다", async () => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "원래값" }) });
      await editText(view, "대표자명", "A성공값");
      await view.unmount();
      const fresh = await mount(v, h, row);
      await editText(fresh, "대표자명", "B거절값");
      expect(h.rowCalls).toHaveLength(1); // 새 화면의 B도 이미 수락한 A 뒤에 선다.
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      expect(h.rowCalls[1].args).toEqual([row._id, v.nameKey, "B거절값"]);
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "대표자명")).toBe("A성공값");
      expect(h.storeCalls).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(0);
    });

    it("전송 중 무효화된 retry 성공도 B 실패의 복원 기준에 남고 추가 보관소 쓰기·통지는 없다", async () => {
      const { h, view } = await setup({ row: makeRow(v, { [v.nameKey]: "원래값" }) });
      await editText(view, "대표자명", "A성공값");
      await rejectCall(h.rowCalls[0], transient());
      const report = h.bar.entries[0];
      let retry!: Promise<boolean>;
      await act(async () => { retry = report.retry(); await sleep(); });
      expect(h.rowCalls).toHaveLength(2);
      await editText(view, "대표자명", "B거절값");
      await resolveCall(h.rowCalls[1]);
      expect(await retry).toBe(false);
      expect(h.storeCalls).toHaveLength(0);
      expect(view.onSaved).not.toHaveBeenCalled();
      await rejectCall(h.rowCalls[2], permanent());
      expect(shownValue(view, "대표자명")).toBe("A성공값");
      expect(h.storeCalls).toHaveLength(0);
      expect(h.bar.entries).toHaveLength(0);
    });

    it("PATCH 성공 전에 목표값 행을 받았어도 이후 false 행을 새 변경으로 반영한다", async () => {
      const { h, row, view } = await setup({ row: makeRow(v, { [AGREE_KEY]: false }) });
      await toggle(view, "동의여부");
      await view.rerender({ ...row, [AGREE_KEY]: true });
      expect(h.rowCalls[0].settled).toBe(false);
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      await view.rerender({ ...row, [AGREE_KEY]: false });
      expect(isChecked(view, "동의여부")).toBe(false);
    });

    const detailResult = (key: string, status: string) => ({
      key, bizno: key.slice(2), company: "테스트상사", ceo: "", phone: "",
      domainRows: [{ domain: v.ownDomain, domainLabel: "시험분야", entryId: "시험분야행", status, row: { _id: "시험분야행" } }],
    });

    it("최초 조회 중 사업자번호를 저장하면 새 번호로 조회하고 늦은 이전 응답은 버린다", async () => {
      const { DOMAIN_GROUPS } = await import("./lib/domain-config");
      const groups = [...DOMAIN_GROUPS];
      DOMAIN_GROUPS.push({ key: v.ownDomain, label: "시험분야", domains: [v.ownDomain] });
      try {
        const { h, row, view } = await setup({ holdDetails: true });
        expect(view.container.textContent).toContain("영역 현황 불러오는 중");
        await editText(view, "사업자번호", "000-00-00002");
        await resolveCall(h.rowCalls[0]);
        await resolveCall(h.storeCalls[0]);
        const oldReads = [...h.domainCalls];
        await view.rerender({ ...row, "15사업자번호": "000-00-00002" });
        const fresh = h.domainCalls.find((call) => call.args[0] === "b:0000000002");
        expect(fresh, "바뀐 사업자번호로 최초 조회를 다시 시작해야 한다").toBeDefined();
        await resolveCall(fresh!, detailResult("b:0000000002", "새번호현황"));
        expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
        expect(view.container.textContent).toContain("새번호현황");
        await resolveCall(oldReads[0], detailResult(`b:${BIZNO_A}`, "옛번호현황"));
        for (const call of oldReads.slice(1)) await rejectCall(call, new Error("옛번호 조회 실패"));
        expect(view.container.textContent).toContain("새번호현황");
        expect(view.container.textContent).not.toContain("옛번호현황");
        expect(view.container.textContent).not.toContain("정보를 불러오지 못했습니다");
      } finally { DOMAIN_GROUPS.splice(0, DOMAIN_GROUPS.length, ...groups); }
    });

    it("Strict Mode 재실행 뒤 최초 조회와 저장 후 새로고침이 모두 화면에 반영된다", async () => {
      const { DOMAIN_GROUPS } = await import("./lib/domain-config");
      const groups = [...DOMAIN_GROUPS];
      DOMAIN_GROUPS.push({ key: v.ownDomain, label: "시험분야", domains: [v.ownDomain] });
      try {
        const { h, view } = await setup({ holdDetails: true, strict: true });
        const initial = [...h.domainCalls];
        expect(initial.length).toBeGreaterThan(0);
        for (const call of initial) await resolveCall(call, detailResult(`b:${BIZNO_A}`, "최초현황"));
        expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
        expect(view.container.textContent).toContain("최초현황");
        h.auto.row = true;
        h.auto.store = true;
        await editText(view, "대표자명", "새대표");
        const refresh = h.domainCalls.slice(initial.length);
        expect(refresh.length).toBeGreaterThan(0);
        for (const call of refresh) await resolveCall(call, detailResult(`b:${BIZNO_A}`, "저장후현황"));
        expect(view.container.textContent).toContain("저장후현황");
        expect(view.container.textContent).not.toContain("최초현황");
      } finally { DOMAIN_GROUPS.splice(0, DOMAIN_GROUPS.length, ...groups); }
    });
  });

  describe("HX3 실제 DOM 회귀와 IX2 표 전달", () => {
    let restoreGroups: () => void;
    beforeEach(async () => {
      const { DOMAIN_GROUPS } = await import("./lib/domain-config");
      const previous = [...DOMAIN_GROUPS];
      DOMAIN_GROUPS.push({ key: v.ownDomain, label: "시험분야", domains: [v.ownDomain] });
      restoreGroups = () => { DOMAIN_GROUPS.splice(0, DOMAIN_GROUPS.length, ...previous); };
    });
    afterEach(() => restoreGroups());
    const result = (status: string) => ({
      key: `b:${BIZNO_A}`, bizno: BIZNO_A, company: "테스트상사", ceo: "", phone: "",
      domainRows: [{ domain: v.ownDomain, domainLabel: "시험분야", entryId: "구회사계약", status, row: { _id: "구회사계약" } }],
    });

    it("재열기 뒤 A 저장이 먼저 끝나도 다음 B 실패는 A로 복원한다", async () => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "원본대표" }) });
      await editText(view, "대표자명", "A확정");
      await view.unmount();
      const fresh = await mount(v, h, row);
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]); // 전역 진행 중 묶음은 여기서 정리된다.
      await editText(fresh, "대표자명", "B거절");
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "대표자명")).toBe("A확정");
      expect(h.storeCalls).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(0);
    });

    it("이전 owner ACK 전에 관측한 A는 다음 원본 행과의 비교 기준이 된다", async () => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "원본대표" }) });
      await editText(view, "대표자명", "A확정");
      await view.unmount();
      const fresh = await mount(v, h, row);
      await editText(fresh, "대표자명", "B거절");
      await fresh.rerender({ ...row, [v.nameKey]: "A확정" });
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "대표자명")).toBe("A확정");
      await fresh.rerender({ ...row });
      expect(shownValue(fresh, "대표자명")).toBe("원본대표");
    });

    it.each(["행", "보관소"])("재열기 확정값보다 나중에 실제 적용한 %s 값을 복원에 쓴다", async (source) => {
      const { h, row, view } = await setup({ row: makeRow(v, { [PROGRESS_KEY]: "원본상태" }), progress: true });
      await editText(view, "진행상태", "A확정");
      await view.unmount();
      const fresh = await mount(v, h, row);
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      if (source === "행") await fresh.rerender({ ...row, [PROGRESS_KEY]: "서버최신" });
      else {
        h.auto.read = false;
        await fresh.rerender({ ...row, [v.emailKey]: "fresh@example.test" });
        const reads = h.readCalls.filter(c => !c.settled);
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) await resolveCall(read, storeRecord({ 진행상태: "서버최신" }));
      }
      expect(shownValue(fresh, "진행상태")).toBe("서버최신");
      await editText(fresh, "진행상태", "B거절");
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "진행상태")).toBe("서버최신");
    });

    it("진행 중 묶음이 없는 재열기는 이전 완료값을 전역에서 가져오지 않는다", async () => {
      const { h, row, view } = await setup({ row: makeRow(v, { [v.nameKey]: "원본대표" }) });
      await editText(view, "대표자명", "완료값");
      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      await view.unmount();
      const fresh = await mount(v, h, { ...row, [v.nameKey]: "나중서버값" });
      await editText(fresh, "대표자명", "B거절");
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "대표자명")).toBe("나중서버값");
    });

    it.each(["행", "보관소"])("이전 보관소 저장 대기 중 실제 적용한 %s 값도 다음 입력 복원의 기준이다", async (source) => {
      const { h, row, view } = await setup({ row: makeRow(v, { [PROGRESS_KEY]: "원본상태" }), progress: true });
      await editText(view, "진행상태", "A확정");
      await view.unmount();
      const fresh = await mount(v, h, row);
      await resolveCall(h.rowCalls[0]); // 확정값은 A지만 아직 전역 저장 묶음은 남아 있다.
      if (source === "행") await fresh.rerender({ ...row, [PROGRESS_KEY]: "나중서버값" });
      else {
        h.auto.read = false;
        await fresh.rerender({ ...row, [v.emailKey]: "fresh@example.test" });
        const reads = h.readCalls.filter(c => !c.settled);
        expect(reads.length).toBeGreaterThan(0);
        for (const read of reads) await resolveCall(read, storeRecord({ 진행상태: "나중서버값" }));
      }
      expect(shownValue(fresh, "진행상태")).toBe("나중서버값");
      await editText(fresh, "진행상태", "B거절");
      expect(h.rowCalls).toHaveLength(1);
      await resolveCall(h.storeCalls[0]);
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(fresh, "진행상태")).toBe("나중서버값");
    });

    it("새 회사 첫 렌더와 null 응답 뒤에도 구회사 계약 편집 경로가 없다", async () => {
      const { h, row, view } = await setup({ holdDetails: true });
      await resolveCall(h.domainCalls[0], result("구회사현황"));
      const observed: Array<{ owner: unknown; ids: string[] }> = [];
      h.adapter.components.sectionPanels = {
        [v.ownDomain]: ({ primaryRow, rows, adapter }) => {
          // passive effect 초기화 전 실제 자식에 전달된 행도 기록한다.
          React.useLayoutEffect(() => { observed.push({ owner: primaryRow._id, ids: rows.map(r => r.entryId) }); });
          return <div data-hx3-contract>{rows.map(r => <button key={r.entryId} onClick={() => { void adapter.api.saveOwnField(r.entryId, "계약정보_차수", "1"); }}>{r.entryId}</button>)}</div>;
        },
      };
      const tab = [...view.container.querySelectorAll("button")].find(b => b.textContent?.includes("시험분야"));
      expect(tab).toBeDefined();
      await act(async () => { tab!.click(); });
      expect(view.container.querySelector("[data-hx3-contract]")?.textContent).toContain("구회사계약");
      const next = makeRow(v, { "15사업자번호": "000-00-00002" });
      await view.rerender(next);
      const leaked = observed.filter(item => item.owner === next._id && item.ids.includes("구회사계약"));
      expect(leaked, "새 회사는 effect 이전에도 구회사 편집 자료를 받으면 안 된다").toEqual([]);
      await resolveCall(h.domainCalls.at(-1)!); // 정상 null
      expect(view.container.textContent).not.toContain("구회사계약");
      expect(view.container.querySelector("[data-hx3-contract] button")).toBeNull();
      expect(h.rowCalls).toHaveLength(0);
      expect(row._id).not.toBe(next._id);
    });

    it("같은 회사의 최신 null 조회도 이전 현황을 명시적으로 지운다", async () => {
      const { h, view } = await setup({ holdDetails: true });
      await resolveCall(h.domainCalls[0], result("이전현황"));
      h.auto.row = true;
      h.auto.store = true;
      await editText(view, "대표자명", "갱신대표");
      await resolveCall(h.domainCalls.at(-1)!);
      expect(view.container.textContent).not.toContain("이전현황");
    });

    it("사업자번호 없는 회사는 연락처 변경으로 새 조회를 시작하고 옛 응답을 버린다", async () => {
      const { h, row, view } = await setup({ holdDetails: true, row: makeRow(v, { "15사업자번호": "", "04연락처": "01099990001" }) });
      const old = h.domainCalls[0];
      expect(old.args).toEqual(["p:01099990001"]);
      await view.rerender({ ...row, "04연락처": "01099990002" });
      const latest = h.domainCalls.find(c => c.args[0] === "p:01099990002");
      expect(latest).toBeDefined();
      await resolveCall(latest!, result("새연락처현황"));
      await resolveCall(old, result("옛연락처현황"));
      expect(view.container.textContent).toContain("새연락처현황");
      expect(view.container.textContent).not.toContain("옛연락처현황");
    });

    it.each(["resolve", "reject"])("StrictMode 두번째 성공 뒤 첫번째 %s는 화면을 덮지 않는다", async (outcome) => {
      const { h, view } = await setup({ holdDetails: true, strict: true });
      expect(h.domainCalls).toHaveLength(2);
      await resolveCall(h.domainCalls[1], result("최신성공현황"));
      expect(view.container.textContent).toContain("최신성공현황");
      if (outcome === "resolve") await resolveCall(h.domainCalls[0], result("이전응답현황"));
      else await rejectCall(h.domainCalls[0], new Error("이전조회실패"));
      expect(view.container.textContent).toContain("최신성공현황");
      expect(view.container.textContent).not.toContain("이전응답현황");
      expect(view.container.textContent).not.toContain("정보를 불러오지 못했습니다");
    });

    it.each(["resolve", "reject"])("silent 최신 조회가 초기 조회를 대체해도 loading이 풀리고 옛 %s를 무시한다", async (outcome) => {
      const { h, view } = await setup({ holdDetails: true });
      h.auto.row = true;
      h.auto.store = true;
      await editText(view, "대표자명", "갱신대표");
      expect(h.domainCalls).toHaveLength(2);
      await resolveCall(h.domainCalls[1], result("저장후최신"));
      expect(view.container.textContent).not.toContain("영역 현황 불러오는 중");
      expect(view.container.textContent).toContain("저장후최신");
      if (outcome === "resolve") await resolveCall(h.domainCalls[0], result("초기옛값"));
      else await rejectCall(h.domainCalls[0], new Error("초기실패"));
      expect(view.container.textContent).toContain("저장후최신");
      expect(view.container.textContent).not.toContain("초기옛값");
      expect(view.container.textContent).not.toContain("정보를 불러오지 못했습니다");
    });

    it("행 ACK는 보관소 응답 전 표 복원 기준으로 전달되고 실패는 전달하지 않는다", async () => {
      const { h, row, view } = await setup();
      const note = vi.fn();
      Object.assign(h.adapter.unsaved!, { noteBasicServerValue: note });
      await editText(view, "대표자명", "A확정");
      expect(note).not.toHaveBeenCalled();
      await resolveCall(h.rowCalls[0]);
      expect(note).toHaveBeenCalledExactlyOnceWith(`시험화면|${row._id}|${v.nameKey}`, { value: "A확정", present: true });
      expect(h.storeCalls[0].settled).toBe(false);
      await resolveCall(h.storeCalls[0]);
      await editText(view, "대표자명", "B거절");
      await rejectCall(h.rowCalls[1], permanent());
      expect(note).toHaveBeenCalledTimes(1);
    });

    it("닫힘과 표 새 입력으로 무효화된 상세 ACK도 표로 전달한다", async () => {
      const { h, row, view } = await setup();
      const note = vi.fn();
      Object.assign(h.adapter.unsaved!, { noteBasicServerValue: note });
      await editText(view, "대표자명", "A확정");
      await view.unmount();
      const id = `시험화면|${row._id}|${v.nameKey}`;
      const sharedRecovery = h.adapter.unsaved!.getBasicRecovery!(id);
      expect(sharedRecovery).toBeDefined();
      const tableLease = h.adapter.unsaved!.beginBasicEdit!(id, () => {}, sharedRecovery);
      await resolveCall(h.rowCalls[0]);
      expect(note).toHaveBeenCalledExactlyOnceWith(id, { value: "A확정", present: true });
      expect(view.onSaved).toHaveBeenCalledTimes(1);
      await resolveCall(h.storeCalls[0]);
      tableLease.release();
    });

    it("무효화된 retry ACK도 표로 전달하되 후속 보관소·UI 통지는 막는다", async () => {
      const { h, row, view } = await setup();
      const note = vi.fn();
      Object.assign(h.adapter.unsaved!, { noteBasicServerValue: note });
      await editText(view, "대표자명", "A확정");
      await rejectCall(h.rowCalls[0], transient());
      const report = h.bar.entries[0];
      let retry!: Promise<boolean>;
      await act(async () => { retry = report.retry(); await sleep(); });
      await editText(view, "대표자명", "B거절");
      await resolveCall(h.rowCalls[1]);
      expect(await retry).toBe(false);
      expect(note).toHaveBeenCalledExactlyOnceWith(`시험화면|${row._id}|${v.nameKey}`, { value: "A확정", present: true });
      expect(h.storeCalls).toHaveLength(0);
      expect(view.onSaved).not.toHaveBeenCalled();
      await rejectCall(h.rowCalls[2], permanent());
      expect(shownValue(view, "대표자명")).toBe("A확정");
    });

    it("optional 표 콜백 예외는 성공한 저장을 실패로 바꾸지 않는다", async () => {
      const { h, view } = await setup();
      const note = vi.fn(() => { throw new Error("표 통지 실패"); });
      Object.assign(h.adapter.unsaved!, { noteBasicServerValue: note });
      await editText(view, "대표자명", "A확정");
      await resolveCall(h.rowCalls[0]);
      expect(note).toHaveBeenCalledTimes(1);
      expect(h.storeCalls).toHaveLength(1);
      await resolveCall(h.storeCalls[0]);
      expect(shownValue(view, "대표자명")).toBe("A확정");
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(h.bar.entries).toHaveLength(0);
      expect(view.onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("같은 회사의 새 행: 안 바뀐 칸은 고친 값을 지키고, 서버에서 바뀐 칸만 갱신하되 저장 중인 칸은 건드리지 않는다", async () => {
    const { h, row, view } = await setup();
    h.auto.row = true;
    h.auto.store = true;
    await editText(view, "대표자명", "홍길동");
    expect(shownValue(view, "대표자명")).toBe("홍길동");
    expect(h.rowCalls[0].args).toEqual([row._id, v.nameKey, "홍길동"]);
    expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "홍길동"]);

    // 서버가 이메일만 바꾼 새 행 — 대표자명은 이전 행과 같은 값(빈칸)이라 고친 값이 유지된다.
    await view.rerender({ ...row, [v.emailKey]: "a@test.example" });
    expect(shownValue(view, "대표자명")).toBe("홍길동");
    expect(shownValue(view, "이메일")).toBe("a@test.example");

    // 이메일 저장이 끝나기 전에 서버가 이메일·대표자명을 모두 바꾼 새 행을 보낸다.
    h.auto.row = false;
    await editText(view, "이메일", "mine@test.example");
    await view.rerender({ ...row, [v.emailKey]: "server@test.example", [v.nameKey]: "서버대표" });
    expect(shownValue(view, "이메일")).toBe("mine@test.example");
    expect(shownValue(view, "대표자명")).toBe("서버대표");

    // 완료만으로 보호 중 보류한 행을 자동 적용하지 않는다. 완료 후 새 행 이벤트는 같은 서버값이어도 반영한다.
    await resolveCall(h.rowCalls[1]);
    await resolveCall(h.storeCalls[1]);
    expect(shownValue(view, "이메일")).toBe("mine@test.example");
    await view.rerender({ ...row, [v.emailKey]: "server@test.example", [v.nameKey]: "서버대표" });
    expect(shownValue(view, "이메일")).toBe("server@test.example");
    expect(shownValue(view, "대표자명")).toBe("서버대표");
  });

  it("false·null·칸 삭제도 실제 값으로 반영하고, 안 바뀐 false 는 비어 있음으로 취급하지 않는다", async () => {
    const row = makeRow(v, { [AGREE_KEY]: true, [v.nameKey]: "홍길동", [v.emailKey]: "a@test.example" });
    const { h, view } = await setup({ row });
    expect(isChecked(view, "동의여부")).toBe(true);

    const withoutEmail = { ...row };
    delete withoutEmail[v.emailKey];
    await view.rerender({ ...withoutEmail, [AGREE_KEY]: false, [v.nameKey]: null });
    expect(isChecked(view, "동의여부")).toBe(false);
    expect(shownValue(view, "대표자명")).toBe("-");
    expect(shownValue(view, "이메일")).toBe("-");

    h.auto.row = true;
    h.auto.store = true;
    await toggle(view, "동의여부"); // false → true
    expect(isChecked(view, "동의여부")).toBe(true);
    await view.rerender({ ...withoutEmail, [AGREE_KEY]: false, [v.nameKey]: null }); // 새 객체·같은 내용
    expect(isChecked(view, "동의여부")).toBe(true);
  });

  it("같은 회사·같은 칸 저장은 입력 순서대로 [행 → 보관소] 를 마친 뒤 다음으로 넘어가고, 다른 칸은 기다리지 않는다", async () => {
    const { h, view } = await setup();
    await toggle(view, "동의여부"); // 입력 1: true
    await toggle(view, "동의여부"); // 입력 2: false
    expect(h.trace).toEqual([`row:${AGREE_KEY}=true`]); // 입력 2 는 입력 1 이 다 끝나기 전엔 시작하지 않는다

    await editText(view, "대표자명", "병렬값"); // 다른 칸 — 바로 시작
    expect(h.trace).toEqual([`row:${AGREE_KEY}=true`, `row:${v.nameKey}=병렬값`]);

    await resolveCall(h.rowCalls[0]); // 입력 1 행 저장 성공 → 같은 값을 보관소에도 기록
    expect(h.trace).toEqual([`row:${AGREE_KEY}=true`, `row:${v.nameKey}=병렬값`, "store:동의여부=true"]);
    expect(h.rowCalls).toHaveLength(2); // 입력 2 는 보관소 기록까지 끝나야 시작

    await resolveCall(h.storeCalls[0]);
    expect(h.trace[3]).toBe(`row:${AGREE_KEY}=false`);
    await resolveCall(h.rowCalls[2]);
    expect(h.trace[4]).toBe("store:동의여부=false");
    expect(h.storeCalls[1].args).toEqual([BIZNO_A, "erp", "동의여부", false]);
    await resolveCall(h.storeCalls[1]);
    expect(isChecked(view, "동의여부")).toBe(false);
  });

  it("창이 닫혀도(언마운트) 이미 받아들인 저장은 입력 순서대로 끝까지 가되, 최신 성공을 원래 부모에 알린다", async () => {
    const { h, view } = await setup();
    await toggle(view, "동의여부");
    await toggle(view, "동의여부");
    await view.unmount();

    await resolveCall(h.rowCalls[0]);
    await resolveCall(h.storeCalls[0]);
    await resolveCall(h.rowCalls[1]);
    await resolveCall(h.storeCalls[1]);
    expect(h.trace).toEqual([
      `row:${AGREE_KEY}=true`, "store:동의여부=true",
      `row:${AGREE_KEY}=false`, "store:동의여부=false",
    ]);
    expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "동의여부", true]);
    expect(h.storeCalls[1].args).toEqual([BIZNO_A, "erp", "동의여부", false]);
    expect(view.onSaved).toHaveBeenCalledTimes(1);
    expect(h.reports).toHaveLength(0);
    expect(h.alertMock).not.toHaveBeenCalled();
  });

  it("창이 닫힌 뒤 최신 잠깐 실패는 앱 보관함에 남고 상세 경고·보관소 기록은 만들지 않는다", async () => {
    const { h, view } = await setup();
    await toggle(view, "동의여부");
    await editText(view, "대표자명", "닫기전값");
    await view.unmount();

    await rejectCall(h.rowCalls[0], transient());
    await rejectCall(h.rowCalls[1], permanent("권한이 없습니다"));
    expect(h.reports).toHaveLength(1);
    expect(h.bar.entries).toHaveLength(1);
    expect(h.alertMock).not.toHaveBeenCalled();
    expect(h.storeCalls).toHaveLength(0); // 행 저장이 실패하면 보관소에도 쓰지 않는다
    expect(view.onSaved).not.toHaveBeenCalled();
  });

  it("행 저장이 끝나도 보관소 기록이 끝날 때까지는 새 행이 입력을 덮지 못하고, 둘 다 끝나면 보호가 풀린다", async () => {
    const { h, row, view } = await setup();
    await editText(view, "대표자명", "내값");
    await resolveCall(h.rowCalls[0]); // 행 저장 성공 → 보관소 기록 시작(아직 안 끝남)
    expect(h.storeCalls).toHaveLength(1);
    expect(h.storeCalls[0].settled).toBe(false);
    expect(view.onSaved).toHaveBeenCalledTimes(1);

    await view.rerender({ ...row, [v.nameKey]: "서버값" });
    expect(shownValue(view, "대표자명")).toBe("내값");

    await resolveCall(h.storeCalls[0]);
    await view.rerender({ ...row, [v.nameKey]: "다음서버값" });
    expect(shownValue(view, "대표자명")).toBe("다음서버값");
  });

  it("없는 칸의 복원 기준을 관측한 뒤에는 새 서버 값을 반영한다", async () => {
    const absent = makeRow(v);
    delete absent[v.nameKey];
    const mounted = await setup({ row: absent });
    const h = mounted.h;
    let view = mounted.view;
    await editText(view, "대표자명", "A");
    await rejectCall(h.rowCalls[0], transient());
    await view.unmount();
    view = await mount(v, h, { ...absent, [v.nameKey]: "A" });
    await editText(view, "대표자명", "B");
    await view.rerender({ ...absent });
    await rejectCall(h.rowCalls[1], permanent());
    expect(shownValue(view, "대표자명")).toBe("-");
    await view.rerender({ ...absent, [v.nameKey]: "A" });
    expect(shownValue(view, "대표자명")).toBe("A");
  });

  it("행 저장이 확인된 값을 보호 중 받았으면 이후 다른 사용자의 변경을 반영한다", async () => {
    const { h, row, view } = await setup({ row: makeRow(v, { [AGREE_KEY]: false }) });
    await toggle(view, "동의여부");
    await resolveCall(h.rowCalls[0]);
    expect(h.storeCalls[0].settled).toBe(false);
    await view.rerender({ ...row, [AGREE_KEY]: true });
    expect(isChecked(view, "동의여부")).toBe(true);
    await resolveCall(h.storeCalls[0]);
    await view.rerender({ ...row, [AGREE_KEY]: false });
    expect(isChecked(view, "동의여부")).toBe(false);
  });

  it("보관소 기록이 실패해도 예전처럼 조용히 넘어가고(경고·보관함 없음) 입력 보호는 풀린다", async () => {
    const { h, row, view } = await setup();
    await editText(view, "대표자명", "내값");
    await resolveCall(h.rowCalls[0]);
    await rejectCall(h.storeCalls[0], new Error("보관소 장애"));
    expect(h.alertMock).not.toHaveBeenCalled();
    expect(h.reports).toHaveLength(0);
    expect(h.resolvedIds).toHaveLength(1); // 수락 때 이전 항목 제거; 최초 성공은 새 항목을 지우지 않는다
    expect(shownValue(view, "대표자명")).toBe("내값");

    await view.rerender({ ...row, [v.nameKey]: "서버값" });
    expect(shownValue(view, "대표자명")).toBe("서버값");
  });

  describe("앱 막대와 새 조회 계약", () => {
    it("retry 중복은 보관소 기록까지 막고 실패 뒤 다음 명시 재시도는 허용한다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "복구값");
      await rejectCall(h.rowCalls[0], transient());
      const report = h.bar.entries[0];
      let first!: Promise<boolean>;
      await act(async () => { first = report.retry(); await sleep(); });
      await rejectCall(h.rowCalls[1], transient());
      expect(await first).toBe(false);
      h.auto.row = true;
      let next!: Promise<boolean>;
      await act(async () => { next = report.retry(); await sleep(); });
      expect(h.storeCalls).toHaveLength(1);
      let duplicate: boolean | undefined;
      await act(async () => { void report.retry().then((value) => { duplicate = value; }); await sleep(); });
      expect(duplicate).toBe(false);
      expect(h.rowCalls).toHaveLength(3);
      await resolveCall(h.storeCalls[0]);
      expect(await next).toBe(true);
      expect(await report.retry()).toBe(false);
    });

    it("retry 두 번 뒤 표 저장이 막대를 제거하고 첫 retry가 실패해도 뒤의 옛 요청은 보내지 않는다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "A실패값");
      await rejectCall(h.rowCalls[0], transient());
      const old = h.bar.entries[0];
      let first!: Promise<boolean>;
      let secondDone = false;
      let secondResult: boolean | undefined;
      await act(async () => {
        first = old.retry();
        void old.retry().then((result) => { secondResult = result; secondDone = true; });
        await sleep();
      });
      h.auto.row = true;
      h.auto.store = true; // 옛 제품의 잘못된 후속 요청이 정리 뒤에 남지 않게 한다
      expect(secondDone).toBe(true);
      expect(secondResult).toBe(false);
      expect(h.rowCalls).toHaveLength(2);
      h.adapter.unsaved!.resolve(old.id); // 표의 B 저장 성공이 같은 id 앱 막대를 제거
      expect(h.bar.entries).toHaveLength(0);
      await rejectCall(h.rowCalls[1], transient());
      expect(await first).toBe(false);
      await tick();
      expect(h.rowCalls).toHaveLength(2);
      const providerRetry = h.bar.entries.includes(old) ? await old.retry() : false;
      expect(providerRetry).toBe(false);
    });

    it.each(["transient", "permanent"] as const)("A 잠깐 실패 뒤 B %s: A 항목 제거와 첫 기준값 복원을 실제 소비 규칙으로 확인한다", async (kind) => {
      const row = makeRow(v, { [v.nameKey]: "첫기준값" });
      const { h, view } = await setup({ row });
      await editText(view, "대표자명", "A임시값");
      await rejectCall(h.rowCalls[0], transient());
      const old = h.bar.entries[0];
      expect(old).toBeDefined();
      await editText(view, "대표자명", "B임시값");
      expect(h.bar.entries).toHaveLength(0);
      await rejectCall(h.rowCalls[1], kind === "transient" ? transient() : permanent());
      if (kind === "transient") {
        expect(h.bar.entries).toHaveLength(1);
        expect(h.bar.entries[0].revert).not.toBe(old.revert);
        await act(async () => { const current = h.bar.entries[0]; current.revert?.(); h.adapter.unsaved!.resolve(current.id); await sleep(); });
      }
      expect(shownValue(view, "대표자명")).toBe("첫기준값");
      expect(h.bar.entries).toHaveLength(0);
      expect(await old.retry()).toBe(false);
      expect(h.rowCalls).toHaveLength(2);
    });

    it("닫힌 뒤 인증 실패도 앱 막대에서 원래 행·보관소에 다시 저장한다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "복구값");
      await view.unmount();
      await rejectCall(h.rowCalls[0], Object.assign(new Error("로그인 만료"), { saveFailureKind: "auth" }));
      expect(h.bar.entries).toHaveLength(1);
      h.auto.row = true;
      h.auto.store = true;
      expect(await h.bar.entries[0].retry()).toBe(true);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "복구값"]);
      expect(view.onSaved).toHaveBeenCalledTimes(1);
      expect(h.alertMock).not.toHaveBeenCalled();
    });

    it("같은 회사를 다시 열어 새 입력을 끝내면 옛 실패 retry·revert는 영구 무효다", async () => {
      const { h, row, view } = await setup();
      await editText(view, "대표자명", "옛입력");
      await rejectCall(h.rowCalls[0], transient());
      const old = h.bar.entries[0];
      await view.unmount();
      const fresh = await mount(v, h, row);
      h.auto.row = true;
      h.auto.store = true;
      await editText(fresh, "대표자명", "새입력");
      expect(h.bar.entries).toHaveLength(0);
      expect(await old.retry()).toBe(false);
      await act(async () => { old.revert?.(); await sleep(); });
      expect(shownValue(fresh, "대표자명")).toBe("새입력");
      expect(h.rowCalls).toHaveLength(2);
    });

    it("다시 연 회사의 새 입력은 대기 중 옛 retry를 막고 이미 출발한 원래 저장은 마친다", async () => {
      const { h, row, view } = await setup();
      await editText(view, "대표자명", "옛입력");
      await rejectCall(h.rowCalls[0], transient());
      const old = h.bar.entries[0];
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => { first = old.retry(); second = old.retry(); await sleep(); });
      expect(h.rowCalls).toHaveLength(2);
      await view.unmount();
      const fresh = await mount(v, h, row);
      await editText(fresh, "대표자명", "새입력");
      await resolveCall(h.rowCalls[1]);
      expect(h.storeCalls).toHaveLength(0);
      expect(await first).toBe(false);
      expect(await second).toBe(false);
      expect(h.rowCalls).toHaveLength(3);
      expect(h.rowCalls[2].args).toEqual([row._id, v.nameKey, "새입력"]);
      await resolveCall(h.rowCalls[2]);
      await resolveCall(h.storeCalls[0]);
      expect(shownValue(fresh, "대표자명")).toBe("새입력");
      expect(await old.retry()).toBe(false);
    });

    it.each(["글자", "null", "삭제", "false"])("저장 중 보류한 %s 값은 완료 직후가 아닌 다음 같은 값의 새 조회에서 적용한다", async (kind) => {
      const flag = kind === "false";
      const row = makeRow(v, flag ? { [AGREE_KEY]: null } : { [v.nameKey]: "첫기준값" });
      const { h, view } = await setup({ row });
      if (flag) await toggle(view, "동의여부");
      else await editText(view, "대표자명", "내입력");
      await resolveCall(h.rowCalls[0]);
      const next: Record<string, unknown> = { ...row, [flag ? AGREE_KEY : v.nameKey]: flag ? false : kind === "글자" ? "서버값" : null };
      if (kind === "삭제") delete next[v.nameKey];
      await view.rerender(next);
      if (flag) expect(isChecked(view, "동의여부")).toBe(true);
      else expect(shownValue(view, "대표자명")).toBe("내입력");
      await resolveCall(h.storeCalls[0]);
      if (flag) expect(isChecked(view, "동의여부")).toBe(true);
      else expect(shownValue(view, "대표자명")).toBe("내입력");
      await view.rerender({ ...next });
      if (flag) expect(isChecked(view, "동의여부")).toBe(false);
      else expect(shownValue(view, "대표자명")).toBe(kind === "글자" ? "서버값" : "-");
    });
  });

  describe("회사 전환(같은 화면에 다른 회사 행)", () => {
    const otherCompany = () => makeRow(v, { "15사업자번호": "000-00-00002" });

    it("받아들인 저장은 이전 회사로 끝까지 가고, 새 회사 화면은 영향받지 않는다", async () => {
      const { h, row, view } = await setup();
      await editText(view, "대표자명", "이전회사값");
      await view.rerender(otherCompany());
      expect(shownValue(view, "대표자명")).toBe("-");

      await resolveCall(h.rowCalls[0]);
      expect(h.rowCalls[0].args).toEqual([row._id, v.nameKey, "이전회사값"]);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "이전회사값"]);
      await resolveCall(h.storeCalls[0]);
      expect(shownValue(view, "대표자명")).toBe("-");
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(view.onSaved).toHaveBeenCalledTimes(1); // 원래 부모에 통지하되 현재 회사 상세는 그대로다
    });

    it("빠른 연속 저장 2건도 이전 회사로 순서대로 끝까지 가고, 원래 부모 통지와 새 회사의 보관함·경고 보호를 유지하며 새 회사 화면은 그대로다", async () => {
      const { h, row, view } = await setup();
      await toggle(view, "동의여부"); // 입력 1: true
      await toggle(view, "동의여부"); // 입력 2: false (줄에서 대기)
      await view.rerender(otherCompany());
      expect(isChecked(view, "동의여부")).toBe(false);

      await resolveCall(h.rowCalls[0]);
      await resolveCall(h.storeCalls[0]);
      await resolveCall(h.rowCalls[1]);
      await resolveCall(h.storeCalls[1]);
      expect(h.trace).toEqual([
        `row:${AGREE_KEY}=true`, "store:동의여부=true",
        `row:${AGREE_KEY}=false`, "store:동의여부=false",
      ]);
      expect(h.rowCalls[0].args[0]).toBe(row._id);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "동의여부", true]);
      expect(h.storeCalls[1].args).toEqual([BIZNO_A, "erp", "동의여부", false]);
      expect(view.onSaved).toHaveBeenCalledTimes(1);
      expect(h.reports).toHaveLength(0);
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(isChecked(view, "동의여부")).toBe(false);
    });

    it("이전 회사의 영구 실패는 새 회사 화면에 되돌리기·경고를 일으키지 않는다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "이전회사값");
      await view.rerender(otherCompany());
      await rejectCall(h.rowCalls[0], permanent());
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(h.reports).toHaveLength(0);
      expect(shownValue(view, "대표자명")).toBe("-");
    });

    it("이전 회사의 최신 잠깐 실패는 앱 보관함에 남고 새 회사 화면·경고에는 나타나지 않는다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "이전회사값");
      await view.rerender(otherCompany());
      await rejectCall(h.rowCalls[0], transient());
      expect(h.reports).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(1);
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(h.storeCalls).toHaveLength(0);
      expect(shownValue(view, "대표자명")).toBe("-");
    });

    it("회사가 바뀌기 전에 담아 둔 최신 재시도는 이전 회사로 저장하고 새 회사 화면은 지킨다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "이전회사값");
      await rejectCall(h.rowCalls[0], transient()); // 아직 이 회사 화면 — 보관함에 담긴다
      expect(h.reports).toHaveLength(1);
      const stale = h.reports[0];

      await view.rerender(otherCompany());
      h.auto.row = true;
      h.auto.store = true;
      let retried: boolean | undefined;
      await act(async () => { retried = await stale.retry(); });
      expect(retried).toBe(true);
      expect(h.rowCalls).toHaveLength(2);
      expect(h.storeCalls).toHaveLength(1);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "이전회사값"]);

      await act(async () => { stale.revert?.(); await sleep(); });
      expect(shownValue(view, "대표자명")).toBe("-");
      expect(h.alertMock).not.toHaveBeenCalled();
    });

    it("늦게 도착한 이전 회사의 보관소 읽기는 새 회사 칸·변경 내역에 나타나지 않는다", async () => {
      // 이전 회사의 보관소 읽기를 모두 보류 상태로 둔 채 회사를 바꾼다.
      const { h, view } = await setup({ holdReads: true });
      const oldReads = h.readCalls.filter((c) => !c.settled && c.args[0] === BIZNO_A);
      expect(oldReads.length).toBeGreaterThan(0);

      h.auto.read = true;
      await view.rerender(otherCompany());
      for (const c of oldReads) await resolveCall(c, storeRecord({ 대표자명: "이전회사대표", 사업자유형: "법인" }));
      expect(shownValue(view, "대표자명")).toBe("-");
      expect(shownValue(view, "사업자유형")).toBe("-");
      expect(view.container.textContent).not.toContain("펼치기 (");
    });
  });

  describe("저장 실패", () => {
    it.each(["영구 실패", "일시 실패 뒤 되돌리기"])("보관소에서 채운 첫 표시값은 %s 때 되돌릴 기준으로 남는다", async (kind) => {
      const { h, view } = await setup({ holdReads: true });
      const reads = h.readCalls.filter((c) => !c.settled);
      expect(reads.length).toBeGreaterThan(0);
      for (const c of reads) await resolveCall(c, storeRecord({ 대표자명: "보관소대표" }));
      expect(shownValue(view, "대표자명")).toBe("보관소대표");

      await editText(view, "대표자명", "거절대표");
      expect(h.rowCalls).toHaveLength(1);
      expect(h.storeCalls).toHaveLength(0);
      await rejectCall(h.rowCalls[0], kind === "영구 실패" ? permanent("거절 사유") : transient());
      if (kind !== "영구 실패") {
        expect(shownValue(view, "대표자명")).toBe("거절대표");
        expect(h.reports).toHaveLength(1);
        await act(async () => { h.reports[0].revert?.(); await sleep(); });
      }
      expect(shownValue(view, "대표자명")).toBe("보관소대표");
      expect(h.storeCalls).toHaveLength(0);
      expect(h.alertMock).toHaveBeenCalledTimes(kind === "영구 실패" ? 1 : 0);
    });

    it("완료된 입력 뒤 보관소가 갱신한 진행상태는 다음 영구 실패 때 최신 표시값으로 돌아간다", async () => {
      const row = makeRow(v);
      const { h, view } = await setup({ row, progress: true });
      h.auto.row = true;
      h.auto.store = true;
      await editText(view, "진행상태", "이전완료상태");
      expect(h.rowCalls).toHaveLength(1);
      expect(h.storeCalls).toHaveLength(1);

      h.auto.read = false;
      await view.rerender({ ...row, [v.emailKey]: "fresh@test.example" });
      const reads = h.readCalls.filter((c) => !c.settled);
      expect(reads.length).toBeGreaterThan(0);
      for (const c of reads) await resolveCall(c, storeRecord({ 진행상태: "보관소최신상태" }));
      expect(shownValue(view, "진행상태")).toBe("보관소최신상태");

      h.auto.row = false;
      await editText(view, "진행상태", "거절상태");
      await rejectCall(h.rowCalls[1], permanent());
      expect(shownValue(view, "진행상태")).toBe("보관소최신상태");
      expect(h.storeCalls).toHaveLength(1);
      expect(h.alertMock).toHaveBeenCalledTimes(1);
    });

    it("보관소 표시값에서 연속 입력·일시 실패 보관을 거쳐도 첫 기준값을 보존한다", async () => {
      const { h, view } = await setup({ holdReads: true });
      const reads = h.readCalls.filter((c) => !c.settled);
      expect(reads.length).toBeGreaterThan(0);
      for (const c of reads) await resolveCall(c, storeRecord({ 대표자명: "보관소기준값" }));
      await editText(view, "대표자명", "첫임시값");
      await editText(view, "대표자명", "두번째임시값");
      expect(h.rowCalls).toHaveLength(1);
      await rejectCall(h.rowCalls[0], transient());
      expect(h.rowCalls).toHaveLength(2);
      await rejectCall(h.rowCalls[1], transient());
      expect(h.reports).toHaveLength(1);
      await editText(view, "대표자명", "거절값");
      await rejectCall(h.rowCalls[2], permanent());
      expect(shownValue(view, "대표자명")).toBe("보관소기준값");
      expect(h.storeCalls).toHaveLength(0);
    });

    it("잠깐 실패: 입력을 지우지 않고 앱 보관함에 담으며, 새 행이 그 칸을 덮지 못한다", async () => {
      const { h, row, view } = await setup();
      await editText(view, "대표자명", "입력값");
      await rejectCall(h.rowCalls[0], transient());
      expect(h.reports).toHaveLength(1);
      expect(h.reports[0]).toMatchObject({ rowId: row._id, fieldKey: v.nameKey, value: "입력값", kind: "transient" });
      expect(shownValue(view, "대표자명")).toBe("입력값");
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(h.storeCalls).toHaveLength(0); // 행 저장이 실패하면 보관소에도 쓰지 않는다

      await view.rerender({ ...row, [v.nameKey]: "서버값" });
      expect(shownValue(view, "대표자명")).toBe("입력값");
    });

    it("영구 실패: 직전 입력이 아니라 마지막으로 확정된 값으로 되돌리고 사유를 알린다", async () => {
      const { h, view } = await setup();
      h.auto.row = true;
      h.auto.store = true;
      await editText(view, "대표자명", "확정값");
      h.auto.row = false;
      await editText(view, "대표자명", "임시값");
      await rejectCall(h.rowCalls[1], transient()); // 잠깐 실패 — 임시값은 화면에 남는다
      expect(shownValue(view, "대표자명")).toBe("임시값");

      await editText(view, "대표자명", "거절값");
      await rejectCall(h.rowCalls[2], permanent("권한이 없습니다"));
      expect(shownValue(view, "대표자명")).toBe("확정값");
      expect(h.alertMock).toHaveBeenCalledWith("권한이 없습니다");
      expect(h.reports).toHaveLength(1); // 영구 실패는 보관함에 올리지 않는다
    });

    it("앱 보관함 통로가 없으면 잠깐 실패도 예전처럼 되돌리고 경고한다", async () => {
      const { h, view } = await setup({ bridge: false });
      await editText(view, "대표자명", "입력값");
      await rejectCall(h.rowCalls[0], transient("통신 끊김"));
      expect(shownValue(view, "대표자명")).toBe("-");
      expect(h.alertMock).toHaveBeenCalledWith("통신 끊김");
    });

    it("낡은 실패: 같은 칸에 더 새 입력이 있으면 보관함·경고·되돌리기 모두 하지 않는다", async () => {
      const { h, view } = await setup();
      await toggle(view, "동의여부"); // 입력 1: true
      await toggle(view, "동의여부"); // 입력 2: false (줄에서 대기)
      await rejectCall(h.rowCalls[0], transient());
      expect(h.reports).toHaveLength(0);
      expect(h.alertMock).not.toHaveBeenCalled();
      expect(isChecked(view, "동의여부")).toBe(false);

      // 줄은 계속 흘러 입력 2 가 저장된다.
      expect(h.rowCalls).toHaveLength(2);
      await resolveCall(h.rowCalls[1]);
      await resolveCall(h.storeCalls[0]);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "동의여부", false]);
      expect(isChecked(view, "동의여부")).toBe(false);
      expect(h.reports).toHaveLength(0);
    });

    it("낡은 재시도·되돌리기: 그 사이 더 새 입력이 생겼으면 아무것도 보내거나 바꾸지 않는다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "처음값");
      await rejectCall(h.rowCalls[0], transient());
      const stale = h.reports[0];

      await editText(view, "대표자명", "새값"); // 더 새 입력(행 저장 대기 중)
      const sent = h.rowCalls.length;
      let retried: boolean | undefined;
      await act(async () => { retried = await stale.retry(); });
      expect(retried).toBe(false);
      expect(h.rowCalls).toHaveLength(sent);

      await act(async () => { stale.revert?.(); await sleep(); });
      expect(shownValue(view, "대표자명")).toBe("새값");
    });

    it("낡은 재시도·되돌리기: 더 새 입력이 이미 성공으로 끝나 줄이 비었어도 옛 값을 다시 보내지 않는다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "처음값");
      await rejectCall(h.rowCalls[0], transient());
      const stale = h.reports[0];

      h.auto.row = true;
      h.auto.store = true;
      await editText(view, "대표자명", "새값"); // 더 새 입력 — 행·보관소 모두 끝남
      await tick();
      expect(h.rowCalls).toHaveLength(2);
      expect(h.storeCalls).toHaveLength(1);
      expect(shownValue(view, "대표자명")).toBe("새값");
      const savedCount = view.onSaved.mock.calls.length;

      let retried: boolean | undefined;
      await act(async () => { retried = await stale.retry(); });
      expect(retried).toBe(false);
      expect(h.rowCalls).toHaveLength(2);
      expect(h.storeCalls).toHaveLength(1);
      expect(view.onSaved.mock.calls).toHaveLength(savedCount);

      await act(async () => { stale.revert?.(); await sleep(); });
      expect(shownValue(view, "대표자명")).toBe("새값");
      expect(h.alertMock).not.toHaveBeenCalled();
    });

    it("재시도 두 번이 줄에 서 있는 사이 더 새 입력이 들어오면 뒤의 낡은 재시도는 줄 차례가 와도 아무것도 보내지 않는다", async () => {
      const { h, row, view } = await setup();
      await editText(view, "대표자명", "처음값");
      await rejectCall(h.rowCalls[0], transient());
      const report = h.reports[0];

      let first: Promise<boolean> | undefined;
      let second: Promise<boolean> | undefined;
      await act(async () => { first = report.retry(); await sleep(); });
      expect(h.rowCalls).toHaveLength(2); // 첫 재시도가 행 저장 중
      await act(async () => { second = report.retry(); await sleep(); });
      expect(h.rowCalls).toHaveLength(2); // 둘째 재시도는 줄에서 기다린다
      await editText(view, "대표자명", "새값"); // 기다리는 사이 더 새 입력
      expect(h.rowCalls).toHaveLength(2);

      await resolveCall(h.rowCalls[1]);
      expect(h.storeCalls).toHaveLength(0);
      expect(await first).toBe(false);
      expect(await second).toBe(false); // 줄 차례가 왔을 때 이미 낡았다 — 보내지 않음
      expect(h.rowCalls).toHaveLength(3);
      expect(h.rowCalls[2].args).toEqual([row._id, v.nameKey, "새값"]); // 옛 값 대신 새 입력이 간다

      await resolveCall(h.rowCalls[2]);
      await resolveCall(h.storeCalls[0]);
      expect(h.trace).toEqual([
        `row:${v.nameKey}=처음값`, `row:${v.nameKey}=처음값`,
        `row:${v.nameKey}=새값`, "store:대표자명=새값",
      ]);
      expect(shownValue(view, "대표자명")).toBe("새값");
    });

    it("재시도 두 번이 줄에 서 있는 사이 창이 닫히면 뒤의 재시도는 보내지 않고, 이미 시작한 앞의 재시도는 끝까지 가고 원래 부모에 성공을 알린다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "처음값");
      await rejectCall(h.rowCalls[0], transient());
      const report = h.reports[0];

      let first: Promise<boolean> | undefined;
      let second: Promise<boolean> | undefined;
      await act(async () => { first = report.retry(); await sleep(); });
      await act(async () => { second = report.retry(); await sleep(); });
      expect(h.rowCalls).toHaveLength(2);
      await view.unmount();

      await resolveCall(h.rowCalls[1]);
      await resolveCall(h.storeCalls[0]);
      expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "처음값"]);
      expect(await first).toBe(true);
      expect(await second).toBe(false);
      expect(h.rowCalls).toHaveLength(2);
      expect(h.storeCalls).toHaveLength(1);
      expect(view.onSaved).toHaveBeenCalledTimes(1);
    });

    it("창이 닫힌 뒤에도 최신 앱 막대 재시도는 원래 행·보관소로 저장한다", async () => {
      const { h, view } = await setup();
      await editText(view, "대표자명", "닫기전값");
      await rejectCall(h.rowCalls[0], transient()); // 아직 열려 있을 때 보관함에 담김
      const stale = h.reports[0];
      await view.unmount();
      h.auto.row = true;
      h.auto.store = true;

      let retried: boolean | undefined;
      await act(async () => { retried = await stale.retry(); });
      expect(retried).toBe(true);
      expect(h.rowCalls).toHaveLength(2);
      expect(h.storeCalls).toHaveLength(1);
      expect(h.bar.entries).toHaveLength(0);
      expect(view.onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("재시도도 같은 [행 → 보관소] 두 곳 길을 쓰고, 행·보관소가 모두 끝나면 onSaved 를 부른다", async () => {
    const { h, view } = await setup();
    await editText(view, "대표자명", "재시도값");
    await rejectCall(h.rowCalls[0], transient());
    expect(view.onSaved).not.toHaveBeenCalled();
    const report = h.reports[0];

    let done = false;
    let result: Promise<boolean> | undefined;
    await act(async () => { result = report.retry(); void result.then(() => { done = true; }); await sleep(); });
    expect(h.rowCalls).toHaveLength(2);
    expect(h.rowCalls[1].args).toEqual([report.rowId, v.nameKey, "재시도값", undefined, { shouldContinue: expect.any(Function) }]);
    expect(view.onSaved).not.toHaveBeenCalled(); // 행 저장이 끝나기 전엔 부르지 않는다
    expect(h.storeCalls).toHaveLength(0);

    await resolveCall(h.rowCalls[1]);
    expect(view.onSaved).not.toHaveBeenCalled(); // retry 항목과 권한은 보관소 완료까지 유지
    expect(h.storeCalls).toHaveLength(1);
    expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "대표자명", "재시도값"]);
    expect(done).toBe(false);

    await resolveCall(h.storeCalls[0]);
    expect(await result).toBe(true);
    expect(view.onSaved).toHaveBeenCalledTimes(1);
    expect(h.resolvedIds).toContain(report.id);
    expect(h.trace).toEqual([`row:${v.nameKey}=재시도값`, `row:${v.nameKey}=재시도값`, "store:대표자명=재시도값"]);
    expect(shownValue(view, "대표자명")).toBe("재시도값");
  });

  it("보관소 읽기는 저장 중인 칸을 덮거나 직접 비운 칸을 다시 채우지 못하고, 손대지 않은 빈칸은 채운다", async () => {
    const row = makeRow(v, { [v.emailKey]: "a@test.example" });
    const { h, view } = await setup({ row, holdReads: true });

    h.auto.row = true;
    h.auto.store = true;
    await editText(view, "이메일", ""); // 직접 비움(저장 성공)
    expect(shownValue(view, "이메일")).toBe("-");
    h.auto.row = false;
    await editText(view, "대표자명", "내가쓴값"); // 저장 대기 중
    expect(shownValue(view, "대표자명")).toBe("내가쓴값");

    const record = storeRecord({ 대표자명: "보관소대표", 이메일: "stored@test.example", 사업자유형: "법인" });
    for (const c of h.readCalls.filter((c) => !c.settled)) await resolveCall(c, record);
    expect(shownValue(view, "대표자명")).toBe("내가쓴값");
    expect(shownValue(view, "이메일")).toBe("-");
    expect(shownValue(view, "사업자유형")).toBe("법인"); // 읽기가 실제로 적용됐다는 대조
  });

  it("읽기가 시작된 뒤 끝난 입력·비움은 늦게 온 보관소 값이 되돌리지 못한다(행·보관소 모두 끝난 뒤에도)", async () => {
    const row = makeRow(v, { [v.emailKey]: "a@test.example" });
    const { h, view } = await setup({ row, holdReads: true });
    const reads = h.readCalls.filter((c) => !c.settled);
    expect(reads.length).toBeGreaterThan(0);

    h.auto.row = true;
    h.auto.store = true;
    await editText(view, "이메일", ""); // 읽기 시작 뒤 직접 비움 — 저장 완료
    await editText(view, "대표자명", "완료값"); // 읽기 시작 뒤 입력 — 저장 완료
    await tick();
    expect(shownValue(view, "이메일")).toBe("-");
    expect(shownValue(view, "대표자명")).toBe("완료값");

    const record = storeRecord({ 대표자명: "보관소대표", 이메일: "stored@test.example", 사업자유형: "법인" });
    for (const c of reads) await resolveCall(c, record);
    expect(shownValue(view, "이메일")).toBe("-");
    expect(shownValue(view, "대표자명")).toBe("완료값");
    expect(shownValue(view, "사업자유형")).toBe("법인"); // 손대지 않은 빈칸은 여전히 채운다
  });

  it("진행상태: 이미 끝난 입력 뒤에 새로 보낸 읽기는 보관소의 새 진행상태를 그대로 적용한다", async () => {
    const row = makeRow(v);
    const { h, view } = await setup({ row, progress: true });
    h.auto.row = true;
    h.auto.store = true;
    await editText(view, "진행상태", "내가쓴상태"); // 저장 완료
    expect(shownValue(view, "진행상태")).toBe("내가쓴상태");
    expect(h.storeCalls[0].args).toEqual([BIZNO_A, "erp", "진행상태", "내가쓴상태"]);

    h.auto.read = false;
    await view.rerender({ ...row, [v.emailKey]: "a@test.example" }); // 새 행 → 읽기를 새로 보낸다(입력이 끝난 뒤 시작)
    const fresh = h.readCalls.filter((c) => !c.settled);
    expect(fresh.length).toBeGreaterThan(0);
    for (const c of fresh) await resolveCall(c, storeRecord({ 진행상태: "보관소최신상태" }));
    expect(shownValue(view, "진행상태")).toBe("보관소최신상태");
  });

  it("진행상태: 읽기를 보낸 뒤 끝난 입력은 두 저장이 모두 끝난 뒤 늦게 온 보관소 값이 되돌리지 못한다", async () => {
    const row = makeRow(v, { [PROGRESS_KEY]: "기존상태" });
    const { h, view } = await setup({ row, holdReads: true, progress: true });
    const reads = h.readCalls.filter((c) => !c.settled);
    expect(reads.length).toBeGreaterThan(0);

    h.auto.row = true;
    h.auto.store = true;
    await editText(view, "진행상태", "새상태"); // 읽기 시작 뒤 입력 — 저장 완료
    expect(shownValue(view, "진행상태")).toBe("새상태");

    for (const c of reads) await resolveCall(c, storeRecord({ 진행상태: "옛보관소상태" }));
    expect(shownValue(view, "진행상태")).toBe("새상태");
  });

  it("진행상태: 읽기를 보낼 때 저장 중이던 칸은 응답이 오기 전에 저장이 끝나도 덮지 못한다", async () => {
    const row = makeRow(v);
    const { h, view } = await setup({ row, progress: true });
    await editText(view, "진행상태", "대기상태"); // 행 저장 대기 중 — 입력 보호 중
    expect(shownValue(view, "진행상태")).toBe("대기상태");

    h.auto.read = false;
    await view.rerender({ ...row, [v.emailKey]: "a@test.example" }); // 저장 중에 읽기를 새로 보낸다
    const reads = h.readCalls.filter((c) => !c.settled);
    expect(reads.length).toBeGreaterThan(0);

    await resolveCall(h.rowCalls[0]);
    await resolveCall(h.storeCalls[0]); // 읽기 응답 전에 행·보관소 저장이 모두 끝남
    for (const c of reads) await resolveCall(c, storeRecord({ 진행상태: "보관소상태" }));
    expect(shownValue(view, "진행상태")).toBe("대기상태");
  });
});


describe("v9 상세 조회 응답의 원래 회사 소유권", () => {
  it.each(["resolve", "reject"])("구회사 조회 시작 뒤 같은 상세 instance를 바꾸면 옛 %s는 현재 상태에 닿지 않는다", async outcome => {
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { useDetailLoadState } = await import("./detail-load-state");
    // 이 파일의 기존 기본정보 시험은 분야 metadata를 비웠다. 읽기 owner 시험에만 실제 형태의 한 분야를 제공한다.
    const { DOMAIN_GROUPS } = await import("./lib/domain-config");
    const previousGroups = [...DOMAIN_GROUPS];
    DOMAIN_GROUPS.push({ key: "government-subsidy", label: "정부지원금", domains: ["government-subsidy"] });
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
      appName: "ILLUA", ownDomain: "tax-amendment", ownColumns: [], configScope: "v9-read-owner", domains: [{ key: "government-subsidy", label: "정부지원금", domains: ["government-subsidy"] }],
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
      DOMAIN_GROUPS.splice(0, DOMAIN_GROUPS.length, ...previousGroups);
    }
  });
});
