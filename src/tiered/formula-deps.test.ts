import { describe, it, expect } from "vitest";
import { formulaDependencyKeys, type FieldDef } from "./index";

const F = (p: Partial<FieldDef> & { key: string }): FieldDef =>
  ({ label: p.key, type: "formula", ...p } as FieldDef);

describe("formulaDependencyKeys", () => {
  it("조건부 수식: 규칙 clauses 의 leftKey 를 의존 칸으로 수집", () => {
    const fee = F({
      key: "[컨설턴트]_수수료",
      type: "formula",
      conditional: {
        rules: [
          {
            leftKey: "27주소지",
            clauses: [{ leftKey: "27주소지", right: { kind: "text", value: "서울,경기,인천" }, op: "contains" }],
            formula: [],
          },
        ],
      },
    });
    expect(formulaDependencyKeys(fee, [fee])).toContain("27주소지");
  });

  it("날짜 수식: baseKey 를 의존 칸으로 수집", () => {
    const due = F({
      key: "정산예정일",
      type: "formula",
      formulaResult: "date",
      dateFormula: { mode: "weekday", baseKey: "착수일", weekday: 5, weeksAhead: 1 } as never,
    });
    expect(formulaDependencyKeys(due, [due])).toEqual(["착수일"]);
  });

  it("옛 형식 conditionFieldKey 도 수집", () => {
    const f = F({
      key: "x",
      conditional: { conditionFieldKey: "지역", rules: [{ whenValue: "서울", formula: [] } as never] },
    });
    expect(formulaDependencyKeys(f, [f])).toContain("지역");
  });

  it("field-kind 오른쪽 비교 대상 key 도 수집", () => {
    const f = F({
      key: "x",
      conditional: { rules: [{ clauses: [{ leftKey: "A", right: { kind: "field", key: "B" }, op: "eq" }], formula: [] }] },
    });
    const deps = formulaDependencyKeys(f, [f]);
    expect(deps).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("의존 칸이 다른 수식칸이면 그 칸의 의존까지 재귀(순환 차단)", () => {
    const inner = F({
      key: "INNER",
      conditional: { rules: [{ clauses: [{ leftKey: "주소", right: { kind: "text", value: "x" }, op: "eq" }], formula: [] }] },
    });
    const outer = F({
      key: "OUTER",
      conditional: { rules: [{ clauses: [{ leftKey: "INNER", right: { kind: "text", value: "y" }, op: "eq" }], formula: [] }] },
    });
    const deps = formulaDependencyKeys(outer, [outer, inner]);
    expect(deps).toEqual(expect.arrayContaining(["INNER", "주소"]));
  });

  it("조건/날짜 없는 순수 수식은 평면 의존 없음(빈 배열)", () => {
    const f = F({ key: "합계", type: "formula", formula: [{ op: "+", unit: "column", columnKey: "계약금" }] });
    expect(formulaDependencyKeys(f, [f])).toEqual([]);
  });

  it("자기 자신 재귀 방지 (seen)", () => {
    const self = F({
      key: "SELF",
      conditional: { rules: [{ clauses: [{ leftKey: "SELF", right: { kind: "text", value: "x" }, op: "eq" }], formula: [] }] },
    });
    // 자기 참조라도 무한재귀 없이 SELF 만 반환
    expect(formulaDependencyKeys(self, [self])).toEqual(["SELF"]);
  });
});
