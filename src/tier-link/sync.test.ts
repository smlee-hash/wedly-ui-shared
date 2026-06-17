import { describe, it, expect } from "vitest";
import { parseTierContainer, computeLinkedValue, applyLatestEdit, recomputeFlatForContainer, applyColumnTierSync } from "./sync";
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

describe("applyColumnTierSync (저장 오케스트레이션)", () => {
  const links: ColumnTierLink[] = [
    { columnKey: "정부최신", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "latest" },
  ];
  it("경우A: 차수 컨테이너 저장 → 평면 재계산", () => {
    const data: any = { "uc:government-subsidy:정산정보": [{ 성공보수: 5 }, { 성공보수: 8 }] };
    const out = applyColumnTierSync(data, "uc:government-subsidy:정산정보", data["uc:government-subsidy:정산정보"], links, OWN);
    expect("synced" in out && out.synced).toEqual({ 정부최신: 8 });
  });
  it("경우B: 최신차수 컬럼 편집 → 맨 끝 차수에 쓰고 평면 갱신", () => {
    const data: any = { "uc:government-subsidy:정산정보": [{ 성공보수: 5 }] };
    const out = applyColumnTierSync(data, "정부최신", 99, links, OWN);
    expect(data["uc:government-subsidy:정산정보"][0].성공보수).toBe(99);
    expect("synced" in out && out.synced).toEqual({ 정부최신: 99 });
  });
  it("경우B 거부: sum 컬럼 직접 수정", () => {
    const sumLinks: ColumnTierLink[] = [{ columnKey: "정부합계", section: "government-subsidy", area: "settlement", tierFieldKey: "성공보수", mode: "sum" }];
    const out = applyColumnTierSync({} as any, "정부합계", 1, sumLinks, OWN);
    expect("rejected" in out).toBe(true);
  });
  it("경우C: 무관 키 → synced 빈 객체", () => {
    const out = applyColumnTierSync({} as any, "기타컬럼", 1, links, OWN);
    expect("synced" in out && out.synced).toEqual({});
  });
});

describe("computeLinkedValue — formula 차수 칸(그때그때 계산)", () => {
  // 저장값이 없는 자동계산 칸. ctx.fields 로 차수 카드와 동일 계산기를 돌린다.
  const fields = [
    { key: "a", label: "A", type: "number" },
    { key: "b", label: "B", type: "number" },
    { key: "sum_ab", label: "합", type: "formula", formula: [
      { op: "+", unit: "column", value: 0, columnKey: "a" },
      { op: "+", unit: "column", value: 0, columnKey: "b" },
    ] },
    { key: "total", label: "총합", type: "formula", formula: [
      { op: "+", unit: "column", value: 0, columnKey: "sum_ab" },
      { op: "+", unit: "column", value: 0, columnKey: "a" },
    ] },
  ] as any;
  const tiers = [{ a: 10, b: 5 }, { a: 100, b: 1 }] as any; // sum_ab: 15, 101

  it("formula latest = 마지막 차수 계산값", () => {
    const link: ColumnTierLink = { columnKey: "c", area: "contract", tierFieldKey: "sum_ab", mode: "latest", readonly: true };
    expect(computeLinkedValue(tiers, link, { fields })).toBe(101);
  });
  it("formula sum = 차수별 계산값 합", () => {
    const link: ColumnTierLink = { columnKey: "c", area: "contract", tierFieldKey: "sum_ab", mode: "sum", readonly: true };
    expect(computeLinkedValue(tiers, link, { fields })).toBe(116);
  });
  it("중첩 formula(다른 formula 칸 참조)도 재귀 계산", () => {
    const link: ColumnTierLink = { columnKey: "c", area: "contract", tierFieldKey: "total", mode: "latest", readonly: true };
    expect(computeLinkedValue(tiers, link, { fields })).toBe(201); // 101 + 100
  });
  it("값 전무 차수면 null(빈 차수)", () => {
    const link: ColumnTierLink = { columnKey: "c", area: "contract", tierFieldKey: "sum_ab", mode: "latest", readonly: true };
    expect(computeLinkedValue([{}] as any, link, { fields })).toBeNull();
  });
  it("fields 미제공 시 기존 동작(저장값 읽기) 유지 — 뒤호환", () => {
    const link: ColumnTierLink = { columnKey: "c", area: "contract", tierFieldKey: "x", mode: "latest" };
    expect(computeLinkedValue([{ x: 7 }] as any, link)).toBe(7);
  });
});

describe("applyColumnTierSync — readonly(자동계산) 연결 직접수정 거부", () => {
  it("readonly latest 연결도 직접 수정 거부", () => {
    const links: ColumnTierLink[] = [{ columnKey: "총수수료", area: "contract", tierFieldKey: "29예상수수료", mode: "latest", readonly: true }];
    const out = applyColumnTierSync({} as any, "총수수료", 1, links, OWN);
    expect("rejected" in out).toBe(true);
  });
});
