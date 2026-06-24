import { describe, it, expect } from "vitest";
import type { ColumnDef } from "../types/columns";
import {
  filterRowsBySearch,
  sortRows,
  nextSortConfig,
  normalizeSort,
  orderColumns,
  computeStickyOffsets,
  paginate,
  totalPageCount,
  reorderList,
  defaultFormatCellValue,
  composeRowClassName,
  resolveActiveColumns,
  type RowData,
  type SortRule,
} from "./collab-table-core";

const col = (key: string, type: ColumnDef["type"], extra: Partial<ColumnDef> = {}): ColumnDef => ({
  key, label: key, type, defaultVisible: true, ...extra,
});

describe("filterRowsBySearch", () => {
  const rows: RowData[] = [
    { _id: "1", name: "가나다", phone: "010", _hidden: "SECRET" },
    { _id: "2", name: "라마바", phone: "", note: null },
  ];
  it("빈 검색어면 전체 반환", () => {
    expect(filterRowsBySearch(rows, "")).toHaveLength(2);
    expect(filterRowsBySearch(rows, "   ")).toHaveLength(2);
  });
  it("일반 컬럼 값으로 대소문자 무시 검색", () => {
    expect(filterRowsBySearch(rows, "가나")).toHaveLength(1);
    expect(filterRowsBySearch(rows, "010")).toHaveLength(1);
  });
  it("밑줄(_)로 시작하는 키는 검색 대상에서 제외", () => {
    expect(filterRowsBySearch(rows, "secret")).toHaveLength(0);
  });
});

describe("sortRows / nextSortConfig", () => {
  const rows: RowData[] = [{ _id: "1", v: "나" }, { _id: "2", v: "" }, { _id: "3", v: "가" }];
  it("정렬 설정이 없으면 원본 순서", () => {
    expect(sortRows(rows, null).map((r) => r._id)).toEqual(["1", "2", "3"]);
  });
  it("오름차순: 빈 값은 항상 뒤로", () => {
    expect(sortRows(rows, { key: "v", direction: "asc" }).map((r) => r._id)).toEqual(["3", "1", "2"]);
  });
  it("내림차순", () => {
    expect(sortRows(rows, { key: "v", direction: "desc" }).map((r) => r._id)).toEqual(["1", "3", "2"]);
  });
  it("정렬 토글: 없음→오름→내림→없음", () => {
    expect(nextSortConfig(null, "v")).toEqual({ key: "v", direction: "asc" });
    expect(nextSortConfig({ key: "v", direction: "asc" }, "v")).toEqual({ key: "v", direction: "desc" });
    expect(nextSortConfig({ key: "v", direction: "desc" }, "v")).toBeNull();
    expect(nextSortConfig({ key: "v", direction: "desc" }, "other")).toEqual({ key: "other", direction: "asc" });
  });
});

describe("normalizeSort", () => {
  it("null → 빈 배열", () => {
    expect(normalizeSort(null)).toEqual([]);
  });
  it("단일 객체 → 1개짜리 배열", () => {
    expect(normalizeSort({ key: "v", direction: "asc" })).toEqual([{ key: "v", direction: "asc" }]);
  });
  it("배열 → 그대로 반환", () => {
    const rules: SortRule[] = [{ key: "a", direction: "asc" }, { key: "b", direction: "desc" }];
    expect(normalizeSort(rules)).toBe(rules);
  });
});

