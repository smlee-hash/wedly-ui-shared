import { describe, it, expect } from "vitest";
import { matchesFilter, matchesTab, filterRowsByTab, buildTabFromDraft, EMPTY_OPTION_VALUE, passesTabFilters, isTabConditionActive, type ViewTab } from "./collab-filters";
import type { RowData } from "./collab-table-core";

describe("matchesFilter", () => {
  const row: RowData = { status: "계약완료", memo: "급한 건", date: "2026-05-01T09:00:00", empty: "" };

  it("equals: 값이 같으면 true", () => {
    expect(matchesFilter(row, { field: "status", operator: "equals", value: "계약완료" })).toBe(true);
    expect(matchesFilter(row, { field: "status", operator: "equals", value: "인용완료" })).toBe(false);
  });
  it("in: 목록에 있으면 true, 배열이 아니면 false", () => {
    expect(matchesFilter(row, { field: "status", operator: "in", value: ["가망", "계약완료"] })).toBe(true);
    expect(matchesFilter(row, { field: "status", operator: "in", value: ["가망", "계약대기"] })).toBe(false);
    expect(matchesFilter(row, { field: "status", operator: "in", value: "계약완료" })).toBe(false);
  });
  it("is_empty / is_not_empty: 없는 칸은 비어있음 취급", () => {
    expect(matchesFilter(row, { field: "empty", operator: "is_empty" })).toBe(true);
    expect(matchesFilter(row, { field: "missing", operator: "is_empty" })).toBe(true);
    expect(matchesFilter(row, { field: "status", operator: "is_empty" })).toBe(false);
    expect(matchesFilter(row, { field: "status", operator: "is_not_empty" })).toBe(true);
  });
  it("contains: 문자열·배열 포함", () => {
    expect(matchesFilter(row, { field: "memo", operator: "contains", value: "급한" })).toBe(true);
    expect(matchesFilter(row, { field: "memo", operator: "contains", value: "없음" })).toBe(false);
    expect(matchesFilter(row, { field: "memo", operator: "contains", value: ["여유", "급한"] })).toBe(true);
  });
  it("on_or_before: 날짜 이전/같음, 비거나 값 없으면 false", () => {
    expect(matchesFilter(row, { field: "date", operator: "on_or_before", value: "2026-05-01" })).toBe(true);
    expect(matchesFilter(row, { field: "date", operator: "on_or_before", value: "2026-04-30" })).toBe(false);
    expect(matchesFilter(row, { field: "empty", operator: "on_or_before", value: "2026-05-01" })).toBe(false);
    expect(matchesFilter(row, { field: "date", operator: "on_or_before" })).toBe(false);
  });
});

