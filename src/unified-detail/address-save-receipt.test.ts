import { randomUUID } from "node:crypto";
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
import { saveFailureKindOf, type AddressEditContextV1, type AddressEditObservationV1, type AddressEditPreparation, type AddressSourceTable, type BasicRecord, type UnifiedDetailApi, type UnifiedDetailAdapter, type UnsavedBridge } from "./adapter-types";
import type { DomainRowLite } from "./lib/customer-detail";
import type { DomainGroup } from "./lib/domain-config";
import type { EditableFieldRow as ActualEditableFieldRow } from "./editors";
import type { SelectDropdownBodyProps } from "@wedly/detail-modal-shared";

// 설치된 node 시험 환경에서 실제 두 컴포넌트를 실행한다. DOM/외형 QA는 아니다.
// 훅의 상태·효과 수명만 대신하고 저장 함수·onUpdate·수정 확인 콜백은 원본 그대로 쓴다.
type Element<Props = Record<string, unknown>> = { type: unknown; props: Props };
type Component<Props> = (props: Props) => Element;
type FieldValue = Parameters<UnifiedDetailApi["saveOwnField"]>[2];
type AddressObservation = AddressEditObservationV1;
type AddressEditContext = AddressEditContextV1;
type LoadAddressEdit = NonNullable<UnifiedDetailApi["loadAddressEdit"]>;
type SupportsAddressEdit = NonNullable<UnifiedDetailApi["supportsAddressEdit"]>;
// 저장 응답 경계의 잘못된 서버 응답도 실제 제품 콜백에서 검사한다.
type SaveOwnField = (...args: Parameters<UnifiedDetailApi["saveOwnField"]>) => Promise<unknown>;
// 기존 네 인자의 값/관측 검사를 유지하면서 새 client-only 실행 객체도 검사한다.
const frozenAddressExecution = {
  asymmetricMatch(value: unknown) {
    return !!value && typeof value === "object" && Object.isFrozen(value)
      && Reflect.ownKeys(value).length === 1 && "shouldContinue" in value
      && typeof value.shouldContinue === "function";
  },
};
type PanelDetail = { domainRows: Array<Pick<DomainRowLite, "domain" | "row">> };
type PanelAdapter = Pick<UnifiedDetailAdapter, "appName" | "ownColumns"> & {
  api: Pick<UnifiedDetailApi, "loadBasicStore" | "saveBasicField" | "loadColumnConfig" | "saveColumnConfig" | "loadManagers" | "loadCommonBasicFields"> & { saveOwnField: SaveOwnField; loadAddressEdit?: LoadAddressEdit; supportsAddressEdit?: SupportsAddressEdit };
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
  render(attachRefs?: (tree: Element) => void) {
    active.current = this; this.cursor = 0; this.dirty = false;
    this.tree = this.component(this.props);
    attachRefs?.(this.tree);
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
  getOptionColorClass: () => "bg-wedly-bg-gray text-wedly-t2",
  STATUS_COLORS: {}, SELECT_BADGE_COLORS: {}, OPTION_COLOR_FAMILIES: [],
  OPTION_COLOR_PALETTE: [{ name: "회색", bg: "bg-wedly-bg-gray", text: "text-wedly-t2", hex: "#eeeeee" }],
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
type TextChildProps = Parameters<typeof import("../components/Editors").TextEditor>[0];
type SelectChildProps = Parameters<typeof import("./editors").SelectEditor>[0];
const fixedCn = { cn: (...classes: unknown[]) => classes.filter(Boolean).join(" ") };
dependencies["../lib/cn"] = fixedCn;
const NativeTextEditor = compile<TextChildProps>("../components/Editors.tsx", "TextEditor");
const NativeSelectDropdownBody = compile<SelectDropdownBodyProps>(
  "../../node_modules/@wedly/detail-modal-shared/src/components/SelectDropdown.tsx", "SelectDropdownBody",
);
dependencies["@wedly/detail-modal-shared"] = { SelectDropdownBody: NativeSelectDropdownBody };
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
type ConfirmProps = { oldVal: unknown; newVal: FieldValue; onConfirm: () => void; onCancel: () => void };
function actualEditor(initialProps: PanelFieldProps) {
  let pending: Promise<void> | undefined;
  const tracked = (props: PanelFieldProps): EditorProps => {
    const captureEdit = props.captureEdit;
    const trackCapture = (capture: Awaited<ReturnType<NonNullable<EditorProps["captureEdit"]>>>) => capture && {
      ...capture, onUpdate: (key: string, next: FieldValue) => {
        const result = capture.onUpdate(key, next);
        pending = Promise.resolve(result);
        return result;
      },
      ...(capture.onToggle ? { onToggle: (key: string, next: FieldValue) => {
        const result = capture.onToggle!(key, next);
        pending = Promise.resolve(result);
        return result;
      } } : {}),
    };
    return {
      ...props, onUpdate: (key: string, next: FieldValue) => { pending = props.onUpdate(key, next); },
      ...(captureEdit ? { captureEdit: (isOpen?: () => boolean) => {
        const result = captureEdit(isOpen);
        return result && typeof (result as Promise<unknown>).then === "function"
          ? Promise.resolve(result).then(trackCapture) : trackCapture(result as Awaited<typeof result>);
      } } : {}),
    };
  };
  const run = new Hooks(EditableFieldRow, tracked(initialProps));
  run.render();
  const input = () => elements(run.tree).find((element): element is Element<{ value: string; onSave: (value: FieldValue) => void }> => element.type === TextEditor);
  const confirmation = () => elements(run.tree).find((element): element is Element<ConfirmProps> => typeof element.props.onConfirm === "function");
  return {
    run, input, confirmation,
    pending: () => pending,
    open: () => {
      const click = elements(run.tree).find((element): element is Element<{ onClick: () => void }> => typeof element.props.onClick === "function");
      expect(click).toBeDefined(); click!.props.onClick(); run.render();
    },
    flush: async () => {
      for (let i = 0; i < 16; i++) { await Promise.resolve(); if (run.dirty) run.render(); }
    },
    rerender: (props: PanelFieldProps) => { run.props = tracked(props); run.render(); },
    saveInput: (value: FieldValue) => { expect(input()).toBeDefined(); input()!.props.onSave(value); run.render(); },
    confirm: () => { confirmation()?.props.onConfirm(); if (run.dirty) run.render(); },
    cancel: () => { expect(confirmation()).toBeDefined(); confirmation()!.props.onCancel(); if (run.dirty) run.render(); },
  };
}
const mounted: Array<Pick<Hooks<unknown>, "unmount">> = [];
const alertSpy = vi.fn();
function panel(options: { value?: unknown; detail?: PanelDetail; load?: Mock<() => Promise<BasicRecord | null>>; save?: SaveOwnField; key?: string; loadAddressEdit?: LoadAddressEdit; supportsAddressEdit?: SupportsAddressEdit; ownDomain?: string; store?: Map<string, Parameters<UnsavedBridge["report"]>[0]> } = {}) {
  vi.stubGlobal("alert", alertSpy);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(randomUUID) });
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ success: true, data: {} }) })));
  const key = options.key ?? addressKey;
  const api = {
    ...(options.loadAddressEdit ? { loadAddressEdit: options.loadAddressEdit } : {}),
    ...(options.supportsAddressEdit ? { supportsAddressEdit: options.supportsAddressEdit } : {}),
    saveOwnField: options.save ?? vi.fn(async () => receipt("서울")),
    saveBasicField: vi.fn<UnifiedDetailApi["saveBasicField"]>(async (_biz: string, _app: string, field: string, value: unknown) => record("공용", { [field]: value })),
    loadBasicStore: options.load ?? vi.fn<() => Promise<BasicRecord | null>>(async () => null),
    // 칸 정의는 이 저장 계약 시험에서 고정한다(정의 응답으로 주소 조회가 재시작되지 않게).
    loadCommonBasicFields: vi.fn(() => new Promise<never>(() => {})),
    loadColumnConfig: vi.fn(async () => ({})), saveColumnConfig: vi.fn(), loadManagers: vi.fn(async () => []),
  };
  const adapter = {
    appName: "ERP", ownColumns: [
      { key, label: "사업장주소지", type: "text", defaultVisible: true },
      { key: "15사업자번호", label: "사업자번호", type: "text", defaultVisible: true },
      { key: "03대표자명", label: "대표자명", type: "text", defaultVisible: true },
      { key: "05경정계약진행상태", label: "진행상태", type: "select", defaultVisible: true },
    ], api, components: {},
    unsaved: {
      scope: "test", makeId: (...parts: string[]) => parts.join(":"),
      resolve: vi.fn<UnsavedBridge["resolve"]>((id, expectedAttemptId) => {
        if (options.store && (expectedAttemptId === undefined || options.store.get(id)?.attemptId === expectedAttemptId)) options.store.delete(id);
      }),
      report: vi.fn<UnsavedBridge["report"]>((entry) => { options.store?.set(entry.id, entry); }),
      ...(options.store ? { getCurrentAttemptId: vi.fn((id: string) => options.store!.get(id)?.attemptId) } : {}),
    },
  } satisfies PanelAdapter;
  const onSaved = vi.fn();
  const run = new Hooks(BasicInfoPanel, {
    row: { _id: "entry-a", "15사업자번호": "123-45-67890", [key]: "value" in options ? options.value : "기존주소" },
    detail: options.detail ?? null, loading: false, onOpenTab: vi.fn(), orderedGroups: [],
    ownDomain: options.ownDomain ?? "tax-amendment", adapter, ...api, onSaved,
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
  const startSave = async (value: FieldValue, fieldKey = key) => {
    const editor = actualEditor(field(fieldKey).props);
    editor.open();
    if (!editor.input()) await editor.flush();
    editor.saveInput(value);
    editor.confirm();
    expect(editor.pending(), "입력기/수정 확인에서 실제 저장 콜백을 실행").toBeDefined();
    editor.run.unmount();
    await editor.pending();
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
  it("capability 주소는 unmount 뒤 실제 retry가 최초 관측·값으로 저장하고 닫힌 UI를 갱신하지 않음", async () => {
    const editContext: AddressEditContext = Object.freeze<AddressEditContext>({
      version: 1, entryId: "entry-a", sourceFieldKey: addressKey, bizno: company,
      observation: Object.freeze<AddressObservation>({
        version: 1, generation: "11111111-1111-4111-8111-111111111111",
        source: Object.freeze({
          identity: Object.freeze({ kind: "source", table: "TaxAmendmentEntry", id: "entry-a" }),
          exists: true, token: Object.freeze({ kind: "revision", uuid: "22222222-2222-4222-8222-222222222222" }),
        }),
        canonical: Object.freeze({
          identity: Object.freeze({ kind: "canonical", key: "secstore:1234567890:basic" }),
          exists: true, token: Object.freeze({ kind: "revision", uuid: "33333333-3333-4333-8333-333333333333" }),
        }),
      }),
    });
    const originalObservation = JSON.parse(JSON.stringify(editContext.observation)) as AddressObservation;
    const committedObservation: AddressObservation = {
      ...editContext.observation, generation: editContext.observation.generation,
      source: { ...editContext.observation.source, token: { kind: "revision", uuid: "55555555-5555-4555-8555-555555555555" } },
      canonical: { ...editContext.observation.canonical, token: { kind: "revision", uuid: "66666666-6666-4666-8666-666666666666" } },
    };
    const loadAddressEdit = vi.fn<LoadAddressEdit>().mockResolvedValueOnce({ value: "기존주소", editContext })
      .mockResolvedValue({ value: "최신주소", editContext: { ...editContext, observation: committedObservation } });
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary())
      .mockResolvedValueOnce(receipt("A", { observation: committedObservation }));
    const p = panel({ loadAddressEdit, save });
    await p.flush();
    const preparedBeforeEdit = loadAddressEdit.mock.calls.length;
    expect(p.field().props.value).toBe("기존주소");
    await p.startSave("A"); await p.flush();
    const failed = failedEntry(p);
    expect(failed.value).toBe("A"); expect(save).toHaveBeenCalledOnce();
    expect(p.onSaved).not.toHaveBeenCalled();
    p.run.unmount();
    const detachedState = p.run.values();
    const detachedCache = p.cache();
    // 최초 RED는 원본 persist의 unmount 거절(false/두 번째 서버 호출 0)이다.
    const retried = await failed.retry();
    expect(retried, "UI 닫힘과 같은 attempt의 저장수명을 구분").toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, "entry-a", addressKey, "A", editContext, frozenAddressExecution);
    expect(save).toHaveBeenNthCalledWith(2, "entry-a", addressKey, "A", editContext, frozenAddressExecution);
    expect(preparedBeforeEdit, "실제 편집 시작 전에 값과 관측 준비").toBe(1);
    expect(loadAddressEdit).toHaveBeenCalledOnce();
    expect(loadAddressEdit).toHaveBeenCalledWith("entry-a", addressKey, company);
    expect(save.mock.calls[0][3]?.observation).toEqual(originalObservation);
    expect(save.mock.calls[1][3]?.observation).toEqual(originalObservation);
    expect(editContext.observation).toEqual(originalObservation);
    expect(editContext.observation).not.toEqual(committedObservation);
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.run.dirty).toBe(false); expect(p.cache()).toBe(detachedCache);
    p.run.values().forEach((value, index) => expect(value).toBe(detachedState[index]));
  });
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


const originalGeneration = "11111111-1111-4111-8111-111111111111";
function preparedAddress(value: string | null = "관측주소", table: AddressSourceTable = "TaxAmendmentEntry"): AddressEditPreparation {
  return { value, editContext: {
    version: 1, entryId: "entry-a", sourceFieldKey: addressKey, bizno: company,
    observation: {
      version: 1, generation: originalGeneration,
      source: { identity: { kind: "source", table, id: "entry-a" }, exists: true,
        token: { kind: "revision", uuid: "22222222-2222-4222-8222-222222222222" } },
      canonical: { identity: { kind: "canonical", key: `secstore:${company}:basic` }, exists: true,
        token: { kind: "revision", uuid: "33333333-3333-4333-8333-333333333333" } },
    },
  } };
}
function committedObservation(prepared = preparedAddress()): AddressObservation {
  return {
    ...prepared.editContext.observation,
    source: { ...prepared.editContext.observation.source, exists: true,
      token: { kind: "revision", uuid: "55555555-5555-4555-8555-555555555555" } },
    canonical: { ...prepared.editContext.observation.canonical, exists: true,
      token: { kind: "revision", uuid: "66666666-6666-4666-8666-666666666666" } },
  };
}
function capabilityPanel(options: Parameters<typeof panel>[0] = {}) {
  return panel({
    loadAddressEdit: vi.fn<LoadAddressEdit>(async () => preparedAddress()),
    save: vi.fn<SaveOwnField>(async (_id, _key, value) => receipt(String(value ?? ""), { observation: committedObservation() })),
    ...options,
  });
}

