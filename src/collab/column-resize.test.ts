import { describe, it, expect } from "vitest";
import { computeResizedWidth, computeGuideX } from "./column-resize";

describe("computeResizedWidth", () => {
  it("늘리기: 마우스가 오른쪽으로 간 만큼 너비가 커진다", () => {
    expect(computeResizedWidth(100, 200, 260)).toBe(160);
  });

  it("줄이기: 마우스가 왼쪽으로 간 만큼 너비가 작아진다", () => {
    expect(computeResizedWidth(100, 200, 170)).toBe(70);
  });

  it("움직임 없음: 시작 너비 그대로", () => {
    expect(computeResizedWidth(100, 200, 200)).toBe(100);
  });

  it("최소 너비(기본 40) 아래로는 안 내려간다", () => {
    expect(computeResizedWidth(100, 200, 50)).toBe(40);
  });

  it("최소 너비를 바꾸면 그 값으로 고정된다", () => {
    expect(computeResizedWidth(100, 200, 100, 60)).toBe(60);
  });
});

describe("computeGuideX", () => {
  it("최소 위치보다 오른쪽이면 마우스 위치 그대로", () => {
    // minX = 200 - 100 + 40 = 140
    expect(computeGuideX(200, 100, 260)).toBe(260);
  });

  it("최소 위치보다 왼쪽이면 최소 위치로 고정", () => {
    // minX = 200 - 100 + 40 = 140
    expect(computeGuideX(200, 100, 120)).toBe(140);
  });

  it("정확히 최소 위치면 그 값", () => {
    expect(computeGuideX(200, 100, 140)).toBe(140);
  });

  it("최소 너비를 바꾸면 최소 위치도 따라간다", () => {
    // minX = 200 - 100 + 60 = 160
    expect(computeGuideX(200, 100, 120, 60)).toBe(160);
  });
});
