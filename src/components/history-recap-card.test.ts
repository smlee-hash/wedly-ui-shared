import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync(new URL("./HistoryRecapCard.tsx", import.meta.url), "utf8");

describe("★정리 카드 디자인 계약", () => {
  it("굵기 600 인 줄은 headline 하나뿐이다 — 단추에 굵은 글씨를 넣지 않는다", () => {
    expect((src.match(/font-semibold|font-bold/g) ?? [])).toHaveLength(1);
  });
  it("원시 색을 쓰지 않는다 — WEDLY 토큰만", () => {
    expect(src).not.toMatch(/(bg|text|border)-(red|green|blue|gray|slate|amber|yellow|sky|indigo)-\d{2,3}/);
  });
  it("카톡 보고 단추가 있다", () => {
    expect(src).toContain("buildKakaoReport");
    expect(src).toContain("카톡 보고");
  });
  it("★clipboard 가 없어도 죽지 않는다 — 대비 경로가 있다", () => {
    expect(src).toContain("fallbackCopy");
  });
});
