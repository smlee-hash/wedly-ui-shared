import { describe, it, expect } from "vitest";
import { cellChips } from "./collab-cell";
import type { ColumnDef } from "../types/columns";

// 테스트용 컬럼 만들기 헬퍼
function col(type: ColumnDef["type"], extra: Partial<ColumnDef> = {}): ColumnDef {
  return { key: "k", label: "L", type, defaultVisible: true, ...extra };
}

const STATUS = { 인용완료: "bg-wedly-bg-purple text-wedly-purple", 계약완료: "bg-wedly-bg-green text-wedly-green" };
const BADGE = { 개인사업자: "bg-wedly-bg-blue text-wedly-accent", 있음: "bg-wedly-bg-green text-wedly-green" };

describe("cellChips — 하이브 표 셀과 동일한 표시 판정", () => {
  it("빈 값은 하이브와 동일하게 '-'", () => {
    expect(cellChips(col("select"), null, { statusColors: STATUS })).toEqual({ kind: "text", text: "-" });
    expect(cellChips(col("select"), "", { statusColors: STATUS })).toEqual({ kind: "text", text: "-" });
    expect(cellChips(col("text"), null)).toEqual({ kind: "text", text: "-" });
  });

  it("select + 매핑된 상태값 → 매핑 색 딱지 1개", () => {
    const r = cellChips(col("select"), "인용완료", { statusColors: STATUS });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") {
      expect(r.chips).toHaveLength(1);
      expect(r.chips[0].label).toBe("인용완료");
      expect(r.chips[0].className).toBe("bg-wedly-bg-purple text-wedly-purple");
    }
  });

  it("status 종류도 딱지로 그린다", () => {
    const r = cellChips(col("status"), "계약완료", { statusColors: STATUS });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") expect(r.chips[0].className).toContain("text-wedly-green");
  });

  it("select + 미매핑 값 → 회색 fallback 딱지", () => {
    const r = cellChips(col("select"), "셀프조회", { statusColors: STATUS });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") expect(r.chips[0].className).toBe("bg-wedly-bg-gray text-wedly-t1");
  });

  it("badgeColors 도 색칠에 쓰인다(환급금여부 '있음'=초록 등)", () => {
    const r = cellChips(col("select"), "있음", { statusColors: STATUS, badgeColors: BADGE });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") expect(r.chips[0].className).toBe("bg-wedly-bg-green text-wedly-green");
  });

  it("multi_select 은 콤마로 쪼개 딱지 여러 개", () => {
    const r = cellChips(col("multi_select"), "인용완료, 계약완료", { statusColors: STATUS });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") {
      expect(r.chips.map((c) => c.label)).toEqual(["인용완료", "계약완료"]);
      expect(r.chips[0].className).toContain("text-wedly-purple");
      expect(r.chips[1].className).toContain("text-wedly-green");
    }
  });

  it("multi_select 빈 조각(콤마만)은 걸러져 '-'", () => {
    expect(cellChips(col("multi_select"), " , ", { statusColors: STATUS })).toEqual({ kind: "text", text: "-" });
  });

  it("통화(currency)·formula 숫자는 통화 형식(kind=currency)", () => {
    const money = cellChips(col("number", { format: "currency" }), 1234567, {});
    expect(money.kind).toBe("currency");
    if (money.kind === "currency") expect(money.text).toMatch(/1[,.]?2/);
    const f = cellChips(col("formula"), 5000, {});
    expect(f.kind).toBe("currency");
  });

  it("날짜는 글자(형식 적용), 일반 텍스트·전화는 그대로", () => {
    const d = cellChips(col("date"), "2026-06-02", {});
    expect(d.kind).toBe("text");
    expect(cellChips(col("text"), "메모", {})).toEqual({ kind: "text", text: "메모" });
    expect(cellChips(col("phone_number"), "010-1234-5678", {})).toEqual({ kind: "text", text: "010-1234-5678" });
  });

  it("checkbox 는 ✓ / - , person 은 이메일 떼고 이름만", () => {
    expect(cellChips(col("checkbox"), true, {})).toEqual({ kind: "text", text: "✓" });
    expect(cellChips(col("checkbox"), false, {})).toEqual({ kind: "text", text: "-" });
    expect(cellChips(col("person"), "김혜나 <hn@wedly.kr>", {})).toEqual({ kind: "text", text: "김혜나" });
  });
});

const fileCol = { key: "정부지원금리포트", label: "정부지원금 리포트", type: "file" } as ColumnDef;

describe("cellChips file", () => {
  it("빈 값은 '-' 텍스트", () => {
    expect(cellChips(fileCol, "")).toEqual({ kind: "text", text: "-" });
    expect(cellChips(fileCol, null)).toEqual({ kind: "text", text: "-" });
  });
  it("JSON 배열 문자열을 파일 목록으로 파싱", () => {
    const v = JSON.stringify([{ name: "리포트.pdf", url: "https://x/api/upload/1" }]);
    expect(cellChips(fileCol, v)).toEqual({
      kind: "files",
      files: [{ name: "리포트.pdf", url: "https://x/api/upload/1" }],
    });
  });
  it("깨진 JSON은 '-' 텍스트(throw 금지)", () => {
    expect(cellChips(fileCol, "not-json")).toEqual({ kind: "text", text: "-" });
  });
  it("기존 select 동작은 불변(회귀)", () => {
    const sel = { key: "s", label: "s", type: "select" } as ColumnDef;
    const r = cellChips(sel, "있음", { badgeColors: { "있음": "c" } });
    expect(r.kind).toBe("chips");
  });
});