describe("sortRows — 다중 AND 정렬", () => {
  // 1순위: status(asc), 2순위: name(asc)
  const rows: RowData[] = [
    { _id: "1", status: "B", name: "나" },
    { _id: "2", status: "A", name: "다" },
    { _id: "3", status: "A", name: "가" },
    { _id: "4", status: "B", name: "가" },
    { _id: "5", status: "",  name: "나" },
  ];

  it("1순위 동률이면 2순위로 정렬(AND)", () => {
    const rules: SortRule[] = [
      { key: "status", direction: "asc" },
      { key: "name",   direction: "asc" },
    ];
    // status A < B, A끼리는 name 오름(가<다), B끼리는 name 오름(가<나), 빈 status는 항상 뒤
    expect(sortRows(rows, rules).map((r) => r._id)).toEqual(["3", "2", "4", "1", "5"]);
  });

  it("2순위 내림차순도 동작", () => {
    const rules: SortRule[] = [
      { key: "status", direction: "asc" },
      { key: "name",   direction: "desc" },
    ];
    // A끼리: 다>가 → 2,3 / B끼리: 나>가 → 1,4
    expect(sortRows(rows, rules).map((r) => r._id)).toEqual(["2", "3", "1", "4", "5"]);
  });

  it("빈 배열 SortConfig → 원본 순서", () => {
    expect(sortRows(rows, []).map((r) => r._id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("nextSortConfig 배열 형태 prev: 첫 규칙 기준 토글", () => {
    const prev: SortRule[] = [{ key: "status", direction: "asc" }, { key: "name", direction: "desc" }];
    // status asc → status desc (2순위는 사라짐 — 단일 반환)
    expect(nextSortConfig(prev, "status")).toEqual({ key: "status", direction: "desc" });
    // 다른 키 → 그 키 osc 단일
    expect(nextSortConfig(prev, "name")).toEqual({ key: "name", direction: "asc" });
  });
});

describe("orderColumns", () => {
  const cols = [col("a", "text"), col("b", "text"), col("c", "text")];
  it("순서 배열이 비면 원본 그대로", () => {
    expect(orderColumns(cols, []).map((c) => c.key)).toEqual(["a", "b", "c"]);
  });
  it("저장된 순서 적용 + 누락 컬럼은 뒤에 붙임", () => {
    expect(orderColumns(cols, ["c", "a"]).map((c) => c.key)).toEqual(["c", "a", "b"]);
  });
  it("알 수 없는 키는 무시", () => {
    expect(orderColumns(cols, ["zzz", "b"]).map((c) => c.key)).toEqual(["b", "a", "c"]);
  });
});

describe("computeStickyOffsets", () => {
  it("고정(sticky) 컬럼만 누적 오프셋 계산", () => {
    const active = [col("id", "text", { sticky: true, width: 60 }), col("name", "title", { sticky: true, width: 300 }), col("x", "text")];
    expect(computeStickyOffsets(active, { id: 60, name: 300 })).toEqual({ id: 0, name: 60 });
  });
});

describe("paginate / totalPageCount", () => {
  const rows: RowData[] = Array.from({ length: 5 }, (_, i) => ({ _id: String(i) }));
  it("페이지 슬라이스", () => {
    expect(paginate(rows, 2, 2).map((r) => r._id)).toEqual(["2", "3"]);
  });
  it("총 페이지 수(최소 1)", () => {
    expect(totalPageCount(5, 2)).toBe(3);
    expect(totalPageCount(0, 2)).toBe(1);
  });
  it("전체(Infinity)면 모든 행 반환 — 0×Infinity=NaN 빈배열 버그 방지", () => {
    expect(paginate(rows, 1, Infinity).map((r) => r._id)).toEqual(["0", "1", "2", "3", "4"]);
    expect(totalPageCount(5, Infinity)).toBe(1);
  });
});

describe("reorderList", () => {
  it("from을 to 위치로 이동", () => {
    expect(reorderList(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
  });
  it("같은 키면 변화 없음", () => {
    expect(reorderList(["a", "b"], "a", "a")).toEqual(["a", "b"]);
  });
  it("없는 키면 원본 반환", () => {
    expect(reorderList(["a", "b"], "z", "a")).toEqual(["a", "b"]);
  });
  // 회귀 방지: 저장된 순서에 없던 칸(나중에 추가됐거나 기본 숨김이라 뒤에 붙은 칸, 예: "DB 담당")이
  // 드래그로 옮겨지지 않던 버그. reorderColumn 이 base 를 colOrder 가 아니라 orderColumns 전체로
  // 잡아야 동작한다. 옛 동작(colOrder 만 base)이면 무시되고, 고친 동작(전체 순서 base)이면 이동된다.
  it("저장된 순서에 없던 칸도 전체 순서 기준이면 드래그로 옮길 수 있다", () => {
    const cols = [col("a", "text"), col("b", "text"), col("DB담당", "select")];
    const savedOrder = ["a", "b"]; // DB담당 빠짐(나중에 추가됨)
    // 옛 동작: 저장된 순서만 기준 → DB담당 이동 무시(버그)
    expect(reorderList(savedOrder, "DB담당", "a")).toEqual(["a", "b"]);
    // 고친 동작: orderColumns 로 만든 전체 순서 기준 → 정상 이동
    const fullBase = orderColumns(cols, savedOrder).map((c) => c.key);
    expect(fullBase).toEqual(["a", "b", "DB담당"]);
    expect(reorderList(fullBase, "DB담당", "a")).toEqual(["DB담당", "a", "b"]);
  });
});

describe("defaultFormatCellValue", () => {
  it("빈 값은 대시", () => {
    expect(defaultFormatCellValue(col("x", "text"), null)).toBe("—");
    expect(defaultFormatCellValue(col("x", "text"), "")).toBe("—");
  });
  it("체크박스", () => {
    expect(defaultFormatCellValue(col("x", "checkbox"), true)).toBe("✓");
    expect(defaultFormatCellValue(col("x", "checkbox"), "true")).toBe("✓");
    expect(defaultFormatCellValue(col("x", "checkbox"), false)).toBe("—");
  });
  it("통화 형식 숫자", () => {
    expect(defaultFormatCellValue(col("x", "number", { format: "currency" }), 1000000)).toBe("1,000,000");
  });
  it("통화 아닌 숫자는 문자열로", () => {
    expect(defaultFormatCellValue(col("x", "number"), 42)).toBe("42");
  });
  it("일반 텍스트는 그대로", () => {
    expect(defaultFormatCellValue(col("x", "text"), "안녕")).toBe("안녕");
  });
  it("percent 는 값 뒤에 % (계산 없이 표시)", () => {
    expect(defaultFormatCellValue(col("x", "percent"), 5)).toBe("5%");
    expect(defaultFormatCellValue(col("x", "percent"), 1.65)).toBe("1.65%");
  });
  it("percent 빈값은 — (em dash)", () => {
    expect(defaultFormatCellValue(col("x", "percent"), "")).toBe("—");
    expect(defaultFormatCellValue(col("x", "percent"), null)).toBe("—");
  });
});

describe("composeRowClassName (줄 색칠 우선순위)", () => {
  // 하이브·일루아 표와 똑같은 규칙을 공용 표로 옮긴 것:
  //   체크된 줄의 파란 강조 > 조건부 색칠 > 기본(테두리+hover).
  //   조건부 색은 그 줄이 체크 안 됐을 때만 적용(체크하면 파란 강조가 이김).
  const base = "border-t hover";
  const checked = "bg-blue";

  it("조건부 색 없고 체크 안 됨 → 기본만", () => {
    expect(composeRowClassName(base, false, checked, null)).toBe("border-t hover");
  });
  it("조건부 색 있고 체크 안 됨 → 기본 + 조건부 색", () => {
    expect(composeRowClassName(base, false, checked, "bg-red text-red")).toBe(
      "border-t hover bg-red text-red",
    );
  });
  it("체크됨 + 조건부 색 없음 → 기본 + 체크 강조", () => {
    expect(composeRowClassName(base, true, checked, null)).toBe("border-t hover bg-blue");
  });
  it("체크됨 + 조건부 색 있음 → 조건부 색은 빠지고 체크 강조가 이김", () => {
    expect(composeRowClassName(base, true, checked, "bg-red text-red")).toBe(
      "border-t hover bg-blue",
    );
  });
  it("조건부 색이 null/undefined/빈문자열이면 무시(빈 토큰 없음)", () => {
    expect(composeRowClassName(base, false, checked, null)).toBe("border-t hover");
    expect(composeRowClassName(base, false, checked, undefined)).toBe("border-t hover");
    expect(composeRowClassName(base, false, checked, "")).toBe("border-t hover");
  });
  it("미지정(조건부 색 없음)일 때 기존 동작과 동일 — ERP 무영향 보장", () => {
    // ERP는 getRowColorClass를 안 넘기므로 conditionalClass는 항상 빈값 → 기존 cn() 결과와 같아야 한다.
    expect(composeRowClassName(base, false, checked, undefined)).toBe("border-t hover");
    expect(composeRowClassName(base, true, checked, undefined)).toBe("border-t hover bg-blue");
  });
});

describe("resolveActiveColumns (탭별 칸 — 부모 제어 통로)", () => {
  // 표에 실제로 보일 칸 목록을 정한다. (3앱 표 통일 — 하이브가 부모에서 탭별로 칸을 계산하던 방식을 공용 표가 받아들이게)
  //   resolver(부모 제공) 있으면 그 결과를 그대로 쓴다(탭별·관리자전역 정책은 부모 소유).
  //   없으면 기존 동작 = 전역 표시 집합으로 거른다(=ERP 무영향).
  const ordered = [col("a", "text"), col("b", "text"), col("c", "text")];

  it("resolver 없으면 전역 표시 집합으로 거름 — 기존 동작과 동일(ERP 무영향)", () => {
    const visible = new Set(["a", "c"]);
    const out = resolveActiveColumns(ordered, visible, "tab1", undefined);
    expect(out.map((c) => c.key)).toEqual(["a", "c"]);
    // 기존 코드(orderedColumns.filter(c=>visible.has(c.key)))와 글자 그대로 같은 결과여야 한다.
    expect(out).toEqual(ordered.filter((c) => visible.has(c.key)));
  });

  it("resolver 없고 null이어도 기존 동작(거름)", () => {
    const visible = new Set(["b"]);
    expect(resolveActiveColumns(ordered, visible, "tab1", null).map((c) => c.key)).toEqual(["b"]);
  });

  it("resolver 있으면 그 결과를 그대로 사용(전역 표시 무시)", () => {
    const visible = new Set(["a"]); // resolver가 있으면 이건 무시돼야 한다
    const resolver = () => [ordered[2], ordered[0]]; // c, a 순서로 (부모가 정한 탭별 순서)
    const out = resolveActiveColumns(ordered, visible, "tab1", resolver);
    expect(out.map((c) => c.key)).toEqual(["c", "a"]);
  });

  it("resolver에 (activeTabId, 전체 칸 목록)이 그대로 전달된다", () => {
    let gotTab = "";
    let gotCatalogKeys: string[] = [];
    const resolver = (tabId: string, catalog: typeof ordered) => {
      gotTab = tabId;
      gotCatalogKeys = catalog.map((c) => c.key);
      return catalog;
    };
    resolveActiveColumns(ordered, new Set(), "tab-xyz", resolver);
    expect(gotTab).toBe("tab-xyz");
    expect(gotCatalogKeys).toEqual(["a", "b", "c"]);
  });

  it("resolver가 빈 배열을 돌려주면 빈 배열(부모 결정 존중)", () => {
    expect(resolveActiveColumns(ordered, new Set(["a", "b", "c"]), "t", () => [])).toEqual([]);
  });
});
