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

describe("computeLinkedValue — latest 빈 차수 폴백 (RC-3, NO.120)", () => {
  // 마지막 차수의 값이 비어 있어도 값 있는 최신 차수를 골라야 한다.
  // (계약일을 1차에 넣고 2차를 빈칸으로 추가하면 표 계약일 칸이 빈칸으로 나던 버그)
  const numLink: ColumnTierLink = { columnKey: "c", section: OWN, area: "settlement", tierFieldKey: "성공보수", mode: "latest" };
  const dateLink: ColumnTierLink = { columnKey: "표계약일", section: OWN, area: "contract", tierFieldKey: "계약일", mode: "latest" };

  it("마지막 차수가 빈값이면 값 있는 최신 차수 값(숫자)", () => {
    expect(computeLinkedValue([{ 성공보수: 7 }, { 성공보수: "" }], numLink)).toBe(7);
    expect(computeLinkedValue([{ 성공보수: 7 }, {}], numLink)).toBe(7);
    expect(computeLinkedValue([{ 성공보수: 3 }, { 성공보수: "" }, { 성공보수: null }], numLink)).toBe(3);
  });
  it("계약일(문자 날짜): 마지막 빈 차수면 값 있는 최신 차수 날짜", () => {
    expect(computeLinkedValue([{ 계약일: "2026-01-05" }, { 계약일: "" }], dateLink)).toBe("2026-01-05");
    expect(computeLinkedValue([{ 계약일: "2026-01-05" }, {}], dateLink)).toBe("2026-01-05");
    expect(computeLinkedValue([{ 계약일: "2026-03-01" }], dateLink)).toBe("2026-03-01");
  });
  it("마지막 차수에 값이 있으면 그대로 (기존 동작 유지)", () => {
    expect(computeLinkedValue([{ 성공보수: 1 }, { 성공보수: 9 }], numLink)).toBe(9);
    expect(computeLinkedValue([{ 계약일: "2026-01-05" }, { 계약일: "2026-02-10" }], dateLink)).toBe("2026-02-10");
  });
  it("모든 차수가 빈값이면 여전히 null", () => {
    expect(computeLinkedValue([{ 성공보수: "" }, {}], numLink)).toBeNull();
    expect(computeLinkedValue([{ 계약일: "" }, { 계약일: null }], dateLink)).toBeNull();
    expect(computeLinkedValue([], dateLink)).toBeNull();
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

// ── 수식 완성: 조건부 금액 합계 + 날짜 수식 최신 ──
describe("computeLinkedValue — 조건부 금액 수식 합계(conditionValues)", () => {
  const feeField = {
    key: "fee", label: "수수료", type: "formula" as const,
    formula: [
      { op: "+", unit: "column", value: 0, columnKey: "계약금" },
      { op: "*", unit: "percent", value: 30 },
    ],
    conditional: {
      rules: [{
        op: "contains" as const, leftKey: "주소",
        right: { kind: "text" as const, value: "서울" },
        formula: [
          { op: "+", unit: "column", value: 0, columnKey: "계약금" },
          { op: "*", unit: "percent", value: 20 },
        ],
      }],
    },
  };
  const fields = [{ key: "계약금", label: "계약금", type: "number" as const }, feeField];
  const link: ColumnTierLink = { columnKey: "표수수료", area: "contract", tierFieldKey: "fee", mode: "sum" };

  it("조건값 주소=서울이면 20%로 합산", () => {
    const tiers = [{ 계약금: 1000 }, { 계약금: 2000 }]; // 200 + 400
    expect(computeLinkedValue(tiers, link, { fields, conditionValues: { 주소: "서울시 강남" } })).toBe(600);
  });
  it("조건값 없으면 base 30%", () => {
    expect(computeLinkedValue([{ 계약금: 1000 }], link, { fields })).toBe(300);
  });
});

describe("computeLinkedValue — 날짜 수식", () => {
  const dateField = {
    key: "예정일", label: "정산예정일", type: "formula" as const,
    formulaResult: "date" as const,
    dateFormula: { mode: "offset" as const, baseKey: "착수일", offsets: [{ amount: 30, unit: "day" as const }] },
  };
  const fields = [{ key: "착수일", label: "착수일", type: "date" as const }, dateField];
  it("최신차수의 계산 날짜 반환", () => {
    const link: ColumnTierLink = { columnKey: "표예정일", area: "contract", tierFieldKey: "예정일", mode: "latest" };
    expect(computeLinkedValue([{ 착수일: "2026-01-01" }, { 착수일: "2026-02-01" }], link, { fields })).toBe("2026-03-03");
  });
  it("합계 모드는 날짜라 null(더할 수 없음)", () => {
    const link: ColumnTierLink = { columnKey: "표예정일", area: "contract", tierFieldKey: "예정일", mode: "sum" };
    expect(computeLinkedValue([{ 착수일: "2026-02-01" }], link, { fields })).toBe(null);
  });
});

describe("recomputeFlatForContainer — entry data를 조건값으로", () => {
  const feeField = {
    key: "fee", label: "수수료", type: "formula" as const,
    formula: [{ op: "+", unit: "column", value: 0, columnKey: "계약금" }, { op: "*", unit: "percent", value: 30 }],
    conditional: { rules: [{ op: "contains" as const, leftKey: "주소", right: { kind: "text" as const, value: "서울" },
      formula: [{ op: "+", unit: "column", value: 0, columnKey: "계약금" }, { op: "*", unit: "percent", value: 20 }] }] },
  };
  const fields = [{ key: "계약금", label: "계약금", type: "number" as const }, feeField];
  const links: ColumnTierLink[] = [{ columnKey: "표수수료", section: "government-subsidy", area: "contract", tierFieldKey: "fee", mode: "sum" }];
  it("data.주소=서울이면 20% 반영", () => {
    const data: Record<string, unknown> = { 주소: "서울 강남", 계약정보_차수: JSON.stringify([{ 계약금: 1000 }]) };
    const out = recomputeFlatForContainer(data, links, "계약정보_차수", "government-subsidy", fields);
    expect(out["표수수료"]).toBe(200);
  });
});
