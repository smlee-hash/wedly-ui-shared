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
  resolveInitialColumnOrder,
  defaultFormatCellValue,
  composeRowClassName,
  resolveInjectedCellEditor,
  colWidthsSignature,
  type RowData,
  type CellValue,
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

// 2026-08-13 이충훈 컨설턴트 제보 — 저장된 상호는 "태권도장 아토"(띄어쓰기)인데 담당자는
// "태권도장아토"(붙여쓰기)로 검색해 0건이 떴다("업체가 목록에 없다"로 오해). 반대 방향
// ("예성기업" 저장 ↔ "예성 기업" 검색)도 같다. 띄어쓰기 차이는 무시하고 찾아야 한다.
describe("filterRowsBySearch — 띄어쓰기 무시 검색", () => {
  const rows: RowData[] = [
    { _id: "1", name: "태권도장 아토" },
    { _id: "2", name: "예성기업" },
    { _id: "3", name: "한빛상사" },
  ];
  const ids = (q: string) => filterRowsBySearch(rows, q).map((r) => r._id);

  it("붙여 쓴 검색어로 띄어 쓴 저장값을 찾는다", () => {
    expect(ids("태권도장아토")).toEqual(["1"]);
  });
  it("띄어 쓴 검색어로 붙여 쓴 저장값을 찾는다", () => {
    expect(ids("예성 기업")).toEqual(["2"]);
  });
  it("띄어쓰기가 같으면 종전대로 찾는다", () => {
    expect(ids("태권도장 아토")).toEqual(["1"]);
    expect(ids("예성기업")).toEqual(["2"]);
  });
  it("띄어쓰기를 무시해도 없는 글자는 안 잡는다", () => {
    expect(ids("태권도장아토상사")).toEqual([]);
  });

  it("숫자 모양 검색어에는 압축 비교를 안 쓴다 — 짧은 숫자 오탐 방지(7자리 문턱) 유지", () => {
    const numRows: RowData[] = [
      { _id: "p1", phone: "010-1234-5678", amount: "10,000,000" },
    ];
    const nids = (q: string) => filterRowsBySearch(numRows, q).map((r) => r._id);
    expect(nids("010 1")).toEqual([]);          // 압축 "0101"이 번호·금액에 번지지 않는다(종전과 동일)
    expect(nids("010 1234 5678")).toEqual(["p1"]); // 7자리 이상 번호는 종전대로 숫자 비교로 찾힌다
  });
});