describe("matchesTab", () => {
  const row: RowData = { status: "계약완료", type: "법인" };
  it("조건 없으면 모두 통과(전체 탭)", () => {
    expect(matchesTab(row, { id: "all", label: "전체", filters: [] })).toBe(true);
  });
  it("여러 조건은 AND(전부 충족해야 통과)", () => {
    const ok: ViewTab = { id: "t", label: "t", filters: [
      { field: "status", operator: "equals", value: "계약완료" },
      { field: "type", operator: "equals", value: "법인" },
    ] };
    const no: ViewTab = { id: "t", label: "t", filters: [
      { field: "status", operator: "equals", value: "계약완료" },
      { field: "type", operator: "equals", value: "개인" },
    ] };
    expect(matchesTab(row, ok)).toBe(true);
    expect(matchesTab(row, no)).toBe(false);
  });

  // NO.127 — 조건 적용 방식(그리고/또는)
  it("filterMatch 를 안 적으면 예전과 똑같이 AND", () => {
    const t: ViewTab = { id: "t", label: "t", filters: [
      { field: "status", operator: "equals", value: "계약완료" },
      { field: "type", operator: "equals", value: "개인" },
    ] };
    expect(matchesTab(row, t)).toBe(false);
    expect(matchesTab(row, { ...t, filterMatch: "all" })).toBe(false);
  });
  it("filterMatch=any 면 하나만 맞아도 통과(OR)", () => {
    const t: ViewTab = { id: "t", label: "t", filterMatch: "any", filters: [
      { field: "status", operator: "equals", value: "계약완료" },
      { field: "type", operator: "equals", value: "개인" },
    ] };
    expect(matchesTab(row, t)).toBe(true);
    expect(matchesTab(row, { ...t, filters: [
      { field: "status", operator: "equals", value: "인용완료" },
      { field: "type", operator: "equals", value: "개인" },
    ] })).toBe(false);
  });
  it("요청 예시 — 제외 조건 둘을 OR 로 묶으면 '둘 다 해당하는 줄'만 빠진다", () => {
    // 환급금여부 X 를 빼고 / 진행상태 방문거절 을 빼고 → OR 로 묶으면 둘 다인 줄만 제외
    const tab: ViewTab = { id: "t", label: "t", filterMatch: "any", filters: [
      { field: "환급금여부", operator: "not_in", value: ["X"] },
      { field: "진행상태", operator: "not_in", value: ["방문거절"] },
    ] };
    expect(matchesTab({ 환급금여부: "X", 진행상태: "방문거절" }, tab)).toBe(false); // 둘 다 → 제외
    expect(matchesTab({ 환급금여부: "X", 진행상태: "가망" }, tab)).toBe(true);      // 하나만 → 남음
    expect(matchesTab({ 환급금여부: "O", 진행상태: "방문거절" }, tab)).toBe(true);  // 하나만 → 남음
    expect(matchesTab({ 환급금여부: "O", 진행상태: "가망" }, tab)).toBe(true);
  });
  it("조건 0개면 any 여도 전체 통과(전체 탭이 0건 되지 않게)", () => {
    expect(matchesTab(row, { id: "all", label: "전체", filters: [], filterMatch: "any" })).toBe(true);
  });
  it("any 에서는 값이 안 채워진 조건을 무시(그 하나 때문에 전체가 다 보이지 않게)", () => {
    const tab: ViewTab = { id: "t", label: "t", filterMatch: "any", filters: [
      { field: "status", operator: "equals", value: "인용완료" }, // 이 행과 안 맞음
      { field: "type", operator: "not_in", value: [] },           // 값 비어 있음 = 무시 대상
    ] };
    expect(matchesTab(row, tab)).toBe(false);
    // 반대로 '그리고'에서는 예전 그대로(빈 not_in 은 전부 통과) — 기존 동작 보존 확인
    expect(matchesTab(row, { ...tab, filterMatch: "all", filters: [
      { field: "status", operator: "equals", value: "계약완료" },
      { field: "type", operator: "not_in", value: [] },
    ] })).toBe(true);
  });
  it("any 인데 채워진 조건이 하나도 없으면 전체 통과", () => {
    expect(matchesTab(row, { id: "t", label: "t", filterMatch: "any", filters: [
      { field: "status", operator: "equals", value: "" },
      { field: "type", operator: "in", value: [] },
    ] })).toBe(true);
  });
});

describe("isTabConditionActive / passesTabFilters", () => {
  it("값이 필요한 연산자는 값이 있어야 '걸린 조건'", () => {
    expect(isTabConditionActive({ field: "a", operator: "equals", value: "X" })).toBe(true);
    expect(isTabConditionActive({ field: "a", operator: "equals", value: "  " })).toBe(false);
    expect(isTabConditionActive({ field: "a", operator: "in", value: ["X"] })).toBe(true);
    expect(isTabConditionActive({ field: "a", operator: "in", value: [] })).toBe(false);
    expect(isTabConditionActive({ field: "", operator: "equals", value: "X" })).toBe(false);
  });
  it("값 없이 성립하는 연산자는 값이 없어도 '걸린 조건'", () => {
    expect(isTabConditionActive({ field: "a", operator: "is_empty" })).toBe(true);
    expect(isTabConditionActive({ field: "a", operator: "date_this_month" })).toBe(true);
  });
  it("판정기를 밖에서 받아 그리고/또는을 묶는다", () => {
    const conds = [
      { field: "a", operator: "equals" as const, value: "1" },
      { field: "b", operator: "equals" as const, value: "2" },
    ];
    const onlyA = (c: { field: string }) => c.field === "a";
    expect(passesTabFilters(conds, "all", onlyA)).toBe(false);
    expect(passesTabFilters(conds, "any", onlyA)).toBe(true);
    expect(passesTabFilters([], "any", onlyA)).toBe(true);
    expect(passesTabFilters(undefined, "any", onlyA)).toBe(true);
  });
});

