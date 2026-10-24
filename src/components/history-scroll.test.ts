import { describe, expect, it } from "vitest";
import { STICK_THRESHOLD_PX, isNearBottom, shouldScrollToBottom } from "./history-scroll";

describe("isNearBottom", () => {
  it("정확히 맨 아래면 붙어 있다", () => {
    expect(isNearBottom({ scrollTop: 1700, scrollHeight: 2000, clientHeight: 300 })).toBe(true);
  });
  it("여유 안쪽으로 비껴도 붙어 있다", () => {
    expect(isNearBottom({ scrollTop: 1700 - STICK_THRESHOLD_PX, scrollHeight: 2000, clientHeight: 300 })).toBe(true);
  });
  it("여유를 1px 넘기면 위로 올린 것이다", () => {
    expect(isNearBottom({ scrollTop: 1700 - STICK_THRESHOLD_PX - 1, scrollHeight: 2000, clientHeight: 300 })).toBe(false);
  });
  it("위로 많이 올린 상태는 붙어 있지 않다", () => {
    expect(isNearBottom({ scrollTop: 100, scrollHeight: 2000, clientHeight: 300 })).toBe(false);
  });
  it("스크롤이 필요 없는 짧은 목록은 늘 붙어 있다", () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 300 })).toBe(true);
  });
  it("여유를 직접 줄 수 있다", () => {
    expect(isNearBottom({ scrollTop: 1690, scrollHeight: 2000, clientHeight: 300 }, 5)).toBe(false);
    expect(isNearBottom({ scrollTop: 1696, scrollHeight: 2000, clientHeight: 300 }, 5)).toBe(true);
  });
});

describe("shouldScrollToBottom", () => {
  it("위로 올려 읽는 중이고 내리라는 요청도 없으면 내리지 않는다", () => {
    expect(shouldScrollToBottom({ force: false, stuck: false })).toBe(false);
  });
  it("맨 아래에 붙어 있으면 따라간다", () => {
    expect(shouldScrollToBottom({ force: false, stuck: true })).toBe(true);
  });
  it("내리라는 요청이 있으면 위치와 상관없이 내린다", () => {
    expect(shouldScrollToBottom({ force: true, stuck: false })).toBe(true);
    expect(shouldScrollToBottom({ force: true, stuck: true })).toBe(true);
  });
});
