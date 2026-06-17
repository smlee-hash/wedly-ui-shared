import { describe, it, expect } from "vitest";
import { collapseMirrorBasicFields } from "./sections";

// 하이브 NO.46 재작업: 새 업체 등록 폼에서 통일쌍(custom_…_b1wc ↔ 59DB담당) 때문에
// 'DB 분류' 칸이 두 번 보이던 중복을 정식키(59DB담당) 하나로 합치는 순수함수 검증.
describe("collapseMirrorBasicFields — 미러쌍 중복 합치기", () => {
  it("미러쌍(custom_…_b1wc + 59DB담당)이 둘 다 있으면 정식키(59DB담당)만 남기고 순서를 유지한다", () => {
    const fields = [
      { key: "03대표자명", label: "대표자명" },
      { key: "custom_1779774393414_b1wc", label: "DB 분류" },
      { key: "59DB담당", label: "DB 분류" },
      { key: "10총환급금", label: "총환급금" },
    ];
    const out = collapseMirrorBasicFields(fields);
    expect(out.map((f) => f.key)).toEqual(["03대표자명", "59DB담당", "10총환급금"]);
    expect(out.filter((f) => f.label === "DB 분류")).toHaveLength(1);
  });

  it("정식키가 먼저 와도 미러 custom_ 를 제거하고 정식키를 남긴다", () => {
    const fields = [
      { key: "59DB담당", label: "DB 분류" },
      { key: "custom_1779774393414_b1wc", label: "DB 분류" },
    ];
    expect(collapseMirrorBasicFields(fields).map((f) => f.key)).toEqual(["59DB담당"]);
  });

  it("미러쌍이 한쪽만 있으면 그대로 둔다(없는 짝을 만들지 않음)", () => {
    const fields = [
      { key: "custom_1779774393414_b1wc", label: "DB 분류" },
      { key: "환급금여부", label: "환급금여부" },
    ];
    expect(collapseMirrorBasicFields(fields).map((f) => f.key)).toEqual([
      "custom_1779774393414_b1wc",
      "환급금여부",
    ]);
  });

  it("미러쌍이 아닌 칸들은 중복이 없으면 그대로 둔다", () => {
    const fields = [
      { key: "03대표자명", label: "대표자명" },
      { key: "04연락처", label: "연락처" },
      { key: "54DB분류", label: "내부 DB 분류" },
    ];
    expect(collapseMirrorBasicFields(fields)).toEqual(fields);
  });

  it("빈 목록은 빈 목록", () => {
    expect(collapseMirrorBasicFields([])).toEqual([]);
  });
});
