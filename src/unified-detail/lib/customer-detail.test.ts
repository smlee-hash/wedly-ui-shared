import { basicRecoveryIdentity } from "./customer-detail";
import { describe, it, expect } from "vitest";
import { resolveBasicFieldValue, type CustomerDetailLite } from "./customer-detail";

function makeDetail(rows: Array<{ domain: string; row: Record<string, unknown> }>): CustomerDetailLite {
  return {
    key: "b:1",
    bizno: "1",
    company: "테스트",
    ceo: "",
    phone: "",
    domainRows: rows.map((r) => ({
      domain: r.domain,
      domainLabel: r.domain,
      entryId: `e-${r.domain}`,
      row: r.row,
    })),
  };
}

describe("resolveBasicFieldValue", () => {
  it("row 에 값이 있으면 그대로 반환(ERP·하이브 경정청구 줄 — 회귀 없음)", () => {
    const row = { "03대표자명": "정민교" };
    const detail = makeDetail([{ domain: "tax-amendment", row: { "03대표자명": "다른값" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("정민교");
  });

  it("row 에 키가 없으면 경정청구 행에서 폴백(일루아 정부지원금 줄 — 핵심 수정)", () => {
    const row = { "01업체명": "쿠앤코" };
    const detail = makeDetail([
      { domain: "policy-fund", row: { "01업체명": "쿠앤코" } },
      { domain: "tax-amendment", row: { "03대표자명": "정민교", "52사업장주소지": "안양시" } },
    ]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("정민교");
    expect(resolveBasicFieldValue(row, detail, "52사업장주소지")).toBe("안양시");
  });

  it("★고른 키가 비표준이어도 후보 키로 경정청구 행에서 폴백(일루아 대표자명·주소 — 키 별칭 케이스)", () => {
    // 일루아는 정부지원금 칸이라 '대표자명' 칸 키가 비표준(예: 26대표자명)으로 골라짐.
    // 그 키는 어디에도 없지만, 후보 키(03대표자명)는 경정청구 행에 있다.
    const row = { "01업체명": "쿠앤코" }; // 비표준 키 26대표자명 자체가 row 에 없음
    const detail = makeDetail([
      { domain: "policy-fund", row: { "01업체명": "쿠앤코" } },
      { domain: "tax-amendment", row: { "03대표자명": "정민교" } },
    ]);
    const candidates = ["03대표자명", "02대표자명", "대표자명"]; // BASIC_FIELD_SPECS.keys
    expect(resolveBasicFieldValue(row, detail, "26대표자명", candidates)).toBe("정민교");
  });

  it("경정청구 행 우선(여러 행에 같은 키가 있어도)", () => {
    const row = {};
    const detail = makeDetail([
      { domain: "labor-subsidy", row: { "14사업자유형": "법인" } },
      { domain: "tax-amendment", row: { "14사업자유형": "개인" } },
    ]);
    expect(resolveBasicFieldValue(row, detail, "14사업자유형")).toBe("개인");
  });

  it("row 의 고른 키가 빈 문자열이면 정규 출처(경정청구)에서 폴백(회사 신원 칸 — 일관 표시)", () => {
    const row = { "03대표자명": "" };
    const detail = makeDetail([{ domain: "tax-amendment", row: { "03대표자명": "정민교" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("정민교");
  });

  it("어디에도 없으면 null", () => {
    const row = { "01업체명": "쿠앤코" };
    const detail = makeDetail([{ domain: "policy-fund", row: { "01업체명": "쿠앤코" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명", ["03대표자명", "대표자명"])).toBeNull();
  });

  it("detail 이 null 이면 row 값(또는 null) 반환", () => {
    expect(resolveBasicFieldValue({ "03대표자명": "정민교" }, null, "03대표자명")).toBe("정민교");
    expect(resolveBasicFieldValue({}, null, "03대표자명")).toBeNull();
  });

  it("row 후보 키에 값이 있으면 detail 보다 우선(현재 줄 우선)", () => {
    const row = { "대표자명": "행값" }; // 고른 키는 없지만 후보 키에 값
    const detail = makeDetail([{ domain: "tax-amendment", row: { "03대표자명": "정민교" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명", ["03대표자명", "대표자명"])).toBe("행값");
  });
});


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