// NO.82 — 전화·번호 검색은 하이픈/구분자와 무관하게 숫자만 비교(부분검색 포함).
// '덧붙이기' 방식: 기존 글자 검색은 그대로 두고, 번호형 검색어에서만 숫자 매칭을 추가한다.
describe("filterRowsBySearch — 번호형 하이픈 무시(숫자만) 검색 (NO.82)", () => {
  const rows: RowData[] = [
    { _id: "1", name: "가나상사", phone: "010-1234-5678", biz: "123-45-67890" },
    { _id: "2", name: "라마상사", phone: "01087651234" }, // 하이픈 없이 저장
    { _id: "3", name: "바사상사", phone: "" },
  ];
  const ids = (q: string) => filterRowsBySearch(rows, q).map((r) => r._id);

  it("하이픈 없이 친 전체 번호 → 하이픈 저장값 조회", () => {
    expect(ids("01012345678")).toEqual(["1"]);
  });
  it("하이픈 포함 검색어도 동일 조회", () => {
    expect(ids("010-1234-5678")).toEqual(["1"]);
  });
  it("뒷 8자리 부분검색(하이픈 없음)", () => {
    expect(ids("12345678")).toEqual(["1"]);
  });
  it("부분검색 + 하이픈 포함", () => {
    expect(ids("1234-5678")).toEqual(["1"]);
  });
  it("하이픈 없이 저장된 값도 하이픈 넣어 검색되면 조회", () => {
    expect(ids("0108-765")).toEqual(["2"]);
  });
  it("사업자번호도 하이픈 무시 숫자 검색", () => {
    expect(ids("1234567890")).toEqual(["1"]);
  });
  it("빈 전화 행은 숫자 검색에 걸리지 않음", () => {
    expect(ids("010")).toEqual(["1", "2"]); // '' 저장(3번)은 제외
  });
  it("숫자 아닌 검색어는 기존 글자검색 그대로(회귀 없음)", () => {
    expect(ids("가나")).toEqual(["1"]);
    expect(filterRowsBySearch(rows, "없는회사")).toHaveLength(0);
  });
  // 오탐 방지(7자리 문턱): 짧은 숫자는 숫자매칭을 켜지 않아 금액/퍼센트 칸이 딸려오지 않는다.
  it("짧은 숫자(6자리 이하)는 숫자매칭 미적용 — 금액·퍼센트 칸 오탐 없음", () => {
    const rows2: RowData[] = [
      { _id: "A", name: "가", amount: "12,340,000", rate: "3.5%" },
      { _id: "B", name: "나", phone: "010-6329-0022" },
    ];
    // "1234": 옛 글자검색도 콤마로 안 걸림 + 6자리 이하라 숫자매칭 미적용 → 0건(금액 12,340,000 안 딸려옴)
    expect(filterRowsBySearch(rows2, "1234")).toHaveLength(0);
    // "35": 6자리 이하라 숫자매칭 미적용 → 퍼센트 3.5%(숫자 35)가 딸려오지 않음(글자로도 '3.5%'에 "35" 없음)
    expect(filterRowsBySearch(rows2, "35")).toHaveLength(0);
    // "3.5": 글자 그대로 '3.5%'에 존재 → 기존 글자검색으로 매칭됨(원래 동작·회귀 아님, 숫자 경로와 무관)
    expect(filterRowsBySearch(rows2, "3.5").map((r) => r._id)).toEqual(["A"]);
    // 7자리 이상은 정상 숫자매칭
    expect(filterRowsBySearch(rows2, "6329002").map((r) => r._id)).toEqual(["B"]);
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

describe("resolveInitialColumnOrder (관리자 서버 순서 우선)", () => {
  it("서버(관리자) 순서가 있으면 그것을 쓴다 — 로컬·기본을 덮어씀", () => {
    expect(resolveInitialColumnOrder(["b", "a"], ["a", "b"], ["c", "d"])).toEqual(["b", "a"]);
  });
  it("서버 순서가 없으면(undefined) 로컬을 쓴다 — 관리자 미설정 시 기존 사용자 순서 보존", () => {
    expect(resolveInitialColumnOrder(undefined, ["a", "b"], ["c", "d"])).toEqual(["a", "b"]);
  });
  it("서버 순서가 빈 배열이면 로컬을 쓴다", () => {
    expect(resolveInitialColumnOrder([], ["a", "b"], ["c", "d"])).toEqual(["a", "b"]);
  });
  it("서버·로컬 둘 다 없으면 기본(앱 지정) 순서를 쓴다", () => {
    expect(resolveInitialColumnOrder(undefined, [], ["c", "d"])).toEqual(["c", "d"]);
  });
  it("셋 다 없으면 빈 배열(=columns 원래 순서)", () => {
    expect(resolveInitialColumnOrder(undefined, undefined, undefined)).toEqual([]);
  });
  it("서버가 배열이 아니면(잘못된 값) 로컬로 폴백", () => {
    expect(resolveInitialColumnOrder("x" as unknown, ["a"], ["c"])).toEqual(["a"]);
  });
  it("로컬이 배열이 아니면 기본으로 폴백", () => {
    expect(resolveInitialColumnOrder(undefined, "bad" as unknown, ["c"])).toEqual(["c"]);
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

describe("resolveInjectedCellEditor (끼울 수 있는 셀 편집기 — 미지정 시 무영향)", () => {
  const args = {
    col: col("26담당컨설턴트", "select"),
    row: { _id: "1" } as RowData,
    value: "홍길동" as CellValue,
    commit: () => {},
    cancel: () => {},
  };
  it("renderEditor 미지정이면 null — 공용 표가 기존 편집기 switch로 폴백(ERP/하이브 무영향)", () => {
    expect(resolveInjectedCellEditor(undefined, args)).toBeNull();
  });
  it("renderEditor가 그 칸에 null을 돌려주면 null — 그 칸만 기본 편집기로 폴백", () => {
    expect(resolveInjectedCellEditor(() => null, args)).toBeNull();
  });
  it("renderEditor가 노드를 돌려주면 그 노드를 그대로 편집기로 사용", () => {
    expect(resolveInjectedCellEditor(() => "EDITOR", args)).toBe("EDITOR");
  });
  it("col/row/value/commit/cancel 인자를 주입 함수에 그대로 전달", () => {
    let seen: unknown = null;
    resolveInjectedCellEditor((a) => { seen = a; return "X"; }, args);
    expect(seen).toBe(args);
  });
});

// ── 공용(관리자) 칸 너비 지문 — NO.139 ──────────────────────────────
// 화면을 다시 그릴 때마다 관리자 너비를 다시 덮어써서, 방금 끌어놓은 칸 폭이
// 옛 값으로 되돌아가던 문제(NO.139)를 막기 위한 "내용이 정말 달라졌는가" 판정.
describe("colWidthsSignature (NO.139 — 끌어놓은 칸 폭이 되돌아가지 않게)", () => {
  it("빈 묶음·없음은 빈 문자열", () => {
    expect(colWidthsSignature(undefined)).toBe("");
    expect(colWidthsSignature(null)).toBe("");
    expect(colWidthsSignature({})).toBe("");
  });

  it("키 순서가 달라도 내용이 같으면 같은 지문", () => {
    expect(colWidthsSignature({ a: 100, b: 200 })).toBe(colWidthsSignature({ b: 200, a: 100 }));
  });

  it("값이 하나라도 다르면 지문이 달라진다", () => {
    expect(colWidthsSignature({ "22인용확인일": 144 })).not.toBe(colWidthsSignature({ "22인용확인일": 264 }));
  });

  it("칸이 늘거나 줄어도 지문이 달라진다", () => {
    expect(colWidthsSignature({ a: 100 })).not.toBe(colWidthsSignature({ a: 100, b: 100 }));
  });

  it("서버 값이 그대로면 지문도 그대로 — 다시 덮어쓸 이유가 없다", () => {
    const server = { "22인용확인일": 144, "02상호명": 276 };
    const before = colWidthsSignature(server);
    // 부모가 화면을 다시 그려 같은 내용의 새 묶음을 넘겨도(참조만 다름) 지문은 동일해야 한다.
    const afterRerender = colWidthsSignature({ ...server });
    expect(afterRerender).toBe(before);
  });
});

// 화면에만 보이는 값(저장값이 비어 다른 곳에서 채워 그리는 칸)도 검색에 걸리게 하는 통로.
// 일루아 대표자명이 그 예 — 저장값은 비었고 회사별 공용 이름으로 표시만 채워 그린다(NO.130).
// 이 통로가 없으면 "화면엔 이름이 보이는데 그 이름으로 찾으면 0건"이 된다(2026-07-29 배포본 실측).
describe("filterRowsBySearch — 화면에만 보이는 값 덧붙이기(extraSearchText)", () => {
  const rows: RowData[] = [
    { _id: "1", "01업체명": "디자인시안", "02대표자명": "", "04사업자번호": "594-24-00345" },
    { _id: "2", "01업체명": "한스라이팅", "02대표자명": "한성열", "04사업자번호": "111-11-11111" },
  ];
  // 저장값이 빈 행에만 화면용 이름을 붙여 주는 통로(원본 행은 그대로 둔다)
  const extra = (row: RowData) => (String(row["02대표자명"] ?? "") === "" && row._id === "1" ? "최우현" : "");
  const ids = (q: string, fn?: (row: RowData) => string) => filterRowsBySearch(rows, q, fn).map((r) => r._id);

  it("통로를 안 주면 종전과 100% 동일(비회귀)", () => {
    expect(ids("최우현")).toEqual([]);
    expect(ids("한성열")).toEqual(["2"]);
    expect(ids("디자인시안")).toEqual(["1"]);
  });
  it("화면에만 보이는 이름으로도 찾힌다", () => {
    expect(ids("최우현", extra)).toEqual(["1"]);
    expect(ids("최우", extra)).toEqual(["1"]);
  });
  it("덧붙이기라 기존 결과는 그대로 남는다", () => {
    expect(ids("한성열", extra)).toEqual(["2"]);
    expect(ids("디자인시안", extra)).toEqual(["1"]);
    expect(ids("없는이름", extra)).toEqual([]);
  });
  it("통로가 빈 글자·공백을 돌려줘도 안전하다", () => {
    expect(ids("최우현", () => "")).toEqual([]);
    expect(ids("최우현", () => "   ")).toEqual([]);
  });
  it("번호형 검색(숫자만 비교)에도 덧붙인 값이 함께 걸린다", () => {
    const withPhone = (row: RowData) => (row._id === "1" ? "010-9999-8888" : "");
    expect(ids("01099998888", withPhone)).toEqual(["1"]);
  });
});
