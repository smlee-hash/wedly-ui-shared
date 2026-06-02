import { describe, it, expect } from "vitest";
import type { ColumnDef } from "../types/columns";
import {
  filterRowsBySearch,
  sortRows,
  nextSortConfig,
  orderColumns,
  computeStickyOffsets,
  paginate,
  totalPageCount,
  reorderList,
  defaultFormatCellValue,
  type RowData,
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
});
