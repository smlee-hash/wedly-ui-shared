import { describe, it, expect } from "vitest";
import { resolveCommonFieldId } from "./sections";
import { mirrorCommonPair, COMMON_KEY_MIRROR } from "./sections";

describe("환급금여부·DB담당 공통칸 통일", () => {
  it("하이브 맞춤키가 공통 fieldId로 해결된다", () => {
    expect(resolveCommonFieldId("custom_1780316171826", "", null)).toBe("환급금여부");
    expect(resolveCommonFieldId("custom_1779774393414_b1wc", "", null)).toBe("DB 담당");
  });
  it("기존 공용키도 같은 fieldId로 해결된다(잔여 호환)", () => {
    expect(resolveCommonFieldId("환급금여부", "", null)).toBe("환급금여부");
    expect(resolveCommonFieldId("59DB담당", "", null)).toBe("DB 담당");
  });
  it("짝 키 동기 — 한쪽 저장 시 다른쪽도 같은 값", () => {
    const d: Record<string, unknown> = {};
    expect(mirrorCommonPair(d, "custom_1780316171826", "O")).toBe("환급금여부");
    expect(d["환급금여부"]).toBe("O");
    expect(mirrorCommonPair(d, "59DB담당", "위들리")).toBe("custom_1779774393414_b1wc");
    expect(d["custom_1779774393414_b1wc"]).toBe("위들리");
  });
  it("통일 대상이 아닌 키는 짝 동기 없음", () => {
    const d: Record<string, unknown> = {};
    expect(mirrorCommonPair(d, "04연락처", "010")).toBeNull();
    expect(Object.keys(d)).toHaveLength(0);
  });
  it("다중후보 칸(DB분류 등)은 짝 동기 대상 아님(오염 방지)", () => {
    expect(COMMON_KEY_MIRROR["54DB분류"]).toBeUndefined();
    expect(COMMON_KEY_MIRROR["16DB분류"]).toBeUndefined();
  });
});
