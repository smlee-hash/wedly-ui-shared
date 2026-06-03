import { describe, it, expect } from "vitest";
import {
  classifyUnifiedFieldValue,
  parseFiles,
  type FieldDisplayOptions,
} from "./field-display-core";

describe("classifyUnifiedFieldValue — 하이브 읽기 분기 동일", () => {
  it("빈 값(읽기전용) → '-'", () => {
    const d = classifyUnifiedFieldValue({ key: "a", label: "x" }, "");
    expect(d.kind).toBe("empty");
    expect(d.text).toBe("-");
  });

  it("빈 값(편집가능) → '비어 있음'", () => {
    const d = classifyUnifiedFieldValue({ key: "a", label: "x" }, null, { isReadonly: false });
    expect(d.kind).toBe("empty");
    expect(d.text).toBe("비어 있음");
  });

  it("date → YYYY.MM.DD (하이브 동일)", () => {
    const d = classifyUnifiedFieldValue({ key: "d", label: "날짜", type: "date" }, "2026-05-20");
    expect(d.kind).toBe("date");
    expect(d.text).toBe("2026.05.20");
  });

  it("currency → 천단위 콤마, '원' 없음", () => {
    const d = classifyUnifiedFieldValue(
      { key: "c", label: "금액", type: "number", format: "currency" },
      1234567,
    );
    expect(d.kind).toBe("currency");
    expect(d.text).toBe("1,234,567");
    expect(d.text).not.toContain("원");
  });

  it("select → kind=select, 원문 텍스트", () => {
    const d = classifyUnifiedFieldValue({ key: "s", label: "상태", type: "select" }, "완료");
    expect(d.kind).toBe("select");
    expect(d.text).toBe("완료");
  });

  it("last_edited_time → datetime 포맷(YYYY.MM.DD HH:MM)", () => {
    const d = classifyUnifiedFieldValue(
      { key: "t", label: "등록일시", type: "last_edited_time" },
      "2026-05-20T07:08:00Z",
    );
    expect(d.kind).toBe("datetime");
    expect(d.text).toMatch(/^2026\.05\.20 \d{2}:\d{2}$/);
  });

  it("ISO 문자열(일반 text 컬럼) → datetime 으로 통일", () => {
    const d = classifyUnifiedFieldValue({ key: "x", label: "등록일자" }, "2026-05-20T01:15:14.034Z");
    expect(d.kind).toBe("datetime");
    expect(d.text).toMatch(/^2026\.05\.20 \d{2}:\d{2}$/);
  });

  it("multi_select 은 별도 배지 없이 기본 텍스트(하이브 동일)", () => {
    const d = classifyUnifiedFieldValue({ key: "m", label: "DB분류", type: "multi_select" }, "벤처,연구소");
    expect(d.kind).toBe("text");
    expect(d.text).toBe("벤처,연구소");
  });

  it("팀장 라벨 → person-chip(isLeader=true), 이름 분해", () => {
    const d = classifyUnifiedFieldValue({ key: "p", label: "팀장", type: "person" }, "홍길동, 김철수");
    expect(d.kind).toBe("person-chip");
    expect(d.isLeader).toBe(true);
    expect(d.names).toEqual(["홍길동", "김철수"]);
  });

  it("팀원 라벨 → person-chip(isLeader=false)", () => {
    const d = classifyUnifiedFieldValue({ key: "p", label: "담당 팀원", type: "person" }, "이영희");
    expect(d.kind).toBe("person-chip");
    expect(d.isLeader).toBe(false);
    expect(d.names).toEqual(["이영희"]);
  });

  it("resolvePersonName 적용", () => {
    const opts: FieldDisplayOptions = { resolvePersonName: (raw) => (raw === "u1" ? "홍길동" : raw) };
    const d = classifyUnifiedFieldValue({ key: "p", label: "팀장" }, "u1", opts);
    expect(d.names).toEqual(["홍길동"]);
  });

  it("file 타입(값 있음) → file 디스크립터", () => {
    const d = classifyUnifiedFieldValue(
      { key: "f", label: "리포트", type: "file" },
      '[{"fileName":"a.pdf","url":"http://x/a"}]',
    );
    expect(d.kind).toBe("file");
    expect(d.files).toEqual([{ fileName: "a.pdf", url: "http://x/a" }]);
  });

  it("file 타입(빈 값) → empty", () => {
    const d = classifyUnifiedFieldValue({ key: "f", label: "리포트", type: "file" }, "");
    expect(d.kind).toBe("empty");
    expect(d.text).toBe("-");
  });

  it("기본 텍스트 — 일반 문자열", () => {
    const d = classifyUnifiedFieldValue({ key: "n", label: "대표자명", type: "text" }, "홍길동");
    expect(d.kind).toBe("text");
    expect(d.text).toBe("홍길동");
  });
});

describe("parseFiles", () => {
  it("JSON 배열 문자열 파싱", () => {
    expect(parseFiles('[{"fileName":"a.pdf","url":"http://x/a"}]')).toEqual([
      { fileName: "a.pdf", url: "http://x/a" },
    ]);
  });

  it("객체 배열 그대로", () => {
    expect(parseFiles([{ name: "b.png", fileUrl: "http://x/b" }])).toEqual([
      { name: "b.png", fileUrl: "http://x/b" },
    ]);
  });

  it("쉼표 구분 문자열 → fileName 들", () => {
    expect(parseFiles("a.pdf, b.png").map((f) => f.fileName)).toEqual(["a.pdf", "b.png"]);
  });

  it("빈 값 → []", () => {
    expect(parseFiles("")).toEqual([]);
    expect(parseFiles(null)).toEqual([]);
    expect(parseFiles(undefined)).toEqual([]);
  });
});
