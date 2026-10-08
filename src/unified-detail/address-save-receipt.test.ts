import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ColumnDef } from "../types/columns";
import * as sections from "../unified/sections";
import * as basicSections from "./lib/unified-sections";
import * as customerDetail from "./lib/customer-detail";
import * as editConfirm from "./lib/edit-confirm-gate";
import { saveFailureKindOf, type BasicRecord, type UnifiedDetailApi, type UnifiedDetailAdapter, type UnsavedBridge } from "./adapter-types";
import type { DomainRowLite } from "./lib/customer-detail";
import type { DomainGroup } from "./lib/domain-config";
import type { EditableFieldRow as ActualEditableFieldRow } from "./editors";

// 설치된 node 시험 환경에서 실제 두 컴포넌트를 실행한다. DOM/외형 QA는 아니다.
// 훅의 상태·효과 수명만 대신하고 저장 함수·onUpdate·수정 확인 콜백은 원본 그대로 쓴다.
type Element<Props = Record<string, unknown>> = { type: unknown; props: Props };
type Component<Props> = (props: Props) => Element;
type FieldValue = Parameters<UnifiedDetailApi["saveOwnField"]>[2];
// 잘못된 응답도 원본 저장 콜백에서 검사하므로 응답 경계만 unknown으로 둔다.
type SaveOwnField = (...args: Parameters<UnifiedDetailApi["saveOwnField"]>) => Promise<unknown>;
type PanelDetail = { domainRows: Array<Pick<DomainRowLite, "domain" | "row">> };
type PanelAdapter = Pick<UnifiedDetailAdapter, "appName" | "ownColumns"> & {
  api: Pick<UnifiedDetailApi, "loadBasicStore" | "saveBasicField" | "loadColumnConfig" | "saveColumnConfig" | "loadManagers" | "loadCommonBasicFields"> & { saveOwnField: SaveOwnField };
  components: Partial<UnifiedDetailAdapter["components"]>;
  unsaved: UnsavedBridge;
};
type PanelProps = {
  row: Record<string, unknown>; detail: PanelDetail | null; loading: boolean;
  onOpenTab: (key: string) => void; orderedGroups: DomainGroup[];
  ownDomain: string; adapter: PanelAdapter; saveOwnField: SaveOwnField;
  loadColumnConfig: UnifiedDetailApi["loadColumnConfig"];
  saveColumnConfig: UnifiedDetailApi["saveColumnConfig"];
  loadManagers: UnifiedDetailApi["loadManagers"]; onSaved: () => void;
};
type EditorProps = Parameters<typeof ActualEditableFieldRow>[0];
type PanelFieldProps = Omit<EditorProps, "onUpdate"> & {
  onUpdate: (key: string, value: FieldValue) => Promise<void>;
};
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
const active: { current?: Pick<Hooks<unknown>, "state" | "ref" | "memo" | "effect"> } = {};
class Hooks<Props> {
  private slots: Slot[] = [];
  private cursor = 0;
  private effects: Array<() => void> = [];
  dirty = true;
  tree!: Element;
  constructor(private component: Component<Props>, public props: Props) {}
  state<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void] {
    const index = this.cursor++;
    const slot = this.slots[index] ??= { value: typeof initial === "function" ? (initial as () => T)() : initial };
    return [slot.value as T, (value: T | ((previous: T) => T)) => {
      const next = typeof value === "function" ? (value as (previous: T) => T)(slot.value as T) : value;
      if (!Object.is(next, slot.value)) { slot.value = next; this.dirty = true; }
    }];
  }
  ref<T>(value: T) {
    return (this.slots[this.cursor++] ??= { value: { current: value } }).value as { current: T };
  }
  memo<T>(factory: () => T, deps: unknown[]) {
    const slot = this.slots[this.cursor++] ??= {};
    if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps![i]))) {
      slot.value = factory(); slot.deps = deps;
    }
    return slot.value as T;
  }
  effect(effect: () => void | (() => void), deps: unknown[]) {
    const slot = this.slots[this.cursor++] ??= {};
    if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps![i]))) {
      slot.deps = deps;
      this.effects.push(() => { slot.cleanup?.(); slot.cleanup = effect() || undefined; });
    }
  }
  render() {
    active.current = this; this.cursor = 0; this.dirty = false;
    this.tree = this.component(this.props);
    const effects = this.effects.splice(0);
    effects.forEach((effect) => effect());
    return this.tree;
  }
  values() { return this.slots.map((slot) => slot.value); }
  unmount() { this.slots.forEach((slot) => slot.cleanup?.()); }
}
const hooks = {
  useState: <T>(initial: T | (() => T)) => active.current!.state(initial),
  useRef: <T>(initial: T) => active.current!.ref(initial),
  useMemo: <T>(factory: () => T, deps: unknown[]) => active.current!.memo(factory, deps),
  useCallback: <Args extends unknown[], Result>(callback: (...args: Args) => Result, deps: unknown[]) => active.current!.memo(() => callback, deps),
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => active.current!.effect(effect, deps),
};
const TextEditor = () => null;
const inert = () => null;
const optionBundle = {
  READONLY_TYPES: new Set(["last_edited_time"]), isReadonlyPerson: () => false,
  getFieldOptions: () => [],
};
const indexModule = {
  ...sections, TextEditor, NumberEditor: inert, SectionAdminMenu: inert,
  EditableTitle: inert, DraggableFieldsSection: inert,
  getCachedCommonOverride: () => null,
  fetchCommonFieldsOverride: () => Promise.resolve(null),
  fetchHiddenBasicColumns: () => Promise.resolve([]),
  subscribeHiddenBasicColumns: () => () => {},
};
const dependencies: Record<string, unknown> = {
  react: hooks, "react/jsx-runtime": jsxRuntime,
  "react-dom": { createPortal: <T>(element: T) => element },
  "../index": indexModule, "../unified/sections": sections,
  "./lib/unified-sections": basicSections, "./lib/customer-detail": customerDetail,
  "./lib/edit-confirm-gate": editConfirm,
  "./adapter-types": { saveFailureKindOf },
  "./field-options-context": { useFieldOptions: () => optionBundle },
  "./lib/use-field-order": { useFieldOrder: <T>(_scope: string, _tab: string, fields: T) => ({ orderedFields: fields }) },
};
function compile<Props>(name: string, symbol: string): Component<Props> {
  const filename = fileURLToPath(new URL(name, import.meta.url));
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  return new Function("require", "exports", `${outputText}\nreturn ${symbol};`)(
    (key: string) => dependencies[key] ?? {}, {},
  ) as Component<Props>;
}
const EditableFieldRow = compile<EditorProps>("./editors.tsx", "EditableFieldRow");
dependencies["./editors"] = { EditableFieldRow };
const BasicInfoPanel = compile<PanelProps>("./UnifiedDetailView.tsx", "BasicInfoPanel");

