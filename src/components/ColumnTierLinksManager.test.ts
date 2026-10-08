import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ColumnTierLinksManager, { type TierFieldDef, type TierLinkAdapter } from "./ColumnTierLinksManager";
import { type ColumnTierLink, type LinkMode } from "../tier-link/config";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));

// Seed loaded state in the node-only test environment; exercise the actual
// rendered controls and persistence handlers without adding a DOM dependency.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.values)) hooks.values[index] = initial;
      return [hooks.values[index], (next: unknown) => {
        hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next;
      }];
    },
  };
});
vi.mock("@wedly/detail-modal-shared", () => ({ CustomSelect: () => null }));

const GOVERNMENT = "government-subsidy";
const TAX = "tax-amendment";
const MIRROR_HINT = "정부지원금 칸은 ERP 값을 그대로 보여 주는 칸이라 표에서 편집할 수 없습니다.";
const amountField: TierFieldDef = { key: "tier_amount", label: "금액", type: "number" };

function adapter(overrides: Partial<TierLinkAdapter> = {}): TierLinkAdapter {
  return {
    ownDomain: TAX,
    sections: [{ key: GOVERNMENT, label: "정부지원금" }, { key: TAX, label: "경정청구" }],
    staticColumns: [
      { key: "amount", label: "금액", type: "number" },
      { key: "select", label: "상태", type: "select" },
      { key: "percent", label: "비율", type: "percent" },
    ],
    loadFields: vi.fn(async () => [amountField]),
    loadLinks: vi.fn(async () => []),
    saveLinks: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

function link(overrides: Partial<ColumnTierLink> = {}): ColumnTierLink {
  return { columnKey: "existing", section: GOVERNMENT, area: "settlement", tierFieldKey: "tier_amount", mode: "latest", ...overrides };
}

function manager(a: TierLinkAdapter, state: {
  links?: readonly ColumnTierLink[];
  section?: string;
  colKey?: string;
  mode?: LinkMode;
  fields?: TierFieldDef[];
} = {}) {
  const fields = state.fields ?? [amountField];
  hooks.values = [
    state.links ?? [], false, false, null, // links, loading, saving, notice
    state.colKey ?? "amount", state.section ?? a.sections[0]?.key ?? a.ownDomain,
    "settlement", fields[0]?.key ?? "", state.mode ?? "sum", fields, false, null,
  ];
  return () => {
    hooks.cursor = 0;
    return ColumnTierLinksManager({ adapter: a });
  };
}

type Element = React.ReactElement<{
  children?: React.ReactNode;
  className?: string;
  options?: { value: string }[];
  onChange?: (value: string) => void;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
}>;

function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Element["props"]>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Element["props"]>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

function button(tree: React.ReactNode, label: string): Element {
  const matches = elements(tree).filter((node) => node.type === "button" && text(node) === label);
  expect(matches).toHaveLength(1);
  return matches[0];
}

async function click(tree: React.ReactNode, label: string) {
  const control = button(tree, label);
  expect(control.props.onClick).toBeTypeOf("function");
  await control.props.onClick!();
}

function badges(tree: React.ReactNode): string[] {
  return elements(tree)
    .filter((node) => node.type === "span" && node.props.className?.includes("rounded-full"))
    .map(text);
}

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

describe("ColumnTierLinksManager presentation boundaries", () => {
  it("keeps the default adapter labels, including existing readonly/formula precedence", () => {
    const render = manager(adapter(), { links: [
      link(), link({ columnKey: "sum", mode: "sum" }),
      link({ columnKey: "formula", readonly: true }),
      link({ columnKey: "formula_sum", mode: "sum", readonly: true }),
    ] });
    expect(badges(render())).toEqual([
      "최신차수(편집)", "합계(읽기전용)", "최신차수(읽기전용)", "최신차수(읽기전용)",
    ]);
    expect(button(render(), "최신차수(편집)").props.disabled).toBeUndefined();
    expect(text(render())).not.toContain(MIRROR_HINT);
    expect(badges(manager(adapter({ readonlySections: [] }), { links: [link()] })())).toEqual(["최신차수(편집)"]);
  });

  it("changes only opted-in latest labels and never mutates persisted links or adapter sections", async () => {
    const links = Object.freeze([
      Object.freeze(link({ readonly: false })),
      Object.freeze(link({ columnKey: "sum", mode: "sum" })),
      Object.freeze(link({ columnKey: "tax", section: TAX })),
    ]);
    const before = JSON.stringify(links);
    const readonlySections = Object.freeze([GOVERNMENT]);
    const a = adapter({ readonlySections });
    const render = manager(a, { links });
    expect(badges(render())).toEqual(["최신차수(읽기전용)", "합계(읽기전용)", "최신차수(편집)"]);
    const remove = elements(render()).filter((node) => node.type === "button" && text(node) === "해제")[1];
    await remove.props.onClick!();
    expect(a.saveLinks).toHaveBeenCalledWith([links[0], links[2]]);
    const saved = vi.mocked(a.saveLinks).mock.calls[0][0];
    expect(saved[0]).toBe(links[0]);
    expect(saved[1]).toBe(links[2]);
    expect(saved[0].readonly).toBe(false);
    expect(JSON.stringify(links)).toBe(before);
    expect(readonlySections).toEqual([GOVERNMENT]);
  });

  it.each([undefined, "", "   "])("uses ownDomain for an implicit section (%s) without writing it back", (section) => {
    const legacy = link();
    delete legacy.section;
    const existing: ColumnTierLink = Object.freeze(section === undefined ? legacy : { ...legacy, section });
    const a = adapter({ ownDomain: GOVERNMENT, readonlySections: [GOVERNMENT] });
    expect(badges(manager(a, { links: [existing] })())).toEqual(["최신차수(읽기전용)"]);
    expect(existing.section).toBe(section);
    if (section === undefined) expect(existing).not.toHaveProperty("section");
    expect(badges(manager(adapter({ readonlySections: [GOVERNMENT] }), { links: [existing] })())).toEqual(["최신차수(편집)"]);
  });

  it("updates the latest button and ERP hint when the selected section changes", () => {
    const render = manager(adapter({ readonlySections: [GOVERNMENT] }));
    const latestClass = button(render(), "최신차수(읽기전용)").props.className;
    const sumClass = button(render(), "합계(읽기전용)").props.className;
    expect(button(render(), "최신차수(읽기전용)").props.disabled).toBeUndefined();
    expect(button(render(), "합계(읽기전용)").props.disabled).toBe(false);
    expect(text(render())).toContain(MIRROR_HINT);
    const sectionSelect = elements(render()).find((node) =>
      node.props.options?.some((option) => option.value === GOVERNMENT)
      && node.props.options.some((option) => option.value === TAX));
    expect(sectionSelect?.props.onChange).toBeTypeOf("function");
    sectionSelect!.props.onChange!(TAX);
    expect(button(render(), "최신차수(편집)").props.disabled).toBeUndefined();
    expect(button(render(), "최신차수(편집)").props.className).toBe(latestClass);
    expect(button(render(), "합계(읽기전용)").props.className).toBe(sumClass);
    expect(text(render())).not.toContain(MIRROR_HINT);
  });

  it.each([
    ["default government", GOVERNMENT, undefined, "최신차수(편집)"],
    ["government mirror", GOVERNMENT, [GOVERNMENT], "최신차수(읽기전용)"],
    ["tax", TAX, [GOVERNMENT], "최신차수(편집)"],
  ] as const)("saves both modes in %s without adding a readonly flag", async (_case, section, readonlySections, latestLabel) => {
    for (const mode of ["sum", "latest"] as const) {
      const a = adapter({ readonlySections });
      const render = manager(a, { section });
      await click(render(), mode === "sum" ? "합계(읽기전용)" : latestLabel);
      await click(render(), "연결 추가");
      expect(a.saveLinks).toHaveBeenCalledWith([link({ columnKey: "amount", section, mode })]);
      expect(vi.mocked(a.saveLinks).mock.calls[0][0][0]).not.toHaveProperty("readonly");
    }
  });

  it.each(["select", "percent"])("keeps %s sum disabled and describes the displayed latest mode", (colKey) => {
    const a = adapter({ readonlySections: [GOVERNMENT] });
    const government = manager(a, { colKey, mode: "latest" })();
    expect(button(government, "합계(읽기전용)").props).toMatchObject({
      disabled: true, title: "드롭다운·비율(%) 칸은 최신차수(읽기전용)로만 연결됩니다.",
    });
    const tax = manager(a, { colKey, section: TAX, mode: "latest" })();
    expect(button(tax, "합계(읽기전용)").props).toMatchObject({
      disabled: true, title: "드롭다운·비율(%) 칸은 최신차수(편집)로만 연결됩니다.",
    });
  });

  it.each([TAX, GOVERNMENT])("preserves recovery formula latest-only behavior in %s", async (section) => {
    const a = adapter({ readonlySections: [GOVERNMENT] });
    const render = manager(a, { section, mode: "latest", fields: [{ ...amountField, type: "formula" }] });
    expect(text(render())).toContain("최신차수(읽기전용)");
    expect(text(render())).toContain("자동계산 칸은 표에서 편집할 수 없습니다.");
    expect(elements(render()).some((node) => node.type === "button" && /합계|최신차수/.test(text(node)))).toBe(false);
    await click(render(), "연결 추가");
    expect(a.saveLinks).toHaveBeenCalledWith([link({ columnKey: "amount", section, mode: "latest", readonly: true })]);
  });

  it("preserves recovery date formula hint and saved readonly flag", async () => {
    const field: TierFieldDef & { formulaResult: string } = { ...amountField, type: "formula", formulaResult: "date" };
    const a = adapter({ readonlySections: [GOVERNMENT] });
    const render = manager(a, { mode: "latest", fields: [field] });
    expect(text(render())).toContain("최신차수(읽기전용)");
    expect(text(render())).toContain("자동계산 칸은 표에서 편집할 수 없습니다.");
    expect(elements(render()).some((node) => node.type === "button" && /합계|최신차수/.test(text(node)))).toBe(false);
    await click(render(), "연결 추가");
    expect(a.saveLinks).toHaveBeenCalledWith([link({ columnKey: "amount", readonly: true })]);
  });

  it("passes the same unmodified link through preview, migration, and saving", async () => {
    const existing = Object.freeze(link({ columnKey: "tax", section: TAX, readonly: false }));
    const a = adapter({
      readonlySections: [GOVERNMENT],
      previewMigrate: vi.fn(async () => ({ migrate: 2, conflict: 0, aligned: 1 })),
      applyMigrate: vi.fn(async () => ({ ok: true })),
    });
    const render = manager(a, { mode: "latest", links: Object.freeze([existing]) });
    await click(render(), "미리보기");
    expect(a.previewMigrate).toHaveBeenCalledWith(link({ columnKey: "amount" }));
    expect(a.applyMigrate).not.toHaveBeenCalled();
    expect(a.saveLinks).not.toHaveBeenCalled();
    await click(render(), "적용");
    const previewed = vi.mocked(a.previewMigrate!).mock.calls[0][0];
    expect(vi.mocked(a.applyMigrate!).mock.calls[0][0]).toBe(previewed);
    expect(a.saveLinks).toHaveBeenCalledWith([existing, link({ columnKey: "amount" })]);
    expect(vi.mocked(a.saveLinks).mock.calls[0][0][0]).toBe(existing);
    expect(vi.mocked(a.saveLinks).mock.calls[0][0][1]).toBe(previewed);
    expect(previewed).not.toHaveProperty("readonly");
    expect(existing).toEqual(link({ columnKey: "tax", section: TAX, readonly: false }));
  });
});
