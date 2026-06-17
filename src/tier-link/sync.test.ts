import { describe, it, expect } from "vitest";
import { parseTierContainer, computeLinkedValue, applyLatestEdit, recomputeFlatForContainer, recomputeFlatFromTiers, applyColumnTierSync } from "./sync";
import type { ColumnTierLink } from "./config";

const OWN = "tax-amendment";

describe("computeLinkedValue", () => {
  const link: ColumnTierLink = { columnKey: "c", section: OWN, area: "settlement", tierFieldKey: "성공보수", mode: "sum" };
  it("sum=숫자 합, 값 전무면 null", () => {
    expect(computeLinkedValue([{ 성공보수: "100" }, { 성공보수: 200 }], link)).toBe(300);
    expect(computeLinkedValue([{}, {}], link)).toBeNull();
  });
  it("latest=맨 끝 차수 값", () => {
    const l2 = { ...link, mode: "latest" as const };
    expect(computeLinkedValue([{ 성공보수: 1 }, { 성공보수: 9 }], l2)).toBe(9);
    expect(computeLinkedValue([], l2)).toBeNull();
  });
});

describe("recomputeFlatForContainer (섹션 인식)", () => {
  const links: ColumnTierLink[] = [
    { columnKey: "경정합계", section: OWN, area: "settlement", tierFieldKey: "성공보수", mode: "sum" },
    { columnKey: "정부합계", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" },
  ];
  it("자기분야 컨테이너는 경정 연결만 계산", () => {
    const data = { "정산정보": [{ 성공보수: 100 }], "uc:government-subsidy:정산정보": [{ 성공보수: 500 }] };
    expect(recomputeFlatForContainer(data, links, "정산정보", OWN)).toEqual({ 경정합계: 100 });
  });
  it("uc 컨테이너는 그 섹션 연결만 계산", () => {
    const data = { "정산정보": [{ 성공보수: 100 }], "uc:government-subsidy:정산정보": [{ 성공보수: 500 }] };
    expect(recomputeFlatForContainer(data, links, "uc:government-subsidy:정산정보", OWN)).toEqual({ 정부합계: 500 });
  });
  it("옛 연결(section 없음)은 자기분야로 승계", () => {
    const legacy: ColumnTierLink[] = [{ columnKey: "c", area: "settlement", tierFieldKey: "성공보수", mode: "sum" } as any];
    const data = { "정산정보": [{ 성공보수: 7 }] };
    expect(recomputeFlatForContainer(data, legacy, "정산정보", OWN)).toEqual({ c: 7 });
  });
});

describe("recomputeFlatFromTiers (저장소 무관 — 다른 섹션 secstore 차수용)", () => {
  const links: ColumnTierLink[] = [
    { columnKey: "정부합계", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" },
    { columnKey: "정부최신", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "latest" },
    { columnKey: "노무합계", section: "labor-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" },
  ];
  it("주어진 차수로 그 (섹션,영역) 연결만 계산", () => {
    const tiers = [{ 성공보수: 100 }, { 성공보수: 250 }];
    expect(recomputeFlatFromTiers(tiers, links, "government-subsidy", "settlement", OWN))
      .toEqual({ 정부합계: 350, 정부최신: 250 });
  });
  it("영역/섹션 안 맞으면 제외", () => {
    const tiers = [{ 성공보수: 5 }];
    expect(recomputeFlatFromTiers(tiers, links, "government-subsidy", "contract", OWN)).toEqual({});
    expect(recomputeFlatFromTiers(tiers, links, "labor-subsidy", "settlement", OWN)).toEqual({ 노무합계: 5 });
  });
});

describe("applyColumnTierSync (저장 오케스트레이션)", () => {
  it("경우A: 차수 컨테이너 저장 → 평면 재계산", () => {
    const links: ColumnTierLink[] = [{ columnKey: "정부합계", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" }];
    const data: any = { "uc:government-subsidy:정산정보": [{ 성공보수: 5 }, { 성공보수: 8 }] };
    const out = applyColumnTierSync(data, "uc:government-subsidy:정산정보", data["uc:government-subsidy:정산정보"], links, OWN);
    expect("synced" in out && out.synced).toEqual({ 정부합계: 13 });
  });
  it("경우B 자기분야: 최신차수 컬럼 편집 → 맨 끝 차수에 쓰고 평면 갱신", () => {
    const links: ColumnTierLink[] = [{ columnKey: "경정최신", section: OWN, area: "settlement", tierFieldKey: "성공보수", mode: "latest" }];
    const data: any = { "정산정보": [{ 성공보수: 5 }] };
    const out = applyColumnTierSync(data, "경정최신", 99, links, OWN);
    expect(data["정산정보"][0].성공보수).toBe(99);
    expect("synced" in out && out.synced).toEqual({ 경정최신: 99 });
  });
  it("경우B 다른섹션: 직접편집은 무시(phantom 안 씀 — 거울은 secstore 훅이 갱신)", () => {
    const links: ColumnTierLink[] = [{ columnKey: "정부최신", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "latest" }];
    const data: any = {};
    const out = applyColumnTierSync(data, "정부최신", 99, links, OWN);
    expect("synced" in out && out.synced).toEqual({});
    expect(data["uc:government-subsidy:정산정보"]).toBeUndefined();
  });
  it("경우B 거부: sum 컬럼 직접 수정", () => {
    const sumLinks: ColumnTierLink[] = [{ columnKey: "정부합계", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" }];
    const out = applyColumnTierSync({} as any, "정부합계", 1, sumLinks, OWN);
    expect("rejected" in out).toBe(true);
  });
  it("경우C: 무관 키 → synced 빈 객체", () => {
    const out = applyColumnTierSync({} as any, "기타컬럼", 1, [], OWN);
    expect("synced" in out && out.synced).toEqual({});
  });
});
