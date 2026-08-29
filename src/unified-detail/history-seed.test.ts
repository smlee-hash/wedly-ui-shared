import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// 창을 열자마자 보여 주는 「씨앗」이 정리본을 함께 실어야 한다.
// ★안 실으면 원본 → (통신 뒤) 정리 카드로 바뀌어 깜빡이고, 목록이 갱신되면 원본으로 되돌아간다
//  (2026-08-29 사장님 지적). 이 시험은 그 회귀를 막는다.
const src = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
const 씨앗함수 = src.slice(src.indexOf("function toUnified"), src.indexOf("export type HistoryPanelApi"));

describe("★히스토리 씨앗 — 정리본을 빠뜨리면 창이 깜빡인다", () => {
  it("씨앗이 recap 을 함께 넘긴다", () => {
    expect(씨앗함수).toMatch(/recap:\s*c\.recap/);
  });

  it("씨앗이 recapSkip 도 함께 넘긴다 — 짧아서 정리 안 한 글의 표시가 흔들리지 않게", () => {
    expect(씨앗함수).toMatch(/recapSkip:\s*c\.recapSkip/);
  });

  it("★씨앗 자료형에도 그 칸이 있다 — 없으면 조용히 undefined 로 떨어진다", () => {
    const 자료형 = src.slice(src.indexOf("type DbComment"), src.indexOf("function toUnified"));
    expect(자료형).toContain("recap?");
    expect(자료형).toContain("recapSkip?");
  });

  it("★통신으로 받는 쪽과 같은 칸을 싣는다 — 두 번 그려도 모양이 안 바뀌어야 한다", () => {
    // 씨앗이 싣는 칸 목록과, 화면이 카드 판정에 쓰는 칸이 어긋나면 깜빡임이 돌아온다.
    for (const k of ["id", "name", "text", "createdAt", "category", "source", "recap", "recapSkip"]) {
      expect(씨앗함수).toContain(`${k}:`);
    }
  });
});