function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  return [tree as Element, ...elements((tree as Element).props.children)];
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const addressKey = "52사업장주소지";
const company = "1234567890";
function record(value: unknown, extra: Record<string, unknown> = {}): BasicRecord {
  return { fields: Object.fromEntries(Object.entries({ 사업장주소지: value, ...extra }).map(([key, value]) => [key, {
    value, updatedAt: "2026-10-08T00:00:00Z", updatedByApp: "erp", updatedByUser: "tester",
  }])), log: [] };
}
function receipt(value: string, overrides: Record<string, unknown> = {}) {
  return { atomicAddress: {
    kind: "atomic-address", version: 1, entryId: "entry-a", sourceFieldKey: addressKey,
    bizno: company, fieldId: "사업장주소지", value, record: record(value), ...overrides,
  } };
}
const mounted: Array<Pick<Hooks<unknown>, "unmount">> = [];
const alertSpy = vi.fn();
function panel(options: { value?: unknown; detail?: PanelDetail; load?: Mock<() => Promise<BasicRecord | null>>; save?: SaveOwnField; key?: string } = {}) {
  vi.stubGlobal("alert", alertSpy);
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true, data: {} }) })));
  const key = options.key ?? addressKey;
  const api = {
    saveOwnField: options.save ?? vi.fn(async () => receipt("서울")),
    saveBasicField: vi.fn<UnifiedDetailApi["saveBasicField"]>(async (_biz: string, _app: string, field: string, value: unknown) => record("공용", { [field]: value })),
    loadBasicStore: options.load ?? vi.fn<() => Promise<BasicRecord | null>>(async () => null),
    // 칸 정의는 이 저장 계약 시험에서 고정한다(정의 응답으로 주소 조회가 재시작되지 않게).
    loadCommonBasicFields: vi.fn(() => new Promise<never>(() => {})),
    loadColumnConfig: vi.fn(async () => ({})), saveColumnConfig: vi.fn(), loadManagers: vi.fn(async () => []),
  };
  const adapter = {
    appName: "ERP", ownColumns: [
      { key, label: "사업장주소지", type: "text" },
      { key: "15사업자번호", label: "사업자번호", type: "text" },
      { key: "03대표자명", label: "대표자명", type: "text" },
      { key: "05경정계약진행상태", label: "진행상태", type: "select" },
    ], api, components: {},
    unsaved: { scope: "test", makeId: (...parts: string[]) => parts.join(":"), resolve: vi.fn(), report: vi.fn<UnsavedBridge["report"]>() },
  } satisfies PanelAdapter;
  const onSaved = vi.fn();
  const run = new Hooks(BasicInfoPanel, {
    row: { _id: "entry-a", "15사업자번호": "123-45-67890", [key]: "value" in options ? options.value : "기존주소" },
    detail: options.detail ?? null, loading: false, onOpenTab: vi.fn(), orderedGroups: [],
    ownDomain: "tax-amendment", adapter, ...api, onSaved,
  });
  mounted.push(run);
  run.render();
  const flush = async () => {
    for (let i = 0; i < 12; i++) { await Promise.resolve(); if (run.dirty) run.render(); }
  };
  const field = (fieldKey = key) => {
    if (run.dirty) run.render();
    const element = elements(run.tree).find((element): element is Element<PanelFieldProps> => element.type === EditableFieldRow && (element.props.col as ColumnDef).key === fieldKey);
    expect(element, `실제 EditableFieldRow ${fieldKey}`).toBeDefined();
    return element!;
  };
  const startSave = (value: string | number | boolean | null, fieldKey = key) => {
    const element = field(fieldKey);
    let pending: Promise<void> | undefined;
    const editor = new Hooks(EditableFieldRow, {
      ...element.props, onUpdate: (key: string, next: FieldValue) => { pending = element.props.onUpdate(key, next); },
    });
    editor.render();
    const click = elements(editor.tree).find((element): element is Element<{ onClick: () => void }> => typeof element.props.onClick === "function");
    expect(click).toBeDefined(); click!.props.onClick(); editor.render();
    const text = elements(editor.tree).find((element): element is Element<{ onSave: (value: FieldValue) => void }> => element.type === TextEditor);
    expect(text).toBeDefined(); text!.props.onSave(value); editor.render();
    const confirm = elements(editor.tree).find((element): element is Element<{ onConfirm: () => void }> => typeof element.props.onConfirm === "function");
    if (confirm) confirm.props.onConfirm();
    expect(pending, "입력기/수정 확인에서 실제 onUpdate를 실행").toBeDefined();
    editor.unmount();
    return pending!;
  };
  const cache = () => run.values().find((value) => value && typeof value === "object" && "fields" in value && Array.isArray((value as Partial<BasicRecord>).log)) as BasicRecord | undefined;
  return { run, api, adapter, onSaved, flush, field, startSave, cache };
}
afterEach(() => { mounted.splice(0).forEach((run) => run.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("실제 기본정보 주소 저장 콜백 — 응답별 공용 PUT", () => {
  it.each([addressKey, "27주소지", "사업장주소지", "주소지", "주소"])("정상 서버 주소 별칭 %s: 추가 PUT 0", async (sourceFieldKey) => {
    const p = panel({ save: vi.fn(async () => receipt("서울", { sourceFieldKey })) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "서울");
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.cache()?.fields.사업장주소지.value).toBe("서울");
    expect(p.onSaved).toHaveBeenCalledOnce();
  });
  it("policy 실제 요청키 27도 52 receipt와 같은 주소 의미로 허용", async () => {
    const p = panel({ key: "27주소지" });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", "27주소지", "서울");
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("void legacy 주소 저장은 공용 PUT 정확히 1", async () => {
    const p = panel({ save: vi.fn(async () => undefined) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).toHaveBeenCalledWith(company, "erp", "사업장주소지", "서울");
  });
  it("비주소 대표자 저장은 공용 PUT 정확히 1", async () => {
    const p = panel({ save: vi.fn(async () => undefined) });
    await p.flush(); await p.startSave("새대표", "03대표자명"); await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).toHaveBeenCalledWith(company, "erp", "대표자명", "새대표");
  });
  it.each([
    { addressCanonicalRecord: record("서울") },
    Object.create({ atomicAddress: receipt("서울").atomicAddress }),
  ])("예전 속성·상속 속성은 주소 receipt 증거가 아님", async (result) => {
    const p = panel({ save: vi.fn(async () => result) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
  });
  it.each([
    { kind: "other" }, { version: 2 }, { entryId: "entry-b" },
    { sourceFieldKey: "03대표자명" }, { sourceFieldKey: "52알수없는주소" },
    { bizno: "9999999999" }, { bizno: "123-45-67890" }, { fieldId: "대표자명" },
    { value: "다른값" }, { value: null }, { record: null }, { record: { fields: {}, log: [] } },
    { record: record("다른값") }, { record: record(null) },
  ])("불일치 receipt %j: PUT 0, 확인 알림과 현재 정보 재조회", async (overrides) => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(record("현재주소"));
    const p = panel({ save: vi.fn(async () => receipt("서울", overrides)), load });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(load).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("저장 확인"));
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.cache()?.fields.사업장주소지.value).toBe("현재주소");
    expect(p.field().props.value).toBe("현재주소");
  });
  it.each([null, undefined, {}, "broken"])("own atomicAddress=%j는 legacy PUT으로 재전송하지 않음", async (atomicAddress) => {
    const p = panel({ save: vi.fn(async () => ({ atomicAddress })) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2);
  });
  it("null 성공 반환도 깨진 응답으로 확인하며 공용 PUT을 재발행하지 않음", async () => {
    const p = panel({ save: vi.fn(async () => null) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("저장 확인"));
  });
  it("행/adapter에 실린 atomic 주장은 소비하지 않고 void 반환만 따라 저장", async () => {
    const p = panel({ save: vi.fn(async () => undefined) });
    Object.assign(p.run.props.row, receipt("서울")); Object.assign(p.adapter, receipt("서울"));
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
  });
  it("확인 재조회 실패도 저장 실패·롤백·재전송으로 바꾸지 않음", async () => {
    const p = panel({ save: vi.fn(async () => ({ atomicAddress: null })),
      load: vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error("조회 실패")) });
    await p.flush(); await p.startSave("새주소"); await p.flush();
    expect(p.field().props.value).toBe("새주소");
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(alertSpy).toHaveBeenCalledOnce(); expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("저장 확인"));
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });
  it("확인 재조회가 Promise 반환 전 던져도 저장 실패/롤백으로 바꾸지 않음", async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockImplementation(() => { throw new Error("동기 조회 실패"); });
    const p = panel({ load, save: vi.fn(async () => ({ atomicAddress: null })) });
    await p.flush(); await p.startSave("새주소"); await p.flush();
    expect(p.field().props.value).toBe("새주소"); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });
  it("비주소 요청에 주소 receipt를 붙이면 칸 불일치로 확인하며 PUT 금지", async () => {
    const p = panel(); await p.flush(); await p.startSave("서울", "03대표자명"); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("저장 확인"));
  });
  it("null 삭제의 canonical value는 빈 문자열; 옛 상세값으로 되살리지 않음", async () => {
    const p = panel({ save: vi.fn(async () => receipt("")), detail: { domainRows: [{ domain: "tax-amendment", row: { [addressKey]: "옛상세주소" } }] } });
    await p.flush(); await p.startSave(null); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, null);
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.cache()?.fields.사업장주소지.value).toBe("");
    expect(p.field().props.value).toBe("");
  });
  it("초기 빈칸에서도 수정 확인을 거쳐 저장이 누락되지 않음", async () => {
    const p = panel({ value: "" });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it.each([0, false])("주소 입력 %j도 실제 canonical 문자열을 대조", async (value) => {
    const p = panel({ save: vi.fn(async () => receipt(String(value))) });
    await p.flush(); await p.startSave(value); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.cache()?.fields.사업장주소지.value).toBe(String(value));
  });
  it.each([409, 403, 500])("서버 실패 %s는 기존 오류 경계 보존, 성공 승격·공용 PUT 없음", async (status) => {
    const error = Object.assign(new Error(`${status} 저장 거절`), { saveFailureKind: "permanent" });
    const p = panel({ save: vi.fn(async () => { throw error; }) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(p.field().props.value).toBe("기존주소"); expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.api.loadBasicStore).toHaveBeenCalledOnce();
    expect(alertSpy).toHaveBeenCalledWith(error.message);
  });
  it.each(["auth", "temporary"])("%s 실패는 기존 저장 실패 통로와 입력값을 보존", async (saveFailureKind) => {
    const error = Object.assign(new Error("기존 저장 오류"), { saveFailureKind });
    const p = panel({ save: vi.fn(async () => { throw error; }) });
    await p.flush(); await p.startSave("새주소"); await p.flush();
    expect(p.field().props.value).toBe("새주소"); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.report.mock.calls[0][0]).toMatchObject({ error: error.message, kind: saveFailureKind });
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("실제 주소 표시·캐시 — 늦은 응답과 대상 보호", () => {
  it("A commit → B commit → 늦은 A 응답은 B 주소와 다른 최신 칸을 덮지 않음", async () => {
    const a = deferred<ReturnType<typeof receipt>>(); const b = deferred<ReturnType<typeof receipt>>();
    const p = panel({ load: vi.fn(async () => record("기존주소", { 대표자명: "최신대표" })),
      save: vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise) });
    await p.flush(); const saveA = p.startSave("A"); await p.flush(); const saveB = p.startSave("B");
    b.resolve(receipt("B", { record: record("B", { 대표자명: "과거대표" }) })); await saveB; await p.flush();
    expect(p.cache()?.fields.대표자명.value).toBe("최신대표");
    a.resolve(receipt("A")); await saveA; await p.flush();
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.onSaved).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it.each(["행", "회사", "왕복"])("%s 전환 뒤 늦은 A 응답은 현재 표시·캐시를 덮지 않음", async (target) => {
    const a = deferred<ReturnType<typeof receipt>>();
    const p = panel({ load: vi.fn(async () => record("현재대상주소")), save: vi.fn(() => a.promise) });
    await p.flush(); const saveA = p.startSave("A"); await p.flush();
    const original = p.run.props.row;
    p.run.props = { ...p.run.props, row: { ...original, _id: target === "회사" ? "entry-a" : "entry-b",
      "15사업자번호": target === "행" ? "123-45-67890" : "999-99-99999", [addressKey]: "현재대상주소" } };
    p.run.render(); await p.flush();
    if (target === "왕복") { p.run.props = { ...p.run.props, row: { ...original, [addressKey]: "현재대상주소" } }; p.run.render(); await p.flush(); }
    a.resolve(receipt("A")); await saveA; await p.flush();
    expect(p.field().props.value).toBe("현재대상주소"); expect(p.cache()?.fields.사업장주소지.value).toBe("현재대상주소");
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("늦은 초기 loadBasicStore는 삭제된 빈 주소와 캐시를 되살리지 않음", async () => {
    const load = deferred<BasicRecord | null>();
    const p = panel({ value: "", load: vi.fn(() => load.promise), save: vi.fn(async () => receipt("")) });
    const save = p.startSave(null); await save; await p.flush();
    load.resolve(record("옛주소")); await p.flush();
    expect(p.field().props.value).toBe(""); expect(p.cache()?.fields.사업장주소지.value).toBe("");
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("무효 A의 확인 재조회가 B 응답 뒤 도착해도 쓰기·역덮기 없음", async () => {
    const read = deferred<BasicRecord | null>();
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(read.promise),
      save: vi.fn().mockResolvedValueOnce({ atomicAddress: null }).mockResolvedValueOnce(receipt("B")) });
    await p.flush(); const saveA = p.startSave("A"); await p.flush();
    await p.startSave("B"); await p.flush(); read.resolve(record("A")); await saveA; await p.flush();
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("늦은 비주소 legacy PUT 응답의 전체 record도 최신 주소 캐시를 덮지 않음", async () => {
    const put = deferred<BasicRecord | null>();
    const fresh = loggedRecord("옛주소", { 대표자명: "대표" });
    const otherLog = { fieldId: "대표자명", from: "이전대표", to: "대표",
      app: "erp", user: "tester", at: "2026-10-08T01:00:00Z" };
    fresh.log.push(otherLog);
    const address = loggedRecord("B");
    const p = panel({ save: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(receipt("B", { record: address })) });
    p.api.saveBasicField.mockReturnValueOnce(put.promise);
    await p.flush(); await p.startSave("대표", "03대표자명"); await p.flush();
    await p.startSave("B"); await p.flush(); put.resolve(fresh); await p.flush();
    expect(p.cache()?.fields.사업장주소지.value).toBe("B"); expect(p.api.saveBasicField).toHaveBeenCalledOnce();
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.대표자명.value).toBe("대표");
    expect(p.cache()?.log.filter((entry) => entry.fieldId === "사업장주소지")).toEqual(address.log);
    expect(p.cache()?.log.filter((entry) => entry.fieldId === "대표자명")).toEqual([otherLog]);
  });
  it("주소 저장 중 시작한 초기 재조회도 완료 뒤 옛 주소를 덮지 않음", async () => {
    const save = deferred<ReturnType<typeof receipt>>(); const oldRead = deferred<BasicRecord | null>();
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(oldRead.promise), save: vi.fn(() => save.promise) });
    await p.flush(); const pending = p.startSave(null); await p.flush();
    p.run.props = { ...p.run.props, row: { ...p.run.props.row } }; p.run.render(); await p.flush();
    expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2);
    save.resolve(receipt("")); await pending; await p.flush(); oldRead.resolve(record("옛주소")); await p.flush();
    expect(p.field().props.value).toBe(""); expect(p.cache()?.fields.사업장주소지.value).toBe("");
  });
  it("주소 저장 중 시작한 비주소 PUT도 주소 완료 뒤 역덮지 않음", async () => {
    const save = deferred<ReturnType<typeof receipt>>(); const oldPut = deferred<BasicRecord | null>();
    const p = panel({ save: vi.fn().mockReturnValueOnce(save.promise).mockResolvedValueOnce(undefined) });
    p.api.saveBasicField.mockReturnValueOnce(oldPut.promise);
    await p.flush(); const pending = p.startSave("B"); await p.flush();
    await p.startSave("대표", "03대표자명"); await p.flush();
    save.resolve(receipt("B")); await pending; await p.flush(); oldPut.resolve(record("옛주소")); await p.flush();
    expect(p.cache()?.fields.사업장주소지.value).toBe("B"); expect(p.api.saveBasicField).toHaveBeenCalledOnce();
  });
  it("늦은 legacy A 성공에도 B 주소를 재전송하여 덮지 않음", async () => {
    const a = deferred<void>();
    const p = panel({ save: vi.fn().mockReturnValueOnce(a.promise).mockResolvedValueOnce(receipt("B")) });
    await p.flush(); const pending = p.startSave("A"); await p.flush();
    await p.startSave("B"); await p.flush(); a.resolve(undefined); await pending; await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
  });
  it("전환 전 편집기의 늦은 콜백도 다른 대상에 입력/저장을 하지 않음", async () => {
    const p = panel(); await p.flush(); const oldUpdate = p.field().props.onUpdate;
    p.run.props = { ...p.run.props, row: { _id: "entry-b", "15사업자번호": "999-99-99999", [addressKey]: "다른주소" } };
    p.run.render(); await p.flush(); await oldUpdate(addressKey, "늦은편집"); await p.flush();
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.field().props.value).toBe("다른주소");
  });
  it("대상 전환 뒤 늦은 확인 재조회·저장 오류는 현재 대상에 반영하지 않음", async () => {
    const read = deferred<BasicRecord | null>(); const failed = deferred<unknown>();
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(read.promise).mockResolvedValue(null),
      save: vi.fn().mockResolvedValueOnce({ atomicAddress: null }).mockReturnValueOnce(failed.promise) });
    await p.flush(); const a = p.startSave("A"); await p.flush(); const b = p.startSave("B"); await p.flush();
    p.run.props = { ...p.run.props, row: { _id: "entry-b", "15사업자번호": "999-99-99999", [addressKey]: "다른주소" } };
    p.run.render(); await p.flush(); read.resolve(record("옛주소")); failed.reject(new Error("옛 저장 실패"));
    await Promise.all([a, b]); await p.flush();
    expect(p.field().props.value).toBe("다른주소"); expect(p.cache()).toBeUndefined();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(alertSpy).toHaveBeenCalledOnce();
  });
});

const temporary = () => Object.assign(new Error("잠깐 저장 실패"), { saveFailureKind: "temporary" });
function loggedRecord(value: string, extra: Record<string, unknown> = {}): BasicRecord {
  return { ...record(value, extra), log: [{ fieldId: "사업장주소지", from: "이전", to: value,
    app: "erp", user: "tester", at: "2026-10-08T00:00:00Z" }] };
}
function replaceRow(p: ReturnType<typeof panel>, values: Record<string, unknown>) {
  p.run.props = { ...p.run.props, row: { ...p.run.props.row, ...values } };
  p.run.render();
}
function failedEntry(p: ReturnType<typeof panel>) { return p.adapter.unsaved.report.mock.calls.at(-1)![0]; }

describe("완결 독립 리뷰 P2 — 현재 GET·PUT의 비주소 동작 보존", () => {
  it("P2① 주소 저장 뒤 fresh GET은 대표자 빈칸·진행상태·비주소 로그도 갱신", async () => {
    const fresh = loggedRecord("B", { 대표자명: "최신대표", 진행상태: "최신상태" });
    const otherLog = { fieldId: "대표자명", from: "이전대표", to: "최신대표",
      app: "hive", user: "other", at: "2026-10-08T01:00:00Z" };
    fresh.log.push(otherLog);
    const read = deferred<BasicRecord | null>();
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(read.promise),
      save: vi.fn(async () => receipt("A", { record: loggedRecord("A") })) });
    await p.flush(); await p.startSave("A"); await p.flush();
    replaceRow(p, { [addressKey]: "B", "03대표자명": "", "05경정계약진행상태": "기존상태" }); await p.flush();
    expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2);
    read.resolve(fresh); await p.flush();
    expect(p.field("03대표자명").props.value).toBe("최신대표");
    expect(p.field("05경정계약진행상태").props.value).toBe("최신상태");
    expect(p.cache()?.fields.대표자명.value).toBe("최신대표");
    expect(p.cache()?.log).toEqual(fresh.log); expect(p.cache()?.log).toContainEqual(otherLog);
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("P2② 비주소 행 저장 대기→주소 A 완료→새 공용 PUT 성공은 비주소 값·로그 보존", async () => {
    const own = deferred<void>(); const put = deferred<BasicRecord | null>();
    const fresh = loggedRecord("A", { 대표자명: "최신대표" });
    const otherLog = { fieldId: "대표자명", from: "기존대표", to: "최신대표",
      app: "erp", user: "tester", at: "2026-10-08T01:00:00Z" };
    fresh.log.push(otherLog);
    const p = panel({ load: vi.fn(async () => record("기존주소", { 대표자명: "기존대표" })),
      save: vi.fn().mockReturnValueOnce(own.promise).mockResolvedValueOnce(receipt("A", { record: loggedRecord("A") })) });
    p.api.saveBasicField.mockReturnValueOnce(put.promise);
    await p.flush(); const pending = p.startSave("최신대표", "03대표자명"); await p.flush();
    await p.startSave("A"); await p.flush(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    own.resolve(undefined); await pending; await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).toHaveBeenCalledWith(company, "erp", "대표자명", "최신대표");
    put.resolve(fresh); await p.flush();
    expect(p.cache()?.fields.대표자명.value).toBe("최신대표"); expect(p.cache()?.log).toEqual(fresh.log);
    expect(p.cache()?.log).toContainEqual(otherLog); expect(p.field("03대표자명").props.value).toBe("최신대표");
    expect(p.cache()?.fields.사업장주소지.value).toBe("A"); expect(p.field().props.value).toBe("A");
    expect(p.api.saveOwnField).toHaveBeenCalledTimes(2); expect(p.onSaved).toHaveBeenCalledTimes(2);
  });
  it.each(["완료전", "완료후"])("주소 저장 중 출발한 비주소 PUT의 %s 응답도 성공한 비주소 칸·로그 보존", async (timing) => {
    const own = deferred<ReturnType<typeof receipt>>(); const put = deferred<BasicRecord | null>();
    const address = loggedRecord("B");
    const fresh = loggedRecord("옛주소", { 대표자명: "최신대표" });
    const otherLog = { fieldId: "대표자명", from: "기존대표", to: "최신대표",
      app: "erp", user: "tester", at: "2026-10-08T01:00:00Z" };
    fresh.log.push(otherLog);
    const p = panel({ load: vi.fn(async () => record("기존주소", { 대표자명: "기존대표" })),
      save: vi.fn().mockReturnValueOnce(own.promise).mockResolvedValueOnce(undefined) });
    p.api.saveBasicField.mockReturnValueOnce(put.promise);
    await p.flush(); const pending = p.startSave("B"); await p.flush();
    await p.startSave("최신대표", "03대표자명"); await p.flush();
    if (timing === "완료후") { own.resolve(receipt("B", { record: address })); await pending; await p.flush(); }
    put.resolve(fresh); await p.flush();
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.대표자명.value).toBe("최신대표");
    expect(p.cache()?.log.filter((entry) => entry.fieldId === "대표자명")).toEqual([otherLog]);
    expect(p.cache()?.log.some((entry) => entry.fieldId === "사업장주소지" && entry.to === "옛주소")).toBe(false);
    if (timing === "완료전") { own.resolve(receipt("B", { record: address })); await pending; await p.flush(); }
    expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.cache()?.log.filter((entry) => entry.fieldId === "사업장주소지")).toEqual(address.log);
    expect(p.cache()?.fields.대표자명.value).toBe("최신대표"); expect(p.cache()?.log).toContainEqual(otherLog);
    expect(p.api.saveBasicField).toHaveBeenCalledOnce(); expect(p.api.saveOwnField).toHaveBeenCalledTimes(2);
  });
  it("주소 없는 fresh GET도 비주소 값을 갱신하며 이미 저장한 주소·주소 로그 보존", async () => {
    const fresh = record("삭제할필드", { 대표자명: "최신대표" }); delete fresh.fields.사업장주소지;
    const address = loggedRecord("A");
    const otherLog = { fieldId: "대표자명", from: "이전대표", to: "최신대표",
      app: "hive", user: "other", at: "2026-10-08T01:00:00Z" };
    fresh.log = [otherLog];
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(fresh),
      save: vi.fn(async () => receipt("A", { record: address })) });
    await p.flush(); await p.startSave("A"); await p.flush(); replaceRow(p, { "03대표자명": "" }); await p.flush();
    expect(p.field("03대표자명").props.value).toBe("최신대표"); expect(p.cache()?.fields.대표자명.value).toBe("최신대표");
    expect(p.field().props.value).toBe("A"); expect(p.cache()?.fields.사업장주소지.value).toBe("A");
    expect(p.cache()?.log).toContainEqual(otherLog); expect(p.cache()?.log).toContainEqual(address.log[0]);
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT"])("%s 대기 중 대상 전환·unmount 뒤 늦은 전체 응답은 적용하지 않음", async (request) => {
    for (const change of ["대상", "unmount"]) {
      const late = deferred<BasicRecord | null>();
      const p = panel({ load: vi.fn().mockResolvedValueOnce(record("기존주소", { 대표자명: "기존대표" }))
        .mockReturnValueOnce(request === "GET" ? late.promise : Promise.resolve(null)).mockResolvedValue(null),
        save: vi.fn(async () => undefined) });
      p.api.saveBasicField.mockReturnValueOnce(late.promise);
      await p.flush();
      if (request === "GET") { replaceRow(p, {}); await p.flush(); }
      else { await p.startSave("최신대표", "03대표자명"); await p.flush(); }
      if (change === "대상") { replaceRow(p, { _id: "entry-b", "15사업자번호": "9999999999", [addressKey]: "다른주소" }); await p.flush(); }
      else p.run.unmount();
      const previous = p.cache();
      late.resolve(loggedRecord("늦은주소", { 대표자명: "늦은대표" })); await p.flush();
      expect(p.cache()).toEqual(previous); expect(p.field().props.value).toBe(change === "대상" ? "다른주소" : "기존주소");
      expect(p.api.saveBasicField).toHaveBeenCalledTimes(request === "PUT" ? 1 : 0);
    }
  });
});

