import { describe, it, expect } from "vitest";
import { basicRecoveryIdentity } from "./customer-detail";

describe("표와 상세의 고객 식별", () => {
  it("사업자번호가 같으면 연락처 표시 변경은 같은 고객이다", () => {
    expect(basicRecoveryIdentity({ _id: "1", "15사업자번호": "123-45-67890", "04연락처": "0101" })).toBe(basicRecoveryIdentity({ _id: "1", "15사업자번호": "1234567890", "04연락처": "0102" }));
  });
  it("사업자번호가 없으면 연락처 변경을 다른 고객으로 본다", () => {
    expect(basicRecoveryIdentity({ _id: "1", "04연락처": "0101" })).not.toBe(basicRecoveryIdentity({ _id: "1", "04연락처": "0102" }));
  });
  it("일루아 원본 키와 상세 별칭은 같은 고객이다", () => {
    expect(basicRecoveryIdentity({ _id: "1", "04사업자번호": "123-45-67890", "03대표연락처": "0101" }, "government-subsidy")).toBe(basicRecoveryIdentity({ _id: "1", "15사업자번호": "1234567890", "04연락처": "0101" }, "government-subsidy"));
    expect(basicRecoveryIdentity({ _id: "1", "03대표연락처": "010-1234-5678" }, "government-subsidy")).toBe(basicRecoveryIdentity({ _id: "1", "04연락처": "01012345678" }, "government-subsidy"));
  });
  it("식별값이 없으면 행과 분야를 함께 구분한다", () => {
    expect(basicRecoveryIdentity({ _id: "1" }, "government-subsidy")).not.toBe(basicRecoveryIdentity({ _id: "1" }, "tax-amendment"));
    expect(basicRecoveryIdentity({ _id: "1" })).not.toBe(basicRecoveryIdentity({ _id: "2" }));
  });
});
