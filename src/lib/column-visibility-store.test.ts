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