describe("filterRowsByTab", () => {
  const rows: RowData[] = [
    { _id: "1", status: "계약완료" },
    { _id: "2", status: "인용완료" },
    { _id: "3", status: "계약완료" },
  ];
  it("tab이 null이면 전체 반환", () => {
    expect(filterRowsByTab(rows, null)).toHaveLength(3);
  });
  it("탭 조건에 맞는 행만 반환", () => {
    const tab: ViewTab = { id: "c", label: "계약완료", filters: [{ field: "status", operator: "equals", value: "계약완료" }] };
    expect(filterRowsByTab(rows, tab).map((r) => r._id)).toEqual(["1", "3"]);
  });
  it("전체 탭(빈 filters)은 전체 반환", () => {
    expect(filterRowsByTab(rows, { id: "all", label: "전체", filters: [] })).toHaveLength(3);
  });
});

describe("matchesFilter — multi_select 다중값(하이브 동일화)", () => {
  it("equals: '가망, 계약대기' 행이 '가망' 필터에 매칭", () => {
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "equals", value: "가망" })).toBe(true);
  });
  it("equals: 단일값은 정확 일치만(기존 동작 보존)", () => {
    expect(matchesFilter({ s: "가망" } as RowData, { field: "s", operator: "equals", value: "계약대기" })).toBe(false);
  });
  it("in: '가망, 계약대기' 행이 ['계약대기'] 필터에 매칭", () => {
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "in", value: ["계약대기"] })).toBe(true);
  });
  it("in: 다중값 어느 것도 안 맞으면 비매칭", () => {
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "in", value: ["계약완료"] })).toBe(false);
  });
});

describe("buildTabFromDraft — 탭 편집 시 숨은 정보 보존", () => {
  it("이름·조건만 바꾸고 columns/isPreset/viewMode 는 그대로 보존한다", () => {
    const original = {
      id: "all",
      label: "전체",
      filters: [],
      columns: ["a", "b"],
      isPreset: true,
      viewMode: "calendar",
    } as unknown as ViewTab;
    const result = buildTabFromDraft(original, "전체(수정)", [
      { field: "05진행상태", operator: "equals", value: "정산완료" },
    ]) as unknown as Record<string, unknown>;
    expect(result.label).toBe("전체(수정)");
    expect(result.filters).toEqual([{ field: "05진행상태", operator: "equals", value: "정산완료" }]);
    expect(result.columns).toEqual(["a", "b"]);
    expect(result.isPreset).toBe(true);
    expect(result.viewMode).toBe("calendar");
    expect(result.id).toBe("all");
  });
});