describe("독립 리뷰 5개 재현 — 실제 입력·등록된 저장 재시도 콜백", () => {
  it("결함1: 등록된 retry snapshot 대기 중 B 성공 후 오래된 A 재시도 쓰기 0", async () => {
    let db = "기존주소";
    const save = vi.fn().mockRejectedValueOnce(temporary()).mockImplementation(async (_id, _key, value) => {
      db = value; return receipt(value);
    });
    const p = panel({ save });
    await p.flush(); await p.startSave("A"); await p.flush();
    const snapshot = failedEntry(p);
    const blocker = deferred<boolean>();
    const pending = blocker.promise.then(() => snapshot.retry());
    await p.startSave("B"); await p.flush(); expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(snapshot.id);
    blocker.resolve(true); expect(await pending).toBe(false); await p.flush();
    expect(save).toHaveBeenCalledTimes(2); expect(db).toBe("B"); expect(p.field().props.value).toBe("B");
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
  });
  it("결함2: row 주소 없음·detail 주소 있음·403 실패는 편집 전 실제 표시값 복원", async () => {
    const p = panel({ value: undefined, detail: { domainRows: [{ domain: "tax-amendment", row: { [addressKey]: "상세주소" } }] },
      save: vi.fn().mockRejectedValue(Object.assign(new Error("403 거절"), { saveFailureKind: "permanent" })) });
    await p.flush(); expect(p.field().props.value).toBe("상세주소");
    await p.startSave("거절주소"); await p.flush(); expect(p.field().props.value).toBe("상세주소");
  });
  it("결함3: A atomic 뒤 실제 새 row B는 현재 대상 최신 GET B로 동기화", async () => {
    const load = vi.fn().mockResolvedValueOnce(record("기존주소", { 대표자명: "최신대표" }))
      .mockResolvedValue(loggedRecord("B", { 대표자명: "조회최신대표" }));
    const p = panel({ load, save: vi.fn(async () => receipt("A")) });
    await p.flush(); await p.startSave("A"); await p.flush(); replaceRow(p, { [addressKey]: "B" }); await p.flush();
    expect(load).toHaveBeenCalledTimes(2); expect(p.field().props.value).toBe("B");
    expect(p.cache()?.fields.사업장주소지.value).toBe("B"); expect(p.cache()?.fields.대표자명.value).toBe("조회최신대표");
    expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("결함4: atomic receipt의 주소 이력만 병합하고 다른 칸 이력·값 보존", async () => {
    const prior = record("기존주소", { 대표자명: "최신대표" });
    const otherLog = { fieldId: "대표자명", from: "이전대표", to: "최신대표", app: "hive", user: "other", at: "2026-10-08T01:00:00Z" };
    prior.log = [otherLog];
    const incoming = loggedRecord("A", { 대표자명: "과거대표" }); incoming.log.push({ ...otherLog, to: "과거대표" });
    const p = panel({ load: vi.fn(async () => prior), save: vi.fn(async () => receipt("A", { record: incoming })) });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(p.cache()?.log).toContainEqual(incoming.log[0]); expect(p.cache()?.log.filter((l) => l.fieldId === "대표자명")).toEqual([otherLog]);
    expect(p.cache()?.fields.대표자명.value).toBe("최신대표");
    p.api.loadBasicStore.mockResolvedValue({ fields: { ...prior.fields, 사업장주소지: incoming.fields.사업장주소지 },
      log: [incoming.log[0], otherLog] });
    replaceRow(p, { [addressKey]: "A" }); await p.flush();
    expect(p.cache()?.log.filter((l) => l.fieldId === "사업장주소지")).toEqual([incoming.log[0]]);
  });
  it("결함5: 실제 후보키 선택 52→27→52에서 한 canonical B 표시 유지", async () => {
    const a = deferred<ReturnType<typeof receipt>>();
    const p = panel({ save: vi.fn().mockReturnValueOnce(a.promise).mockResolvedValueOnce(receipt("B", { sourceFieldKey: "27주소지" })) }); await p.flush();
    const pendingA = p.startSave("A"); await p.flush();
    replaceRow(p, { [addressKey]: "", "27주소지": "기존주소" }); await p.flush();
    expect(p.field("27주소지").props.col.key).toBe("27주소지");
    await p.startSave("B", "27주소지"); await p.flush();
    a.resolve(receipt("A")); await pendingA; await p.flush();
    replaceRow(p, { [addressKey]: "A", "27주소지": "" }); await p.flush();
    expect(p.field().props.col.key).toBe(addressKey); expect(p.field().props.value).toBe("B");
    expect(p.cache()?.fields.사업장주소지.value).toBe("B"); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
});

describe("주소 재시도와 최신 읽기 경계", () => {
  it.each(["atomic", "legacy", "broken"])("유효 retry %s도 원저장 결과 검문을 통과", async (kind) => {
    const result = kind === "legacy" ? undefined : kind === "broken" ? receipt("A", { entryId: "틀린행" }) : receipt("A");
    const p = panel({ save: vi.fn().mockRejectedValueOnce(temporary()).mockResolvedValue(result),
      load: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(record("확인주소")) });
    await p.flush(); await p.startSave("A"); await p.flush(); const retry = failedEntry(p).retry;
    expect(await retry()).toBe(kind !== "broken"); await p.flush();
    expect(p.api.saveBasicField).toHaveBeenCalledTimes(kind === "legacy" ? 1 : 0);
    expect(p.onSaved).toHaveBeenCalledTimes(kind === "broken" ? 0 : 1);
    if (kind === "broken") { expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.api.loadBasicStore).toHaveBeenCalledTimes(2); }
  });
  it.each(["행", "회사", "왕복", "unmount", "source"])("%s 변경 후 고정된 retry는 쓰기 0", async (change) => {
    const p = panel({ save: vi.fn().mockRejectedValue(temporary()) }); await p.flush(); await p.startSave("A"); await p.flush();
    const retry = failedEntry(p).retry; const original = p.run.props.row;
    if (change === "unmount") p.run.unmount();
    else if (change === "source") { p.run.props = { ...p.run.props, saveOwnField: vi.fn() }; p.run.render(); }
    else { replaceRow(p, change === "회사" ? { "15사업자번호": "9999999999" } : { _id: "entry-b" });
      if (change === "왕복") { p.run.props = { ...p.run.props, row: { ...original } }; p.run.render(); } }
    await p.flush(); expect(await retry()).toBe(false); expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("retry에서 영구 실패도 같은 사유·복원 처리", async () => {
    const p = panel({ save: vi.fn().mockRejectedValueOnce(temporary()).mockRejectedValue(new Error("403 거절")) });
    await p.flush(); await p.startSave("A"); await p.flush(); expect(await failedEntry(p).retry()).toBe(false); await p.flush();
    expect(p.field().props.value).toBe("기존주소"); expect(alertSpy).toHaveBeenCalledWith("403 거절");
  });
  it("최신 GET 실패는 재PUT·실패등록·입력 rollback으로 바꾸지 않음", async () => {
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockRejectedValue(new Error("GET 실패")) });
    await p.flush(); await p.startSave("서울"); await p.flush(); replaceRow(p, { [addressKey]: "다른행주소" }); await p.flush();
    expect(p.field().props.value).toBe("서울"); expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });
  it("입력 중 시작한 GET과 완료 뒤 latest GET을 구분하고 명시 empty 보존", async () => {
    const saving = deferred<ReturnType<typeof receipt>>(); const old = deferred<BasicRecord | null>();
    const p = panel({ save: vi.fn(() => saving.promise), detail: { domainRows: [{ domain: "tax-amendment", row: { [addressKey]: "옛상세" } }] },
      load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(old.promise).mockResolvedValue(record("")) });
    await p.flush(); const pending = p.startSave(null); await p.flush(); replaceRow(p, { [addressKey]: "옛행" }); await p.flush();
    saving.resolve(receipt("")); await pending; await p.flush(); old.resolve(record("옛GET")); await p.flush();
    expect(p.field().props.value).toBe(""); replaceRow(p, { [addressKey]: "빈값을확인할행" }); await p.flush();
    expect(p.field().props.value).toBe(""); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("최신 GET A 대기 중 새 B 저장은 A 주소·로그 응답을 무효화", async () => {
    const old = deferred<BasicRecord | null>();
    const fresh = loggedRecord("A", { 대표자명: "읽은대표", 진행상태: "읽은상태" });
    const otherLog = { fieldId: "대표자명", from: "이전대표", to: "읽은대표",
      app: "hive", user: "other", at: "2026-10-08T01:00:00Z" }; fresh.log.push(otherLog);
    const p = panel({ save: vi.fn(async (_id, _key, value) => receipt(String(value), { record: loggedRecord(String(value)) })),
      load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(old.promise) });
    await p.flush(); await p.startSave("A"); await p.flush(); replaceRow(p, { [addressKey]: "새행" }); await p.flush();
    await p.startSave("B"); await p.flush(); old.resolve(fresh); await p.flush();
    expect(p.field().props.value).toBe("B"); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.cache()?.log[0].to).toBe("B");
    expect(p.cache()?.fields.대표자명.value).toBe("읽은대표"); expect(p.field("03대표자명").props.value).toBe("읽은대표");
    expect(p.field("05경정계약진행상태").props.value).toBe("읽은상태"); expect(p.cache()?.log).toContainEqual(otherLog);
  });
  it("source 왕복 전환 후에도 옛 retry를 새 세대로 승격하지 않음", async () => {
    const p = panel({ save: vi.fn().mockRejectedValueOnce(temporary()).mockResolvedValue(receipt("A")) });
    await p.flush(); await p.startSave("A"); await p.flush(); const retry = failedEntry(p).retry;
    p.run.props = { ...p.run.props, saveOwnField: vi.fn() }; p.run.render(); await p.flush();
    p.run.props = { ...p.run.props, saveOwnField: p.api.saveOwnField }; p.run.render(); await p.flush();
    expect(await retry()).toBe(false); expect(p.api.saveOwnField).toHaveBeenCalledOnce();
  });
  it("legacy 후속 PUT 대기 중 GET은 완료 전 주소로 되돌리지 않음", async () => {
    const put = deferred<BasicRecord | null>(); const old = deferred<BasicRecord | null>();
    const p = panel({ save: vi.fn(async () => undefined),
      load: vi.fn().mockResolvedValueOnce(null).mockReturnValueOnce(old.promise) });
    p.api.saveBasicField.mockReturnValueOnce(put.promise);
    await p.flush(); await p.startSave("B"); await p.flush(); replaceRow(p, { [addressKey]: "B" }); await p.flush();
    old.resolve(record("A")); await p.flush(); expect(p.field().props.value).toBe("B");
    put.resolve(loggedRecord("B")); await p.flush(); expect(p.cache()?.fields.사업장주소지.value).toBe("B");
    expect(p.api.saveBasicField).toHaveBeenCalledOnce();
  });
  it("동기 latest GET 예외도 저장 오류·재PUT·rollback으로 바꾸지 않음", async () => {
    const p = panel({ load: vi.fn().mockResolvedValueOnce(null).mockImplementation(() => { throw new Error("GET 동기 실패"); }) });
    await p.flush(); await p.startSave("서울"); await p.flush();
    expect(() => replaceRow(p, { [addressKey]: "옛주소" })).not.toThrow(); await p.flush();
    expect(p.field().props.value).toBe("서울"); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });
  it("비주소 retry는 기존 직접 저장 콜백 동작을 유지", async () => {
    const p = panel({ save: vi.fn().mockRejectedValueOnce(temporary()).mockResolvedValue(undefined) });
    await p.flush(); await p.startSave("대표", "03대표자명"); await p.flush();
    expect(await failedEntry(p).retry()).toBe(true); await p.flush();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
  });
});
