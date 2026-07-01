import { describe, it, expect } from "vitest";
import { matchesFilter, matchesTab, filterRowsByTab, buildTabFromDraft, EMPTY_OPTION_VALUE, resolveDateWindow, filterRowsByConditions, isConditionComplete, type ViewTab } from "./collab-filters";
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

describe("resolveDateWindow (상대/범위 날짜 → from/to)", () => {
  const TODAY = "2026-07-15"; // 수요일

  it("오늘/어제", () => {
    expect(resolveDateWindow({ operator: "date_today" }, TODAY)).toEqual({ from: "2026-07-15", to: "2026-07-15" });
    expect(resolveDateWindow({ operator: "date_yesterday" }, TODAY)).toEqual({ from: "2026-07-14", to: "2026-07-14" });
  });

  it("이번 주(월~일)", () => {
    // 2026-07-15(수) 기준 주: 월 2026-07-13 ~ 일 2026-07-19
    expect(resolveDateWindow({ operator: "date_this_week" }, TODAY)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
  });

  it("이번 달 / 지난 달(말일 포함)", () => {
    expect(resolveDateWindow({ operator: "date_this_month" }, TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(resolveDateWindow({ operator: "date_last_month" }, TODAY)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("이후/이전/기간", () => {
    expect(resolveDateWindow({ operator: "on_or_after", value: "2026-07-10" }, TODAY)).toEqual({ from: "2026-07-10" });
    expect(resolveDateWindow({ operator: "on_or_before", value: "2026-07-10" }, TODAY)).toEqual({ to: "2026-07-10" });
    expect(resolveDateWindow({ operator: "date_between", value: ["2026-07-01", "2026-07-10"] }, TODAY)).toEqual({ from: "2026-07-01", to: "2026-07-10" });
  });

  it("연/월 경계: 1월 15일의 지난 달 = 작년 12월", () => {
    expect(resolveDateWindow({ operator: "date_last_month" }, "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("matchesFilter — 노션 추가 연산자", () => {
  const TODAY = "2026-07-15";
  const row: RowData = { 상호명: "김밥천국", 상태: "가망, 계약대기", 계약일: "2026-07-13T09:00:00", 빈칸: "" };

  it("not_equals / not_contains (텍스트)", () => {
    expect(matchesFilter(row, { field: "상호명", operator: "not_equals", value: "김밥천국" })).toBe(false);
    expect(matchesFilter(row, { field: "상호명", operator: "not_equals", value: "다른곳" })).toBe(true);
    expect(matchesFilter(row, { field: "상호명", operator: "not_contains", value: "천국" })).toBe(false);
    expect(matchesFilter(row, { field: "상호명", operator: "not_contains", value: "왕국" })).toBe(true);
  });

  it("not_in (드롭다운 제외, 다중선택 분해) — 기존 로직 유지", () => {
    expect(matchesFilter(row, { field: "상태", operator: "not_in", value: ["가망"] })).toBe(false);
    expect(matchesFilter(row, { field: "상태", operator: "not_in", value: ["보류"] })).toBe(true);
  });

  it("상대 날짜(이번 주 포함)/기간, 빈 값 제외", () => {
    // 계약일 2026-07-13 은 2026-07-15 기준 '이번 주(월13~일19)'에 포함
    expect(matchesFilter(row, { field: "계약일", operator: "date_this_week" }, TODAY)).toBe(true);
    expect(matchesFilter(row, { field: "계약일", operator: "date_today" }, TODAY)).toBe(false);
    expect(matchesFilter(row, { field: "계약일", operator: "on_or_after", value: "2026-07-14" }, TODAY)).toBe(false);
    expect(matchesFilter(row, { field: "계약일", operator: "date_between", value: ["2026-07-01", "2026-07-31"] }, TODAY)).toBe(true);
    expect(matchesFilter(row, { field: "빈칸", operator: "date_this_month" }, TODAY)).toBe(false);
  });
});

describe("isConditionComplete", () => {
  it("값 없는 연산자는 완성", () => {
    expect(isConditionComplete({ field: "a", operator: "is_empty" })).toBe(true);
    expect(isConditionComplete({ field: "a", operator: "date_this_month" })).toBe(true);
  });
  it("in/not_in 은 배열 비어있으면 미완성", () => {
    expect(isConditionComplete({ field: "a", operator: "in", value: [] })).toBe(false);
    expect(isConditionComplete({ field: "a", operator: "in", value: ["x"] })).toBe(true);
  });
  it("date_between 은 둘 다 있어야 완성", () => {
    expect(isConditionComplete({ field: "a", operator: "date_between", value: ["2026-07-01", ""] })).toBe(false);
    expect(isConditionComplete({ field: "a", operator: "date_between", value: ["2026-07-01", "2026-07-10"] })).toBe(true);
  });
  it("텍스트/단일값 연산자는 빈 문자열이면 미완성", () => {
    expect(isConditionComplete({ field: "a", operator: "contains", value: "" })).toBe(false);
    expect(isConditionComplete({ field: "a", operator: "contains", value: "김" })).toBe(true);
  });
});

describe("filterRowsByConditions (AND, 미완성 조건 건너뜀)", () => {
  const TODAY = "2026-07-15";
  const rows: RowData[] = [
    { 상호명: "김밥천국", 상태: "가망", 계약일: "2026-07-13" },
    { 상호명: "박가네", 상태: "계약대기", 계약일: "2026-06-30" },
  ];
  it("완성된 조건만 AND 로 적용", () => {
    const out = filterRowsByConditions(
      rows,
      [
        { field: "상태", operator: "in", value: ["가망"] },
        { field: "상호명", operator: "contains", value: "" }, // 미완성 → 무시
      ],
      TODAY,
    );
    expect(out.map((r) => r.상호명)).toEqual(["김밥천국"]);
  });
  it("완성 조건 0개면 전체 반환", () => {
    expect(filterRowsByConditions(rows, [{ field: "상태", operator: "in", value: [] }], TODAY)).toHaveLength(2);
  });
});