describe("EMPTY_OPTION_VALUE — '(미입력)' 빈 값 거르기", () => {
  const emptyRow = { status: "" } as RowData;
  const filledRow = { status: "계약완료" } as RowData;

  it("equals '(미입력)': 빈 값 항목만 매칭", () => {
    expect(matchesFilter(emptyRow, { field: "status", operator: "equals", value: EMPTY_OPTION_VALUE })).toBe(true);
    expect(matchesFilter(filledRow, { field: "status", operator: "equals", value: EMPTY_OPTION_VALUE })).toBe(false);
    // 아예 칸이 없는(undefined) 경우도 빈 값으로 매칭
    expect(matchesFilter({} as RowData, { field: "status", operator: "equals", value: EMPTY_OPTION_VALUE })).toBe(true);
  });

  it("in ['(미입력)']: 빈 값 항목 매칭", () => {
    expect(matchesFilter(emptyRow, { field: "status", operator: "in", value: [EMPTY_OPTION_VALUE] })).toBe(true);
    expect(matchesFilter(filledRow, { field: "status", operator: "in", value: [EMPTY_OPTION_VALUE] })).toBe(false);
  });

  it("in ['계약완료','(미입력)']: 실제 값 항목과 빈 값 항목 둘 다 매칭", () => {
    expect(matchesFilter(filledRow, { field: "status", operator: "in", value: ["계약완료", EMPTY_OPTION_VALUE] })).toBe(true);
    expect(matchesFilter(emptyRow, { field: "status", operator: "in", value: ["계약완료", EMPTY_OPTION_VALUE] })).toBe(true);
    expect(matchesFilter({ status: "가망" } as RowData, { field: "status", operator: "in", value: ["계약완료", EMPTY_OPTION_VALUE] })).toBe(false);
  });

  it("in [실제값들]만: 빈 값 항목은 매칭 안 함(기존 동작 보존)", () => {
    expect(matchesFilter(emptyRow, { field: "status", operator: "in", value: ["계약완료", "가망"] })).toBe(false);
  });
});

describe("not_in — 다중 선택(제외): 고른 값만 빼고 전부 표시", () => {
  it("제외 목록에 든 값은 숨김, 나머지는 표시", () => {
    expect(matchesFilter({ status: "계약완료" } as RowData, { field: "status", operator: "not_in", value: ["계약취하"] })).toBe(true);
    expect(matchesFilter({ status: "계약취하" } as RowData, { field: "status", operator: "not_in", value: ["계약취하"] })).toBe(false);
  });
  it("제외 목록이 비었거나 배열이 아니면 전부 통과", () => {
    expect(matchesFilter({ status: "계약완료" } as RowData, { field: "status", operator: "not_in", value: [] })).toBe(true);
    expect(matchesFilter({ status: "계약완료" } as RowData, { field: "status", operator: "not_in", value: "계약취하" })).toBe(true);
  });
  it("빈 값(미입력)은 '(미입력)'을 제외했을 때만 숨김", () => {
    expect(matchesFilter({ status: "" } as RowData, { field: "status", operator: "not_in", value: ["계약취하"] })).toBe(true);
    expect(matchesFilter({ status: "" } as RowData, { field: "status", operator: "not_in", value: [EMPTY_OPTION_VALUE] })).toBe(false);
    expect(matchesFilter({} as RowData, { field: "status", operator: "not_in", value: [EMPTY_OPTION_VALUE] })).toBe(false);
  });
  it("다중값 행은 그중 하나라도 제외 대상이면 숨김", () => {
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "not_in", value: ["계약대기"] })).toBe(false);
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "not_in", value: ["계약완료"] })).toBe(true);
  });
  it("filterRowsByTab: '계약취하' 제외 → 계약완료·미입력 둘 다 남는다(사용자 상황)", () => {
    const rows: RowData[] = [
      { _id: "1", status: "계약완료" },
      { _id: "2", status: "" },
      { _id: "3", status: "계약취하" },
    ];
    const tab: ViewTab = { id: "x", label: "취하 제외", filters: [{ field: "status", operator: "not_in", value: ["계약취하"] }] };
    expect(filterRowsByTab(rows, tab).map((r) => r._id)).toEqual(["1", "2"]);
  });
  it("다중값 행: 모든 값이 제외 대상이면 숨김", () => {
    expect(matchesFilter({ s: "가망, 계약대기" } as RowData, { field: "s", operator: "not_in", value: ["가망", "계약대기"] })).toBe(false);
  });
  it("값이 undefined 면 전부 통과(제외 대상 없음)", () => {
    expect(matchesFilter({ status: "계약완료" } as RowData, { field: "status", operator: "not_in", value: undefined })).toBe(true);
  });
  it("빈 행 + 빈 제외목록 → 표시", () => {
    expect(matchesFilter({ status: "" } as RowData, { field: "status", operator: "not_in", value: [] })).toBe(true);
  });
});
