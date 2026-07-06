import { describe, it, expect } from "vitest";
import {
  filterCategory, defaultOperator, itemsToConditions, operatorsFor, isValueNeeded,
  reorderItems, genItemId,
  seedOperatorFor, itemsToDefaultColumns, reconcileItemsWithDefaultColumns, resetItemValues,
  type FilterItem,
} from "./filter-items";
import type { FilterCondition } from "./collab-filters";

describe("filterCategory", () => {
  it("타입 → 카테고리 매핑", () => {
    expect(filterCategory("date")).toBe("date");
    expect(filterCategory("datetime")).toBe("date");
    expect(filterCategory("last_edited_time")).toBe("date");
    expect(filterCategory("select")).toBe("select");
    expect(filterCategory("multi_select")).toBe("select");
    expect(filterCategory("status")).toBe("select");
    expect(filterCategory("checkbox")).toBe("select");
    expect(filterCategory("text")).toBe("text");
    expect(filterCategory("phone_number")).toBe("text");
    expect(filterCategory("number")).toBe("text");
  });
});

describe("operatorsFor / defaultOperator", () => {
  it("카테고리별 첫 연산자가 기본", () => {
    expect(defaultOperator("text")).toBe(operatorsFor("text")[0].op);
    expect(defaultOperator("select")).toBe("in");
    expect(defaultOperator("date")).toBe("date_today");
  });
});

describe("isValueNeeded", () => {
  it("값 없는 연산자는 false", () => {
    expect(isValueNeeded("is_empty")).toBe(false);
    expect(isValueNeeded("date_today")).toBe(false);
    expect(isValueNeeded("contains")).toBe(true);
    expect(isValueNeeded("in")).toBe(true);
    expect(isValueNeeded("date_between")).toBe(true);
  });
});

// ── '기본 필터 = 칸(컬럼)만 공유' 모델 ────────────────────────────────
const typeOfFrom = (m: Record<string, string>) => (f: string) => m[f];

describe("seedOperatorFor", () => {
  it("빈 값이면 자동 필터되지 않는(값 필요) 연산자를 고른다", () => {
    // 값 없으면 isConditionComplete=false → 갓 시드된 빈 기본 칸이 목록을 거르지 않음.
    expect(seedOperatorFor("date")).toBe("date_between");
    expect(seedOperatorFor("select")).toBe("in");
    expect(seedOperatorFor("text")).toBe("contains");
    expect(isValueNeeded(seedOperatorFor("date"))).toBe(true);
    expect(isValueNeeded(seedOperatorFor("select"))).toBe(true);
    expect(isValueNeeded(seedOperatorFor("text"))).toBe(true);
  });
});

describe("itemsToDefaultColumns", () => {
  const TY = typeOfFrom({ DB분류: "multi_select", 계약일: "date", 메모: "text", 영업담당: "person" });

  it("칸만 남긴다(중복 제거·값 제외·seed 연산자로 정규화)", () => {
    const items: FilterItem[] = [
      { id: "a", field: "DB분류", operator: "in", value: ["경정청구"] },
      { id: "b", field: "계약일", operator: "date_this_month" }, // 값없는 연산자여도 저장 땐 seed 로
      { id: "c", field: "DB분류", operator: "not_in", value: ["x"] }, // 중복 칸 → 무시
    ];
    expect(itemsToDefaultColumns(items, TY)).toEqual([
      { field: "DB분류", operator: "in" },
      { field: "계약일", operator: "date_between" },
    ]);
  });

  it("값(선택한 값)은 절대 서버로 나가지 않는다(칸만) — person 은 text 계열이라 seed=contains", () => {
    const items: FilterItem[] = [{ id: "a", field: "영업담당", operator: "equals", value: "김철수", pinned: true }];
    const out = itemsToDefaultColumns(items, TY);
    expect(out).toEqual([{ field: "영업담당", operator: "contains" }]);
    expect(out[0]).not.toHaveProperty("value");
  });

  it("종류를 못 찾으면 text 로 간주(contains)", () => {
    const out = itemsToDefaultColumns([{ id: "a", field: "미지칸", operator: "equals", value: "z" }], typeOfFrom({}));
    expect(out).toEqual([{ field: "미지칸", operator: "contains" }]);
  });
});