describe("편집 시작 고정 — 실제 입력기와 확인 콜백", () => {
  it("부모 값·onUpdate가 바뀌어도 최초 입력값·확인 oldVal·저장 콜백 유지", async () => {
    const p = panel(); await p.flush();
    const originalSave = vi.fn<EditorProps["onUpdate"]>();
    const latestSave = vi.fn(async () => {});
    const release = vi.fn();
    const props = { ...p.field().props, value: "부모표시", captureEdit: () => ({
      initialValue: "고정표시", onUpdate: originalSave, release,
    }) };
    const editor = actualEditor(props); mounted.push(editor.run); editor.open();
    expect(editor.input()?.props.value).toBe("고정표시");
    editor.rerender({ ...props, value: "최신부모", onUpdate: latestSave });
    expect(editor.input()?.props.value).toBe("고정표시");
    editor.saveInput("입력A");
    expect(editor.confirmation()?.props.oldVal).toBe("고정표시");
    editor.rerender({ ...props, value: "확인중최신", onUpdate: latestSave });
    expect(editor.confirmation()?.props.oldVal).toBe("고정표시");
    editor.confirm(); await editor.pending();
    expect(originalSave).toHaveBeenCalledOnce();
    expect(originalSave).toHaveBeenCalledWith(addressKey, "입력A");
    expect(latestSave).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
  });
  it("capture 없는 입력기는 기존 최신 value·onUpdate 동작 유지", async () => {
    const p = panel(); await p.flush();
    const originalSave = vi.fn(async () => {});
    const latestSave = vi.fn(async () => {});
    const props = { ...p.field().props, value: "기존표시", onUpdate: originalSave };
    const editor = actualEditor(props); mounted.push(editor.run); editor.open();
    editor.rerender({ ...props, value: "최신표시", onUpdate: latestSave });
    expect(editor.input()?.props.value).toBe("최신표시");
    editor.saveInput("입력A"); expect(editor.confirmation()?.props.oldVal).toBe("최신표시");
    editor.confirm(); await editor.pending();
    expect(latestSave).toHaveBeenCalledOnce();
    expect(latestSave).toHaveBeenCalledWith(addressKey, "입력A");
    expect(originalSave).not.toHaveBeenCalled();
  });
  it("주소도 부모 재렌더·확인 대기 동안 준비한 표시값과 실제 저장 관측 유지", async () => {
    const p = capabilityPanel(); await p.flush();
    const latestSave = vi.fn(async () => {});
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
    replaceRow(p, { [addressKey]: "행갱신주소" }); await p.flush();
    editor.rerender({ ...p.field().props, onUpdate: latestSave });
    expect(editor.input()?.props.value).toBe("관측주소");
    editor.saveInput("A"); expect(editor.confirmation()?.props.oldVal).toBe("관측주소");
    editor.rerender({ ...p.field().props, value: "확인중갱신", onUpdate: latestSave });
    editor.confirm(); await editor.pending(); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution);
    expect(latestSave).not.toHaveBeenCalled(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
  });
  it("취소 뒤 재편집은 새 snapshot 초기값·관측을 준비하고 첫 입력은 전송하지 않음", async () => {
    const second = preparedAddress("새관측주소");
    const load = vi.fn<LoadAddressEdit>().mockResolvedValueOnce(preparedAddress()).mockResolvedValueOnce(second);
    const p = capabilityPanel({ loadAddressEdit: load }); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
    editor.saveInput("취소A"); editor.cancel(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    editor.rerender(p.field().props); editor.open(); await p.flush(); await editor.flush();
    expect(editor.input()?.props.value).toBe("새관측주소");
    editor.saveInput("B"); expect(editor.confirmation()?.props.oldVal).toBe("새관측주소");
    editor.confirm(); await editor.pending(); await p.flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "B", second.editContext, frozenAddressExecution);
  });
  it("준비 실패는 입력을 열거나 3인자 저장으로 우회하지 않음", async () => {
    const load = vi.fn<LoadAddressEdit>().mockRejectedValue(new Error("관측 준비 실패"));
    const p = capabilityPanel({ loadAddressEdit: load }); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush(); await p.flush();
    expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
    await p.field().props.onUpdate(addressKey, "우회A");
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(alertSpy).toHaveBeenCalledWith("관측 준비 실패");
  });
  it.each(["행", "회사", "source", "panel-unmount", "editor-unmount"])("준비 대기 중 %s 변경이면 늦은 입력·저장·경고 0", async (change) => {
    const waiting = deferred<AddressEditPreparation>();
    const load = vi.fn<LoadAddressEdit>().mockReturnValueOnce(waiting.promise).mockImplementation(() => new Promise<never>(() => {}));
    const p = capabilityPanel({ loadAddressEdit: load }); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
    expect(editor.input()).toBeUndefined();
    if (change === "행") replaceRow(p, { _id: "entry-b" });
    else if (change === "회사") replaceRow(p, { "15사업자번호": "9999999999" });
    else if (change === "source") { p.run.props = { ...p.run.props, saveOwnField: vi.fn() }; p.run.render(); }
    else if (change === "panel-unmount") p.run.unmount();
    else editor.run.unmount();
    const dirty = editor.run.dirty;
    waiting.resolve(preparedAddress()); await p.flush();
    if (change !== "editor-unmount") await editor.flush();
    else { for (let i = 0; i < 16; i++) await Promise.resolve(); expect(editor.run.dirty).toBe(dirty); }
    expect(editor.input()).toBeUndefined(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("주소 capability 준비 자료의 wire 경계", () => {
  it("실제 ERP 정적 tax-amendment 표시에서도 서버 PolicyFund 원본 관측을 그대로 저장", async () => {
    const prepared = preparedAddress("관측주소", "PolicyFundEntry");
    const p = capabilityPanel({ ownDomain: "tax-amendment", loadAddressEdit: vi.fn(async () => prepared),
      save: vi.fn(async () => receipt("A", { sourceFieldKey: "27주소지", observation: committedObservation(prepared) })) });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledTimes(1);
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledTimes(1);
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it.each([
    ["tax-amendment", "TaxAmendmentEntry", addressKey], ["policy-fund", "PolicyFundEntry", "27주소지"],
    ["labor-subsidy", "LaborSubsidyEntry", "사업장 주소지"], ["free-subsidy", "FreeSubsidyEntry", "businessAddress"],
    ["cert", "CertEntry", addressKey], ["patent", "PatentEntry", addressKey],
  ] as const)("%s의 독립 source table 준비를 실제 콜백으로 수락", async (ownDomain, table, sourceFieldKey) => {
    const prepared = preparedAddress("관측주소", table);
    const p = capabilityPanel({ ownDomain, loadAddressEdit: vi.fn(async () => prepared),
      save: vi.fn(async () => receipt("A", { sourceFieldKey, observation: committedObservation(prepared) })) });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("baseline·canonical absent도 같은 관측으로 전송하고 각 revision이 달라도 정상 수락", async () => {
    const base = preparedAddress(null);
    const prepared: AddressEditPreparation = { ...base, editContext: { ...base.editContext, observation: {
      ...base.editContext.observation,
      source: { ...base.editContext.observation.source, token: { kind: "baseline" } },
      canonical: { ...base.editContext.observation.canonical, exists: false, token: { kind: "baseline" } },
    } } };
    const p = capabilityPanel({ loadAddressEdit: vi.fn(async () => prepared),
      save: vi.fn(async () => receipt("A", { observation: committedObservation(prepared) })) });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce(); expect(p.onSaved).toHaveBeenCalledOnce();
  });
  it("준비 응답을 깊게 복사·동결하므로 외부 객체 변경과 최신 GET으로 입력을 재기준화하지 않음", async () => {
    const prepared = preparedAddress();
    const fixed = JSON.parse(JSON.stringify(prepared.editContext)) as AddressEditContext;
    const p = capabilityPanel({ loadAddressEdit: vi.fn(async () => prepared), save: vi.fn().mockRejectedValue(temporary()) });
    await p.flush();
    const external = prepared.editContext.observation as unknown as {
      generation: string; source: { identity: { id: string }; token: { uuid: string } };
    };
    external.generation = "99999999-9999-4999-8999-999999999999"; external.source.identity.id = "변조행";
    external.source.token.uuid = "88888888-8888-4888-8888-888888888888";
    await p.startSave("A"); await p.flush();
    const saved = (p.api.saveOwnField as Mock<SaveOwnField>).mock.calls[0][3]!;
    expect(saved).toEqual(fixed); expect(saved).not.toBe(prepared.editContext);
    expect(Object.isFrozen(saved)).toBe(true); expect(Object.isFrozen(saved.observation)).toBe(true);
    expect(Object.isFrozen(saved.observation.source.identity)).toBe(true);
    expect(Object.isFrozen(saved.observation.source.token)).toBe(true);
    p.api.loadBasicStore.mockResolvedValue(record("최신GET주소"));
    replaceRow(p, { [addressKey]: "행갱신" }); await p.flush();
    expect(p.field().props.value).toBe("A");
    p.run.unmount(); expect(await failedEntry(p).retry()).toBe(false);
    expect((p.api.saveOwnField as Mock<SaveOwnField>).mock.calls[1][3]).toBe(saved);
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it.each(["값", "행", "칸", "회사", "source-id", "source-table", "canonical", "generation", "token", "exists", "extra"])("%s 잘못된 준비는 입력·저장 0", async (bad) => {
    const prepared = preparedAddress();
    const context = prepared.editContext;
    const observation = context.observation;
    let invalid: unknown = prepared;
    if (bad === "값") invalid = { ...prepared, value: 12 };
    else if (bad === "행") invalid = { ...prepared, editContext: { ...context, entryId: "entry-b" } };
    else if (bad === "칸") invalid = { ...prepared, editContext: { ...context, sourceFieldKey: "27주소지" } };
    else if (bad === "회사") invalid = { ...prepared, editContext: { ...context, bizno: "9999999999" } };
    else if (bad === "source-id") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, source: { ...observation.source, identity: { ...observation.source.identity, id: "entry-b" } } } } };
    else if (bad === "source-table") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, source: { ...observation.source, identity: { ...observation.source.identity, table: "PrimaryDbEntry" } } } } };
    else if (bad === "canonical") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, canonical: { ...observation.canonical, identity: { kind: "canonical", key: "secstore:9999999999:basic" } } } } };
    else if (bad === "generation") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, generation: "invalid" } } };
    else if (bad === "token") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, source: { ...observation.source, token: { kind: "revision", uuid: "invalid" } } } } };
    else if (bad === "exists") invalid = { ...prepared, editContext: { ...context, observation: { ...observation, source: { ...observation.source, exists: false } } } };
    else invalid = { ...prepared, editContext: { ...context, extra: true } };
    const p = capabilityPanel({ loadAddressEdit: vi.fn(async () => invalid as AddressEditPreparation) }); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush(); await p.flush();
    expect(editor.input()).toBeUndefined(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
});

describe("분리된 주소 attempt — 실제 보관함 retry·revert 콜백", () => {
  it("상세 닫힘 뒤 같은 실패의 중복 retry는 한 요청만 보내고 성공 뒤 재실행 0", async () => {
    const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ save }); await p.flush(); await p.startSave("A"); await p.flush();
    const failed = failedEntry(p); expect(failed.attemptId).toEqual(expect.any(String)); expect(failed.restorable).toBe(false);
    p.run.unmount(); const state = p.run.values(); const cache = p.cache();
    const first = failed.retry(); expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledTimes(2);
    waiting.resolve(receipt("A", { observation: committedObservation() }));
    expect(await first).toBe(true); expect(await failed.retry()).toBe(false); failed.revert?.();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0][3]).toBe(save.mock.calls[1][3]);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(failed.id, failed.attemptId);
    expect(p.onSaved).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
    expect(p.run.dirty).toBe(false); expect(p.cache()).toBe(cache);
    p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
  });
  it.each(["성공", "오류"])("새 실패 B 뒤 늦은 detached A %s·revert는 B 삭제/덮어쓰기 0", async (ending) => {
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const waiting = deferred<ReturnType<typeof receipt>>();
    const a = capabilityPanel({ store, save: vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockReturnValueOnce(waiting.promise) });
    await a.flush(); await a.startSave("A"); await a.flush(); const failedA = failedEntry(a);
    a.run.unmount(); const pendingA = failedA.retry();
    const b = capabilityPanel({ store, save: vi.fn().mockRejectedValue(temporary()) });
    await b.flush(); await b.startSave("B"); await b.flush(); const failedB = failedEntry(b);
    expect(failedA.attemptId).not.toBe(failedB.attemptId); expect(store.get(failedB.id)).toBe(failedB);
    if (ending === "성공") waiting.resolve(receipt("A", { observation: committedObservation() }));
    else waiting.reject(new Error("늦은403"));
    expect(await pendingA).toBe(false); failedA.revert?.();
    expect(await failedA.retry()).toBe(false); await b.flush();
    expect(store.get(failedB.id)).toBe(failedB); expect(b.field().props.value).toBe("B");
    expect(a.adapter.unsaved.report).toHaveBeenCalledOnce(); expect(a.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(b.adapter.unsaved.report).toHaveBeenCalledOnce(); expect(b.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(a.onSaved).not.toHaveBeenCalled(); expect(b.onSaved).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
  });
  it("보관함에서 취소된 detached attempt는 다시 실패를 살리거나 요청하지 않음", async () => {
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const p = capabilityPanel({ store, save: vi.fn().mockRejectedValue(temporary()) });
    await p.flush(); await p.startSave("A"); await p.flush(); const failed = failedEntry(p); p.run.unmount();
    store.delete(failed.id); expect(await failed.retry()).toBe(false); failed.revert?.();
    expect(store.size).toBe(0); expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.report).toHaveBeenCalledOnce();
  });
  it("유효한 새 B 성공만 앞 실패 A를 관측한 attemptId로 조건부 정리", async () => {
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const a = capabilityPanel({ store, save: vi.fn().mockRejectedValue(temporary()) });
    await a.flush(); await a.startSave("A"); await a.flush(); const failedA = failedEntry(a); a.run.unmount();
    const b = capabilityPanel({ store }); await b.flush(); await b.startSave("B"); await b.flush();
    expect(store.size).toBe(0);
    expect(b.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(b.adapter.unsaved.resolve).toHaveBeenCalledWith(failedA.id, failedA.attemptId);
    expect(await failedA.retry()).toBe(false); expect(a.api.saveOwnField).toHaveBeenCalledOnce();
  });
  it.each(["행", "회사", "source", "주소키", "새편집"])("%s 변화는 옛 attempt 저장을 거절하고 입력을 새 관측으로 재기준화하지 않음", async (change) => {
    const p = capabilityPanel({ save: vi.fn().mockRejectedValue(temporary()) });
    await p.flush(); await p.startSave("A"); await p.flush(); const failed = failedEntry(p);
    if (change === "행") replaceRow(p, { _id: "entry-b" });
    else if (change === "회사") replaceRow(p, { "15사업자번호": "9999999999" });
    else if (change === "source") { p.run.props = { ...p.run.props, saveOwnField: vi.fn() }; p.run.render(); }
    else if (change === "주소키") replaceRow(p, { [addressKey]: "", "27주소지": "다른주소" });
    else {
      const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    }
    expect(await failed.retry()).toBe(false);
    expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });
  it.each([403, 409])("현재 서버 %s 거절은 입력을 보존하고 retry도 최초 관측·값을 그대로 전달", async (status) => {
    const error = Object.assign(new Error(`${status} 저장 거절`), { saveFailureKind: "permanent" });
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockRejectedValue(error);
    const p = capabilityPanel({ save }); await p.flush(); await p.startSave("A"); await p.flush();
    const failed = failedEntry(p); expect(p.field().props.value).toBe("A");
    expect(await failed.retry()).toBe(false); await p.flush(); expect(p.field().props.value).toBe("A");
    expect(failedEntry(p).attemptId).toBe(failed.attemptId);
    p.run.unmount(); expect(await failedEntry(p).retry()).toBe(false);
    expect(save).toHaveBeenCalledTimes(3);
    save.mock.calls.forEach((args) => expect(args).toEqual(["entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution]));
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(alertSpy).not.toHaveBeenCalled();
  });
  it.each(["void", "null", "관측없음", "generation", "source", "canonical", "token", "exists", "값"])("%s 확인 불가 receipt는 legacy PUT·입력삭제·성공삭제 0", async (bad) => {
    const observation = committedObservation();
    let result: unknown = receipt("A", { observation });
    if (bad === "void") result = undefined;
    else if (bad === "null") result = null;
    else if (bad === "관측없음") result = receipt("A");
    else if (bad === "generation") result = receipt("A", { observation: { ...observation, generation: "77777777-7777-4777-8777-777777777777" } });
    else if (bad === "source") result = receipt("A", { observation: { ...observation, source: { ...observation.source, identity: { ...observation.source.identity, id: "entry-b" } } } });
    else if (bad === "canonical") result = receipt("A", { observation: { ...observation, canonical: { ...observation.canonical, identity: { kind: "canonical", key: "secstore:9999999999:basic" } } } });
    else if (bad === "token") result = receipt("A", { observation: { ...observation, canonical: { ...observation.canonical, token: { kind: "revision", uuid: "invalid" } } } });
    else if (bad === "exists") result = receipt("A", { observation: { ...observation, source: { ...observation.source, exists: false } } });
    else result = receipt("다른값", { observation });
    const save = vi.fn<SaveOwnField>().mockResolvedValue(result);
    const p = capabilityPanel({ save }); await p.flush(); await p.startSave("A"); await p.flush();
    const failed = failedEntry(p); expect(failed.kind).toBe("confirmation-needed"); expect(p.field().props.value).toBe("A");
    p.run.unmount(); expect(await failed.retry()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2); expect(save.mock.calls[0][3]).toBe(save.mock.calls[1][3]);
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.onSaved).not.toHaveBeenCalled();
  });
});

describe("ERP 정적 도메인·행별 주소 capability 호환성", () => {
  it.each([
    "TaxAmendmentEntry", "PolicyFundEntry", "LaborSubsidyEntry",
    "FreeSubsidyEntry", "CertEntry", "PatentEntry",
  ] as const)("정적 tax-amendment의 지원 delegate %s는 최초 원본 관측으로 저장·PUT 0", async (table) => {
    const prepared = preparedAddress("관측주소", table);
    const supportsAddressEdit = vi.fn<SupportsAddressEdit>(() => true);
    const load = vi.fn<LoadAddressEdit>(async () => prepared);
    const sourceFieldKey = table === "PolicyFundEntry" ? "27주소지"
      : table === "LaborSubsidyEntry" ? "사업장 주소지" : table === "FreeSubsidyEntry" ? "businessAddress" : addressKey;
    const save = vi.fn<SaveOwnField>(async () => receipt("A", { sourceFieldKey, observation: committedObservation(prepared) }));
    const p = capabilityPanel({ ownDomain: "tax-amendment", supportsAddressEdit, loadAddressEdit: load, save });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(supportsAddressEdit).toHaveBeenCalledWith("entry-a");
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("entry-a", addressKey, company);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution]);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledTimes(1);
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it.each(["pdb-entry-a", "odb-entry-a", "srd-entry-a", "copy-entry-a"])("명시 미지원 자체 행 %s는 기존 3인자 저장·PUT 1·준비 0", async (nativeEntryId) => {
    const supportsAddressEdit = vi.fn<SupportsAddressEdit>((entryId) => entryId !== nativeEntryId);
    const load = vi.fn<LoadAddressEdit>(async () => preparedAddress());
    const save = vi.fn<SaveOwnField>(async () => {});
    const p = capabilityPanel({ supportsAddressEdit, loadAddressEdit: load, save });
    replaceRow(p, { _id: nativeEntryId }); await p.flush();
    expect(p.field().props.captureEdit).toBeUndefined();
    await p.startSave("A"); await p.flush();
    expect(supportsAddressEdit).toHaveBeenCalledWith(nativeEntryId);
    expect(load).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual([nativeEntryId, addressKey, "A"]);
    expect(p.api.saveBasicField).toHaveBeenCalledTimes(1);
    expect(p.api.saveBasicField).toHaveBeenCalledWith(company, "erp", "사업장주소지", "A");
    expect(p.onSaved).toHaveBeenCalledTimes(1);
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });

  it("지원 predicate만 있고 loader가 없는 행은 기존 저장을 유지", async () => {
    const supportsAddressEdit = vi.fn<SupportsAddressEdit>(() => true);
    const save = vi.fn<SaveOwnField>(async () => {});
    const p = panel({ supportsAddressEdit, save }); await p.flush();
    expect(p.field().props.captureEdit).toBeUndefined();
    await p.startSave("A"); await p.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "A"]);
    expect(p.api.saveBasicField).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])("지원 행 준비의 %s 거절은 기존 저장으로 전환하지 않음", async (status) => {
    const error = Object.assign(new Error(`${status} 준비 거절`), { status });
    const load = vi.fn<LoadAddressEdit>().mockRejectedValue(error);
    const p = capabilityPanel({ supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => true), loadAddressEdit: load });
    await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run);
    editor.open(); await editor.flush(); await p.flush();
    expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
    await p.field().props.onUpdate(addressKey, "우회A");
    expect(p.field().props.captureEdit).toEqual(expect.any(Function));
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(alertSpy).toHaveBeenCalledWith(error.message);
  });

  it("지원 행의 잘못된 원본 준비도 기존 저장으로 전환하지 않음", async () => {
    const prepared = preparedAddress();
    const invalid = { ...prepared, editContext: { ...prepared.editContext, observation: {
      ...prepared.editContext.observation, source: { ...prepared.editContext.observation.source,
        identity: { kind: "source", table: "PrimaryDbEntry", id: "entry-a" },
      },
    } } };
    const p = capabilityPanel({ supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => true),
      loadAddressEdit: vi.fn(async () => invalid as AddressEditPreparation) });
    await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run);
    editor.open(); await editor.flush(); await p.flush();
    expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
    await p.field().props.onUpdate(addressKey, "우회A");
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled();
  });

  it.each(["predicate-owner", "capability", "capability-roundtrip"])("준비 대기 중 %s 변경은 늦은 입력·저장·경고 0", async (change) => {
    let capable = true;
    const supportsAddressEdit = vi.fn<SupportsAddressEdit>(() => capable);
    const waiting = deferred<AddressEditPreparation>();
    const load = vi.fn<LoadAddressEdit>().mockReturnValueOnce(waiting.promise)
      .mockImplementation(() => new Promise<never>(() => {}));
    const p = capabilityPanel({ supportsAddressEdit, loadAddressEdit: load }); await p.flush();
    const originalProps = p.field().props;
    const editor = actualEditor(originalProps); mounted.push(editor.run); editor.open();
    expect(editor.input()).toBeUndefined(); expect(load).toHaveBeenCalledTimes(1);
    if (change === "predicate-owner") p.adapter.api.supportsAddressEdit = vi.fn<SupportsAddressEdit>(() => true);
    else capable = false;
    p.run.render(); await p.flush();
    if (change === "capability-roundtrip") { capable = true; p.run.render(); await p.flush(); }
    waiting.resolve(preparedAddress()); await p.flush(); await editor.flush();
    await originalProps.onUpdate(addressKey, "오래된우회A");
    expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(change === "capability" ? 1 : 2);
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
  });

  it("수정 확인 중 지원 해제는 고정된 이전 저장 콜백을 실행하지 않음", async () => {
    let capable = true;
    const p = capabilityPanel({ supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => capable) }); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); editor.saveInput("A");
    expect(editor.confirmation()?.props.oldVal).toBe("관측주소");
    capable = false; p.run.render(); await p.flush(); editor.rerender(p.field().props);
    editor.confirm(); await editor.pending(); await p.flush();
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(alertSpy).not.toHaveBeenCalled();
  });

  it.each(["predicate-owner", "capability"])("%s 변경은 보관된 이전 attempt의 추가 전송 0", async (change) => {
    let capable = true;
    const save = vi.fn<SaveOwnField>().mockRejectedValue(temporary());
    const p = capabilityPanel({ supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => capable), save });
    await p.flush(); await p.startSave("A"); await p.flush(); const failed = failedEntry(p);
    if (change === "predicate-owner") p.adapter.api.supportsAddressEdit = vi.fn<SupportsAddressEdit>(() => true);
    else capable = false;
    p.run.render(); await p.flush(); p.run.unmount();
    expect(await failed.retry()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).toHaveBeenCalledTimes(1); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });

  it.each(["TaxAmendmentEntry", "PrimaryDbEntry"])("최초 PolicyFund와 다른 receipt 원본 %s는 확인 실패·PUT 0", async (table) => {
    const prepared = preparedAddress("관측주소", "PolicyFundEntry");
    const observation = committedObservation(prepared);
    const mismatched = { ...observation, source: { ...observation.source,
      identity: { ...observation.source.identity, table },
    } };
    const save = vi.fn<SaveOwnField>(async () => receipt("A", { observation: mismatched }));
    const p = capabilityPanel({ ownDomain: "tax-amendment", supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => true),
      loadAddressEdit: vi.fn(async () => prepared), save });
    await p.flush(); await p.startSave("A"); await p.flush();
    const failed = failedEntry(p);
    expect(failed.kind).toBe("confirmation-needed"); expect(p.field().props.value).toBe("A");
    p.run.unmount(); expect(await failed.retry()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution]);
    expect(save.mock.calls[1][3]).toBe(save.mock.calls[0][3]);
    expect(p.api.loadAddressEdit).toHaveBeenCalledTimes(1);
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled();
  });
});

