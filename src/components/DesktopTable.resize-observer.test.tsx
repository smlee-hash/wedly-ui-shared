// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DesktopTable } from "./DesktopTable";

// 실제 DesktopTable과 TanStack을 사용한다. jsdom에 없는 크기 알림·프레임·스크롤만 제공한다.
const rows = Array.from({ length: 100 }, (_, index) => ({
  _id: `row-${String(index).padStart(3, "0")}`,
  name: `이름 ${String(index).padStart(3, "0")}`,
}));
const noop = () => {};

function TableHost() {
  const [checkedIds, setCheckedIds] = useState(new Set<string>());
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const colMenuRef = useRef<HTMLDivElement | null>(null);
  const resizingRef = useRef<unknown>(null);
  return (
    <DesktopTable
      mobileViewMode="table"
      pagedData={direction === "asc" ? rows : [...rows].reverse()}
      sortedDataLength={rows.length}
      activeColumns={[{ key: "name", label: "이름", type: "text", defaultVisible: true }]}
      colWidths={{ name: 240 }}
      stickyOffsets={{}}
      checkedIds={checkedIds}
      toggleAllChecks={() => setCheckedIds((current) =>
        current.size === rows.length ? new Set() : new Set(rows.map((row) => row._id)),
      )}
      sortConfig={{ key: "name", direction }}
      handleSort={() => setDirection((current) => current === "asc" ? "desc" : "asc")}
      colMenuKey={null}
      setColMenuKey={noop}
      colMenuRef={colMenuRef}
      renamingColKey={null}
      setRenamingColKey={noop}
      renameValue=""
      setRenameValue={noop}
      saveColLabel={noop}
      removeColFromTab={noop}
      dragColKey={null}
      setDragColKey={noop}
      dragOverColKey={null}
      setDragOverColKey={noop}
      resizingRef={resizingRef}
      reorderColumn={noop}
      onResizeStart={noop}
      onResizeDoubleClick={noop}
      getColLabel={(col) => col.label}
      getColAccent={() => null}
      error={null}
      searchQuery=""
      refreshData={noop}
      renderRow={(row, index) => {
        const id = String(row._id);
        return (
          <tr key={id} data-index={index} data-row-id={id}>
            <td>
              <input
                type="checkbox"
                aria-label={`${String(row.name)} 선택`}
                checked={checkedIds.has(id)}
                onChange={() => setCheckedIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })}
              />
            </td>
            <td>{String(row.name)}</td>
          </tr>
        );
      }}
    />
  );
}

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.push(this);
  }
  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
}

const frames = new Map<number, FrameRequestCallback>();
const restore: Array<() => void> = [];
let nextFrame = 0;
let root: Root | undefined;
let container: HTMLDivElement;

