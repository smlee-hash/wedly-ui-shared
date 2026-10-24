// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryPanel, type HistoryAdapter } from "./HistoryPanel";
import type { UnifiedComment } from "../unified/history-core";

// 사업장 상세창 히스토리에서 위쪽 이전 내역을 읽는 중인데 화면이 저절로 맨 아래로 내려가는 결함(노션 3fe7b6a9).
//
// 결함: 목록 맨 아래로 내리는 효과가 `comments` 가 바뀔 때마다 돈다. 5초 주기 갱신(ERP 연결막 pollingIntervalMs=5000)·
// 부모 씨앗 변경·수정·삭제·저장이 모두 새 배열을 만들기 때문에, 내용이 그대로여도 5초마다 맨 아래로 내려간다.
//
// 진짜 HistoryPanel 을 jsdom 에 그린다. jsdom 은 레이아웃이 없으므로 이 시험이 정하는 것은 두 가지뿐이다.
//   - scrollHeight/clientHeight: 목록 높이(layout.height)와 보이는 높이(VIEWPORT)를 시험이 정한다.
//   - scrollTop: 브라우저처럼 [0, 높이-보이는 높이] 로 잘라 저장한다.
// 기대값은 전부 목록 요소의 scrollTop 이다(제품의 스크롤 판정 함수는 시험에서 다시 만들지 않는다).
//
// 구현 전 main 에서 실패해야 하는 시험: "위로 올려 둔 채" 로 시작하는 주기 갱신·새 내역·씨앗·수정·삭제 시험.
// 나머지(처음 열기, 맨 아래에 붙어 있을 때 따라가기, 내 저장, 분류 탭 변경)는 지금도 통과해야 하는 보호선이다.

const VIEWPORT = 300;
const layout = { height: 2000 };
const scrollTops = new WeakMap<object, number>();
const bottomOf = () => Math.max(0, layout.height - VIEWPORT);