// review013: 정해진 실제 자식만 기존 Hooks/JSX로 연결한다. 저장·닫힘·토글은 원본 콜백이다.
function nativeChildDom() {
  vi.stubGlobal("window", {
    innerWidth: 1280, innerHeight: 800,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  });
  vi.stubGlobal("document", { body: {}, addEventListener: vi.fn(), removeEventListener: vi.fn() });
}
function attachNativeChildRefs(tree: Element) {
  for (const element of elements(tree)) {
    if (typeof element.type !== "string") continue;
    // React 18/19의 ref 위치를 읽되 경고용 getter는 호출하지 않는다.
    const ref = Object.getOwnPropertyDescriptor(element.props, "ref")?.value
      ?? Object.getOwnPropertyDescriptor(element, "ref")?.value;
    if (ref && typeof ref === "object" && "current" in ref) {
      ref.current = {
        focus: vi.fn(), select: vi.fn(), contains: () => false,
        getBoundingClientRect: () => ({ top: 100, bottom: 130, left: 100, right: 340, width: 240, height: 30 }),
      };
    }
  }
}
function nativeOptionButton(tree: Element, option: string) {
  const button = elements(tree).find((element): element is Element<{ onClick: () => void }> =>
    element.type === "button" && typeof element.props.onClick === "function"
    && elements(element).some((child) => child.type === "span" && child.props.children === option));
  expect(button, `실제 자식의 ${option} 선택 단추`).toBeDefined();
  return button!;
}

