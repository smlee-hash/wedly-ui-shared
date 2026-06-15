import { describe, it, expect, vi } from "vitest";
import {
  subscribeHiddenBasicColumns,
  saveHiddenBasicColumns,
  refreshHiddenBasicColumns,
  getCachedHiddenBasicColumns,
} from "./column-visibility-store";

// 서버 응답을 흉내내는 fetch mock — { success: true, data: { hidden } }
function mockFetchReturning(hidden: string[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: { hidden } }),
  })) as unknown as typeof fetch;
}

describe("앱별 칸 숨김 — 저장/새로고침 시 구독 화면에 즉시 알림", () => {
  it("저장하면 구독자가 새 값으로 호출된다 (새로고침 불필요)", async () => {
    global.fetch = mockFetchReturning(["연락처"]);
    const seen: string[][] = [];
    const unsub = subscribeHiddenBasicColumns((v) => seen.push(v));
    await saveHiddenBasicColumns(["연락처"]);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[seen.length - 1]).toEqual(["연락처"]);
    unsub();
  });

  it("구독 해제 후에는 알림이 오지 않는다", async () => {
    global.fetch = mockFetchReturning([]);
    let calls = 0;
    const unsub = subscribeHiddenBasicColumns(() => {
      calls += 1;
    });
    unsub();
    await saveHiddenBasicColumns([]);
    expect(calls).toBe(0);
  });

  it("저장 후 기억값(cache)도 새 값으로 갱신된다", async () => {
    global.fetch = mockFetchReturning(["대표자명"]);
    await saveHiddenBasicColumns(["대표자명"]);
    expect(getCachedHiddenBasicColumns()).toEqual(["대표자명"]);
  });

  it("강제 새로고침도 구독자에게 알린다", async () => {
    global.fetch = mockFetchReturning(["사업장주소"]);
    const seen: string[][] = [];
    const unsub = subscribeHiddenBasicColumns((v) => seen.push(v));
    await refreshHiddenBasicColumns();
    expect(seen[seen.length - 1]).toEqual(["사업장주소"]);
    unsub();
  });
});

describe("앱별 칸 숨김 — 매끄러운 즉시 반영(낙관적 저장)", () => {
  // 우리가 원하는 시점에 응답을 주도록 미뤄두는 fetch 흉내
  function deferredFetch() {
    const calls: Array<{ resolve: (hidden: string[]) => void; fail: () => void }> = [];
    const fn = vi.fn(
      () =>
        new Promise((resolve) => {
          calls.push({
            resolve: (hidden: string[]) =>
              resolve({ ok: true, json: async () => ({ success: true, data: { hidden } }) }),
            fail: () => resolve({ ok: false, json: async () => ({ success: false }) }),
          });
        }),
    ) as unknown as typeof fetch;
    return { fn, calls };
  }

  it("서버 응답 전에 이미 구독자에게 새 값이 전달된다 (기다림 없는 즉시 반영)", async () => {
    const { fn, calls } = deferredFetch();
    global.fetch = fn;
    const seen: string[][] = [];
    const unsub = subscribeHiddenBasicColumns((v) => seen.push([...v]));
    const p = saveHiddenBasicColumns(["연락처"]);
    // 아직 서버가 응답하지 않았는데도 화면(구독자)은 이미 새 값을 받았어야 한다
    expect(seen[seen.length - 1]).toEqual(["연락처"]);
    calls[0].resolve(["연락처"]); // 이제서야 서버 응답
    await p;
    unsub();
  });

  it("연속으로 빠르게 저장하면 마지막 저장값이 최종으로 남는다 (늦게 온 옛 응답 무시)", async () => {
    const { fn, calls } = deferredFetch();
    global.fetch = fn;
    const p1 = saveHiddenBasicColumns(["A"]); // 1번째
    const p2 = saveHiddenBasicColumns(["A", "B"]); // 2번째(마지막)
    // 응답을 거꾸로 준다: 2번째 먼저, 1번째(옛것) 나중
    calls[1].resolve(["A", "B"]);
    await p2;
    calls[0].resolve(["A"]);
    await p1;
    expect([...getCachedHiddenBasicColumns()].sort()).toEqual(["A", "B"]);
  });

  it("저장이 실패하면 직전 값으로 되돌린다 (화면도 원상복구)", async () => {
    // 먼저 알려진 상태를 만든다: [연락처]
    global.fetch = mockFetchReturning(["연락처"]);
    await saveHiddenBasicColumns(["연락처"]);
    expect(getCachedHiddenBasicColumns()).toEqual(["연락처"]);
    // 이제 실패하는 저장
    const { fn, calls } = deferredFetch();
    global.fetch = fn;
    const seen: string[][] = [];
    const unsub = subscribeHiddenBasicColumns((v) => seen.push([...v]));
    const p = saveHiddenBasicColumns([]); // 모두 보이게 시도하지만 실패할 것
    expect(seen[seen.length - 1]).toEqual([]); // 낙관적으로 잠깐 [] 반영
    calls[0].fail(); // 서버 실패
    await p;
    expect(getCachedHiddenBasicColumns()).toEqual(["연락처"]); // 직전 값으로 복구
    expect(seen[seen.length - 1]).toEqual(["연락처"]); // 화면도 복구 알림 받음
    unsub();
  });
});