const originals: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const key of ["scrollHeight", "clientHeight", "scrollTop"]) {
    originals[key] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
  }
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => layout.height });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => VIEWPORT });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get(this: object) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: object, v: number) {
      scrollTops.set(this, Math.max(0, Math.min(Number(v), bottomOf())));
    },
  });
});
afterAll(() => {
  for (const key of ["scrollHeight", "clientHeight", "scrollTop"]) {
    if (originals[key]) Object.defineProperty(HTMLElement.prototype, key, originals[key]!);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

const iso = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
const other = (i: number): UnifiedComment => ({ id: `c${i}`, name: "배보라", text: `상담 내역 ${i}`, createdAt: iso(i), source: "hive" });
const mine = (i: number): UnifiedComment => ({ id: `c${i}`, name: "나", text: `내 기록 ${i}`, createdAt: iso(i), source: "hive" });

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
  return { adapter, fetch, create, edit, remove, set: (next: UnifiedComment[]) => { list = next; } };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  layout.height = 2000;
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
const render = async (adapter: HistoryAdapter, props: Props = {}) => {
  await act(async () => {
    root.render(
      <HistoryPanel
        adapter={adapter}
        currentUserName="나"
        pollingIntervalMs={5000}
        confirmDialog={async () => true}
        alertDialog={() => {}}
        {...props}
      />,
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
/** 사용자가 위로 올려 읽는다 — 브라우저는 스크롤 위치를 바꾸고 scroll 신호를 보낸다. */
const readUp = async (top: number) => {
  await act(async () => {
    list().scrollTop = top;
    list().dispatchEvent(new Event("scroll"));
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

const manyOthers = (n: number) => Array.from({ length: n }, (_, i) => other(i + 1));

describe("처음 열 때", () => {
  it("불러온 뒤 가장 최근(맨 아래)으로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    expect(list().textContent).toContain("상담 내역 30");
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("부모가 미리 준 목록(씨앗)이 있어도 처음에는 맨 아래로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter, { seedComments: manyOthers(30) });
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("씨앗이 비어 있다가 통신으로 목록이 채워져도 아직 안 읽기 시작했으면 맨 아래로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter, { seedComments: [] });
    expect(list().textContent).toContain("상담 내역 30");
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("다른 사업장(pageId)으로 바뀌면 처음 여는 것처럼 맨 아래로 간다", async () => {
    const a = makeServer(manyOthers(30));
    await render(a.adapter, { pageId: "A" });
    await readUp(100);
    const b = makeServer(manyOthers(40));
    layout.height = 2400;
    await render(b.adapter, { pageId: "B" });
    await settle(0);
    expect(list().textContent).toContain("상담 내역 40");
    expect(list().scrollTop).toBe(bottomOf());
  });
});

describe("위로 올려 읽는 중에는 자동으로 내리지 않는다", () => {
  it("위로 올려 둔 채 1분 넘게 5초 주기 갱신이 돌아도 위치가 그대로다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await readUp(100);
    const before = s.fetch.mock.calls.length;
    await settle(65_000);
    expect(s.fetch.mock.calls.length - before).toBeGreaterThanOrEqual(12);
    expect(list().scrollTop).toBe(100);
  });

  it("위로 올려 둔 채 남이 쓴 새 내역이 와도 위치가 그대로다(새 내역은 화면에 반영된다)", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await readUp(100);
    layout.height = 2120;
    s.set([...manyOthers(30), other(31)]);
    await settle(5000);
    expect(list().textContent).toContain("상담 내역 31");
    expect(list().scrollTop).toBe(100);
  });

  it("위로 올려 둔 채 부모가 준 목록(씨앗)이 바뀌어도 위치가 그대로다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter, { seedComments: manyOthers(30) });
    await readUp(100);
    layout.height = 2120;
    await render(s.adapter, { seedComments: [...manyOthers(30), other(31)] });
    expect(list().textContent).toContain("상담 내역 31");
    expect(list().scrollTop).toBe(100);
  });

  it("위로 올려 둔 채 창으로 포커스가 돌아와도 위치가 그대로다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await readUp(100);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(5000);
    expect(list().scrollTop).toBe(100);
  });

  it("위로 올려 둔 채 내 옛 기록을 수정해도 위치가 그대로다", async () => {
    const s = makeServer([mine(1), ...Array.from({ length: 29 }, (_, i) => other(i + 2))]);
    await render(s.adapter);
    await readUp(100);
    await act(async () => {
      (container.querySelector('[aria-label="히스토리 수정"]') as HTMLButtonElement).click();
    });
    await typeInto(list().querySelector("textarea") as HTMLTextAreaElement, "고친 기록");
    await act(async () => {
      buttonByText(list(), "저장").click();
    });
    await settle(0);
    expect(s.edit).toHaveBeenCalledTimes(1);
    expect(list().textContent).toContain("고친 기록");
    expect(list().scrollTop).toBe(100);
  });

  it("위로 올려 둔 채 내 옛 기록을 삭제해도 위치가 그대로다", async () => {
    const s = makeServer([mine(1), ...Array.from({ length: 29 }, (_, i) => other(i + 2))]);
    await render(s.adapter);
    await readUp(100);
    await act(async () => {
      (container.querySelector('[aria-label="히스토리 삭제"]') as HTMLButtonElement).click();
    });
    await settle(0);
    expect(s.remove).toHaveBeenCalledTimes(1);
    expect(list().textContent).not.toContain("내 기록 1");
    expect(list().scrollTop).toBe(100);
  });
});

describe("맨 아래로 내려가야 하는 경우", () => {
  it("맨 아래에 붙어 읽는 중이면 새 내역이 와도 계속 맨 아래를 따라간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    expect(list().scrollTop).toBe(bottomOf());
    layout.height = 2120;
    s.set([...manyOthers(30), other(31)]);
    await settle(5000);
    expect(list().textContent).toContain("상담 내역 31");
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("위로 올려 둔 채 내가 새 히스토리를 저장하면 최신 내역 위치로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    await readUp(100);
    layout.height = 2120;
    await typeInto(container.querySelector("textarea") as HTMLTextAreaElement, "방금 쓴 기록");
    await act(async () => {
      buttonByText(container, "등록").click();
    });
    await settle(0);
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(list().textContent).toContain("방금 쓴 기록");
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("내가 저장해 맨 아래로 간 뒤에는 다시 위로 올려 읽는 동안 주기 갱신이 위치를 지킨다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter);
    layout.height = 2120;
    await typeInto(container.querySelector("textarea") as HTMLTextAreaElement, "방금 쓴 기록");
    await act(async () => {
      buttonByText(container, "등록").click();
    });
    await settle(0);
    await readUp(100);
    await settle(30_000);
    expect(list().scrollTop).toBe(100);
  });

  it("분류 탭을 직접 눌러 바꾸면 그 분류의 맨 아래로 간다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter, { hideCategories: false });
    await readUp(100);
    await act(async () => {
      buttonByText(container, "정책자금").click();
    });
    expect(list().scrollTop).toBe(bottomOf());
  });

  it("이미 보고 있는 분류 탭을 다시 눌러도 이후 주기 갱신이 위치를 지킨다", async () => {
    const s = makeServer(manyOthers(30));
    await render(s.adapter, { hideCategories: false });
    await act(async () => {
      buttonByText(container, "정책자금").click();
    });
    await readUp(100);
    await act(async () => {
      buttonByText(container, "정책자금").click();
    });
    await settle(30_000);
    expect(list().scrollTop).toBe(100);
  });
});
