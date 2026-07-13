import { describe, it, expect } from "vitest";
import {
  computeHeaderSignature,
  autoMatchMapping,
  validateRequiredMapping,
  validateRequiredValues,
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
  it("고정값(비어있지 않은)으로 채운 필수 칸은 충족으로 인정, 빈 고정값은 불충족", () => {
    expect(validateRequiredMapping({ "A": "상호명" }, FIELDS, { "연락처": "010-1" })).toEqual([]);
    expect(validateRequiredMapping({ "A": "상호명" }, FIELDS, { "연락처": "  " })).toEqual(["연락처"]);
    expect(validateRequiredMapping({}, FIELDS, { "상호명": "가게", "연락처": "010" })).toEqual([]);
  });
});

describe("validateRequiredValues", () => {
  const mapping = { "업체명": "상호명", "전화": "연락처", "메모": "" };
  it("필수 칸 값이 빈 줄을 칸별로 집계한다 (엑셀 행 번호 = 제목줄 다음부터)", () => {
    const rows = [
      { "업체명": "가게A", "전화": "010-1", "메모": "x" },
      { "업체명": "", "전화": "010-2", "메모": "" },
      { "업체명": "  ", "전화": "", "메모": "" },
    ];
    expect(validateRequiredValues(rows, mapping, {}, FIELDS)).toEqual([
      { label: "상호명", count: 2, exampleRows: [3, 4] },
      { label: "연락처", count: 1, exampleRows: [4] },
    ]);
  });
  it("모두 채워져 있으면 빈 배열", () => {
    const rows = [{ "업체명": "가게A", "전화": "010-1" }];
    expect(validateRequiredValues(rows, mapping, {}, FIELDS)).toEqual([]);
  });
  it("고정값이 채워진 필수 칸은 빈 열이어도 통과, 빈 고정값은 통과 못 함", () => {
    const rows = [{ "업체명": "", "전화": "010-1" }];
    expect(validateRequiredValues(rows, mapping, { "상호명": "고정상호" }, FIELDS)).toEqual([]);
    expect(validateRequiredValues(rows, mapping, { "상호명": "  " }, FIELDS))
      .toEqual([{ label: "상호명", count: 1, exampleRows: [2] }]);
  });
  it("매핑 자체가 없는 필수 칸은 여기서 다루지 않음(validateRequiredMapping 담당)", () => {
    const rows = [{ "전화": "010-1" }];
    expect(validateRequiredValues(rows, { "전화": "연락처" }, {}, FIELDS)).toEqual([]);
  });
  it("같은 필수 칸에 열 여러 개가 매핑되면 하나라도 값 있으면 통과", () => {
    const rows = [{ "업체명": "", "상호2": "가게B", "전화": "010-1" }];
    const m = { "업체명": "상호명", "상호2": "상호명", "전화": "연락처" };
    expect(validateRequiredValues(rows, m, {}, FIELDS)).toEqual([]);
  });
  it("예시 행 번호는 최대 3개까지만 담는다", () => {
    const rows = [1, 2, 3, 4, 5].map(() => ({ "업체명": "", "전화": "010" }));
    expect(validateRequiredValues(rows, mapping, {}, FIELDS)).toEqual([
      { label: "상호명", count: 5, exampleRows: [2, 3, 4] },
    ]);
  });
});

describe("applyMapping", () => {
  it("매핑된 열만 항목 키로 바꿔 담고, 빈 매핑은 버림", () => {
    const rows = [{ "업체명": "가게", "메모": "x", "연락처": "010" }];
    expect(applyMapping(rows, { "업체명": "상호명", "메모": "", "연락처": "연락처" }))
      .toEqual([{ "상호명": "가게", "연락처": "010" }]);
  });
  it("같은 칸에 두 열이 매핑되면 빈 값이 채워진 값을 덮어쓰지 않는다(값 보존)", () => {
    // 채워진 A열 + 빈 B열이 둘 다 상호명 → A열 값 보존(서버 last-wins가 빈값으로 클로버하던 버그 대칭 수정)
    expect(applyMapping([{ "A": "가게", "B": "" }], { "A": "상호명", "B": "상호명" }))
      .toEqual([{ "상호명": "가게" }]);
    // 순서 반대(빈 B열이 뒤)도 동일하게 보존
    expect(applyMapping([{ "A": "", "B": "가게" }], { "A": "상호명", "B": "상호명" }))
      .toEqual([{ "상호명": "가게" }]);
    // 둘 다 채워지면 뒤 열이 이김(기존 last-wins 유지)
    expect(applyMapping([{ "A": "앞", "B": "뒤" }], { "A": "상호명", "B": "상호명" }))
      .toEqual([{ "상호명": "뒤" }]);
    // 둘 다 비면 빈값 유지(그래야 validateRequiredValues가 빈 줄로 잡음)
    expect(applyMapping([{ "A": "", "B": "" }], { "A": "상호명", "B": "상호명" }))
      .toEqual([{ "상호명": "" }]);
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
