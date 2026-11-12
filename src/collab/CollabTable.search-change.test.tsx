// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CollabTable } from "./CollabTable";

// 일루아 업체 목록 지역 필터(노션 NO.724): 필터 바 선택지 업체 수를 표와 같은 검색으로 세려면
// 표 안 검색어를 바깥이 알아야 한다. onSearchChange 를 넘기지 않으면 지금과 똑같다.

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
  localStorage.clear();
});

const COLUMNS = [{ key: "name", label: "상호명", type: "title" }];
const ROWS = [{ _id: "1", name: "가나상사" }];

function renderTable(onSearchChange?: (q: string) => void) {
  act(() => {
    root.render(
      <CollabTable
        storagePrefix="search-change-test"
        columns={COLUMNS}
        rows={ROWS}
        rowIdKey="_id"
        loading={false}
        onRefresh={() => {}}
        isAdmin={false}
        onOpenRow={() => {}}
        onSearchChange={onSearchChange}
      />,
    );
  });
}

async function typeSearch(text: string) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder*="검색"]');
  expect(input).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, text);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150)); // 0.1초 디바운스
  });
}

describe("CollabTable onSearchChange", () => {
  it("처음엔 빈 검색어, 입력하면 디바운스 뒤 소문자·앞뒤 공백 없는 검색어를 알린다", async () => {
    const onSearchChange = vi.fn();
    renderTable(onSearchChange);
    expect(onSearchChange).toHaveBeenLastCalledWith("");
    await typeSearch("  ABC 상사 ");
    expect(onSearchChange).toHaveBeenLastCalledWith("abc 상사");
  });

  it("넘기지 않아도 검색은 그대로 된다", async () => {
    renderTable();
    await typeSearch("가나");
    expect(host.textContent).toContain("가나상사");
  });
});