describe("reconcileItemsWithDefaultColumns", () => {
  const TY = typeOfFrom({ 영업담당: "person", 계약일: "date", 메모: "text", 옛기본: "text", DB분류: "multi_select" });

  it("세션 없으면 기본 칸을 '빈 값' pinned 로 시드(operator 는 종류별 seed 로 재계산)", () => {
    const defs: FilterCondition[] = [{ field: "DB분류", operator: "in" }, { field: "계약일", operator: "date_between" }];
    const out = reconcileItemsWithDefaultColumns(null, defs, TY);
    expect(out.map((i) => [i.field, i.operator, i.value, i.pinned])).toEqual([
      ["DB분류", "in", undefined, true],
      ["계약일", "date_between", undefined, true],
    ]);
  });

  it("세션의 개인 값(pinned)은 유지, 관리자가 뺀 칸은 제거, 사용자 칩은 유지, 신규 기본 칸은 빈 값", () => {
    const saved: FilterItem[] = [
      { id: "p1", field: "영업담당", operator: "equals", value: "김철수", pinned: true }, // 개인 조건·값 유지
      { id: "p2", field: "옛기본", operator: "contains", value: "x", pinned: true },       // 관리자가 뺌 → 제거
      { id: "u1", field: "메모", operator: "contains", value: "abc" },                     // 사용자 칩 유지
    ];
    const defs: FilterCondition[] = [{ field: "영업담당", operator: "in" }, { field: "계약일", operator: "date_between" }];
    const out = reconcileItemsWithDefaultColumns(saved, defs, TY);
    expect(out.map((i) => i.field)).toEqual(["영업담당", "메모", "계약일"]);
    expect(out[0].value).toBe("김철수");        // 개인 조건·값 보존(연산자도 그대로 equals)
    expect(out[0].operator).toBe("equals");
    expect(out[0].pinned).toBe(true);
    expect(out[1].pinned).toBeFalsy();          // 사용자 칩
    expect(out[2].value).toBeUndefined();       // 신규 기본 칸 = 빈 값
    expect(out[2].operator).toBe("date_between");
    expect(out[2].pinned).toBe(true);
  });

  it("defaults 비면(해제) 기본 칸 모두 제거, 사용자 칩만 남음", () => {
    const saved: FilterItem[] = [
      { id: "p1", field: "영업담당", operator: "in", value: ["김"], pinned: true },
      { id: "u1", field: "메모", operator: "contains", value: "a" },
    ];
    const out = reconcileItemsWithDefaultColumns(saved, [], TY);
    expect(out.map((i) => i.field)).toEqual(["메모"]);
  });

  it("복원된 세션에 중복 id 가 있어도 결과 id 는 모두 고유", () => {
    const saved: FilterItem[] = [
      { id: "f1", field: "메모", operator: "contains", value: "김" },
      { id: "f1", field: "DB분류", operator: "in", value: ["x"] },
    ];
    const out = reconcileItemsWithDefaultColumns(saved, [], TY);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((i) => i.id)).size).toBe(2);
  });
});

describe("resetItemValues", () => {
  it("모든 칩(칸·조건) 유지, 고른 값만 비움", () => {
    const items: FilterItem[] = [
      { id: "a", field: "DB분류", operator: "in", value: ["경정청구"], pinned: true },
      { id: "b", field: "메모", operator: "contains", value: "abc" },
    ];
    expect(resetItemValues(items)).toEqual([
      { id: "a", field: "DB분류", operator: "in", value: undefined, pinned: true },
      { id: "b", field: "메모", operator: "contains", value: undefined },
    ]);
  });
});

describe("reorderItems", () => {
  const items = [
    { id: "a", field: "상태", operator: "in" as const },
    { id: "b", field: "상호명", operator: "contains" as const },
    { id: "c", field: "계약일", operator: "date_today" as const },
  ];
  it("from을 to로 이동", () => {
    expect(reorderItems(items, 0, 2).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(reorderItems(items, 2, 0).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
  it("같은 위치·경계 밖은 원본 반환", () => {
    expect(reorderItems(items, 1, 1)).toBe(items);
    expect(reorderItems(items, -1, 0)).toBe(items);
    expect(reorderItems(items, 0, 9)).toBe(items);
  });
  it("원본 배열 불변", () => {
    const copy = items.slice();
    reorderItems(items, 0, 2);
    expect(items).toEqual(copy);
  });
});

describe("genItemId", () => {
  it("연속 호출 시 서로 다른 id (같은 id면 필터가 서로를 같은 필터로 오인)", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) ids.add(genItemId());
    expect(ids.size).toBe(500);
  });
});

describe("itemsToConditions", () => {
  it("표시 항목 → 조건 배열", () => {
    const out = itemsToConditions([{ id: "1", field: "상태", operator: "in", value: ["가망"], pinned: true }]);
    expect(out).toEqual([{ field: "상태", operator: "in", value: ["가망"] }]);
  });
});
