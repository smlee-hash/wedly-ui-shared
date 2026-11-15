// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "../types/columns";
import type { FieldOptionsBundle } from "./adapter-types";
import { FieldOptionsProvider } from "./field-options-context";
import { EditableFieldRow } from "./editors";

// 상세창 다중선택 편집기의 색 바꾸기(노션 개선 글 40f7b6a9 — 출처 3fe7b6a9).
//
// 결함: 단일선택은 색 고르기 판(colorFamilies)을 넘긴 앱만 「색상 변경」 단추를 그리는데, 다중선택 편집기는
// 끄는 설정이 없어 늘 그렸다. 색을 ERP 에서만 정하는 앱(일루아 — 판을 비우고 색 저장을 빈 함수로 둠)에서도
// 단추·「새 옵션 추가」 색 점이 보여, 눌러도 저장되지 않는 색을 고르게 했다(그 앱은 globals.css 로 숨겨 왔다).
//
// 진짜 EditableFieldRow·MultiSelectEditor·FieldOptionsProvider 를 쓴다. 가짜로 바꾼 것은 이 시험과 무관한
// 곁가지(배럴 ../index 의 글자·숫자 입력기와 표시 함수, 단일선택·사람 선택 공용 부품)뿐이다.
vi.mock("../index", () => ({
  TextEditor: () => null,
  NumberEditor: () => null,
  isCommonBasicLabel: () => false,
  renderUnifiedFieldValue: () => null,
  detectPersonChipRole: () => null,
  formatPercent: (v: unknown) => String(v),
}));
vi.mock("@wedly/detail-modal-shared", () => ({
  SelectDropdownBody: () => null,
  MultiPersonEditor: () => null,
  personDisplayName: (s: string) => s,
}));

const FAMILIES: FieldOptionsBundle["OPTION_COLOR_FAMILIES"] = [
  { name: "파랑", shades: [{ shade: "보통", bg: "bg-blue-100", text: "text-blue-700", bgHex: "#DBEAFE" }] },
];
const PALETTE: FieldOptionsBundle["OPTION_COLOR_PALETTE"] = [
  { name: "파랑", bg: "bg-blue-100", text: "text-blue-700", hex: "#DBEAFE" },
  { name: "초록", bg: "bg-green-100", text: "text-green-700", hex: "#DCFCE7" },
];

const bundle = (families: FieldOptionsBundle["OPTION_COLOR_FAMILIES"], palette = PALETTE) => ({
  READONLY_TYPES: new Set<string>(),
  getFieldOptions: () => ["가", "나"],
  addCustomOption: vi.fn(),
  removeCustomOption: vi.fn(),
  setOptionColor: vi.fn(),
  getOptionColorClass: () => "bg-wedly-bg-gray text-wedly-t2",
  OPTION_COLOR_FAMILIES: families,
  OPTION_COLOR_PALETTE: palette,
  STATUS_COLORS: {},
  SELECT_BADGE_COLORS: {},
  isReadonlyPerson: () => false,
});

const COL: ColumnDef = { key: "custom_tags", label: "태그", type: "multi_select", defaultVisible: true };

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

/** 다중선택 칸을 그리고 값 영역을 눌러 편집기(document.body 로 띄움)를 연다. */
async function openEditor(fo: FieldOptionsBundle) {
  await act(async () => {
    root.render(
      <FieldOptionsProvider value={fo}>
        <EditableFieldRow col={COL} value="가" onUpdate={vi.fn()} />
      </FieldOptionsProvider>,
    );
  });
  await act(async () => {
    (container.querySelector(".cursor-pointer") as HTMLDivElement).click();
  });
}
const colorButtons = () => document.body.querySelectorAll('button[title="색상 변경"]');
const buttonByText = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
/** 편집기(document.body 로 띄운 판)에 보이는 선택지 이름 — 위에서부터. */
const optionLabels = () => Array.from(document.body.querySelectorAll("div.fixed span.truncate")).map((s) => s.textContent);
const paletteDots = () => PALETTE.flatMap((c) => Array.from(document.body.querySelectorAll(`button[title="${c.name}"]`)));

async function addOption(name: string) {
  await act(async () => {
    buttonByText("+ 새 옵션 추가").click();
  });
  const input = document.body.querySelector('input[placeholder="새 옵션 이름"]') as HTMLInputElement;
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

describe("색 고르기 판을 비운 앱(색은 ERP 에서만 정함)", () => {
  it("선택지마다 「색상 변경」 단추를 그리지 않는다", async () => {
    await openEditor(bundle([]));
    expect(optionLabels()).toEqual(["가", "나"]); // 편집기는 열려 있다
    expect(colorButtons()).toHaveLength(0);
  });

  it("「새 옵션 추가」 양식에 색 점이 없고, 추가해도 색을 저장하지 않는다", async () => {
    const fo = bundle([]);
    await openEditor(fo);
    await addOption("다");
    expect(paletteDots()).toHaveLength(0);
    await act(async () => {
      buttonByText("추가").click();
    });
    expect(fo.addCustomOption).toHaveBeenCalledWith("custom_tags", "다");
    expect(fo.setOptionColor).not.toHaveBeenCalled();
    expect(optionLabels()).toEqual(["가", "나", "다"]);
  });

  it("팔레트까지 비워도 새 선택지를 추가할 수 있다", async () => {
    const fo = bundle([], []);
    await openEditor(fo);
    await addOption("다");
    await act(async () => {
      buttonByText("추가").click();
    });
    expect(fo.addCustomOption).toHaveBeenCalledWith("custom_tags", "다");
    expect(optionLabels()).toEqual(["가", "나", "다"]);
  });
});

describe("색 고르기 판을 넘긴 앱(ERP·하이브) — 전과 같다", () => {
  it("선택지마다 「색상 변경」 단추가 있고 눌러 고른 색을 저장한다", async () => {
    const fo = bundle(FAMILIES);
    await openEditor(fo);
    expect(colorButtons()).toHaveLength(2);
    await act(async () => {
      (colorButtons()[0] as HTMLButtonElement).click();
    });
    await act(async () => {
      (document.body.querySelector('button[title="파랑 · 보통"]') as HTMLButtonElement).click();
    });
    expect(fo.setOptionColor).toHaveBeenCalledWith("가", { bg: "bg-blue-100", text: "text-blue-700" });
  });

  it("「새 옵션 추가」 양식에 색 점이 있고, 고른 색으로 새 선택지 색을 저장한다", async () => {
    const fo = bundle(FAMILIES);
    await openEditor(fo);
    await addOption("다");
    expect(paletteDots()).toHaveLength(2);
    await act(async () => {
      (document.body.querySelector('button[title="초록"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      buttonByText("추가").click();
    });
    expect(fo.addCustomOption).toHaveBeenCalledWith("custom_tags", "다");
    expect(fo.setOptionColor).toHaveBeenCalledWith("다", { bg: "bg-green-100", text: "text-green-700" });
  });
});
