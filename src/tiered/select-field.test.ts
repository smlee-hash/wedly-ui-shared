import { describe, it, expect } from "vitest";
import { makeEmptyTier, parseTiers, isNumericFieldType, type FieldDef } from "./index";

const fields: FieldDef[] = [
  { key: "status", label: "진행상태", type: "select", options: ["대기", "진행", "완료"] },
  { key: "amount", label: "금액", type: "number" },
];

describe("select 차수 칸", () => {
  it("makeEmptyTier: select 칸은 빈 문자열로 시작(숫자처럼 null 아님)", () => {
    const t = makeEmptyTier(0, fields);
    expect(t.status).toBe("");
    expect(t.amount).toBeNull();
  });
  it("parseTiers: 저장된 select 문자값을 그대로 보존", () => {
    const raw = JSON.stringify([{ id: "t1", label: "1차", status: "진행", amount: 100 }]);
    const [t] = parseTiers(raw, fields);
    expect(t.status).toBe("진행");
    expect(t.amount).toBe(100);
  });
  it("parseTiers: select 칸의 비문자(숫자 등) 값은 빈 문자열로 정리", () => {
    const raw = JSON.stringify([{ id: "t1", label: "1차", status: 123 }]);
    const [t] = parseTiers(raw, fields);
    expect(t.status).toBe("");
  });
  it("isNumericFieldType: select 은 숫자형 아님(수식 참조 불가)", () => {
    expect(isNumericFieldType("select")).toBe(false);
  });
});