describe("review013 실제 자식 콜백 회귀 — 제품 수정 전 RED", () => {
  afterEach(() => { Object.assign(indexModule, { TextEditor }); });

  it("정적 ERP tax의 FreeSubsidy wire52는 실제 businessAddress receipt로 한 번 성공·조건부 정리·PUT 0", async () => {
    const prepared = preparedAddress("관측주소", "FreeSubsidyEntry");
    const committed = committedObservation(prepared);
    const save = vi.fn<SaveOwnField>(async () => receipt("A", {
      sourceFieldKey: "businessAddress", observation: committed,
    }));
    const p = capabilityPanel({ ownDomain: "tax-amendment", supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => true),
      loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    await p.flush(); await p.startSave("A"); await p.flush();
    expect(committed.generation).toBe(prepared.editContext.observation.generation);
    expect(committed.source.token).not.toEqual(prepared.editContext.observation.source.token);
    expect(committed.canonical.token).not.toEqual(prepared.editContext.observation.canonical.token);
    expect(p.run.props.ownDomain).toBe("tax-amendment");
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    expect(p.api.loadAddressEdit).toHaveBeenCalledWith("entry-a", addressKey, company);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution);
    expect(p.onSaved).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(`test:entry-a:${addressKey}`, expect.any(String));
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.cache()?.fields.사업장주소지.value).toBe("A");
  });

  it("실제 TextEditor의 Escape 다음 blur는 변경 draft도 쓰기·확인·실패 보고 0", async () => {
    Object.assign(indexModule, { TextEditor: NativeTextEditor });
    const p = capabilityPanel(); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const emitted = elements(editor.run.tree).find((element) => element.type === NativeTextEditor) as Element<TextChildProps> | undefined;
    expect(emitted).toBeDefined();
    const child = new Hooks(NativeTextEditor, emitted!.props); mounted.push(child); child.render(attachNativeChildRefs);
    type InputProps = { value: string; onChange: (event: { target: { value: string } }) => void;
      onKeyDown: (event: { key: string; preventDefault: () => void }) => void; onBlur: () => void };
    const input = () => elements(child.tree).find((element) => element.type === "input") as Element<InputProps>;
    expect(input().props.value).toBe("관측주소");
    input().props.onChange({ target: { value: "취소할주소" } }); child.render(attachNativeChildRefs);
    const callbacks = input().props;
    callbacks.onKeyDown({ key: "Escape", preventDefault: vi.fn() });
    callbacks.onBlur(); // 자식 제거로 이어지는 blur도 부모 render 전 같은 콜백으로 전달한다.
    await editor.pending(); await editor.flush(); await p.flush();
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(editor.confirmation()).toBeUndefined(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("설치된 select의 한 클릭 안 onSave→onClose 뒤 확인도 최초 값·관측으로 한 번 저장", async () => {
    nativeChildDom();
    const prepared = preparedAddress();
    const p = capabilityPanel(); await p.flush();
    const props = p.field().props;
    const col: ColumnDef = { ...props.col, type: "select", options: ["A", "B"] };
    const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
    const emitted = elements(editor.run.tree).find((element) => typeof element.type === "function" && element.type.name === "SelectEditor") as Element<SelectChildProps> | undefined;
    expect(emitted).toBeDefined();
    const select = new Hooks(emitted!.type as Component<SelectChildProps>, emitted!.props); mounted.push(select);
    select.render(attachNativeChildRefs); if (select.dirty) select.render(attachNativeChildRefs);
    const wrapper = elements(select.tree).find((element) => typeof element.type === "function" && element.type.name === "ErpSelectDropdownBody") as Element<SelectChildProps> | undefined;
    expect(wrapper).toBeDefined();
    const erp = new Hooks(wrapper!.type as Component<SelectChildProps>, wrapper!.props); mounted.push(erp); erp.render();
    const body = elements(erp.tree).find((element) => element.type === NativeSelectDropdownBody) as Element<SelectDropdownBodyProps> | undefined;
    expect(body).toBeDefined();
    const dropdown = new Hooks(NativeSelectDropdownBody, body!.props); mounted.push(dropdown); dropdown.render(attachNativeChildRefs);
    nativeOptionButton(dropdown.tree, "A").props.onClick(); // 실제 원본이 같은 stack에서 저장 후 닫는다.
    editor.run.render();
    expect(editor.confirmation()?.props.oldVal).toBe(prepared.value);
    expect(editor.confirmation()?.props.newVal).toBe("A"); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    const latestUpdate = vi.fn(async () => {});
    editor.rerender({ ...p.field().props, col, value: "확인중최신주소", onUpdate: latestUpdate });
    expect(editor.confirmation()?.props.oldVal).toBe(prepared.value);
    editor.confirm(); await editor.pending(); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution);
    expect(latestUpdate).not.toHaveBeenCalled(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.onSaved).toHaveBeenCalledOnce();
  });

  it("실제 MultiSelect 첫 토글은 최초 관측으로 즉시 저장·열림 유지, 응답 전 두 번째 선택도 둘 다 표시", async () => {
    nativeChildDom();
    const prepared = preparedAddress("기존");
    const committed = committedObservation(prepared);
    const first = deferred<ReturnType<typeof receipt>>();
    const nextCommitted: AddressObservation = { ...committed,
      source: { ...committed.source, token: { kind: "revision", uuid: "77777777-7777-4777-8777-777777777777" } },
      canonical: { ...committed.canonical, token: { kind: "revision", uuid: "88888888-8888-4888-8888-888888888888" } },
    };
    const save = vi.fn<SaveOwnField>(async (_id, _key, value) => receipt(String(value ?? ""), { observation: nextCommitted }))
      .mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const props = p.field().props;
    const col: ColumnDef = { ...props.col, type: "multi_select", options: ["기존", "A", "B"] };
    const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
    const emitted = () => elements(editor.run.tree).find((element) => typeof element.type === "function" && element.type.name === "MultiSelectEditor") as Element<SelectChildProps> | undefined;
    expect(emitted()).toBeDefined();
    const child = new Hooks(emitted()!.type as Component<SelectChildProps>, emitted()!.props); mounted.push(child);
    child.render(attachNativeChildRefs); if (child.dirty) child.render(attachNativeChildRefs);
    const syncChild = async () => {
      await p.flush(); editor.rerender({ ...p.field().props, col });
      expect(emitted(), "즉시 토글 저장 뒤 실제 다중 선택창을 계속 열어 둔다").toBeDefined();
      child.props = emitted()!.props; child.render(attachNativeChildRefs);
    };
    try {
      nativeOptionButton(child.tree, "A").props.onClick(); await syncChild();
      const firstShowsA = elements(nativeOptionButton(child.tree, "A")).some((element) => element.type === "svg");
      nativeOptionButton(child.tree, "B").props.onClick(); await syncChild(); // 첫 요청은 아직 응답하지 않았다.
      expect(save).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledWith("entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution);
      expect(firstShowsA).toBe(true); expect(child.props.value).toBe("기존, A, B");
      expect(elements(nativeOptionButton(child.tree, "A")).some((element) => element.type === "svg")).toBe(true);
      expect(elements(nativeOptionButton(child.tree, "B")).some((element) => element.type === "svg")).toBe(true);
      expect(editor.confirmation()).toBeUndefined(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
      expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    } finally {
      first.resolve(receipt("기존, A", { observation: committed })); await editor.flush(); await p.flush();
    }
  });
});


// 같은 실제 자식/설치 본문/고정 dependency를 재사용한다. 별도 평가기나 실행기는 만들지 않는다.
type ActualCallbackEditor = ReturnType<typeof actualEditor>;
type ActualPanel = ReturnType<typeof capabilityPanel>;
type NativeInputProps = {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
  onBlur: () => void;
};
function actualTextChild(editor: ActualCallbackEditor) {
  const emitted = elements(editor.run.tree).find((element) => element.type === NativeTextEditor) as Element<TextChildProps> | undefined;
  expect(emitted).toBeDefined();
  const child = new Hooks(NativeTextEditor, emitted!.props); mounted.push(child);
  child.render(attachNativeChildRefs);
  const input = () => elements(child.tree).find((element) => element.type === "input") as Element<NativeInputProps>;
  const change = (value: string) => {
    input().props.onChange({ target: { value } }); child.render(attachNativeChildRefs);
  };
  return { child, input, change };
}
function installedSelectDropdownBody(editor: ActualCallbackEditor) {
  const emitted = elements(editor.run.tree).find((element) => typeof element.type === "function" && element.type.name === "SelectEditor") as Element<SelectChildProps> | undefined;
  expect(emitted).toBeDefined();
  const select = new Hooks(emitted!.type as Component<SelectChildProps>, emitted!.props); mounted.push(select);
  select.render(attachNativeChildRefs); if (select.dirty) select.render(attachNativeChildRefs);
  const wrapper = elements(select.tree).find((element) => typeof element.type === "function" && element.type.name === "ErpSelectDropdownBody") as Element<SelectChildProps> | undefined;
  expect(wrapper).toBeDefined();
  const erp = new Hooks(wrapper!.type as Component<SelectChildProps>, wrapper!.props); mounted.push(erp); erp.render();
  const emittedBody = elements(erp.tree).find((element) => element.type === NativeSelectDropdownBody) as Element<SelectDropdownBodyProps> | undefined;
  expect(emittedBody).toBeDefined();
  const body = new Hooks(NativeSelectDropdownBody, emittedBody!.props); mounted.push(body); body.render(attachNativeChildRefs);
  return body;
}
type MultiChildProps = SelectChildProps & { retainDraft?: boolean };
async function actualMultiSelectEditor(p: ActualPanel) {
  nativeChildDom();
  const props = p.field().props;
  const col: ColumnDef = { ...props.col, type: "multi_select", options: ["기존", "A", "B", "C"] };
  const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
  const emitted = () => elements(editor.run.tree).find((element) => typeof element.type === "function" && element.type.name === "MultiSelectEditor") as Element<MultiChildProps> | undefined;
  expect(emitted()).toBeDefined();
  const child = new Hooks(emitted()!.type as Component<MultiChildProps>, emitted()!.props); mounted.push(child);
  child.render(attachNativeChildRefs); if (child.dirty) child.render(attachNativeChildRefs);
  const refresh = () => {
    editor.rerender({ ...p.field().props, col });
    expect(emitted(), "토글 뒤 열린 실제 다중 선택 입력기").toBeDefined();
    child.props = emitted()!.props; child.render(attachNativeChildRefs);
  };
  const flush = async () => { await editor.flush(); await p.flush(); refresh(); };
  const selected = (option: string) => elements(nativeOptionButton(child.tree, option)).some((element) => element.type === "svg");
  return { editor, child, col, emitted, refresh, flush, selected,
    toggle: (option: string) => nativeOptionButton(child.tree, option).props.onClick() };
}
function serialObservation(base: AddressObservation, sourceUuid: string, canonicalUuid: string): AddressObservation {
  return { ...base,
    source: { ...base.source, token: { kind: "revision", uuid: sourceUuid } },
    canonical: { ...base.canonical, token: { kind: "revision", uuid: canonicalUuid } },
  };
}
const secondSourceRevision = "77777777-7777-4777-8777-777777777777";
const secondCanonicalRevision = "88888888-8888-4888-8888-888888888888";
const thirdSourceRevision = "99999999-9999-4999-8999-999999999999";
const thirdCanonicalRevision = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("review013 실제 입력 lifecycle 추가 회귀", () => {
  afterEach(() => { Object.assign(indexModule, { TextEditor }); });

  it("실제 같은 값 Enter 다음 blur도 최초 관측의 주소 CAS는 한 번이고 확인창은 없음", async () => {
    Object.assign(indexModule, { TextEditor: NativeTextEditor });
    const p = capabilityPanel(); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const child = actualTextChild(editor);
    const callbacks = child.input().props;
    callbacks.onKeyDown({ key: "Enter", preventDefault: vi.fn() }); callbacks.onBlur();
    await editor.pending(); await editor.flush(); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "관측주소", preparedAddress().editContext, frozenAddressExecution);
    expect(editor.confirmation()).toBeUndefined(); expect(p.onSaved).toHaveBeenCalledOnce();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });

  it.each(["Enter+blur", "blur"] as const)("실제 변경 입력 %s는 최초 callback·값으로 확인 한 번 후 저장", async (trigger) => {
    Object.assign(indexModule, { TextEditor: NativeTextEditor });
    const p = capabilityPanel(); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const child = actualTextChild(editor); child.change("A");
    const callbacks = child.input().props;
    const latestUpdate = vi.fn(async () => {});
    editor.rerender({ ...p.field().props, value: "최신부모", onUpdate: latestUpdate });
    if (trigger === "Enter+blur") callbacks.onKeyDown({ key: "Enter", preventDefault: vi.fn() });
    callbacks.onBlur(); await editor.flush();
    const confirmation = editor.confirmation()!.props;
    expect(confirmation.oldVal).toBe("관측주소"); expect(confirmation.newVal).toBe("A");
    expect(p.api.saveOwnField).not.toHaveBeenCalled();
    confirmation.onConfirm(); confirmation.onConfirm(); await editor.pending(); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution);
    expect(latestUpdate).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });

  it("실제 Escape·blur 취소 뒤 재개방은 새 관측을 준비하고 이전 callback은 저장하지 않음", async () => {
    Object.assign(indexModule, { TextEditor: NativeTextEditor });
    const next = preparedAddress("재개방주소");
    const load = vi.fn<LoadAddressEdit>().mockResolvedValueOnce(preparedAddress()).mockResolvedValueOnce(next);
    const p = capabilityPanel({ loadAddressEdit: load, save: vi.fn<SaveOwnField>(async () => receipt("B", { observation: committedObservation(next) })) });
    await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const first = actualTextChild(editor); first.change("취소A");
    const stale = first.input().props;
    stale.onKeyDown({ key: "Escape", preventDefault: vi.fn() }); stale.onBlur(); await editor.flush(); await p.flush();
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(editor.confirmation()).toBeUndefined();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    editor.rerender(p.field().props); editor.open(); await editor.flush(); await p.flush();
    const reopened = actualTextChild(editor); expect(reopened.input().props.value).toBe("재개방주소");
    stale.onKeyDown({ key: "Enter", preventDefault: vi.fn() }); stale.onBlur();
    expect(p.api.saveOwnField).not.toHaveBeenCalled();
    reopened.change("B"); reopened.input().props.onBlur(); await editor.flush();
    expect(editor.confirmation()?.props.oldVal).toBe("재개방주소");
    editor.confirm(); await editor.pending(); await p.flush();
    expect(load).toHaveBeenCalledTimes(2); expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "B", next.editContext, frozenAddressExecution);
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("미설정 실제 TextEditor는 Enter·blur·Escape의 기존 최신 onSave(value) 동작 유지", () => {
    const originalSave = vi.fn(); const latestSave = vi.fn();
    const child = new Hooks(NativeTextEditor, { value: "최초", onSave: originalSave }); mounted.push(child);
    child.render(attachNativeChildRefs);
    const input = () => elements(child.tree).find((element) => element.type === "input") as Element<NativeInputProps>;
    input().props.onChange({ target: { value: "입력" } }); child.render(attachNativeChildRefs);
    child.props = { value: "최신", onSave: latestSave }; child.render(attachNativeChildRefs);
    input().props.onKeyDown({ key: "Enter", preventDefault: vi.fn() }); input().props.onBlur();
    input().props.onKeyDown({ key: "Escape", preventDefault: vi.fn() });
    expect(originalSave).not.toHaveBeenCalled(); expect(latestSave.mock.calls).toEqual([["입력"], ["입력"], ["최신"]]);
    expect(input().props.value).toBe("입력");
  });

  it.each(["확인취소", "선택전Escape"] as const)("설치된 선택 본문의 %s는 주소 전송·실패 보고 0", async (action) => {
    nativeChildDom(); const p = capabilityPanel(); await p.flush();
    const props = p.field().props; const col: ColumnDef = { ...props.col, type: "select", options: ["A", "B"] };
    const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
    const body = installedSelectDropdownBody(editor);
    if (action === "확인취소") {
      nativeOptionButton(body.tree, "A").props.onClick(); await editor.flush();
      const confirmation = editor.confirmation()!.props;
      expect(confirmation.oldVal).toBe("관측주소"); confirmation.onCancel(); confirmation.onConfirm();
    } else {
      const input = elements(body.tree).find((element) => element.type === "input") as Element<{ onKeyDown: (event: { key: string }) => void }>;
      input.props.onKeyDown({ key: "Escape" });
    }
    await editor.flush(); await p.flush();
    expect(editor.confirmation()).toBeUndefined(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
  });

  it.each(["회사", "source"] as const)("설치된 선택 뒤 확인 대기의 %s 교체는 오래된 확인 callback 저장 0", async (change) => {
    nativeChildDom(); const p = capabilityPanel(); await p.flush();
    const props = p.field().props; const col: ColumnDef = { ...props.col, type: "select", options: ["A"] };
    const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
    const body = installedSelectDropdownBody(editor); nativeOptionButton(body.tree, "A").props.onClick(); await editor.flush();
    const stale = editor.confirmation()!.props;
    expect(stale.oldVal).toBe("관측주소"); expect(stale.newVal).toBe("A");
    if (change === "회사") replaceRow(p, { "15사업자번호": "9999999999" });
    else { p.run.props = { ...p.run.props, saveOwnField: vi.fn<SaveOwnField>() }; p.run.render(); }
    await p.flush(); editor.rerender({ ...p.field().props, col }); await editor.flush(); stale.onConfirm();
    expect(editor.confirmation()).toBeUndefined(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled();
  });

  it("실제 세 토글은 즉시 모두 표시하고 자기 receipt의 서로 다른 source/canonical 버전만 직렬 연결", async () => {
    const prepared = preparedAddress("기존", "FreeSubsidyEntry");
    const firstObservation = committedObservation(prepared);
    const secondObservation = serialObservation(firstObservation, secondSourceRevision, secondCanonicalRevision);
    const thirdObservation = serialObservation(secondObservation, thirdSourceRevision, thirdCanonicalRevision);
    const first = deferred<ReturnType<typeof receipt>>(); const second = deferred<ReturnType<typeof receipt>>();
    const third = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save,
      ownDomain: "tax-amendment", supportsAddressEdit: vi.fn<SupportsAddressEdit>(() => true) });
    await p.flush(); const multi = await actualMultiSelectEditor(p);
    const a = nativeOptionButton(multi.child.tree, "A").props.onClick;
    const b = nativeOptionButton(multi.child.tree, "B").props.onClick;
    a(); b(); // 부모·자식 어느 쪽도 렌더하기 전 실제 두 callback.
    multi.child.render(attachNativeChildRefs);
    expect(multi.selected("A")).toBe(true); expect(multi.selected("B")).toBe(true);
    await multi.flush(); expect(multi.child.props.value).toBe("기존, A, B");
    expect(save).toHaveBeenCalledOnce(); expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    multi.toggle("C"); await multi.flush(); expect(multi.child.props.value).toBe("기존, A, B, C");
    expect(multi.selected("C")).toBe(true); expect(save).toHaveBeenCalledOnce();
    const latestUpdate = vi.fn(async () => {});
    multi.editor.rerender({ ...p.field().props, col: multi.col, value: "최신부모주소", onUpdate: latestUpdate });
    expect(multi.emitted()?.props.value).toBe("기존, A, B, C");
    first.resolve(receipt("기존, A", { sourceFieldKey: "businessAddress", observation: firstObservation })); await multi.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A, B", { ...prepared.editContext, observation: firstObservation }, frozenAddressExecution]);
    expect(multi.child.props.value).toBe("기존, A, B, C"); expect(p.field().props.value).toBe("기존, A, B, C");
    const secondContext = save.mock.calls[1][3]!;
    expect(secondContext.sourceFieldKey).toBe(addressKey); expect(secondContext.observation.source.identity.table).toBe("FreeSubsidyEntry");
    expect(secondContext.observation.source.token).not.toEqual(secondContext.observation.canonical.token);
    expect(secondContext).not.toBe(prepared.editContext); expect(Object.isFrozen(secondContext)).toBe(true);
    expect(Object.isFrozen(secondContext.observation.source.token)).toBe(true);
    second.resolve(receipt("기존, A, B", { sourceFieldKey: "businessAddress", observation: secondObservation })); await multi.flush();
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]).toEqual(["entry-a", addressKey, "기존, A, B, C", { ...prepared.editContext, observation: secondObservation }, frozenAddressExecution]);
    expect(save.mock.calls[0][3]).toEqual(prepared.editContext); expect(save.mock.calls[1][3]).toBe(secondContext);
    third.resolve(receipt("기존, A, B, C", { sourceFieldKey: "businessAddress", observation: thirdObservation }));
    await multi.editor.pending(); await multi.flush();
    expect(save).toHaveBeenCalledTimes(3); expect(p.cache()?.fields.사업장주소지.value).toBe("기존, A, B, C");
    expect(multi.emitted()).toBeDefined(); expect(multi.editor.confirmation()).toBeUndefined(); expect(p.onSaved).toHaveBeenCalledOnce();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(latestUpdate).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
  });

  it.each(["transient", "response-loss", "403", "null", "boolean", "ready", "source", "source-id", "company", "canonical", "generation", "value", "token", "wire-key", "inherited"] as const)(
    "실제 토글 A의 %s는 대기 B/C 전송을 멈추고 최신 입력을 보존", async (failure) => {
      const prepared = preparedAddress("기존"); const observation = committedObservation(prepared);
      const first = deferred<unknown>();
      const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.toggle("A"); multi.toggle("B"); multi.toggle("C"); await multi.flush();
      expect(save).toHaveBeenCalledOnce(); expect(multi.child.props.value).toBe("기존, A, B, C");
      let result: unknown = receipt("기존, A", { observation });
      if (failure === "null") result = null;
      else if (failure === "boolean") result = true;
      else if (failure === "ready") result = { value: "기존, A", editContext: { ...prepared.editContext, observation } };
      else if (failure === "source") result = receipt("기존, A", { observation: { ...observation, source: { ...observation.source, identity: { ...observation.source.identity, table: "PolicyFundEntry" } } } });
      else if (failure === "source-id") result = receipt("기존, A", { observation: { ...observation, source: { ...observation.source, identity: { ...observation.source.identity, id: "entry-b" } } } });
      else if (failure === "company") result = receipt("기존, A", { bizno: "9999999999", observation });
      else if (failure === "canonical") result = receipt("기존, A", { observation: { ...observation, canonical: { ...observation.canonical, identity: { kind: "canonical", key: "secstore:9999999999:basic" } } } });
      else if (failure === "generation") result = receipt("기존, A", { observation: { ...observation, generation: thirdSourceRevision } });
      else if (failure === "value") result = receipt("다른주소", { observation });
      else if (failure === "token") result = receipt("기존, A", { observation: { ...observation, canonical: { ...observation.canonical, token: { kind: "revision", uuid: "broken" } } } });
      else if (failure === "wire-key") result = receipt("기존, A", { sourceFieldKey: "custom_address", observation });
      else if (failure === "inherited") result = Object.create(result as object);
      if (failure === "transient" || failure === "response-loss") first.reject(temporary());
      else if (failure === "403") first.reject(Object.assign(new Error("403"), { saveFailureKind: "permanent" }));
      else first.resolve(result);
      await multi.editor.pending(); await multi.flush();
      const failed = failedEntry(p);
      expect(failed.value).toBe("기존, A"); expect(failed.restorable).toBe(false);
      expect(failed.kind).toBe(failure === "transient" || failure === "response-loss" ? "temporary" : failure === "403" ? "permanent" : "confirmation-needed");
      expect(save).toHaveBeenCalledOnce(); expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
      expect(p.field().props.value).toBe("기존, A, B, C"); expect(multi.child.props.value).toBe("기존, A, B, C");
      expect(multi.selected("A")).toBe(true); expect(multi.selected("B")).toBe(true); expect(multi.selected("C")).toBe(true);
      multi.toggle("A"); await multi.editor.pending(); await multi.flush(); // 실패 뒤 새 입력도 버리지 않고 자동 전송은 재개하지 않는다.
      expect(save).toHaveBeenCalledOnce(); expect(p.field().props.value).toBe("기존, B, C");
      expect(multi.child.props.value).toBe("기존, B, C"); expect(multi.selected("A")).toBe(false);
      expect(p.adapter.unsaved.report).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
      expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
      expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.cache()).toBeUndefined();
    },
  );

  it.each(["성공", "실패", "되돌리기"] as const)("실제 A 실패의 %s도 후속 B 입력을 지우거나 자동 전송하지 않음", async (ending) => {
    const prepared = preparedAddress("기존"); const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockReturnValueOnce(waiting.promise);
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
    const failed = failedEntry(p);
    expect(failed.value).toBe("기존, A"); expect(store.get(failed.id)).toBe(failed);
    if (ending === "되돌리기") {
      failed.revert?.(); expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledOnce();
    } else {
      const retry = failed.retry(); expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
      expect(save.mock.calls[1][3]).toBe(save.mock.calls[0][3]);
      if (ending === "성공") waiting.resolve(receipt("기존, A", { observation: committedObservation(prepared) }));
      else waiting.reject(temporary());
      expect(await retry).toBe(ending === "성공"); failed.revert?.();
      expect(save).toHaveBeenCalledTimes(2);
      if (ending === "성공") {
        expect(store.size).toBe(0); expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(failed.id, failed.attemptId);
      } else expect(store.get(failed.id)?.attemptId).toBe(failed.attemptId);
    }
    await multi.flush();
    expect(p.field().props.value).toBe("기존, A, B"); expect(multi.child.props.value).toBe("기존, A, B");
    expect(multi.selected("B")).toBe(true); expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("자기 A 성공 이후 외부 변경으로 B의 CAS409가 나면 B 관측·값은 retry에도 고정하고 C 자동 전송 0", async () => {
    const prepared = preparedAddress("기존"); const ownObservation = committedObservation(prepared);
    const first = deferred<ReturnType<typeof receipt>>();
    const conflict = Object.assign(new Error("409 외부 변경"), { saveFailureKind: "permanent" });
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise).mockRejectedValue(conflict);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); multi.toggle("C"); await multi.flush();
    first.resolve(receipt("기존, A", { observation: ownObservation })); await multi.editor.pending(); await multi.flush();
    expect(save).toHaveBeenCalledTimes(2); const failedB = failedEntry(p);
    expect(failedB.kind).toBe("permanent"); expect(failedB.value).toBe("기존, A, B");
    const contextB = save.mock.calls[1][3]!;
    expect(contextB).toEqual({ ...prepared.editContext, observation: ownObservation });
    expect(await failedB.retry()).toBe(false); await multi.flush();
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[2]).toEqual(["entry-a", addressKey, "기존, A, B", contextB, frozenAddressExecution]);
    expect(save.mock.calls[2][3]).toBe(contextB); expect(p.field().props.value).toBe("기존, A, B, C");
    expect(multi.child.props.value).toBe("기존, A, B, C"); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
  });

  it("상세는 열어 둔 채 실제 다중 입력창만 닫아도 늦은 A가 UI callback을 실행하거나 대기 B를 보내지 않음", async () => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush();
    expect(multi.emitted()).toBeUndefined();
    first.resolve(receipt("기존, A", { observation: committedObservation(prepared) })); await multi.editor.pending(); await p.flush();
    expect(save).toHaveBeenCalledOnce(); expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.field().props.value).toBe("기존, A, B"); expect(p.cache()).toBeUndefined();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
  });

  it("실제 다중 입력창·상세 닫힘 뒤 시작된 A의 성공은 조건부 보관함 정리만 하고 B 자동 전송·UI 갱신 0", async () => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush(); p.run.unmount();
    const state = p.run.values(); const cache = p.cache();
    first.resolve(receipt("기존, A", { observation: committedObservation(prepared) })); await multi.editor.pending();
    expect(save).toHaveBeenCalledOnce(); expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(`test:entry-a:${addressKey}`, expect.any(String));
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.cache()).toBe(cache); expect(p.run.dirty).toBe(false);
    p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(multi.emitted()).toBeUndefined(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("실제 다중 입력 닫힘 뒤 A의 수동 retry는 원래 시도만 저장하고 최신 B와 닫힌 UI는 유지", async () => {
    const prepared = preparedAddress("기존");
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockResolvedValueOnce(receipt("기존, A", { observation: committedObservation(prepared) }));
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
    const failed = failedEntry(p); expect(p.field().props.value).toBe("기존, A, B");
    multi.child.props.onClose(); await multi.editor.flush(); p.run.unmount(); const state = p.run.values();
    expect(await failed.retry()).toBe(true); expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    expect(save.mock.calls[1][3]).toBe(save.mock.calls[0][3]); expect(store.size).toBe(0);
    expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(failed.id, failed.attemptId);
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.run.dirty).toBe(false);
    p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it.each(["성공", "오류"] as const)("실제 다중 입력 A 닫힘 후 다른 소유자 B 실패가 생기면 늦은 A %s는 B 보관함 변경 0", async (ending) => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const saveA = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const a = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save: saveA }); await a.flush();
    const multi = await actualMultiSelectEditor(a); multi.toggle("A"); multi.toggle("B"); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush(); a.run.unmount();
    const b = capabilityPanel({ store, save: vi.fn<SaveOwnField>().mockRejectedValue(temporary()) });
    await b.flush(); await b.startSave("새B"); await b.flush(); const failedB = failedEntry(b);
    if (ending === "성공") first.resolve(receipt("기존, A", { observation: committedObservation(prepared) }));
    else first.reject(temporary());
    await multi.editor.pending();
    expect(saveA).toHaveBeenCalledOnce(); expect(store.get(failedB.id)).toBe(failedB);
    expect(b.field().props.value).toBe("새B"); expect(a.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(a.adapter.unsaved.report).not.toHaveBeenCalled(); expect(a.onSaved).not.toHaveBeenCalled();
    expect(a.api.saveBasicField).not.toHaveBeenCalled(); expect(b.api.saveBasicField).not.toHaveBeenCalled();
  });

  it.each(["회사", "source"] as const)("실제 토글 대기의 %s 교체는 이전 응답으로 후속 토글을 보내지 않음", async (change) => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); await multi.flush();
    const replacement = vi.fn<SaveOwnField>();
    if (change === "회사") replaceRow(p, { "15사업자번호": "9999999999" });
    else { p.run.props = { ...p.run.props, saveOwnField: replacement }; p.run.render(); }
    await p.flush(); multi.editor.rerender({ ...p.field().props, col: multi.col }); await multi.editor.flush();
    first.resolve(receipt("기존, A", { observation: committedObservation(prepared) })); await multi.editor.pending();
    expect(save).toHaveBeenCalledOnce(); expect(replacement).not.toHaveBeenCalled(); expect(multi.emitted()).toBeUndefined();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
  it("설치된 선택의 같은 stack 저장·닫힘 뒤 중복 확인도 최초 capture로 정확히 한 번 저장", async () => {
    nativeChildDom(); const p = capabilityPanel(); await p.flush();
    const props = p.field().props; const col: ColumnDef = { ...props.col, type: "select", options: ["A", "B"] };
    const editor = actualEditor({ ...props, col }); mounted.push(editor.run); editor.open(); await editor.flush();
    const body = installedSelectDropdownBody(editor); nativeOptionButton(body.tree, "A").props.onClick(); await editor.flush();
    const confirmation = editor.confirmation()!.props;
    expect(confirmation.oldVal).toBe("관측주소"); expect(confirmation.newVal).toBe("A");
    editor.rerender({ ...p.field().props, col, value: "최신부모주소", onUpdate: vi.fn() });
    confirmation.onConfirm(); confirmation.onConfirm(); await editor.pending(); await p.flush();
    expect(p.api.saveOwnField).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution);
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.onSaved).toHaveBeenCalledOnce(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
  });

  it("자기 A receipt를 확인한 직후 보관함이 다른 시도로 교체돼도 대기 B는 전송·조건부 삭제 0", async () => {
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const other = capabilityPanel({ store, save: vi.fn<SaveOwnField>().mockRejectedValue(temporary()) });
    await other.flush(); await other.startSave("다른입력"); await other.flush();
    const replacement = failedEntry(other); store.clear();
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save }); await p.flush();
    const conditionalResolve = p.adapter.unsaved.resolve.getMockImplementation()!;
    p.adapter.unsaved.resolve.mockImplementation((id, expectedAttemptId) => {
      conditionalResolve(id, expectedAttemptId); store.set(replacement.id, replacement);
    });
    const multi = await actualMultiSelectEditor(p); multi.toggle("A"); multi.toggle("B"); await multi.flush();
    first.resolve(receipt("기존, A", { observation: committedObservation(prepared) })); await multi.editor.pending(); await multi.flush();
    expect(save).toHaveBeenCalledOnce(); expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(store.get(replacement.id)).toBe(replacement);
    expect(p.field().props.value).toBe("기존, A, B"); expect(multi.child.props.value).toBe("기존, A, B");
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
  });

});

