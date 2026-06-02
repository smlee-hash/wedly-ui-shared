import { describe, it, expect } from "vitest";
import { cellChips } from "./collab-cell";
import type { ColumnDef } from "../types/columns";

// 테스트용 컬럼 만들기 헬퍼
function col(type: ColumnDef["type"], extra: Partial<ColumnDef> = {}): ColumnDef {
  return { key: "k", label: "L", type, defaultVisible: true, ...extra };
}

const STATUS = { 인용완료: "bg-wedly-bg-purple text-wedly-purple", 계약완료: "bg-wedly-bg-green text-wedly-green" };
const BADGE = { 개인사업자: "bg-wedly-bg-blue text-wedly-accent" };

describe("cellChips — 글자 vs 색깔 딱지 판정", () => {
  it("빈 값은 기본 표시(—) 글자", () => {
    expect(cellChips(col("select"), null, { statusColors: STATUS })).toEqual({ kind: "text", text: "—" });
    expect(cellChips(col("select"), "", { statusColors: STATUS })).toEqual({ kind: "text", text: "—" });
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

  it("badgeColors 도 색칠에 쓰인다(statusColors 에 없을 때)", () => {
    const r = cellChips(col("select"), "개인사업자", { statusColors: STATUS, badgeColors: BADGE });
    expect(r.kind).toBe("chips");
    if (r.kind === "chips") expect(r.chips[0].className).toBe("bg-wedly-bg-blue text-wedly-accent");
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

  it("multi_select 빈 조각(콤마만)은 걸러져 글자 —", () => {
    expect(cellChips(col("multi_select"), " , ", { statusColors: STATUS })).toEqual({ kind: "text", text: "—" });
  });

  it("number/currency, date 등은 색칠 없이 기본 글자", () => {
    const money = cellChips(col("number", { format: "currency" }), 1234567, {});
    expect(money.kind).toBe("text");
    const d = cellChips(col("date"), "2026-06-02", {});
    expect(d.kind).toBe("text");
    const t = cellChips(col("text"), "메모", {});
    expect(t).toEqual({ kind: "text", text: "메모" });
  });
});
