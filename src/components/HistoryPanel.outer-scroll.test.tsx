// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryPanel, type HistoryAdapter } from "./HistoryPanel";
import type { UnifiedComment } from "../unified/history-core";

// 히스토리 패널이 높이가 정해지지 않은 부모 안에 들어가면(노션 3fe7b6a9, 운영 측정: 목록 h=scrollHeight=clientHeight=6348)
// 목록 상자는 스스로 스크롤되지 않고 **바깥 조상 칸**이 스크롤된다. 그런데 「맨 아래로 따라가기」는 목록 상자의 scrollTop 만
// 바꿔서, 처음 열 때와 내가 새 히스토리를 저장했을 때 최신 내역(패널 맨 아래)으로 가지 않고 맨 위에 머물렀다.
//
// 진짜 HistoryPanel 을 inline style `overflow-y:auto` 를 준 바깥 div 안에 그린다. jsdom 은 레이아웃이 없으므로
// 요소별로 크기를 흉내 낸다(이 시험이 정하는 것은 아래뿐이고, 제품의 판정 함수는 다시 만들지 않는다).
//   - 목록 상자: scrollHeight == clientHeight(스스로 안 스크롤). 「목록이 스스로 스크롤」 경우만 clientHeight 를 작게 둔다.
//   - 바깥 칸: scrollHeight > clientHeight, scrollTop 은 [0, 높이-보이는 높이] 로 잘라 저장.
//   - getBoundingClientRect: 바깥 칸 scrollTop 에 따라 목록·패널의 bottom 이 움직인다. 패널 끝은 목록 끝 아래 입력 칸(INPUT_H) 만큼 더 내려간다.
// 기대값은 전부 바깥 칸(또는 목록) 요소의 scrollTop 이다.
//
// 구현 전 실패해야 하는 시험: 처음 열기·바깥 칸이 끝에 붙어 있을 때 따라가기·위로 올려 둔 채 내 저장·다시 끝에 붙으면 따라가기.
// 나머지(위로 올려 읽는 중 위치 지키기, 목록 자신이 스크롤되는 경우)는 지금도 통과해야 하는 보호선이다.

const OUTER_VIEWPORT = 600;
const LIST_VIEWPORT = 300;
const INPUT_H = 80;
const layout = { height: 2000, listSelfScrolls: false };
const scrollTops = new WeakMap<object, number>();

const isOuter = (el: Element) => el.hasAttribute("data-test-outer");
const isList = (el: Element) => el.matches("div.overflow-y-auto.space-y-4");
const isPanelRoot = (el: Element) => !!el.parentElement && isOuter(el.parentElement);
const listHeight = () => layout.height - INPUT_H;
const outerEl = () => document.querySelector("[data-test-outer]") as HTMLDivElement;
const outerMax = () => Math.max(0, layout.height - OUTER_VIEWPORT);
const listMax = () => (layout.listSelfScrolls ? Math.max(0, listHeight() - LIST_VIEWPORT) : 0);
const maxTopOf = (el: Element) => (isOuter(el) ? outerMax() : isList(el) ? listMax() : 0);

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() {} } as DOMRect;
}

