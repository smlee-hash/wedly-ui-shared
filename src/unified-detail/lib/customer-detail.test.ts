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
  it("row 에 키가 있으면 그대로 반환(ERP·하이브 경정청구 줄 — 회귀 없음)", () => {
    const row = { "03대표자명": "정민교" };
    const detail = makeDetail([{ domain: "tax-amendment", row: { "03대표자명": "다른값" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("정민교");
  });

  it("row 에 키가 없으면(undefined) 경정청구 행에서 폴백(일루아 정부지원금 줄 — 핵심 수정)", () => {
    const row = { "01업체명": "쿠앤코" }; // 정부지원금 줄: 대표자명 칸 없음
    const detail = makeDetail([
      { domain: "policy-fund", row: { "01업체명": "쿠앤코" } },
      { domain: "tax-amendment", row: { "03대표자명": "정민교", "52사업장주소지": "안양시" } },
    ]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("정민교");
    expect(resolveBasicFieldValue(row, detail, "52사업장주소지")).toBe("안양시");
  });

  it("경정청구 행이 없으면 다른 행에서 폴백", () => {
    const row = {};
    const detail = makeDetail([{ domain: "labor-subsidy", row: { "환급금여부": "X" } }]);
    expect(resolveBasicFieldValue(row, detail, "환급금여부")).toBe("X");
  });

  it("경정청구 행 우선(여러 행에 같은 키가 있어도)", () => {
    const row = {};
    const detail = makeDetail([
      { domain: "labor-subsidy", row: { "14사업자유형": "법인" } },
      { domain: "tax-amendment", row: { "14사업자유형": "개인" } },
    ]);
    expect(resolveBasicFieldValue(row, detail, "14사업자유형")).toBe("개인");
  });

  it("키가 빈 문자열이면 폴백 안 함(사용자가 비운 값 되살리기 방지)", () => {
    const row = { "03대표자명": "" };
    const detail = makeDetail([{ domain: "tax-amendment", row: { "03대표자명": "정민교" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBe("");
  });

  it("어디에도 없으면 null", () => {
    const row = { "01업체명": "쿠앤코" };
    const detail = makeDetail([{ domain: "policy-fund", row: { "01업체명": "쿠앤코" } }]);
    expect(resolveBasicFieldValue(row, detail, "03대표자명")).toBeNull();
  });

  it("detail 이 null 이면 row 값(또는 null) 반환", () => {
    expect(resolveBasicFieldValue({ "03대표자명": "정민교" }, null, "03대표자명")).toBe("정민교");
    expect(resolveBasicFieldValue({}, null, "03대표자명")).toBeNull();
  });
});