describe("review3dec 실제 다중 선택 콜백 추가 회귀", () => {
  it("A 실패 뒤 같은 상세에서 입력창을 닫고 다시 열어도 미전송 B와 원래 A retry를 보존", async () => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(receipt("기존, A", { observation: committedObservation(prepared) }));
    const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
    const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.flush();
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    const originalContext = save.mock.calls[0][3]!;
    first.reject(temporary()); await multi.editor.pending(); await multi.flush();
    const failed = failedEntry(p); const attemptId = failed.attemptId;
    expect(failed.value).toBe("기존, A"); expect(store.get(failed.id)).toBe(failed);
    expect(p.field().props.value).toBe("기존, A, B");
    expect(multi.child.props.value).toBe("기존, A, B"); expect(multi.selected("B")).toBe(true);

    multi.child.props.onClose(); await multi.editor.flush(); multi.child.unmount(); await p.flush();
    expect(multi.emitted()).toBeUndefined();
    multi.editor.rerender({ ...p.field().props, col: multi.col });
    multi.editor.open(); await multi.editor.flush(); await p.flush();
    const emitted = multi.emitted(); expect(emitted, "실제 재개방 경로가 새 자식을 출력").toBeDefined();
    const reopened = new Hooks(emitted!.type as Component<MultiChildProps>, emitted!.props); mounted.push(reopened);
    reopened.render(attachNativeChildRefs); if (reopened.dirty) reopened.render(attachNativeChildRefs);
    expect.soft(reopened.props.value).toBe("기존, A, B");
    expect.soft(elements(nativeOptionButton(reopened.tree, "B")).some((element) => element.type === "svg")).toBe(true);
    expect.soft(p.field().props.value).toBe("기존, A, B");
    expect.soft(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    expect.soft(p.api.loadBasicStore).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(store.get(failed.id)).toBe(failed);

    expect.soft(await failed.retry()).toBe(true); await multi.editor.flush(); await p.flush();
    expect.soft(save).toHaveBeenCalledTimes(2);
    expect.soft(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    expect.soft(save.mock.calls[1]?.[3]).toBe(originalContext);
    expect(failed.value).toBe("기존, A"); expect(failed.attemptId).toBe(attemptId);
    expect(save.mock.calls[0][3]).toBe(originalContext); expect(originalContext).toEqual(prepared.editContext);
    expect(Object.isFrozen(originalContext)).toBe(true);
    multi.editor.rerender({ ...p.field().props, col: multi.col });
    reopened.props = multi.emitted()!.props; reopened.render(attachNativeChildRefs);
    expect.soft(reopened.props.value).toBe("기존, A, B");
    expect.soft(elements(nativeOptionButton(reopened.tree, "B")).some((element) => element.type === "svg")).toBe(true);
    expect.soft(p.field().props.value).toBe("기존, A, B");
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("실제 관리자 메뉴에서 선택 A를 삭제한 성공 receipt 뒤 B를 토글하면 A를 되살리지 않음", async () => {
    const prepared = preparedAddress("기존, A"); const firstObservation = committedObservation(prepared);
    const nextObservation = serialObservation(firstObservation, secondSourceRevision, secondCanonicalRevision);
    const first = deferred<ReturnType<typeof receipt>>(); const second = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const removeCustomOption = vi.fn(); Object.assign(optionBundle, { removeCustomOption });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.editor.rerender({ ...p.field().props, col: multi.col, isAdmin: true });
      multi.child.props = multi.emitted()!.props; multi.child.render(attachNativeChildRefs);
      expect(multi.child.props.canDelete).toBe(true); expect(multi.selected("A")).toBe(true);
      const optionRow = () => elements(multi.child.tree).find((element) => element.type === "div"
        && element.props.className === "relative"
        && elements(element).some((child) => child.type === "span" && child.props.children === "A"))!;
      const menu = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "색상 변경") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      menu.props.onClick({ stopPropagation: vi.fn() }); multi.child.render(attachNativeChildRefs);
      expect(save).not.toHaveBeenCalled();
      const deletion = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "옵션 삭제") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      deletion.props.onClick({ stopPropagation: vi.fn() }); await multi.flush();
      expect(removeCustomOption).toHaveBeenCalledWith(addressKey, "A");
      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "기존", prepared.editContext, frozenAddressExecution]);
      first.resolve(receipt("기존", { observation: firstObservation })); await multi.editor.pending(); await multi.flush();
      expect(p.cache()?.fields.사업장주소지.value).toBe("기존");
      expect(p.adapter.unsaved.report).not.toHaveBeenCalled();

      multi.toggle("B"); await multi.flush();
      expect.soft(multi.child.props.value).toBe("기존, B");
      expect.soft(p.field().props.value).toBe("기존, B"); expect(multi.selected("B")).toBe(true);
      expect(elements(multi.child.tree).some((element) => element.type === "span" && element.props.children === "A")).toBe(false);
      expect(save).toHaveBeenCalledTimes(2);
      expect.soft(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, B", { ...prepared.editContext, observation: firstObservation }, frozenAddressExecution]);
      expect(save.mock.calls[0][3]).toEqual(prepared.editContext);
      expect(save.mock.calls[1][3]?.observation.source.token).not.toEqual(save.mock.calls[1][3]?.observation.canonical.token);
      second.resolve(receipt("기존, B", { observation: nextObservation })); await multi.editor.pending(); await multi.flush();
      expect(multi.emitted()).toBeDefined(); expect(multi.editor.confirmation()).toBeUndefined();
      expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    } finally {
      first.resolve(receipt("기존", { observation: firstObservation }));
      second.resolve(receipt("기존, B", { observation: nextObservation }));
      Reflect.deleteProperty(optionBundle, "removeCustomOption");
    }
  });
});

