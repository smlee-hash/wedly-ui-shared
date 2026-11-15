// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnDef } from "../types/columns";
import { CollabTable, type CollabTableProps } from "./CollabTable";

// 표에서 선택·상태 칸을 바로 고를 때 선택지는 그 줄을 보고 고른다 — 한 표에 분야가 다른 줄이 섞이면(통합 DB 관리 전체 탭)
// 노무 줄에 경정청구 선택지가 나오지 않게 앱이 줄마다 다른 선택지를 줄 수 있어야 한다(2026-11-15 화면 검토).
// 옛 앱처럼 칸 이름만 받는 getOptions 도 그대로 돈다.

// jsdom 은 크기가 0이라 가상 스크롤이 줄을 하나도 그리지 않는다 — 시험은 스크롤이 아니라 편집기를 보므로 모든 줄을 그리게 바꾼다.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const items = Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 37, end: (index + 1) * 37, size: 37, lane: 0 }));
    return { getVirtualItems: () => items, getTotalSize: () => count * 37 };
  },
}));

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "상호", type: "title", defaultVisible: true },
  { key: "stage", label: "진행상태", type: "status", defaultVisible: true },
  { key: "tags", label: "태그", type: "multi_select", defaultVisible: true },
] as ColumnDef[];
const ROWS = [
  { _id: "r1", name: "가나상사", stage: "상담", tags: "", 분야: "노무" },
  { _id: "r2", name: "다라상사", stage: "접수", tags: "", 분야: "경정청구" },
];
const OPTIONS: Record<string, Record<string, string[]>> = {
  노무: { stage: ["상담", "노무 진행"], tags: ["노무 태그"] },
  경정청구: { stage: ["접수", "경정 진행"], tags: ["경정 태그"] },
};

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let savedActEnv: boolean | undefined;

async function draw(editConfig: CollabTableProps["editConfig"]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(
      <CollabTable
        storagePrefix="test:row-options"
        columns={COLUMNS}
        rows={ROWS}
        loading={false}
        onRefresh={() => {}}
        isAdmin
        onOpenRow={() => {}}
        onCellEdit={() => {}}
        editConfig={editConfig}
      />,
    );
  });
  return container;
}

/** 줄(상호 글자로 찾음)의 칸을 눌러 편집을 연다. */
async function openCell(container: HTMLElement, company: string, columnKey: string) {
  const row = Array.from(container.querySelectorAll("tr")).find((tr) => tr.textContent?.includes(company));
  const cell = row?.querySelector<HTMLElement>(`td[data-col="${columnKey}"]`);
  if (!cell) throw new Error(`${company} 줄의 ${columnKey} 칸이 없습니다`);
  await act(async () => {
    cell.click();
  });
}

beforeEach(() => {
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("CollabTable — 칸을 바로 고를 때 선택지는 그 줄로 묻는다", () => {
  it("상태 칸: getOptions 가 칸 이름과 그 줄을 받아 줄마다 다른 선택지를 보인다", async () => {
    const getOptions = vi.fn((columnKey: string, row?: Record<string, unknown>) => OPTIONS[String(row?.분야)]?.[columnKey] ?? []);
    const container = await draw({ getOptions });

    await openCell(container, "가나상사", "stage");
    expect(getOptions).toHaveBeenCalledWith("stage", expect.objectContaining({ _id: "r1" }));
    expect(document.body.textContent).toContain("노무 진행");
    expect(document.body.textContent).not.toContain("경정 진행");
  });

  it("다중 선택 칸도 그 줄의 선택지를 보인다", async () => {
    const getOptions = vi.fn((columnKey: string, row?: Record<string, unknown>) => OPTIONS[String(row?.분야)]?.[columnKey] ?? []);
    const container = await draw({ getOptions });

    await openCell(container, "다라상사", "tags");
    expect(getOptions).toHaveBeenCalledWith("tags", expect.objectContaining({ _id: "r2" }));
    expect(getOptions.mock.calls.every(([, row]) => row && (row as { _id: string })._id === "r2")).toBe(true);
    expect(document.body.textContent).toContain("경정 태그");
    expect(document.body.textContent).not.toContain("노무 태그");
  });

  it("칸 이름만 받는 옛 getOptions 도 그대로 선택지를 보인다", async () => {
    const getOptions = vi.fn((columnKey: string) => (columnKey === "stage" ? ["상담", "접수", "완료"] : []));
    const container = await draw({ getOptions });

    await openCell(container, "가나상사", "stage");
    expect(document.body.textContent).toContain("완료");
  });
});
