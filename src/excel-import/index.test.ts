import { describe, it, expect } from "vitest";
import {
  computeHeaderSignature,
  autoMatchMapping,
  validateRequiredMapping,
  applyMapping,
  availableFixedFields,
  mappingTargetsExcludingFixed,
  applyFixedValues,
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

const FF: TargetField[] = [
  { key: "상호명", label: "상호명", required: true },
  { key: "연락처", label: "연락처", required: true, role: "dedupKey" },
  { key: "유형", label: "유형", type: "select", options: ["개인", "법인"] },
  { key: "담당자", label: "담당자", type: "person" },
  { key: "조회일시", label: "조회일시", type: "datetime", fixedDisabled: true },
];

describe("availableFixedFields", () => {
  it("매핑된 칸·이미 고정된 칸·fixedDisabled 칸을 제외한다", () => {
    const mapping = { "회사": "상호명" };            // 상호명은 엑셀 열 연결됨
    const fixed = { "유형": "법인" };                 // 유형은 이미 고정됨
    const out = availableFixedFields(FF, mapping, fixed).map((f) => f.key);
    expect(out).toEqual(["연락처", "담당자"]);        // 상호명(매핑)·유형(고정)·조회일시(disabled) 제외
  });
});

describe("mappingTargetsExcludingFixed", () => {
  it("고정값이 지정된 칸을 매핑 후보에서 제외한다", () => {
    const fixed = { "유형": "법인" };
    const out = mappingTargetsExcludingFixed(FF, fixed).map((f) => f.key);
    expect(out).not.toContain("유형");
    expect(out).toContain("상호명");
  });
});

describe("applyFixedValues", () => {
  it("모든 행에 고정값을 넣고, 빈 문자열 고정값은 무시한다", () => {
    const rows = [{ 상호명: "A" }, { 상호명: "B" }];
    const out = applyFixedValues(rows, { 유형: "법인", DB분류: "" });
    expect(out).toEqual([
      { 상호명: "A", 유형: "법인" },
      { 상호명: "B", 유형: "법인" },
    ]);
  });
  it("같은 칸이 이미 있으면 고정값으로 덮어쓴다", () => {
    const out = applyFixedValues([{ 유형: "개인" }], { 유형: "법인" });
    expect(out).toEqual([{ 유형: "법인" }]);
  });
});