describe("review3dec 닫힘 초안과 옵션 삭제 경계 회귀", () => {
  it.each(["응답 유실", "잘못된 응답", "retry 재실패", "revert"] as const)(
    "%s 뒤 반복 재개방은 B·원래 A를 유지하고 닫힌 입력 콜백은 새 입력을 건드리지 않음", async (ending) => {
      const prepared = preparedAddress("기존");
      const save = vi.fn<SaveOwnField>()
        .mockImplementationOnce(async () => { if (ending === "잘못된 응답") return receipt("다른값"); throw temporary(); })
        .mockImplementationOnce(async () => {
          if (ending === "retry 재실패") throw temporary();
          return receipt("기존, A", { observation: committedObservation(prepared) });
        }).mockRejectedValueOnce(temporary()); // 명시 C는 실제 전송 후 실패한 입력으로 남긴다.
      const store = new Map<string, Parameters<UnsavedBridge["report"]>[0]>();
      const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
      const failed = failedEntry(p); const originalContext = save.mock.calls[0][3];
      expect(failed.value).toBe("기존, A"); expect(failed.restorable).toBe(false);
      expect(failed.kind).toBe(ending === "잘못된 응답" ? "confirmation-needed" : "temporary");
      let child = multi.child;
      for (let cycle = 0; cycle < 2; cycle++) {
        const closedCallbacks = child.props;
        closedCallbacks.onClose(); await multi.editor.flush(); child.unmount(); await p.flush();
        expect(multi.emitted()).toBeUndefined();
        multi.editor.rerender({ ...p.field().props, col: multi.col }); multi.editor.open(); await multi.editor.flush();
        const emitted = multi.emitted(); expect(emitted).toBeDefined();
        child = new Hooks(emitted!.type as Component<MultiChildProps>, emitted!.props); mounted.push(child);
        child.render(attachNativeChildRefs); if (child.dirty) child.render(attachNativeChildRefs);
        closedCallbacks.onSave("늦은입력"); closedCallbacks.onClose(); await multi.editor.flush(); await p.flush();
        expect(multi.emitted()).toBeDefined(); expect(child.props.value).toBe("기존, A, B");
        expect(elements(nativeOptionButton(child.tree, "B")).some((element) => element.type === "svg")).toBe(true);
        expect(p.field().props.value).toBe("기존, A, B"); expect(store.get(failed.id)).toBe(failed);
        expect(save).toHaveBeenCalledOnce(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
        expect(p.api.loadBasicStore).toHaveBeenCalledOnce();
      }
      if (ending === "revert") {
        failed.revert?.(); expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledOnce();
      } else {
        expect(await failed.retry()).toBe(ending !== "retry 재실패");
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
        expect(save.mock.calls[1][3]).toBe(originalContext); expect(Object.isFrozen(originalContext)).toBe(true);
        if (ending !== "retry 재실패") {
          expect(store.size).toBe(0); expect(p.adapter.unsaved.resolve).toHaveBeenCalledWith(failed.id, failed.attemptId);
        } else expect(store.get(failed.id)?.attemptId).toBe(failed.attemptId);
        failed.revert?.();
      }
      await p.flush(); multi.editor.rerender({ ...p.field().props, col: multi.col });
      child.props = multi.emitted()!.props; child.render(attachNativeChildRefs);
      expect(child.props.value).toBe("기존, A, B"); expect(p.field().props.value).toBe("기존, A, B");
      const calls = save.mock.calls.length;
      nativeOptionButton(child.tree, "C").props.onClick(); await multi.editor.pending(); await p.flush();
      multi.editor.rerender({ ...p.field().props, col: multi.col });
      child.props = multi.emitted()!.props; child.render(attachNativeChildRefs);
      expect(child.props.value).toBe("기존, A, B, C"); expect(p.field().props.value).toBe("기존, A, B, C");
      const verifiedRetry = ending === "응답 유실" || ending === "잘못된 응답";
      // review94440: 검증된 자기 A 성공 뒤 다음 명시 C는 A의 관측으로 전송한다.
      expect(save).toHaveBeenCalledTimes(calls + (verifiedRetry ? 1 : 0)); expect(failed.value).toBe("기존, A");
      if (verifiedRetry) {
        expect(save.mock.calls[2]).toEqual(["entry-a", addressKey, "기존, A, B, C", { ...prepared.editContext, observation: committedObservation(prepared) }, frozenAddressExecution]);
        expect(store.get(failed.id)?.value).toBe("기존, A, B, C");
        expect(store.get(failed.id)?.attemptId).not.toBe(failed.attemptId);
      }
      expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
      expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.loadBasicStore).toHaveBeenCalledOnce();
    },
  );

  it.each(["성공", "응답 유실", "잘못된 응답"] as const)("재개방 뒤 늦은 A %s도 B를 보내거나 열린 입력을 덮지 않음", async (ending) => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush(); multi.child.unmount(); await p.flush();
    multi.editor.rerender({ ...p.field().props, col: multi.col }); multi.editor.open(); await multi.editor.flush(); await p.flush();
    const emitted = multi.emitted(); expect(emitted?.props.value).toBe("기존, A, B");
    const child = new Hooks(emitted!.type as Component<MultiChildProps>, emitted!.props); mounted.push(child);
    child.render(attachNativeChildRefs); if (child.dirty) child.render(attachNativeChildRefs);
    const state = p.run.values();
    if (ending === "응답 유실") first.reject(temporary());
    else first.resolve(receipt(ending === "잘못된 응답" ? "다른값" : "기존, A", { observation: committedObservation(prepared) }));
    await multi.editor.pending();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(multi.editor.run.dirty).toBe(false); expect(child.props.value).toBe("기존, A, B");
    expect(p.field().props.value).toBe("기존, A, B"); expect(save).toHaveBeenCalledOnce();
    if (ending !== "성공") expect(failedEntry(p).value).toBe("기존, A");
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.loadBasicStore).toHaveBeenCalledOnce();
  });

  it.each(["행", "회사", "source"] as const)("초안을 재개방한 뒤 %s 교체는 입력을 닫고 늦은 A와 이전 콜백을 차단", async (change) => {
    const prepared = preparedAddress("기존"); const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush(); multi.child.unmount(); await p.flush();
    multi.editor.rerender({ ...p.field().props, col: multi.col }); multi.editor.open(); await multi.editor.flush();
    const callbacks = multi.emitted()!.props; expect(callbacks.value).toBe("기존, A, B");
    const replacement = vi.fn<SaveOwnField>();
    if (change === "행") replaceRow(p, { _id: "entry-b", [addressKey]: "새소유자주소" });
    else if (change === "회사") replaceRow(p, { "15사업자번호": "9999999999", [addressKey]: "새회사주소" });
    else { p.run.props = { ...p.run.props, saveOwnField: replacement }; p.run.render(); }
    await p.flush(); multi.editor.rerender({ ...p.field().props, col: multi.col }); await multi.editor.flush();
    expect(multi.emitted()).toBeUndefined(); const value = p.field().props.value;
    first.resolve(receipt("기존, A", { observation: committedObservation(prepared) })); await multi.editor.pending();
    callbacks.onSave("늦은입력"); callbacks.onClose(); await multi.editor.flush(); await p.flush();
    expect(multi.emitted()).toBeUndefined(); expect(p.field().props.value).toBe(value);
    expect(save).toHaveBeenCalledOnce(); expect(replacement).not.toHaveBeenCalled();
    expect(save.mock.calls[0]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("같은 stack의 C 선택·A 삭제·B 선택은 최신 초안에서 삭제하고 자기 receipt로만 직렬 저장", async () => {
    const prepared = preparedAddress("기존, A"); const firstObservation = committedObservation(prepared);
    const secondObservation = serialObservation(firstObservation, secondSourceRevision, secondCanonicalRevision);
    const thirdObservation = serialObservation(secondObservation, thirdSourceRevision, thirdCanonicalRevision);
    const first = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(receipt("기존, C", { observation: secondObservation }))
      .mockResolvedValueOnce(receipt("기존, C, B", { observation: thirdObservation }));
    const removeCustomOption = vi.fn(); Object.assign(optionBundle, { removeCustomOption });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.editor.rerender({ ...p.field().props, col: multi.col, isAdmin: true });
      multi.child.props = multi.emitted()!.props; multi.child.render(attachNativeChildRefs);
      const optionRow = () => elements(multi.child.tree).find((element) => element.type === "div" && element.props.className === "relative"
        && elements(element).some((child) => child.type === "span" && child.props.children === "A"))!;
      const menu = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "색상 변경") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      menu.props.onClick({ stopPropagation: vi.fn() }); multi.child.render(attachNativeChildRefs);
      const deletion = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "옵션 삭제") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      nativeOptionButton(multi.child.tree, "C").props.onClick(); deletion.props.onClick({ stopPropagation: vi.fn() });
      nativeOptionButton(multi.child.tree, "B").props.onClick(); await multi.flush();
      expect(removeCustomOption).toHaveBeenCalledWith(addressKey, "A"); expect(multi.child.props.value).toBe("기존, C, B");
      expect(multi.selected("C")).toBe(true); expect(multi.selected("B")).toBe(true);
      expect(save).toHaveBeenCalledOnce();
      first.resolve(receipt("기존, A, C", { observation: firstObservation })); await multi.editor.pending(); await multi.flush();
      expect(save.mock.calls).toEqual([
        ["entry-a", addressKey, "기존, A, C", prepared.editContext, frozenAddressExecution],
        ["entry-a", addressKey, "기존, C", { ...prepared.editContext, observation: firstObservation }, frozenAddressExecution],
        ["entry-a", addressKey, "기존, C, B", { ...prepared.editContext, observation: secondObservation }, frozenAddressExecution],
      ]);
      expect(p.cache()?.fields.사업장주소지.value).toBe("기존, C, B"); expect(multi.emitted()).toBeDefined();
      expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
      expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    } finally { first.resolve(receipt("기존, A, C", { observation: firstObservation })); Reflect.deleteProperty(optionBundle, "removeCustomOption"); }
  });

  it("retainDraft=false의 관리자 삭제·다음 토글은 기존 부모값·즉시 저장·색상 이벤트를 유지", async () => {
    const save = vi.fn<SaveOwnField>(async (_id, _key, value) => receipt(String(value ?? "")));
    const removeCustomOption = vi.fn(); Object.assign(optionBundle, { removeCustomOption });
    vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
    try {
      const p = panel({ value: "기존, A", save }); await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.editor.rerender({ ...p.field().props, col: multi.col, isAdmin: true });
      multi.child.props = multi.emitted()!.props; multi.child.render(attachNativeChildRefs);
      expect(multi.child.props.retainDraft).toBe(false); expect(multi.child.props.canDelete).toBe(true);
      const optionRow = () => elements(multi.child.tree).find((element) => element.type === "div" && element.props.className === "relative"
        && elements(element).some((child) => child.type === "span" && child.props.children === "A"))!;
      const menu = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "색상 변경") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      menu.props.onClick({ stopPropagation: vi.fn() }); multi.child.render(attachNativeChildRefs);
      const deletion = elements(optionRow()).find((element) => element.type === "button" && element.props.title === "옵션 삭제") as Element<{ onClick: (event: { stopPropagation: () => void }) => void }>;
      const dispatch = vi.spyOn(window, "dispatchEvent");
      deletion.props.onClick({ stopPropagation: vi.fn() }); await multi.flush();
      expect(removeCustomOption).toHaveBeenCalledWith(addressKey, "A"); expect(dispatch).toHaveBeenCalledOnce();
      expect(dispatch.mock.calls[0][0].type).toBe("option-color-changed");
      expect(multi.child.props.value).toBe("기존"); multi.toggle("B"); await multi.flush();
      expect(save.mock.calls).toEqual([["entry-a", addressKey, "기존"], ["entry-a", addressKey, "기존, B"]]);
      expect(multi.child.props.value).toBe("기존, B"); expect(multi.editor.confirmation()).toBeUndefined();
      expect(p.api.saveBasicField).not.toHaveBeenCalled(); dispatch.mockRestore();
    } finally { Reflect.deleteProperty(optionBundle, "removeCustomOption"); }
  });

  it("미전송 초안과 대기 시도가 없는 성공 뒤 재개방은 기존 새 준비 동작", async () => {
    const prepared = preparedAddress("기존"); const next = preparedAddress("새관측");
    const load = vi.fn<LoadAddressEdit>().mockResolvedValueOnce(prepared).mockResolvedValueOnce(next);
    const p = capabilityPanel({ loadAddressEdit: load }); await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); await multi.editor.pending(); await multi.flush();
    multi.child.props.onClose(); await multi.editor.flush(); multi.child.unmount(); await p.flush();
    multi.editor.rerender({ ...p.field().props, col: multi.col }); multi.editor.open(); await multi.editor.flush();
    expect(load).toHaveBeenCalledTimes(2); expect(multi.emitted()?.props.value).toBe("새관측");
    expect(p.api.saveOwnField).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });
});

// Owned3: 아래 핸들은 ERP 구조 계약의 typed mock이다. 실제 Provider/PG 통합 검증을 대신하지 않는다.
// 기존 214 사례·입력기·loader는 그대로 두고 현재 capture/save/retry/revert 콜백만 연결한다.
type Owned3EditHandle = import("./adapter-types").AddressUnsavedEditOwnership;
type Owned3AttemptHandle = import("./adapter-types").AddressUnsavedAttemptOwnership;
type Owned3Entry = Parameters<UnsavedBridge["report"]>[0];
type Owned3Attempt = {
  live: boolean;
  handle: {
    isCurrent: Mock<Owned3AttemptHandle["isCurrent"]>;
    report: Mock<Owned3AttemptHandle["report"]>;
    resolve: Mock<Owned3AttemptHandle["resolve"]>;
  };
};
type Owned3Edit = {
  live: boolean; used: boolean; expected: Owned3Entry | undefined; attempts: Owned3Attempt[];
  handle: {
    isCurrent: Mock<Owned3EditHandle["isCurrent"]>;
    beginAttempt: Mock<Owned3EditHandle["beginAttempt"]>;
    cancelUnused: Mock<Owned3EditHandle["cancelUnused"]>;
  };
};
function owned3Fixture(p: ActualPanel, store = new Map<string, Owned3Entry>()) {
  const id = p.adapter.unsaved.makeId(p.adapter.unsaved.scope, "entry-a", addressKey);
  const edits: Owned3Edit[] = [];
  const beginAddressEdit = vi.fn<NonNullable<UnsavedBridge["beginAddressEdit"]>>((requestedId) => {
    expect(requestedId).toBe(id);
    for (const previous of edits) previous.live = false;
    const attempts: Owned3Attempt[] = [];
    const editCurrent = () => edit.live && store.get(id) === edit.expected;
    const edit: Owned3Edit = {
      live: true, used: false, expected: store.get(id), attempts,
      handle: {
        isCurrent: vi.fn<Owned3EditHandle["isCurrent"]>(editCurrent),
        beginAttempt: vi.fn<Owned3EditHandle["beginAttempt"]>(() => {
          if (!editCurrent()) return null;
          edit.used = true;
          for (const previous of attempts) previous.live = false;
          let expected = store.get(id);
          const current = () => editCurrent() && attempt.live && store.get(id) === expected;
          const attempt: Owned3Attempt = {
            live: true,
            handle: {
              isCurrent: vi.fn<Owned3AttemptHandle["isCurrent"]>(current),
              report: vi.fn<Owned3AttemptHandle["report"]>((entry) => {
                if (!current()) return false;
                store.set(id, entry); expected = entry; edit.expected = entry;
                return true;
              }),
              resolve: vi.fn<Owned3AttemptHandle["resolve"]>(() => {
                if (!current()) return false;
                store.delete(id); expected = undefined; edit.expected = undefined; attempt.live = false;
                return true;
              }),
            },
          };
          attempts.push(attempt);
          return attempt.handle;
        }),
        cancelUnused: vi.fn<Owned3EditHandle["cancelUnused"]>(() => {
          if (edit.used || !editCurrent()) return false;
          edit.live = false;
          return true;
        }),
      },
    };
    edits.push(edit);
    return edit.handle;
  });
  Object.assign(p.adapter.unsaved, { beginAddressEdit });
  return { id, edits, store, beginAddressEdit };
}
function owned3LegacyEntry(id: string): Owned3Entry {
  return {
    id, scope: "test", rowId: "entry-a", fieldKey: addressKey, rowLabel: "이 항목", fieldLabel: addressKey,
    value: "기존 실패 A", error: "기존 실패", kind: "temporary", retry: vi.fn(async () => false),
  };
}
function owned3Failed(fixture: ReturnType<typeof owned3Fixture>): Owned3Entry {
  const entry = fixture.store.get(fixture.id);
  expect(entry).toBeDefined();
  expect(entry!.restorable).toBe(false);
  return entry!;
}

