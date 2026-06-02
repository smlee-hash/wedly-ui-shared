import { describe, it, expect } from "vitest";
import { applyTabConfig, EMPTY_TAB_CONFIG, type LabeledItem } from "./tab-config";

const items: LabeledItem[] = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
];

describe("applyTabConfig", () => {
  it("저장 순서대로 정렬하고 나머지는 원래 순서로 뒤에 붙인다", () => {
    const r = applyTabConfig(items, ["c", "a"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["c", "a", "b"]);
  });

  it("저장 순서에 없는(삭제된) 키는 무시한다", () => {
    const r = applyTabConfig(items, ["z", "b"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("중복된 저장 순서는 한 번만 반영한다", () => {
    const r = applyTabConfig(items, ["b", "b", "a"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("라벨을 덮어쓴다(빈 문자열·공백은 무시)", () => {
    const r = applyTabConfig(items, [], { a: "가", b: "  " }, []);
    expect(r.find((x) => x.key === "a")!.label).toBe("가");
    expect(r.find((x) => x.key === "b")!.label).toBe("B");
  });

  it("pinLast 키는 순서를 무시하고 항상 맨 뒤", () => {
    const r = applyTabConfig(items, ["c", "b", "a"], {}, ["c"]);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("pinLast 키도 라벨은 덮어쓸 수 있다", () => {
    const r = applyTabConfig(items, [], { c: "다" }, ["c"]);
    expect(r.find((x) => x.key === "c")!.label).toBe("다");
  });

  it("order·label 모두 비면 원본 순서·이름 그대로(불변 입력 보존)", () => {
    const r = applyTabConfig(items, [], {}, []);
    expect(r.map((x) => x.key)).toEqual(["a", "b", "c"]);
    expect(r.map((x) => x.label)).toEqual(["A", "B", "C"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const copy = items.map((x) => ({ ...x }));
    applyTabConfig(items, ["c", "a"], { a: "가" }, ["b"]);
    expect(items).toEqual(copy);
  });

  it("EMPTY_TAB_CONFIG 는 빈 설정", () => {
    expect(EMPTY_TAB_CONFIG).toEqual({ topOrder: [], topLabels: {}, subOrder: [], subLabels: {} });
  });
});
