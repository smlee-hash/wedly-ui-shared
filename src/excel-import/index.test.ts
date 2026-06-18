import { describe, it, expect } from "vitest";
import {
  computeHeaderSignature,
  autoMatchMapping,
  validateRequiredMapping,
  applyMapping,
  type TargetField,
} from "./index";

const FIELDS: TargetField[] = [
  { key: "상호명", label: "상호명", required: true },
  { key: "연락처", label: "연락처", required: true, role: "dedupKey" },
  { key: "대표자명", label: "대표자명" },
];

describe("computeHeaderSignature", () => {
  it("순서·공백 달라도 같은 서명", () => {
    expect(computeHeaderSignature([" 업체명", "연락처 ", "대표자명"]))
      .toBe(computeHeaderSignature(["대표자명", "연락처", "업체명"]));
  });
  it("빈 헤더는 무시", () => {
    expect(computeHeaderSignature(["업체명", "", "  "])).toBe(computeHeaderSignature(["업체명"]));
  });
});

describe("autoMatchMapping", () => {
  it("이름이 같으면 자동 짝지음, 없으면 빈값", () => {
    const m = autoMatchMapping(["상호명", "연락처", "메모"], FIELDS);
    expect(m["상호명"]).toBe("상호명");
    expect(m["연락처"]).toBe("연락처");
    expect(m["메모"]).toBe("");
  });
});

describe("validateRequiredMapping", () => {
  it("필수 항목 누락 시 라벨 반환", () => {
    expect(validateRequiredMapping({ "A": "상호명" }, FIELDS)).toEqual(["연락처"]);
    expect(validateRequiredMapping({ "A": "상호명", "B": "연락처" }, FIELDS)).toEqual([]);
  });
});

describe("applyMapping", () => {
  it("매핑된 열만 항목 키로 바꿔 담고, 빈 매핑은 버림", () => {
    const rows = [{ "업체명": "가게", "메모": "x", "연락처": "010" }];
    expect(applyMapping(rows, { "업체명": "상호명", "메모": "", "연락처": "연락처" }))
      .toEqual([{ "상호명": "가게", "연락처": "010" }]);
  });
});
