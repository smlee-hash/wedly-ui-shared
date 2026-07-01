import { describe, it, expect } from "vitest";
import {
  filterCategory, defaultOperator, seedItemsFromDefaults, resetItems, itemsToConditions, operatorsFor, isValueNeeded,
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
  it("사용자 항목 제거 + pinned 값 비움", () => {
    const items = [
      { id: "1", field: "상태", operator: "in" as const, value: ["가망"], pinned: true },
      { id: "2", field: "상호명", operator: "contains" as const, value: "김" },
    ];
    const out = resetItems(items);
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe("상태");
    expect(out[0].value).toBeUndefined();
  });
});

describe("itemsToConditions", () => {
  it("표시 항목 → 조건 배열", () => {
    const out = itemsToConditions([{ id: "1", field: "상태", operator: "in", value: ["가망"], pinned: true }]);
    expect(out).toEqual([{ field: "상태", operator: "in", value: ["가망"] }]);
  });
});
