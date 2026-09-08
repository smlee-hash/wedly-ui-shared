import { describe, expect, it } from "vitest";
import { evalFormulaForTier, getManagedTierValue, parseTiers, type FieldDef } from "./index";

const fields: FieldDef[] = [
  { key: "amount", label: "금액", type: "number" },
  { key: "fee", label: "수수료", type: "formula", formula: [{ op: "+", unit: "column", columnKey: "amount" }, { op: "*", unit: "percent", value: 50 }] },
  { key: "total", label: "합계", type: "formula", formula: [{ op: "+", unit: "column", columnKey: "fee" }, { op: "+", unit: "number", value: 10 }] },
];
describe("ERP에서 반영한 결과의 공통 읽기", () => {
  it("임의 메타의 예약 키와 숫자가 아닌 필드는 파싱 중 덮어쓰지 않는다", () => {
    const [parsed] = parseTiers(JSON.stringify([{ id: "tier-1", label: "1차", memo: "확인", _cf_id: "r", _cf_label: "r", _cf___proto__: "r", _cf_memo: "r" }]), [{ key: "memo", label: "메모", type: "text" }]);
    expect(parsed.id).toBe("tier-1"); expect(parsed.label).toBe("1차"); expect(parsed.memo).toBe("확인");
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype); expect(parsed._cf_memo).toBeUndefined();
  });
  it("공백·객체는 승인된 0원으로 변환하지 않으며 정의가 있을 때 숫자 문자열을 보존한다", () => {
    expect(getManagedTierValue({ id: "t", label: "t", fee: " ", _cf_fee: "r" }, "fee")).toBeNull();
    const [parsed] = parseTiers(JSON.stringify([{ id: "t", label: "t", fee: "37", _cf_fee: "r" }]), fields);
    expect(parsed.fee).toBe(37); expect(evalFormulaForTier(fields[1], parsed, fields)).toBe(37);
  });
  it("표시와 다른 수식의 참조가 같은 반영값을 사용한다", () => {
    const tier = { id: "t", label: "계약", amount: 100, fee: 37, _cf_fee: "revision-1" };
    expect(evalFormulaForTier(fields[1], tier, fields)).toBe(37);
    expect(evalFormulaForTier(fields[2], tier, fields)).toBe(47);
  });
  it("관리 밖 기존 수식과 수동 0원의 우선순위를 보존한다", () => {
    const tier = { id: "t", label: "계약", amount: 100, fee: 37 };
    expect(evalFormulaForTier(fields[1], tier, fields)).toBe(50);
    expect(evalFormulaForTier(fields[1], { ...tier, _cf_fee: "r", _ovr_fee: 0 }, fields)).toBe(0);
  });
  it("필드 정의가 오기 전 파싱과 저장에서도 반영 버전·0원이 사라지지 않는다", () => {
    const tier = { id: "t", label: "계약", amount: 100, fee: 0, _cf_fee: "r" };
    const parsed = parseTiers(JSON.stringify([tier]), []);
    expect(parsed[0]._cf_fee).toBe("r");
    expect(parsed[0].fee).toBe(0);
    expect(evalFormulaForTier(fields[1], parsed[0], fields)).toBe(0);
  });
  it("파트너 응답에서 지워진 금액은 예전 식으로 다시 계산하지 않는다", () => {
    expect(evalFormulaForTier(fields[1], { id: "t", label: "계약", amount: 100, _cf_fee: "r" }, fields)).toBeNull();
  });
});