describe("Owned3 실제 주소 콜백 — 선택적 ERP 소유권 구조 mock", () => {
  it("렌더·preload는 소유권 0, 실제 capture는 기다리는 prepare보다 먼저 편집 핸들을 고정", async () => {
    const waiting = deferred<AddressEditPreparation>();
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(() => waiting.promise) });
    const fixture = owned3Fixture(p); await p.flush();
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(fixture.beginAddressEdit).not.toHaveBeenCalled();
    p.run.render(); expect(fixture.beginAddressEdit).not.toHaveBeenCalled();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
    expect(fixture.beginAddressEdit).toHaveBeenCalledOnce();
    expect(fixture.beginAddressEdit).toHaveBeenCalledWith(fixture.id);
    expect(editor.input()).toBeUndefined(); expect(fixture.edits[0].handle.beginAttempt).not.toHaveBeenCalled();
    waiting.resolve(preparedAddress()); await editor.flush(); await p.flush();
    expect(editor.input()?.props.value).toBe("관측주소");
    expect(fixture.beginAddressEdit).toHaveBeenCalledOnce(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).not.toHaveBeenCalled();
  });

  it.each(["Provider 없음", "null", "잘못된 핸들", "현재 아님", "잘못된 통로"] as const)(
    "광고한 bridge의 %s는 새 입력·저장과 legacy 우회를 거절", async (denial) => {
      const p = capabilityPanel(); const fixture = owned3Fixture(p);
      const legacy = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, legacy);
      const cancelUnused = vi.fn<Owned3EditHandle["cancelUnused"]>(() => false);
      const denied = vi.fn<NonNullable<UnsavedBridge["beginAddressEdit"]>>(() => {
        if (denial === "Provider 없음") throw new Error("Provider가 없습니다.");
        if (denial === "null") return null as unknown as Owned3EditHandle;
        if (denial === "잘못된 핸들") return { isCurrent: () => true } as unknown as Owned3EditHandle;
        return { isCurrent: () => false, beginAttempt: () => null, cancelUnused };
      });
      Object.assign(p.adapter.unsaved, { beginAddressEdit: denial === "잘못된 통로" ? null : denied });
      await p.flush(); const displayedBeforeEdit = p.field().props.value;
      expect(displayedBeforeEdit).toBe(preparedAddress().value);
      const editor = actualEditor(p.field().props); mounted.push(editor.run);
      editor.open(); await editor.flush(); await p.flush(); editor.run.unmount();
      expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
      expect(p.field().props.value).toBe(displayedBeforeEdit); expect(fixture.store.get(fixture.id)).toBe(legacy);
      expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
      expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
      expect(p.onSaved).not.toHaveBeenCalled();
      if (denial === "현재 아님") expect(cancelUnused).toHaveBeenCalledOnce();
      else expect(cancelUnused).not.toHaveBeenCalled();
    },
  );

  it.each(["null", "잘못된 핸들", "throw", "현재 아님", "전송 직전 상실"] as const)(
    "beginAttempt %s는 source를 보내지 않고 보관함도 건드리지 않음", async (denial) => {
      const p = capabilityPanel(); const fixture = owned3Fixture(p); await p.flush();
      const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
      const edit = fixture.edits[0]; const begin = edit.handle.beginAttempt.getMockImplementation()!;
      edit.handle.beginAttempt.mockImplementationOnce(() => {
        if (denial === "null") return null;
        if (denial === "throw") throw new Error("소유권 거절");
        if (denial === "잘못된 핸들") return { isCurrent: () => true } as unknown as Owned3AttemptHandle;
        const handle = begin()!; const attempt = edit.attempts[0];
        if (denial === "현재 아님") attempt.handle.isCurrent.mockImplementation(() => false);
        else {
          let checks = 0;
          attempt.handle.isCurrent.mockImplementation(() => ++checks === 1);
        }
        return handle;
      });
      editor.saveInput("A"); editor.confirm(); await editor.pending(); await p.flush();
      expect(edit.handle.beginAttempt).toHaveBeenCalledOnce(); expect(p.api.saveOwnField).not.toHaveBeenCalled();
      expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
      expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
      expect(fixture.store.size).toBe(0); expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
    },
  );

  it("첫 자기 성공은 attemptId 없는 시작 legacy A를 핸들로만 정리", async () => {
    const p = capabilityPanel(); const fixture = owned3Fixture(p);
    const legacy = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, legacy);
    await p.flush(); await p.startSave("A"); await p.flush();
    const edit = fixture.edits[0]; const attempt = edit.attempts[0];
    expect(legacy.attemptId).toBeUndefined(); expect(fixture.store.size).toBe(0);
    expect(attempt.handle.resolve).toHaveBeenCalledOnce(); expect(attempt.handle.report).not.toHaveBeenCalled();
    expect(edit.handle.beginAttempt).toHaveBeenCalledOnce(); expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.api.saveOwnField).toHaveBeenCalledWith("entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution);
    expect(p.cache()?.fields.사업장주소지.value).toBe("A"); expect(p.onSaved).toHaveBeenCalledOnce();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it.each(["확인 취소", "준비 실패", "준비 중 닫힘"] as const)(
    "미사용 %s는 같은 편집의 cancelUnused 한 번만 호출하고 기존 A를 보존", async (ending) => {
      const waiting = deferred<AddressEditPreparation>();
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(() => waiting.promise) });
      const fixture = owned3Fixture(p); const legacy = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, legacy);
      await p.flush(); const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
      if (ending === "준비 중 닫힘") editor.run.unmount();
      if (ending === "준비 실패") waiting.reject(new Error("준비 실패"));
      else waiting.resolve(preparedAddress());
      await editor.flush(); await p.flush();
      if (ending === "확인 취소") { editor.saveInput("A"); editor.cancel(); }
      editor.run.unmount(); await p.flush();
      const edit = fixture.edits[0];
      expect(edit.handle.cancelUnused).toHaveBeenCalledOnce(); expect(edit.handle.beginAttempt).not.toHaveBeenCalled();
      expect(fixture.store.get(fixture.id)).toBe(legacy); expect(p.api.saveOwnField).not.toHaveBeenCalled();
      expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
      expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
    },
  );

  it("새 미사용 편집 취소는 기존 실패 A를 남겨도 취소된 원래 retry를 되살리지 않음", async () => {
    const save = vi.fn<SaveOwnField>().mockRejectedValue(temporary());
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p);
    await p.flush(); await p.startSave("A"); await p.flush();
    const failed = owned3Failed(fixture);
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    editor.saveInput("B"); editor.cancel(); editor.run.unmount();
    expect(fixture.edits.length).toBe(2); expect(fixture.edits[1].handle.cancelUnused).toHaveBeenCalledOnce();
    expect(fixture.edits[0].handle.cancelUnused).not.toHaveBeenCalled(); expect(fixture.store.get(fixture.id)).toBe(failed);
    expect(await failed.retry()).toBe(false); failed.revert?.(); expect(save).toHaveBeenCalledOnce();
    expect(fixture.edits[0].attempts[0].handle.resolve).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });

  it.each(["retry 성공", "retry 실패", "revert"] as const)(
    "실패 A·미전송 B의 닫힘/재개방과 %s는 같은 편집·고정 A·B 초안을 보존", async (ending) => {
      const prepared = preparedAddress("기존");
      const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockImplementationOnce(async () => {
        if (ending === "retry 실패") throw temporary();
        return receipt("기존, A", { observation: committedObservation(prepared) });
      });
      if (ending === "retry 성공") save.mockRejectedValueOnce(temporary());
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      const fixture = owned3Fixture(p); const legacy = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, legacy);
      await p.flush(); const multi = await actualMultiSelectEditor(p);
      multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
      const failed = owned3Failed(fixture); const originalContext = save.mock.calls[0][3];
      const edit = fixture.edits[0]; const attempt = edit.attempts[0];
      expect(failed.value).toBe("기존, A"); expect(attempt.handle.report).toHaveBeenCalledOnce();
      const oldCallbacks = multi.child.props;
      oldCallbacks.onClose(); await multi.editor.flush(); multi.child.unmount(); await p.flush();
      multi.editor.rerender({ ...p.field().props, col: multi.col }); multi.editor.open(); await multi.editor.flush();
      const emitted = multi.emitted(); expect(emitted).toBeDefined();
      const reopened = new Hooks(emitted!.type as Component<MultiChildProps>, emitted!.props); mounted.push(reopened);
      reopened.render(attachNativeChildRefs); if (reopened.dirty) reopened.render(attachNativeChildRefs);
      oldCallbacks.onSave("늦은 입력"); oldCallbacks.onClose(); await multi.editor.flush(); await p.flush();
      expect(reopened.props.value).toBe("기존, A, B"); expect(multi.emitted()).toBeDefined();
      expect(elements(nativeOptionButton(reopened.tree, "B")).some((element) => element.type === "svg")).toBe(true);
      expect(fixture.beginAddressEdit).toHaveBeenCalledOnce(); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
      expect(save).toHaveBeenCalledOnce(); expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
      if (ending === "revert") {
        failed.revert?.(); expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledOnce();
      } else {
        expect(await failed.retry()).toBe(ending === "retry 성공");
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
        expect(save.mock.calls[1][3]).toBe(originalContext);
      }
      expect(edit.handle.beginAttempt).toHaveBeenCalledOnce(); expect(Object.isFrozen(originalContext)).toBe(true);
      if (ending === "retry 실패") {
        expect(owned3Failed(fixture).attemptId).toBe(failed.attemptId); expect(attempt.handle.report).toHaveBeenCalledTimes(2);
        expect(attempt.handle.resolve).not.toHaveBeenCalled();
      } else {
        expect(fixture.store.size).toBe(0); expect(attempt.handle.resolve).toHaveBeenCalledOnce();
      }
      await p.flush(); multi.editor.rerender({ ...p.field().props, col: multi.col });
      reopened.props = multi.emitted()!.props; reopened.render(attachNativeChildRefs);
      expect(reopened.props.value).toBe("기존, A, B"); expect(p.field().props.value).toBe("기존, A, B");
      const calls = save.mock.calls.length;
      nativeOptionButton(reopened.tree, "C").props.onClick(); await multi.editor.pending(); await p.flush();
      multi.editor.rerender({ ...p.field().props, col: multi.col });
      reopened.props = multi.emitted()!.props; reopened.render(attachNativeChildRefs);
      expect(reopened.props.value).toBe("기존, A, B, C"); expect(save).toHaveBeenCalledTimes(calls + (ending === "retry 성공" ? 1 : 0));
      if (ending === "retry 성공") {
        expect(save.mock.calls[calls]).toEqual(["entry-a", addressKey, "기존, A, B, C", {
          ...prepared.editContext, observation: committedObservation(prepared),
        }, frozenAddressExecution]);
        expect(owned3Failed(fixture).value).toBe("기존, A, B, C");
      }
      reopened.props.onClose(); await multi.editor.flush(); reopened.unmount();
      expect(edit.handle.cancelUnused).not.toHaveBeenCalled(); expect(fixture.beginAddressEdit).toHaveBeenCalledOnce();
      expect(p.onSaved).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
      expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    },
  );

  it("상세 unmount 뒤 원래 실패 retry는 같은 시도 핸들·관측으로 저장하고 화면 상태를 쓰지 않음", async () => {
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary())
      .mockResolvedValueOnce(receipt("A", { observation: committedObservation() }));
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p);
    await p.flush(); await p.startSave("A"); await p.flush();
    const failed = owned3Failed(fixture); const edit = fixture.edits[0]; const attempt = edit.attempts[0];
    const originalContext = save.mock.calls[0][3]; p.run.unmount();
    const state = p.run.values(); const cache = p.cache();
    expect(await failed.retry()).toBe(true);
    expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "A", preparedAddress().editContext, frozenAddressExecution]);
    expect(save.mock.calls[1][3]).toBe(originalContext); expect(edit.handle.beginAttempt).toHaveBeenCalledOnce();
    expect(attempt.handle.resolve).toHaveBeenCalledOnce(); expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
    expect(p.run.dirty).toBe(false); expect(p.cache()).toBe(cache);
    p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(fixture.store.size).toBe(0); expect(p.onSaved).not.toHaveBeenCalled();
  });

  it.each(["성공", "오류"] as const)("전송 뒤 소유권 상실의 늦은 %s는 외부 항목·B 초안을 덮지 않음", async (ending) => {
    const prepared = preparedAddress("기존"); const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    const fixture = owned3Fixture(p); await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.flush();
    const attempt = fixture.edits[0].attempts[0];
    const foreign = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, foreign);
    const state = p.run.values();
    if (ending === "성공") waiting.resolve(receipt("기존, A", { observation: committedObservation(prepared) }));
    else waiting.reject(temporary());
    await multi.editor.pending();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(fixture.store.get(fixture.id)).toBe(foreign); expect(p.field().props.value).toBe("기존, A, B");
    expect(attempt.handle.report).not.toHaveBeenCalled(); expect(attempt.handle.resolve).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce(); expect(p.onSaved).not.toHaveBeenCalled(); expect(p.cache()).toBeUndefined();
    expect(p.api.saveBasicField).not.toHaveBeenCalled(); expect(p.adapter.unsaved.report).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });

  it.each(["성공 resolve 거절", "오류 report 거절"] as const)("%s는 조건부 핸들의 false를 legacy로 우회하지 않음", async (ending) => {
    const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    editor.saveInput("A"); editor.confirm(); await p.flush();
    const attempt = fixture.edits[0].attempts[0]; const foreign = owned3LegacyEntry(fixture.id);
    const deny = () => { fixture.store.set(fixture.id, foreign); return false; };
    const state = p.run.values();
    if (ending === "성공 resolve 거절") {
      attempt.handle.resolve.mockImplementationOnce(deny);
      waiting.resolve(receipt("A", { observation: committedObservation() }));
    } else {
      attempt.handle.report.mockImplementationOnce(deny); waiting.reject(temporary());
    }
    await editor.pending();
    expect(fixture.store.get(fixture.id)).toBe(foreign); expect(p.cache()).toBeUndefined();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(p.onSaved).not.toHaveBeenCalled(); expect(save).toHaveBeenCalledOnce();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("보고 뒤 동일 attemptId의 다른 구체 항목은 원래 retry/revert가 지우지 않음", async () => {
    const save = vi.fn<SaveOwnField>().mockRejectedValue(temporary());
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p);
    await p.flush(); await p.startSave("A"); await p.flush(); const failed = owned3Failed(fixture);
    const foreign: Owned3Entry = { ...failed, value: "외부 B" }; fixture.store.set(fixture.id, foreign);
    const state = p.run.values(); const attempt = fixture.edits[0].attempts[0];
    expect(await failed.retry()).toBe(false); failed.revert?.();
    expect(fixture.store.get(fixture.id)).toBe(foreign); expect(save).toHaveBeenCalledOnce();
    expect(attempt.handle.report).toHaveBeenCalledOnce(); expect(attempt.handle.resolve).not.toHaveBeenCalled();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });

  it("직렬 세 토글은 실제 전송마다 별도 핸들, 마지막 retry는 고정 핸들·자기 receipt 관측만 재사용", async () => {
    const prepared = preparedAddress("기존", "FreeSubsidyEntry"); const firstObservation = committedObservation(prepared);
    const secondObservation = serialObservation(firstObservation, secondSourceRevision, secondCanonicalRevision);
    const thirdObservation = serialObservation(secondObservation, thirdSourceRevision, thirdCanonicalRevision);
    const first = deferred<ReturnType<typeof receipt>>(); const second = deferred<ReturnType<typeof receipt>>();
    const third = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise).mockResolvedValueOnce(receipt("기존, A, B, C", {
        sourceFieldKey: "businessAddress", observation: thirdObservation,
      }));
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    const fixture = owned3Fixture(p); await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); multi.toggle("C"); await multi.flush();
    const edit = fixture.edits[0]; expect(edit.handle.beginAttempt).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledOnce();
    first.resolve(receipt("기존, A", { sourceFieldKey: "businessAddress", observation: firstObservation })); await multi.flush();
    expect(edit.handle.beginAttempt).toHaveBeenCalledTimes(2); expect(save).toHaveBeenCalledTimes(2);
    second.resolve(receipt("기존, A, B", { sourceFieldKey: "businessAddress", observation: secondObservation })); await multi.flush();
    expect(edit.handle.beginAttempt).toHaveBeenCalledTimes(3); expect(save).toHaveBeenCalledTimes(3);
    third.reject(temporary()); await multi.editor.pending(); await multi.flush(); const failed = owned3Failed(fixture);
    expect(failed.value).toBe("기존, A, B, C"); expect(edit.attempts[0].handle.resolve).toHaveBeenCalledOnce();
    expect(edit.attempts[1].handle.resolve).toHaveBeenCalledOnce(); expect(edit.attempts[2].handle.report).toHaveBeenCalledOnce();
    const originalContext = save.mock.calls[2][3];
    p.run.props = { ...p.run.props, row: { ...p.run.props.row, [addressKey]: "최신 부모값" } }; p.run.render(); await p.flush();
    expect(await failed.retry()).toBe(true); await multi.flush();
    expect(edit.handle.beginAttempt).toHaveBeenCalledTimes(3); expect(fixture.beginAddressEdit).toHaveBeenCalledOnce();
    expect(edit.attempts[2].handle.resolve).toHaveBeenCalledOnce(); expect(fixture.store.size).toBe(0);
    expect(save.mock.calls).toEqual([
      ["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution],
      ["entry-a", addressKey, "기존, A, B", { ...prepared.editContext, observation: firstObservation }, frozenAddressExecution],
      ["entry-a", addressKey, "기존, A, B, C", { ...prepared.editContext, observation: secondObservation }, frozenAddressExecution],
      ["entry-a", addressKey, "기존, A, B, C", { ...prepared.editContext, observation: secondObservation }, frozenAddressExecution],
    ]);
    expect(save.mock.calls[3][3]).toBe(originalContext); expect(Object.isFrozen(originalContext)).toBe(true);
    expect(save.mock.calls[1][3]?.observation.source.token).not.toEqual(save.mock.calls[1][3]?.observation.canonical.token);
    expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
    expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it("캡처/시도 뒤 원본 핸들의 메서드 교체는 기존 전송·retry의 고정 소유권을 재배정하지 않음", async () => {
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary())
      .mockResolvedValueOnce(receipt("A", { observation: committedObservation() }));
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const edit = fixture.edits[0]; const originalBegin = edit.handle.beginAttempt;
    const replacementBegin = vi.fn<Owned3EditHandle["beginAttempt"]>(() => null);
    Object.assign(edit.handle, { beginAttempt: replacementBegin });
    editor.saveInput("A"); editor.confirm(); await editor.pending(); await p.flush();
    const failed = owned3Failed(fixture); const attempt = edit.attempts[0]; const originalResolve = attempt.handle.resolve;
    const replacementCurrent = vi.fn(() => false); const replacementResolve = vi.fn(() => false);
    Object.assign(attempt.handle, { isCurrent: replacementCurrent, resolve: replacementResolve });
    const replacementBridge = vi.fn<NonNullable<UnsavedBridge["beginAddressEdit"]>>(() => { throw new Error("새 통로"); });
    Object.assign(p.adapter.unsaved, { beginAddressEdit: replacementBridge });
    expect(await failed.retry()).toBe(true);
    expect(originalBegin).toHaveBeenCalledOnce(); expect(replacementBegin).not.toHaveBeenCalled();
    expect(originalResolve).toHaveBeenCalledOnce(); expect(replacementResolve).not.toHaveBeenCalled();
    expect(replacementCurrent).not.toHaveBeenCalled(); expect(replacementBridge).not.toHaveBeenCalled();
    expect(save.mock.calls[1][3]).toBe(save.mock.calls[0][3]); expect(fixture.store.size).toBe(0);
    expect(edit.handle.cancelUnused).not.toHaveBeenCalled();
  });

  it("preload가 아직 출발하지 않은 실제 capture도 beginAddressEdit를 async prepare 앞에서 호출", async () => {
    const trace: string[] = []; const waiting = deferred<AddressEditPreparation>();
    const load = vi.fn<LoadAddressEdit>(() => { trace.push("prepare"); return waiting.promise; });
    const p = capabilityPanel({ loadAddressEdit: load }); const fixture = owned3Fixture(p);
    const begin = fixture.beginAddressEdit.getMockImplementation()!;
    fixture.beginAddressEdit.mockImplementation((id) => { trace.push("capture"); return begin(id); });
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open();
    expect(trace).toEqual(["capture"]); expect(load).not.toHaveBeenCalled();
    await p.flush(); expect(trace).toEqual(["capture", "prepare"]);
    expect(fixture.edits[0].handle.beginAttempt).not.toHaveBeenCalled();
    waiting.resolve(preparedAddress()); await editor.flush(); await p.flush();
    expect(editor.input()?.props.value).toBe("관측주소"); expect(load).toHaveBeenCalledOnce();
  });

  it("capture 뒤 편집 소유권 상실은 새 입력·확인·source를 막고 외부 항목을 보존", async () => {
    const p = capabilityPanel(); const fixture = owned3Fixture(p); await p.flush();
    const editor = actualEditor(p.field().props); mounted.push(editor.run); editor.open(); await editor.flush();
    const foreign = owned3LegacyEntry(fixture.id); fixture.store.set(fixture.id, foreign);
    editor.saveInput("A"); editor.confirm(); await editor.flush(); await p.flush();
    expect(editor.input()).toBeUndefined(); expect(editor.confirmation()).toBeUndefined();
    expect(p.field().props.value).toBe("관측주소"); expect(fixture.store.get(fixture.id)).toBe(foreign);
    expect(fixture.edits[0].handle.beginAttempt).not.toHaveBeenCalled();
    expect(fixture.edits[0].handle.cancelUnused).toHaveBeenCalledOnce();
    expect(p.api.saveOwnField).not.toHaveBeenCalled(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    expect(p.adapter.unsaved.report).not.toHaveBeenCalled(); expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled();
  });

  it.each(["성공", "오류"] as const)("실행 중 A 뒤 미사용 편집 취소도 늦은 A %s를 되살리지 않음", async (ending) => {
    const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p); await p.flush();
    const first = actualEditor(p.field().props); mounted.push(first.run); first.open(); await first.flush();
    first.saveInput("A"); first.confirm(); first.run.unmount(); await p.flush();
    const second = actualEditor(p.field().props); mounted.push(second.run); second.open(); await second.flush();
    second.saveInput("B"); second.cancel(); second.run.unmount(); await p.flush();
    expect(fixture.edits.length).toBe(2); const oldAttempt = fixture.edits[0].attempts[0];
    expect(fixture.edits[1].handle.cancelUnused).toHaveBeenCalledOnce();
    expect(fixture.edits[0].handle.cancelUnused).not.toHaveBeenCalled();
    const state = p.run.values();
    if (ending === "성공") waiting.resolve(receipt("A", { observation: committedObservation() }));
    else waiting.reject(temporary());
    await first.pending();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(fixture.store.size).toBe(0); expect(oldAttempt.handle.report).not.toHaveBeenCalled();
    expect(oldAttempt.handle.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
  });

  it.each(["성공", "오류"] as const)("원래 retry 전송 뒤 늦은 %s도 다른 항목·동일 편집 B를 정리하지 않음", async (ending) => {
    const prepared = preparedAddress("기존"); const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    const fixture = owned3Fixture(p); await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
    const failed = owned3Failed(fixture); const originalContext = save.mock.calls[0][3];
    const pending = failed.retry(); await p.flush(); const state = p.run.values();
    const foreign: Owned3Entry = { ...failed, value: "외부 실패" }; fixture.store.set(fixture.id, foreign);
    if (ending === "성공") waiting.resolve(receipt("기존, A", { observation: committedObservation(prepared) }));
    else waiting.reject(temporary());
    expect(await pending).toBe(false); failed.revert?.();
    expect(save.mock.calls[1]).toEqual(["entry-a", addressKey, "기존, A", prepared.editContext, frozenAddressExecution]);
    expect(save.mock.calls[1][3]).toBe(originalContext); expect(fixture.store.get(fixture.id)).toBe(foreign);
    expect(p.field().props.value).toBe("기존, A, B"); expect(multi.child.props.value).toBe("기존, A, B");
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    const edit = fixture.edits[0]; expect(edit.handle.beginAttempt).toHaveBeenCalledOnce();
    expect(edit.attempts[0].handle.report).toHaveBeenCalledOnce(); expect(edit.attempts[0].handle.resolve).not.toHaveBeenCalled();
    expect(edit.handle.cancelUnused).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
  });

  it("revert의 조건부 resolve 거절은 같은 편집의 미전송 B를 지우거나 다시 보내지 않음", async () => {
    const prepared = preparedAddress("기존"); const save = vi.fn<SaveOwnField>().mockRejectedValue(temporary());
    const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
    const fixture = owned3Fixture(p); await p.flush(); const multi = await actualMultiSelectEditor(p);
    multi.toggle("A"); multi.toggle("B"); await multi.editor.pending(); await multi.flush();
    const failed = owned3Failed(fixture); const attempt = fixture.edits[0].attempts[0];
    const foreign: Owned3Entry = { ...failed, value: "외부 실패" };
    attempt.handle.resolve.mockImplementationOnce(() => { fixture.store.set(fixture.id, foreign); return false; });
    const state = p.run.values(); failed.revert?.();
    expect(attempt.handle.resolve).toHaveBeenCalledOnce(); expect(fixture.store.get(fixture.id)).toBe(foreign);
    expect(p.field().props.value).toBe("기존, A, B"); expect(multi.child.props.value).toBe("기존, A, B");
    expect(await failed.retry()).toBe(false); expect(save).toHaveBeenCalledOnce();
    expect(p.run.dirty).toBe(false); p.run.values().forEach((value, index) => expect(value).toBe(state[index]));
    expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(fixture.edits[0].handle.cancelUnused).not.toHaveBeenCalled();
  });
});

