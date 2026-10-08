import { describe, expect, it } from "vitest";
import { resolveCompanyAddress } from "./company-address";
const bizno = "0000000001";
const row = { "15사업자번호": bizno, "52사업장주소지": "옛 주소" };
const fields = { 사업장주소지: { value: "정본 주소" } };
const store = { key: `secstore:${bizno}:basic`, value: { fields } };
describe("독립 리뷰: 식별자와 사전 형식", () => {
  it.each(["invalid-0000000001", "0000000001bad", "abc0000000001"])("잘못된 식별자 %s를 정상 숫자로 바꾸지 않는다", value => {
    expect(resolveCompanyAddress({ bizno: value, rows: [row] })).toMatchObject({ status: "invalid", value: null });
    expect(resolveCompanyAddress({ bizno, rows: [{ ...row, "04사업자번호": value }] })).toMatchObject({ status: "invalid", value: null });
    expect(resolveCompanyAddress({ bizno, rows: [row], commonStore: { ...store, key: `secstore:${value}:basic` } })).toMatchObject({ status: "invalid", value: null });
  });
  it.each([new Date(0), new Map([["사업장주소지", { value: null }]]), new Set(["사업장주소지"])])("필드 사전이 아닌 객체 %j는 부재로 간주하지 않는다", fields => {
    expect(resolveCompanyAddress({ bizno, rows: [row], commonStore: { ...store, value: { fields } } })).toMatchObject({ status: "invalid", value: null });
  });
  it("실제 숫자·하이픈·공백 표기의 기존 번호 폭은 유지한다", () => {
    expect(resolveCompanyAddress({ bizno: " 000-00-00001 ", rows: [row], commonStore: store })).toMatchObject({ status: "canonical", value: "정본 주소" });
    expect(resolveCompanyAddress({ bizno: 12345678, rows: [{ "사업자번호": "12-345-678", 주소: "정상 주소" }] })).toMatchObject({ status: "unique", value: "정상 주소" });
  });
  it("Object.create(null)의 JSON 사전은 유효하다", () => {
    const fields = Object.assign(Object.create(null), { 사업장주소지: { value: "" } });
    expect(resolveCompanyAddress({ bizno, rows: [row], commonStore: { ...store, value: { fields } } })).toMatchObject({ status: "canonical", value: "" });
  });
});

describe("총괄 정본키 정확대조", () => {
  it.each(["secstore:000-00-00001:basic", "secstore: 0000000001 :basic"])("정규화하지 않은 정본키 %s를 다른 키와 같게 고치지 않는다", key => {
    expect(resolveCompanyAddress({ bizno, rows: [row], commonStore: { ...store, key } })).toMatchObject({ status: "invalid", value: null });
  });
  it("클래스 객체는 공통사전 또는 필드레코드로 쓰지 않는다", () => {
    class CustomFields { 사업장주소지 = { value: "정본" }; }
    class CustomField { value = "정본"; }
    for (const fields of [new CustomFields(), { 사업장주소지: new CustomField() }]) {
      expect(resolveCompanyAddress({ bizno, rows: [row], commonStore: { ...store, value: { fields } } })).toMatchObject({ status: "invalid", value: null });
    }
  });
});
