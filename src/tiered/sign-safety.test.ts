import { describe, it, expect } from "vitest";
import { checkRefundSignSafety, degreeOfTerms, type SignCheckCtx } from "./sign-safety";
import type { FieldDef, FormulaTerm } from "./index";

const col = (k: string, op: FormulaTerm["op"] = "+"): FormulaTerm => ({ op, unit: "column", columnKey: k });
const pct = (v: number, op: FormulaTerm["op"] = "*"): FormulaTerm => ({ op, unit: "percent", value: v });
const num = (v: number, op: FormulaTerm["op"] = "+"): FormulaTerm => ({ op, unit: "number", value: v });

const F = (p: Partial<FieldDef> & { key: string }): FieldDef => ({ label: p.key, type: "formula", ...p } as FieldDef);

// 운영 실제 구조: 기준금액 = 환불금액, 짝지어진 수수료 3칸
const ctxOf = (fields: FieldDef[], unit: string[]): SignCheckCtx => ({
  unitKeys: new Set(unit),
  byKey: new Map(fields.map((f) => [f.key, f])),
});

describe("degreeOfTerms — 기준금액을 몇 번 썼나", () => {
  const ctx = ctxOf([], ["환불금액"]);
  it("기준금액 × 퍼센트 = 1차", () => {
    expect(degreeOfTerms([col("환불금액"), pct(30)], ctx)).toBe(1);
  });
  it("상수만 = 0차", () => {
    expect(degreeOfTerms([num(1_000_000), pct(30)], ctx)).toBe(0);
  });
  it("기준금액 × 기준금액 = 2차", () => {
    expect(degreeOfTerms([col("환불금액"), col("환불금액", "*")], ctx)).toBe(2);
  });
  it("기준금액 − 상수 = 판정 불가(null)", () => {
    expect(degreeOfTerms([col("환불금액"), num(50_000, "-")], ctx)).toBeNull();
  });
  it("괄호 안을 먼저 센다: (기준 − 짝칸) × 퍼센트 = 1차", () => {
    const terms: FormulaTerm[] = [
      { op: "+", unit: "group", terms: [col("환불금액"), col("환불파트너사수수료", "-")] },
      pct(25),
    ];
    expect(degreeOfTerms(terms, ctxOf([], ["환불금액", "환불파트너사수수료"]))).toBe(1);
  });
  it("수수료 ÷ 기준금액 = 0차(요율)", () => {
    expect(degreeOfTerms([col("환불파트너사수수료"), col("환불금액", "/")], ctxOf([], ["환불금액", "환불파트너사수수료"]))).toBe(0);
  });
});

describe("checkRefundSignSafety — 적용 가부 판정", () => {
  it("운영 실제 수식 3종은 모두 통과", () => {
    const unit = ["환불금액", "환불파트너사수수료", "환불컨설턴트수수료", "[위들리]_환불_수수료"];
    const 컨설턴트 = F({ key: "환불파트너사수수료", formula: [col("환불금액"), pct(30)] });
    const 위들리 = F({
      key: "[위들리]_환불_수수료",
      formula: [{ op: "+", unit: "group", terms: [col("환불금액"), col("환불파트너사수수료", "-")] }, pct(25)],
    });
    const 하이브 = F({
      key: "환불컨설턴트수수료",
      formula: [col("환불금액"), col("환불파트너사수수료", "-"), col("[위들리]_환불_수수료", "-")],
    });
    const ctx = ctxOf([컨설턴트, 위들리, 하이브], unit);
    expect(checkRefundSignSafety(컨설턴트, ctx).ok).toBe(true);
    expect(checkRefundSignSafety(위들리, ctx).ok).toBe(true);
    expect(checkRefundSignSafety(하이브, ctx).ok).toBe(true);
  });

  it("더해지는 상수항은 차단", () => {
    const f = F({ key: "x", formula: [col("환불금액"), num(50_000, "-")] });
    const v = checkRefundSignSafety(f, ctxOf([f], ["환불금액"]));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("상수");
  });

  it("기준금액이 없는 식(상수만)은 차단", () => {
    const f = F({ key: "x", formula: [num(1_000_000), pct(30)] });
    expect(checkRefundSignSafety(f, ctxOf([f], ["환불금액"])).ok).toBe(false);
  });

  it("기준금액을 두 번 곱한 식은 차단", () => {
    const f = F({ key: "x", formula: [col("환불금액"), col("환불금액", "*")] });
    expect(checkRefundSignSafety(f, ctxOf([f], ["환불금액"])).ok).toBe(false);
  });

  it("조건별 식마다 차수가 다르면 차단", () => {
    const f = F({
      key: "x",
      formula: [col("환불금액"), pct(30)],
      conditional: {
        rules: [{ leftKey: "52사업장주소지", right: { kind: "text", value: "서울" }, op: "eq", formula: [num(500_000)] }],
      },
    });
    expect(checkRefundSignSafety(f, ctxOf([f], ["환불금액"])).ok).toBe(false);
  });

  it("평면 글자칸(52사업장주소지) 조건은 통과", () => {
    const f = F({
      key: "x",
      formula: [col("환불금액"), pct(30)],
      conditional: {
        rules: [{ leftKey: "52사업장주소지", right: { kind: "text", value: "서울" }, op: "contains", formula: [col("환불금액"), pct(20)] }],
      },
    });
    expect(checkRefundSignSafety(f, ctxOf([f], ["환불금액"])).ok).toBe(true);
  });

  it("조건 기준칸이 짝지어진 자동계산 칸이면 차단", () => {
    const 짝 = F({ key: "환불파트너사수수료", formula: [col("환불금액"), pct(30)] });
    const f = F({
      key: "x",
      formula: [col("환불금액"), pct(30)],
      conditional: {
        rules: [{ leftKey: "환불파트너사수수료", right: { kind: "text", value: "0" }, op: "eq", formula: [col("환불금액"), pct(10)] }],
      },
    });
    const v = checkRefundSignSafety(f, ctxOf([짝, f], ["환불금액", "환불파트너사수수료"]));
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("조건");
  });
});