// 이식 가능한 shared 회귀. 아래 LOCAL ERP 원본 의존과 분리한다.
describe("review2ac shared native receipt/transition/execution", () => {
  it.each(["source baseline", "canonical baseline", "wrong native key", "source absent", "canonical absent", "reused existence token"] as const)(
    "%s는 원값·관측·실패 시도를 보존하고 캐시/성공/새 준비를 적용하지 않음", async defect => {
      const base = preparedAddress("관측주소", defect === "wrong native key" ? "PolicyFundEntry" : "TaxAmendmentEntry");
      const prepared: AddressEditPreparation = defect === "reused existence token" ? {
        ...base, editContext: { ...base.editContext, observation: { ...base.editContext.observation,
          canonical: { ...base.editContext.observation.canonical, exists: false } } },
      } : base;
      const committed = committedObservation(prepared);
      const observation: AddressObservation = {
        ...committed,
        source: defect === "source baseline" ? { ...committed.source, token: { kind: "baseline" } }
          : defect === "source absent" ? { ...committed.source, exists: false } : committed.source,
        canonical: defect === "canonical baseline" ? { ...committed.canonical, token: { kind: "baseline" } }
          : defect === "canonical absent" ? { ...committed.canonical, exists: false }
          : defect === "reused existence token" ? { ...committed.canonical, token: prepared.editContext.observation.canonical.token }
          : committed.canonical,
      };
      const save = vi.fn<SaveOwnField>(async () => receipt("A", { observation }));
      const store = new Map<string, Owned3Entry>();
      const p = capabilityPanel({ store, loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared), save });
      await p.flush(); await p.startSave("A"); await p.flush();
      const failed = failedEntry(p); const context = save.mock.calls[0][3];
      expect(failed).toMatchObject({ value: "A", kind: "confirmation-needed", restorable: false });
      expect(await failed.retry()).toBe(false); await p.flush();
      expect(failedEntry(p)).toMatchObject({ attemptId: failed.attemptId, value: failed.value, kind: failed.kind });
      expect(save.mock.calls).toEqual([
        ["entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution],
        ["entry-a", addressKey, "A", prepared.editContext, frozenAddressExecution],
      ]);
      expect(save.mock.calls[1][3]).toBe(context); expect(Object.isFrozen(context)).toBe(true);
      expect(p.field().props.value).toBe("A"); expect(p.cache()).toBeUndefined();
      expect(p.adapter.unsaved.resolve).not.toHaveBeenCalled(); expect(p.onSaved).not.toHaveBeenCalled();
      expect(p.api.loadAddressEdit).toHaveBeenCalledOnce(); expect(p.api.saveBasicField).not.toHaveBeenCalled();
    },
  );

  it.each(["baseline", "revision noop", "lower UUID", "absent becomes revision"] as const)(
    "%s 정상 전이는 새 UUID/문자열 순서를 요구하지 않음", async transition => {
      const base = preparedAddress();
      const prepared: AddressEditPreparation = transition === "baseline" ? {
        ...base, editContext: { ...base.editContext, observation: { ...base.editContext.observation,
          source: { ...base.editContext.observation.source, token: { kind: "baseline" } },
          canonical: { ...base.editContext.observation.canonical, token: { kind: "baseline" } } } },
      } : transition === "absent becomes revision" ? {
        ...base, editContext: { ...base.editContext, observation: { ...base.editContext.observation,
          canonical: { ...base.editContext.observation.canonical, exists: false } } },
      } : base;
      const observation: AddressObservation = transition === "lower UUID" ? {
        ...committedObservation(prepared),
        source: { ...prepared.editContext.observation.source, token: { kind: "revision", uuid: "00000000-0000-4000-8000-000000000001" } },
        canonical: { ...prepared.editContext.observation.canonical, token: { kind: "revision", uuid: "00000000-0000-4000-8000-000000000002" } },
      } : transition === "absent becomes revision" ? committedObservation(prepared) : prepared.editContext.observation;
      const p = capabilityPanel({ loadAddressEdit: vi.fn<LoadAddressEdit>(async () => prepared),
        save: vi.fn<SaveOwnField>(async () => receipt("A", { observation })) });
      await p.flush(); await p.startSave("A"); await p.flush();
      expect(p.adapter.unsaved.resolve).toHaveBeenCalledOnce(); expect(p.onSaved).toHaveBeenCalledOnce();
      expect(p.cache()?.fields.사업장주소지.value).toBe("A"); expect(p.api.loadAddressEdit).toHaveBeenCalledOnce();
      expect(p.api.saveBasicField).not.toHaveBeenCalled();
    },
  );

  it("beginRetry는 재귀 반환 핸들의 원 메서드와 수신 객체까지 고정", () => {
    const freezeAttempt = compile<unknown>("./UnifiedDetailView.tsx", "freezeAddressAttemptOwnership") as unknown as
      (value: unknown) => Owned3AttemptHandle | null;
    const third = {
      isCurrent() { expect(this).toBe(third); return true; },
      report() { expect(this).toBe(third); return true; },
      resolve() { expect(this).toBe(third); return true; },
    };
    const second = { ...third,
      isCurrent() { expect(this).toBe(second); return true; },
      report() { expect(this).toBe(second); return true; },
      resolve() { expect(this).toBe(second); return true; },
      beginRetry() { expect(this).toBe(second); return third; },
    };
    const first = { ...second,
      isCurrent() { expect(this).toBe(first); return true; },
      report() { expect(this).toBe(first); return true; },
      resolve() { expect(this).toBe(first); return true; },
      beginRetry() { expect(this).toBe(first); return second; },
    };
    const fixed = freezeAttempt(first)!; expect(Object.isFrozen(fixed)).toBe(true);
    Object.assign(first, { isCurrent: () => false, beginRetry: () => null, report: () => false, resolve: () => false });
    expect(fixed.isCurrent()).toBe(true); expect(fixed.report(owned3LegacyEntry("A"))).toBe(true);
    const next = fixed.beginRetry!()!; expect(Object.isFrozen(next)).toBe(true);
    Object.assign(second, { isCurrent: () => false, beginRetry: () => null, report: () => false, resolve: () => false });
    expect(next.isCurrent()).toBe(true); expect(next.resolve()).toBe(true);
    const last = next.beginRetry!()!; expect(Object.isFrozen(last)).toBe(true);
    Object.assign(third, { isCurrent: () => false, report: () => false, resolve: () => false });
    expect(last.isCurrent()).toBe(true); expect(last.report(owned3LegacyEntry("A"))).toBe(true);
    expect(last.resolve()).toBe(true); expect(last.beginRetry).toBeUndefined();
    expect(freezeAttempt({ isCurrent: () => true, report: () => true, resolve: () => true, beginRetry: false })).toBeNull();
    const denied = freezeAttempt({ isCurrent: () => true, report: () => true, resolve: () => true,
      beginRetry: () => ({ isCurrent: () => false, report: () => true, resolve: () => true }) });
    expect(denied!.beginRetry!()).toBeNull();
  });

  it("기존 beginRetry 없는 핸들도 실행마다 별도 guard를 갖고 중복/예외/옛 되돌리기를 거절", async () => {
    const waiting = deferred<ReturnType<typeof receipt>>();
    const save = vi.fn<SaveOwnField>().mockRejectedValueOnce(temporary()).mockReturnValueOnce(waiting.promise);
    const p = capabilityPanel({ save }); const fixture = owned3Fixture(p);
    await p.flush(); await p.startSave("A"); await p.flush();
    const failed = owned3Failed(fixture); const oldGuard = save.mock.calls[0][4]!;
    expect(oldGuard).toEqual(frozenAddressExecution); expect(oldGuard.shouldContinue()).toBe(false);
    const pending = failed.retry(); const guard = save.mock.calls[1][4]!;
    expect(guard).toEqual(frozenAddressExecution); expect(guard).not.toBe(oldGuard);
    expect(guard.shouldContinue()).toBe(true); expect(oldGuard.shouldContinue()).toBe(false);
    expect(await failed.retry()).toBe(false); failed.revert?.();
    expect(fixture.store.get(fixture.id)).toBe(failed); expect(save).toHaveBeenCalledTimes(2);
    fixture.edits[0].attempts[0].handle.isCurrent.mockImplementation(() => { throw new Error("권한 검사 실패"); });
    expect(guard.shouldContinue()).toBe(false);
    waiting.resolve(receipt("A", { observation: committedObservation() })); expect(await pending).toBe(false);
    expect(oldGuard.shouldContinue()).toBe(false); expect(guard.shouldContinue()).toBe(false);
    expect(fixture.store.get(fixture.id)).toBe(failed); expect(p.onSaved).not.toHaveBeenCalled();
    expect(p.cache()).toBeUndefined(); expect(fixture.edits[0].attempts[0].handle.resolve).not.toHaveBeenCalled();
    expect(fixture.beginAddressEdit).toHaveBeenCalledOnce();
  });
});

