// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FilterBar, type FilterBarProps } from "./FilterBar";
import { EMPTY_OPTION_VALUE } from "./collab-filters";
import type { FilterItem } from "./filter-items";

// 일루아 업체 목록 지역 필터(노션 NO.724): 선택지마다 업체 수를 보이고, 빈 값이 없는 칸은 '(미입력)'을 숨긴다.
// 두 기능은 선택이다 — 넘기지 않은 화면(ERP·하이브·다른 필터 칸)은 지금과 똑같아야 한다.

const FIELDS = [
  { key: "sido", label: "시·도", type: "select" },
  { key: "status", label: "진행상태", type: "select" },
];
const OPTIONS: Record<string, string[]> = { sido: ["경기", "서울", "주소 없음"], status: ["접수", "완료"] };

let host: HTMLDivElement;
let root: Root;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(field: string, extra: Partial<FilterBarProps> = {}) {
  const items: FilterItem[] = [{ id: "f1", field, operator: "in" }];
  act(() => {
    root.render(
      <FilterBar
        fields={FIELDS}
        items={items}
        onChange={() => {}}
        visible
        onToggleVisible={() => {}}
        onReset={() => {}}
        getOptions={(k) => OPTIONS[k] ?? []}
        {...extra}
      />,
    );
  });
  const chip = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(FIELDS.find((f) => f.key === field)!.label));
  act(() => chip!.click());
}

/** 열린 값 목록의 줄마다 [선택지, 개수 글자] — 개수가 없으면 null. */
function optionRows(): Array<[string, string | null]> {
  return [...host.querySelectorAll("label:has(input[type=checkbox])")].map((row) => [
    row.querySelector("[data-option-label]")?.textContent ?? "",
    row.querySelector("[data-option-count]")?.textContent ?? null,
  ]);
}

describe("FilterBar 선택지 개수·빈 값 선택지", () => {
  it("getOptionCount 를 넘기면 선택지마다 개수를 보인다", () => {
    const counts: Record<string, number> = { [EMPTY_OPTION_VALUE]: 0, 경기: 12, 서울: 3, "주소 없음": 1 };
    render("sido", { getOptionCount: (_k, o) => counts[o] });
    expect(optionRows()).toEqual([
      [EMPTY_OPTION_VALUE, "0"],
      ["경기", "12"],
      ["서울", "3"],
      ["주소 없음", "1"],
    ]);
  });

  it("개수가 1,000 을 넘으면 자리 쉼표를 찍는다", () => {
    render("sido", { getOptionCount: (_k, o) => (o === "경기" ? 1234 : undefined) });
    expect(optionRows().find(([o]) => o === "경기")?.[1]).toBe("1,234");
  });

  it("getOptionCount 가 undefined 를 돌려준 선택지는 개수를 그리지 않는다", () => {
    render("status", { getOptionCount: (k) => (k === "sido" ? 5 : undefined) });
    expect(optionRows().every(([, c]) => c === null)).toBe(true);
  });

  it("includeEmptyOption 이 false 인 칸은 '(미입력)'을 넣지 않는다", () => {
    render("sido", { includeEmptyOption: (k) => k !== "sido" });
    expect(optionRows().map(([o]) => o)).toEqual(["경기", "서울", "주소 없음"]);
  });

  it("includeEmptyOption 이 true 인 칸은 지금처럼 '(미입력)'을 맨 앞에 넣는다", () => {
    render("status", { includeEmptyOption: (k) => k !== "sido" });
    expect(optionRows().map(([o]) => o)).toEqual([EMPTY_OPTION_VALUE, "접수", "완료"]);
  });

  it("두 기능을 넘기지 않으면 지금과 같다 — '(미입력)' 맨 앞, 개수 없음", () => {
    render("sido");
    expect(optionRows()).toEqual([
      [EMPTY_OPTION_VALUE, null],
      ["경기", null],
      ["서울", null],
      ["주소 없음", null],
    ]);
  });
});