function replace(target: object, key: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
  restore.push(() => {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  replace(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  for (const target of new Set<object>([globalThis, window])) {
    replace(target, "ResizeObserver", ControlledResizeObserver);
    replace(target, "requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    replace(target, "cancelAnimationFrame", (id: number) => frames.delete(id));
  }
  replace(HTMLElement.prototype, "scrollTo", function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollTop = options.top ?? this.scrollTop;
    this.scrollLeft = options.left ?? this.scrollLeft;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  try {
    await act(async () => root?.unmount());
  } finally {
    root = undefined;
    container.remove();
    restore.reverse().forEach((undo) => undo());
    restore.length = 0;
    frames.clear();
    nextFrame = 0;
    ControlledResizeObserver.instances = [];
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it("실제 표의 크기 측정과 행 갱신은 다음 프레임에 실행되고 끝 행·선택·정렬이 유지된다", async () => {
  await act(async () => root!.render(<TableHost />));
  const scrollDiv = container.querySelector<HTMLDivElement>("div.overflow-y-auto")!;
  expect(scrollDiv.tagName).toBe("DIV");
  const observer = ControlledResizeObserver.instances.find((item) => item.targets.has(scrollDiv));
  expect(observer).toBeDefined();

  const visibleIds = () => Array.from(container.querySelectorAll("tbody tr[data-row-id]"))
    .map((row) => row.getAttribute("data-row-id"));
  const rowCheck = (id: string) => container.querySelector<HTMLInputElement>(`tr[data-row-id="${id}"] input`)!;
  const allCheck = () => container.querySelector<HTMLInputElement>("thead input[type=checkbox]")!;
  const click = async (element: HTMLElement) => { await act(async () => element.click()); };
  const scroll = async (top: number) => {
    await act(async () => {
      scrollDiv.scrollTop = top;
      scrollDiv.dispatchEvent(new Event("scroll"));
    });
  };
  const resize = async (height: number) => {
    const previousRows = visibleIds();
    const readMeasurement = vi.fn(() => [{ inlineSize: 1038.609375, blockSize: height }]);
    const entry = Object.defineProperty({ target: scrollDiv }, "borderBoxSize", {
      get: readMeasurement,
    }) as ResizeObserverEntry;
    // 알림 뒤 React 갱신까지 기다린다. 원래 동기 실행이면 여기서 측정·행 수가 바뀌어 실패한다.
    await act(async () => observer!.callback([entry], observer as unknown as ResizeObserver));
    expect(readMeasurement).not.toHaveBeenCalled();
    expect(visibleIds()).toEqual(previousRows);
    expect(frames.size).toBe(1);
    await act(async () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(16));
    });
    expect(readMeasurement).toHaveBeenCalled();
    expect(frames.size).toBe(0);
  };

  // jsdom의 초기 크기 0×0에서 실제 브라우저에서 관측한 폭×높이 37로 바꾼다.
  expect(visibleIds()).toEqual([]);
  await resize(37);
  expect(visibleIds()).toEqual(rows.slice(0, 16).map((row) => row._id));
  await click(rowCheck("row-000"));
  expect(rowCheck("row-000").checked).toBe(true);
  expect(allCheck().checked).toBe(false);

  await resize(185);
  expect(visibleIds()).toEqual(rows.slice(0, 20).map((row) => row._id));
  expect(rowCheck("row-000").checked).toBe(true);
  await resize(111);
  expect(visibleIds()).toEqual(rows.slice(0, 18).map((row) => row._id));

  const bottom = rows.length * 37 - 111;
  await scroll(bottom);
  expect(visibleIds()).toEqual(rows.slice(-18).map((row) => row._id));
  expect(container.querySelector<HTMLTableRowElement>("tbody tr:last-child")!.style.height).toBe("0px");
  await click(rowCheck("row-099"));
  await scroll(0);
  expect(rowCheck("row-000").checked).toBe(true);

  await click(container.querySelector<HTMLElement>("thead .truncate")!);
  expect(container.querySelector("thead")!.textContent).toContain("↓");
  expect(visibleIds()).toEqual(rows.slice(-18).reverse().map((row) => row._id));
  expect(rowCheck("row-099").checked).toBe(true);
  await scroll(bottom);
  expect(visibleIds()).toEqual(rows.slice(0, 18).reverse().map((row) => row._id));
  expect(rowCheck("row-000").checked).toBe(true);

  await click(allCheck());
  expect(allCheck().checked).toBe(true);
  await scroll(0);
  expect(rowCheck("row-099").checked).toBe(true);
  await click(allCheck());
  expect(allCheck().checked).toBe(false);
  expect(Array.from(container.querySelectorAll<HTMLInputElement>("tbody input"))
    .every((input) => !input.checked)).toBe(true);
  await click(container.querySelector<HTMLElement>("thead .truncate")!);
  expect(container.querySelector("thead")!.textContent).toContain("↑");
  await resize(37);
  expect(visibleIds()).toEqual(rows.slice(0, 16).map((row) => row._id));
});
