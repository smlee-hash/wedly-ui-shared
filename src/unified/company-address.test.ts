import { describe, expect, it } from "vitest";
import { applyCompanyAddress, COMPANY_ADDRESS_KEYS, resolveCompanyAddress } from "./company-address";
const bizno = "0000000001";
const old = "서울특별시 시험구 옛길 1";
const current = "경기도 시험시 새길 2";
const row = (address: unknown, more = {}) => ({ "15사업자번호": bizno, "52사업장주소지": address, ...more });
const store = (value: unknown) => ({ key: `secstore:${bizno}:basic`, value: { fields: { "사업장주소지": { value } } } });
const resolve = (rows: Record<string, unknown>[], commonStore?: ReturnType<typeof store>) => resolveCompanyAddress({ bizno, rows, commonStore });
describe("회사 공통 주소 정본", () => {
  it("분야 주소가 다르고 비어 있지 않아도 정본을 우선한다", () => {
    expect(resolve([row(old), row("인천광역시 시험길 3")], store(current))).toMatchObject({ status: "canonical", value: current });
  });
  it.each(["", null])("정본의 명시 지움 %s은 과거 주소로 되살리지 않는다", value => {
    expect(resolve([row(old)], store(value))).toMatchObject({ status: "canonical", value: "" });
  });
  it("모든 분야의 한 정규화 후보는 분야 순서와 무관하다", () => {
    const rows = [row(" 서울특별시  시험구 옛길 １ "), { "04사업자번호": bizno, "27주소지": old }, { "사업자번호": bizno, "사업장 주소지": old }];
    expect(resolve(rows)).toMatchObject({ status: "unique", value: old });
    expect(resolve([...rows].reverse())).toEqual(resolve(rows));
  });
  it("한 분야 행 안의 충돌도 임의 우선순위로 고르지 않는다", () => {
    expect(resolve([row(old, { "27주소지": current })])).toMatchObject({ status: "conflict", value: null });
  });
  it("서로 다른 건물명·지역 접미사를 임의로 지우지 않는다", () => {
    expect(resolve([row(old), row(`${old} 시험빌딩`)])).toMatchObject({ status: "conflict", value: null });
  });
  it("정본 없는 다중 주소 후보는 현재행·최신행·세무 우선이 없다", () => {
    expect(resolve([row(old, { _updatedTime: "2020-01-01" }), row(current, { _updatedTime: "2099-01-01" })])).toMatchObject({ status: "conflict", value: null });
  });
  it("다른 회사·번호없는 행·삭제·병합된 주소는 후보로 쓰지 않는다", () => {
    const rows = [row(old), row(current, { "15사업자번호": "0000000002" }), { "52사업장주소지": current }, row(current, { _deletedAt: "2026-10-01" }), row(current, { _mergedInto: "other" })];
    expect(resolve(rows)).toMatchObject({ status: "unique", value: old });
  });
  it("다른 회사 보관함을 주면 현재 회사 주소로 쓰지 않는다", () => {
    expect(resolveCompanyAddress({ bizno, rows: [row(old)], commonStore: { ...store(current), key: "secstore:0000000002:basic" } })).toMatchObject({ status: "invalid", value: null });
  });
  it.each([123, {}, [], true])("정본 값이 잘못된 형식 %j이면 분야 주소로 덮지 않는다", value => {
    expect(resolve([row(old)], store(value))).toMatchObject({ status: "invalid", value: null });
  });
  it("주소 필드가 진짜 없을 때만 단일 후보를 사용한다", () => {
    const commonStore = { key: `secstore:${bizno}:basic`, value: { fields: {} } };
    expect(resolveCompanyAddress({ bizno, rows: [row(old)], commonStore })).toMatchObject({ status: "unique", value: old });
  });
  it("깨진 주소 필드는 부재로 간주하지 않는다", () => {
    const commonStore = { key: `secstore:${bizno}:basic`, value: { fields: { "사업장주소지": {} } } };
    expect(resolveCompanyAddress({ bizno, rows: [row(old)], commonStore })).toMatchObject({ status: "invalid", value: null });
  });
  it("주소가 어디에도 없으면 빈 상태를 반환한다", () => {
    expect(resolve([row("")])).toMatchObject({ status: "missing", value: null });
  });
  it.each(["", "123", "12345678901234"])("잘못된 사업자번호 %s는 전화/빈키로 대신하지 않는다", bizno => {
    expect(resolveCompanyAddress({ bizno, rows: [row(old)] })).toMatchObject({ status: "invalid", value: null });
  });
  it("한 행의 다른 사업자번호 별칭이 충돌하면 주소를 자동선택하지 않는다", () => {
    expect(resolve([row(old, { "04사업자번호": "0000000002" })])).toMatchObject({ status: "invalid", value: null });
  });
  it("정본/충돌/지움 모두 여섯 주소 별칭을 같게 만들고 원본은 보존한다", () => {
    expect(new Set(COMPANY_ADDRESS_KEYS)).toEqual(new Set(["52사업장주소지", "27주소지", "사업장주소지", "사업장 주소지", "주소지", "주소"]));
    const original = { ...row(old), "27주소지": current, unrelated: 7 };
    for (const resolution of [resolve([row(old)], store(current)), resolve([row(old)], store("")), resolve([row(old), row(current)])]) {
      const next = applyCompanyAddress(original, resolution);
      for (const key of COMPANY_ADDRESS_KEYS) expect(next[key]).toBe(resolution.value);
      expect(next.unrelated).toBe(7);
      expect(original["52사업장주소지"]).toBe(old);
    }
  });
});