const originals: Record<string, PropertyDescriptor | undefined> = {};
let originalRect: typeof Element.prototype.getBoundingClientRect;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const key of ["scrollHeight", "clientHeight", "scrollTop"]) {
    originals[key] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isOuter(this) ? layout.height : isList(this) ? listHeight() : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (isOuter(this)) return OUTER_VIEWPORT;
      if (isList(this)) return layout.listSelfScrolls ? LIST_VIEWPORT : listHeight();
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get(this: HTMLElement) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: HTMLElement, v: number) {
      scrollTops.set(this, Math.max(0, Math.min(Number(v), maxTopOf(this))));
    },
  });
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const outerTop = scrollTops.get(outerEl()) ?? 0;
    if (isOuter(this)) return rect(0, OUTER_VIEWPORT);
    if (isPanelRoot(this)) return rect(-outerTop, layout.height - outerTop);
    if (isList(this)) return rect(-outerTop, listHeight() - outerTop);
    return rect(0, 0);
  };
});
afterAll(() => {
  for (const key of ["scrollHeight", "clientHeight", "scrollTop"]) {
    if (originals[key]) Object.defineProperty(HTMLElement.prototype, key, originals[key]!);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
  Element.prototype.getBoundingClientRect = originalRect;
});

const iso = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
const other = (i: number): UnifiedComment => ({ id: `c${i}`, name: "배보라", text: `상담 내역 ${i}`, createdAt: iso(i), source: "hive" });

/** 서버 흉내 — 목록을 시험이 바꾸고, 어댑터는 그 목록을 **새 배열**로 돌려준다(실제 통신과 같다). */
function makeServer(initial: UnifiedComment[]) {
  let list = initial;
  const fetch = vi.fn(async () => ({ comments: [...list] }));
  const create = vi.fn(async ({ text, category }: { text: string; category?: string }) => {
    list = [...list, { id: `c${list.length + 100}`, name: "나", text, createdAt: iso(list.length + 100), source: "hive", category }];
    return [...list];
  });
  const edit = vi.fn(async ({ commentId, text }: { commentId: string; text: string }) => {
    list = list.map((c) => (c.id === commentId ? { ...c, text } : c));
    return [...list];
  });
  const remove = vi.fn(async ({ commentId }: { commentId: string }) => {
    list = list.filter((c) => c.id !== commentId);
    return [...list];
  });
  const adapter: HistoryAdapter = { fetch, create, edit, remove };
  return { adapter, fetch, create, set: (next: UnifiedComment[]) => { list = next; } };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  layout.height = 2000;
  layout.listSelfScrolls = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

type Props = Partial<React.ComponentProps<typeof HistoryPanel>>;
/** 앱 화면처럼 — 높이가 정해지지 않은 부모(`overflow-y:auto` 바깥 칸) 안에 진짜 HistoryPanel 을 그린다. */
const render = async (adapter: HistoryAdapter, props: Props = {}) => {
  await act(async () => {
    root.render(
      <div data-test-outer="" style={{ overflowY: "auto" }}>
        <HistoryPanel
          adapter={adapter}
          currentUserName="나"
          pollingIntervalMs={5000}
          confirmDialog={async () => true}
          alertDialog={() => {}}
          {...props}
        />
      </div>,
    );
  });
  await settle(0);
};
const settle = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const list = () => container.querySelector("div.overflow-y-auto.space-y-4") as HTMLDivElement;
/** 사용자가 바깥 칸을 스크롤한다 — 브라우저는 스크롤 위치를 바꾸고 바깥 칸에 scroll 신호를 보낸다. */
const scrollOuterTo = async (top: number) => {
  await act(async () => {
    outerEl().scrollTop = top;
    outerEl().dispatchEvent(new Event("scroll"));
  });
};
const typeInto = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const buttonByText = (root_: ParentNode, text: string) =>
  [...root_.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const saveMyRecord = async () => {
  await typeInto(container.querySelector("textarea") as HTMLTextAreaElement, "방금 쓴 기록");
  await act(async () => {
    buttonByText(container, "등록").click();
  });
  await settle(0);
};

const manyOthers = (n: number) => Array.from({ length: n }, (_, i) => other(i + 1));

describe("바깥 칸이 스크롤되는 배치(목록 상자는 스스로 안 스크롤)", () => {
  it("전제: 목록은 스스로 스크롤되지 않고 바깥 칸만 스크롤된다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    expect(list().scrollHeight - list().clientHeight).toBe(0);
    expect(outerEl().scrollHeight - outerEl().clientHeight).toBeGreaterThan(1);
    expect(getComputedStyle(outerEl()).overflowY).toBe("auto");
  });

  it("a. 처음 열면 바깥 칸이 패널 끝(최신 내역·입력 칸)까지 내려간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    expect(list().textContent).toContain("상담 내역 30");
    expect(outerEl().scrollTop).toBe(outerMax());
  });

  it("b. 바깥 칸을 위로 올려 읽는 중이면 5초 갱신이 돌아도 위치가 그대로다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await scrollOuterTo(500);
    const before = s.fetch.mock.calls.length;
    await settle(65_000);
    expect(s.fetch.mock.calls.length - before).toBeGreaterThanOrEqual(12);
    expect(outerEl().scrollTop).toBe(500);
  });

  it("b. 바깥 칸을 위로 올려 읽는 중이면 남이 쓴 새 내역이 와도 위치가 그대로다(새 내역은 화면에 반영된다)", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await scrollOuterTo(500);
    layout.height = 2120;
    s.set([...manyOthers(30), other(31)]);
    await settle(5000);
    expect(list().textContent).toContain("상담 내역 31");
    expect(outerEl().scrollTop).toBe(500);
  });

  it("c. 바깥 칸이 끝에 붙어 있으면 남이 쓴 새 내역이 와도 끝을 따라간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await scrollOuterTo(outerMax());
    layout.height = 2120;
    s.set([...manyOthers(30), other(31)]);
    await settle(5000);
    expect(list().textContent).toContain("상담 내역 31");
    expect(outerEl().scrollTop).toBe(outerMax());
    expect(outerMax()).toBe(2120 - OUTER_VIEWPORT);
  });

  it("c. 위로 올려 읽다가 다시 끝까지 내려 붙이면 그 뒤 새 내역을 따라간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await scrollOuterTo(500);
    await scrollOuterTo(outerMax());
    layout.height = 2120;
    s.set([...manyOthers(30), other(31)]);
    await settle(5000);
    expect(outerEl().scrollTop).toBe(outerMax());
  });

  it("d. 위로 올려 둔 채 내가 새 히스토리를 저장하면 바깥 칸이 끝으로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await scrollOuterTo(500);
    layout.height = 2120;
    await saveMyRecord();
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(list().textContent).toContain("방금 쓴 기록");
    expect(outerEl().scrollTop).toBe(outerMax());
  });

  it("d. 내가 저장해 끝으로 간 뒤 다시 위로 올려 읽으면 주기 갱신이 위치를 지킨다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    layout.height = 2120;
    await saveMyRecord();
    await scrollOuterTo(500);
    await settle(30_000);
    expect(outerEl().scrollTop).toBe(500);
  });

  it("e. 다른 사업장(pageId)으로 바뀌면 처음 여는 것처럼 바깥 칸이 끝으로 간다", async () => {
    const a = makeServer(manyOthers(30));
    await render(a.adapter, { pageId: "A" });
    await scrollOuterTo(500);
    const b = makeServer(manyOthers(40));
    layout.height = 2400;
    await render(b.adapter, { pageId: "B" });
    await settle(0);
    expect(list().textContent).toContain("상담 내역 40");
    expect(outerEl().scrollTop).toBe(outerMax());
    expect(outerMax()).toBe(2400 - OUTER_VIEWPORT);
  });

  it("패널 화면에서 사라지면 바깥 칸에 달아 둔 scroll 듣기를 뗀다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    const outer = outerEl();
    const added = vi.spyOn(outer, "addEventListener");
    const removed = vi.spyOn(outer, "removeEventListener");
    await settle(5000); // 갱신 한 번 — 효과가 듣기를 떼고 다시 달 수 있다
    await act(async () => root.unmount());
    const addedScroll = added.mock.calls.filter(([type]) => type === "scroll").length;
    const removedScroll = removed.mock.calls.filter(([type]) => type === "scroll").length;
    // 이 시험 시작 뒤 단 것(addedScroll)보다, 처음에 단 것까지 포함해 떼야 하므로 뗀 수가 더 많거나 같다.
    expect(removedScroll).toBeGreaterThanOrEqual(addedScroll);
    expect(removedScroll).toBeGreaterThanOrEqual(1);
  });
});

describe("목록 상자가 스스로 스크롤되면 지금처럼 목록 상자를 내린다", () => {
  it("바깥 칸도 스크롤 가능해도 목록 상자의 scrollTop 을 맨 아래로 두고 바깥 칸은 건드리지 않는다", async () => {
    layout.listSelfScrolls = true;
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    expect(list().scrollHeight - list().clientHeight).toBeGreaterThan(1);
    expect(list().scrollTop).toBe(listMax());
    expect(outerEl().scrollTop).toBe(0);
  });
});
