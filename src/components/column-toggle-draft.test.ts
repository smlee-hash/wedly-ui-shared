import { describe, it, expect } from "vitest";
import {
  initDraft,
  toggleInList,
  moveVisibleInOrder,
  reconcileDraft,
  commitPayload,
} from "./column-toggle-draft";

describe("initDraft", () => {
  it("orderedKeys 순서를 그대로 쓰고, 표시집합은 isVisible 로 계산", () => {
    const d = initDraft(["a", "b", "c"], ["c", "a", "b"], (k) => k !== "b");
    expect(d.order).toEqual(["c", "a", "b"]);
    expect(d.visible).toEqual(["a", "c"]); // allKeys 순서로 표시집합
  });
  it("orderedKeys 에 없는 칸은 allKeys 순서로 뒤에 붙인다", () => {
    const d = initDraft(["a", "b", "c", "d"], ["b", "a"], () => true);
    expect(d.order).toEqual(["b", "a", "c", "d"]);
  });
  it("orderedKeys 에 있지만 allKeys 에 없는 칸(삭제된 칸)은 버린다", () => {
    const d = initDraft(["a", "b"], ["z", "a", "b"], () => true);
    expect(d.order).toEqual(["a", "b"]);
  });
  it("orderedKeys 중복은 첫 등장만 남긴다", () => {
    const d = initDraft(["a", "b"], ["a", "a", "b"], () => true);
    expect(d.order).toEqual(["a", "b"]);
  });
});

describe("toggleInList", () => {
  it("없으면 추가, 있으면 제거", () => {
    expect(toggleInList(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleInList(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("원본 불변", () => {
    const src = ["a", "b"];
    toggleInList(src, "a");
    expect(src).toEqual(["a", "b"]);
  });
});

describe("moveVisibleInOrder — 표시된 이웃끼리만 교환(숨은 칸 슬롯 보존)", () => {
  it("표시된 칸 사이에 숨은 칸이 끼어 있어도 표시 이웃과 교환", () => {
    // order: a(표시) H(숨김) b(표시) c(표시)
    const order = ["a", "H", "b", "c"];
    const visible = ["a", "b", "c"];
    // b 를 위로 → a 와 자리 교환 (H 는 자기 슬롯 유지)
    expect(moveVisibleInOrder(order, visible, "b", -1)).toEqual(["b", "H", "a", "c"]);
  });
  it("아래로 이동", () => {
    const order = ["a", "b", "c"];
    expect(moveVisibleInOrder(order, ["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
  });
  it("맨 위 표시칸을 위로는 변화 없음", () => {
    const order = ["H", "a", "b"];
    expect(moveVisibleInOrder(order, ["a", "b"], "a", -1)).toEqual(["H", "a", "b"]);
  });
  it("맨 아래 표시칸을 아래로는 변화 없음", () => {
    expect(moveVisibleInOrder(["a", "b"], ["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
  it("표시집합에 없는 키는 변화 없음", () => {
    expect(moveVisibleInOrder(["a", "b"], ["a", "b"], "z", 1)).toEqual(["a", "b"]);
  });
  it("원본 불변", () => {
    const order = ["a", "b", "c"];
    moveVisibleInOrder(order, ["a", "b", "c"], "a", 1);
    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("reconcileDraft — 창 열린 중 칸 추가/삭제 반영(진행 중 초안 토글 보존)", () => {
  it("새 칸은 order 뒤에 붙이고 isVisible 로 표시집합에 반영", () => {
    const prev = { order: ["a", "b"], visible: ["a"] };
    const next = reconcileDraft(prev, ["a", "b", "c"], (k) => k === "c");
    expect(next.order).toEqual(["a", "b", "c"]);
    expect(next.visible).toEqual(["a", "c"]);
  });
  it("삭제된 칸은 order·표시집합에서 제거", () => {
    const prev = { order: ["a", "b", "c"], visible: ["a", "c"] };
    const next = reconcileDraft(prev, ["a", "c"], () => true);
    expect(next.order).toEqual(["a", "c"]);
    expect(next.visible).toEqual(["a", "c"]);
  });
  it("기존 칸의 진행 중 초안 토글은 부모값으로 덮지 않는다", () => {
    // 사용자가 초안에서 a 를 껐는데(표시집합에서 뺌), 부모는 아직 a 표시 상태여도 초안 유지
    const prev = { order: ["a", "b"], visible: ["b"] };
    const next = reconcileDraft(prev, ["a", "b"], () => true);
    expect(next.visible).toEqual(["b"]); // a 다시 켜지지 않음
  });
});

describe("commitPayload — 저장 시 넘길 표시목록(순서대로)+전체순서", () => {
  it("visibleKeys 는 order 순서로, order 는 전체(숨은 칸 포함)", () => {
    const draft = { order: ["a", "H", "b"], visible: ["b", "a"] };
    const p = commitPayload(draft);
    expect(p.visibleKeys).toEqual(["a", "b"]); // order 순서
    expect(p.order).toEqual(["a", "H", "b"]);
  });
  it("order 는 새 배열(원본 불변)", () => {
    const draft = { order: ["a", "b"], visible: ["a", "b"] };
    const p = commitPayload(draft);
    expect(p.order).not.toBe(draft.order);
  });
});
