import { describe, it, expect } from "vitest";
import { isCsvFile, decodeCsvText } from "./csv-encoding";

describe("isCsvFile", () => {
  it("확장자가 .csv면 true (대소문자 무관)", () => {
    expect(isCsvFile("data.csv")).toBe(true);
    expect(isCsvFile("DATA.CSV")).toBe(true);
  });
  it("MIME이 text/csv면 true", () => {
    expect(isCsvFile("", "text/csv")).toBe(true);
    expect(isCsvFile("noext", "application/csv")).toBe(true);
  });
  it("엑셀 파일은 false", () => {
    expect(isCsvFile("data.xlsx")).toBe(false);
    expect(isCsvFile("data.xls", "application/vnd.ms-excel")).toBe(false);
  });
});

describe("decodeCsvText", () => {
  it("UTF-8(BOM 없음) 한글을 그대로 복원", () => {
    const bytes = new TextEncoder().encode("상호명,연락처");
    expect(decodeCsvText(bytes)).toBe("상호명,연락처");
  });
  it("UTF-8 BOM을 제거하고 복원", () => {
    const body = new TextEncoder().encode("상호명");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    expect(decodeCsvText(withBom)).toBe("상호명");
  });
  it("CP949/EUC-KR 한글을 복원 (엑셀 CSV 저장 기본)", () => {
    // '한글'의 EUC-KR 바이트 = C7 D1 B1 DB (실측 확인됨)
    const euckr = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]);
    expect(decodeCsvText(euckr)).toBe("한글");
  });
});
