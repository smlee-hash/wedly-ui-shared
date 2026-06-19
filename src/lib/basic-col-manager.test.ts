import { describe, it, expect } from "vitest";
import {
  parseChoices,
  uniqueColKey,
  upsertDef,
  removeDef,
  setDefScope,
  colDefFromOwnColumn,
  buildDefFromForm,
  isChoiceType,
  isAllowedBasicType,
  type BasicColDef,
} from "./basic-col-manager";

describe("parseChoices — 선택지 입력 정리", () => {
  it("줄바꿈·쉼표로 나누고 공백·빈값·중복 제거", () => {
    expect(parseChoices("가, 나\n다,, 나 ")).toEqual(["가", "나", "다"]);
  });
  it("빈 입력은 빈 배열", () => {
    expect(parseChoices("")).toEqual([]);
    expect(parseChoices("  , \n")).toEqual([]);
  });
});

describe("uniqueColKey — 키 충돌 회피", () => {
  it("안 겹치면 그대로", () => {
    expect(uniqueColKey("custom_1", ["a", "b"])).toBe("custom_1");
  });
  it("겹치면 접미사", () => {
    expect(uniqueColKey("custom_1", ["custom_1"])).toBe("custom_1_2");
    expect(uniqueColKey("custom_1", ["custom_1", "custom_1_2"])).toBe("custom_1_3");
  });
});

describe("upsert/remove/setScope — 불변 조작", () => {
  const base: BasicColDef[] = [
    { key: "k1", label: "비고", type: "text", scope: "custom" },
    { key: "k2", label: "등급", type: "select", scope: "common" },
  ];
  it("upsert: 새 키는 추가, 같은 키는 교체 (입력 불변)", () => {
    const added = upsertDef(base, { key: "k3", label: "메모", type: "text", scope: "common" });
    expect(added).toHaveLength(3);
    const replaced = upsertDef(base, { key: "k1", label: "비고2", type: "text", scope: "common" });
    expect(replaced).toHaveLength(2);
    expect(replaced[0].label).toBe("비고2");
    expect(replaced[0].scope).toBe("common");
    expect(base[0].label).toBe("비고"); // 원본 불변
  });
  it("remove: 키 제거 (입력 불변)", () => {
    const r = removeDef(base, "k1");
    expect(r.map((d) => d.key)).toEqual(["k2"]);
    expect(base).toHaveLength(2);
  });
  it("setDefScope: 해당 키 범위만 변경 (입력 불변)", () => {
    const r = setDefScope(base, "k1", "common");
    expect(r[0].scope).toBe("common");
    expect(r[1].scope).toBe("common");
    expect(base[0].scope).toBe("custom");
  });
});

describe("colDefFromOwnColumn — 표 칸 → def", () => {
  it("키·라벨·종류·범위 매핑, 드롭다운은 선택지 포함", () => {
    const d = colDefFromOwnColumn({ key: "25주업종", label: "주업종", type: "select", options: ["제조", "도매", "제조"] }, "common");
    expect(d).toEqual({ key: "25주업종", label: "주업종", type: "select", scope: "common", options: ["제조", "도매"] });
  });
  it("허용 밖 종류는 글자로 폴백, 비드롭다운은 선택지 없음", () => {
    const d = colDefFromOwnColumn({ key: "x", label: "수식칸", type: "formula" }, "custom");
    expect(d.type).toBe("text");
    expect(d.options).toBeUndefined();
  });
});

describe("buildDefFromForm — 폼 입력 → def", () => {
  it("드롭다운이면 선택지 싣고, 라벨 공백 제거", () => {
    const d = buildDefFromForm({ key: "custom_9", label: "  등급 ", type: "select", scope: "common", choicesText: "A,B,B" });
    expect(d).toEqual({ key: "custom_9", label: "등급", type: "select", scope: "common", options: ["A", "B"] });
  });
  it("글자 종류는 선택지 무시", () => {
    const d = buildDefFromForm({ key: "custom_9", label: "비고", type: "text", scope: "custom", choicesText: "무시,됨" });
    expect(d.options).toBeUndefined();
  });
  it("선택지 빈 드롭다운은 options 생략", () => {
    const d = buildDefFromForm({ key: "k", label: "등급", type: "select", scope: "common", choicesText: "" });
    expect(d.options).toBeUndefined();
  });
});

describe("형식 판정 보조", () => {
  it("isChoiceType / isAllowedBasicType", () => {
    expect(isChoiceType("select")).toBe(true);
    expect(isChoiceType("multi_select")).toBe(true);
    expect(isChoiceType("text")).toBe(false);
    expect(isAllowedBasicType("file")).toBe(true);
    expect(isAllowedBasicType("formula")).toBe(false);
  });
});
