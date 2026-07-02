import { describe, it, expect } from "vitest";
import {
  filterCategory, defaultOperator, seedItemsFromDefaults, resetItems, itemsToConditions, operatorsFor, isValueNeeded,
  reorderItems, reconcileItemsWithDefaults, genItemId,
} from "./filter-items";

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

describe("seedItemsFromDefaults", () => {
  it("기본 필터를 pinned 항목으로(값 유지)", () => {
    const items = seedItemsFromDefaults(
      [{ field: "상태", operator: "in", value: ["가망"] }, { field: "상호명", operator: "contains", value: "김" }],
    );
    expect(items).toHaveLength(2);
    expect(items[0].pinned).toBe(true);
    expect(items[0].field).toBe("상태");
    expect(items[0].value).toEqual(["가망"]);
  });
});

describe("resetItems", () => {
  const defs = [{ field: "상태", operator: "in" as const, value: ["가망"] }];
  it("pinned은 기본값 복원, 사용자 항목은 값만 비움, 모든 항목 유지", () => {
    const items = [
      { id: "1", field: "상태", operator: "in" as const, value: ["계약"], pinned: true },
      { id: "2", field: "상호명", operator: "contains" as const, value: "김" },
    ];
    const out = resetItems(items, defs);
    expect(out).toHaveLength(2); // 둘 다 유지
    expect(out[0].value).toEqual(["가망"]); // pinned → 기본값 복원
    expect(out[0].pinned).toBe(true);
    expect(out[1].value).toBeUndefined();   // 사용자 항목 → 값만 비움
    expect(out[1].field).toBe("상호명");     // 항목 유지
  });
  it("기본필터 없으면 pinned 없음 → 전부 값만 해제(항목 유지)", () => {
    const items = [{ id: "2", field: "상호명", operator: "contains" as const, value: "김" }];
    const out = resetItems(items, []);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBeUndefined();
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

describe("reconcileItemsWithDefaults", () => {
  const defs = [
    { field: "상태", operator: "in" as const, value: ["가망"] },
    { field: "영업담당", operator: "equals" as const, value: "김철수" },
  ];
  it("세션 비었으면 기본필터로 시드(모두 pinned)", () => {
    const out = reconcileItemsWithDefaults(null, defs);
    expect(out).toHaveLength(2);
    expect(out.every((i) => i.pinned)).toBe(true);
    expect(out[0].value).toEqual(["가망"]);
  });
  it("세션에 없던 기본필터는 뒤에 추가(전파)", () => {
    const saved = [{ id: "u1", field: "상호명", operator: "contains" as const, value: "김" }];
    const out = reconcileItemsWithDefaults(saved, defs);
    expect(out.map((i) => i.field)).toEqual(["상호명", "상태", "영업담당"]);
    expect(out[1].pinned).toBe(true);
    expect(out[2].pinned).toBe(true);
  });
  it("세션 pinned의 개인 변경값은 유지", () => {
    const saved = [{ id: "p1", field: "상태", operator: "in" as const, value: ["계약"], pinned: true }];
    const out = reconcileItemsWithDefaults(saved, defs);
    const stateItem = out.find((i) => i.field === "상태");
    expect(stateItem?.value).toEqual(["계약"]); // 기본값 ["가망"]로 덮어쓰지 않음
  });
  it("관리자가 지운 기본필터(pinned)는 제거", () => {
    const saved = [{ id: "p9", field: "삭제된칸", operator: "in" as const, value: ["x"], pinned: true }];
    const out = reconcileItemsWithDefaults(saved, defs);
    expect(out.find((i) => i.field === "삭제된칸")).toBeUndefined();
    expect(out).toHaveLength(2); // defs 2개만
  });
  it("복원된 세션에 중복 id가 있어도 결과 id는 모두 고유 — 한 필터 조작이 다른 필터에 함께 적용되는 버그 방지", () => {
    // 이전(버그) 빌드가 같은 id(f1)로 두 필터를 저장해 둔 상태를 재현.
    const saved = [
      { id: "f1", field: "상호명", operator: "contains" as const, value: "김" },
      { id: "f1", field: "대표자명", operator: "contains" as const, value: "이" },
    ];
    const out = reconcileItemsWithDefaults(saved, []);
    expect(out).toHaveLength(2); // 두 항목 모두 유지
    const ids = out.map((i) => i.id);
    expect(new Set(ids).size).toBe(2); // id는 서로 달라야 함
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
