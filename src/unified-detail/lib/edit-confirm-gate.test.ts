import { describe, it, expect } from "vitest";
import { isBlankFieldValue, shouldConfirmFieldEdit } from "./edit-confirm-gate";

describe("isBlankFieldValue", () => {
  it("null·undefined·빈 문자열·공백만 있는 문자열을 빈 값으로 본다", () => {
    expect(isBlankFieldValue(null)).toBe(true);
    expect(isBlankFieldValue(undefined)).toBe(true);
    expect(isBlankFieldValue("")).toBe(true);
    expect(isBlankFieldValue("   ")).toBe(true);
    expect(isBlankFieldValue("\t\n ")).toBe(true);
  });
  it("0·false 는 실제 값이므로 빈 값이 아니다", () => {
    expect(isBlankFieldValue(0)).toBe(false);
    expect(isBlankFieldValue(false)).toBe(false);
  });
  it("실제 글자가 있으면 빈 값이 아니다", () => {
    expect(isBlankFieldValue("홍길동")).toBe(false);
    expect(isBlankFieldValue(" 홍길동 ")).toBe(false);
  });
});

describe("shouldConfirmFieldEdit — 저장 전 '수정 확인' 팝업을 띄울지", () => {
  // NO.44 핵심: 기존 행 상세창에서 비어 있던 칸에 처음 값을 넣을 때는 팝업이 뜨면 안 된다.
  it("기존 행 + 빈 칸(빈 문자열)에 첫 입력 → 팝업 안 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "", newVal: "홍길동QA", type: "text", isNew: false }),
    ).toBe(false);
  });
  it("기존 행 + 빈 칸(null)에 첫 입력 → 팝업 안 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: null, newVal: "010-1234-5678", type: "phone_number", isNew: false }),
    ).toBe(false);
  });
  it("기존 행 + 공백만 있던 칸에 첫 입력 → 팝업 안 띄움(공백=빈칸)", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "   ", newVal: "값", type: "text", isNew: false }),
    ).toBe(false);
  });

  // 값이 있던 칸을 고칠 때만 팝업.
  it("기존 행 + 값이 있던 칸을 다른 값으로 수정 → 팝업 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "홍길동", newVal: "김철수", type: "text", isNew: false }),
    ).toBe(true);
  });
  it("기존 행 + 값이 있던 칸을 같은 값으로 저장(안 바뀜) → 팝업 안 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "홍길동", newVal: "홍길동", type: "text", isNew: false }),
    ).toBe(false);
  });
  it("숫자 0 은 실제 값 — 0을 다른 값으로 바꾸면 팝업 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: 0, newVal: 5, type: "number", isNew: false }),
    ).toBe(true);
  });

  // 신규 등록 폼은 칸마다 팝업을 띄우지 않는다.
  it("신규 등록 폼(isNew) → 값이 바뀌어도 팝업 안 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "홍길동", newVal: "김철수", type: "text", isNew: true }),
    ).toBe(false);
  });

  // 태그 여러 개 고르는 칸은 토글마다 저장돼 매번 묻기 불편 → 제외.
  it("multi_select 는 값이 바뀌어도 팝업 안 띄움", () => {
    expect(
      shouldConfirmFieldEdit({ oldVal: "A", newVal: "A, B", type: "multi_select", isNew: false }),
    ).toBe(false);
  });
});
