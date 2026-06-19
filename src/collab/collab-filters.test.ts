import { describe, it, expect } from "vitest";
import { matchesFilter, matchesTab, filterRowsByTab, buildTabFromDraft, EMPTY_OPTION_VALUE, type ViewTab } from "./collab-filters";
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
