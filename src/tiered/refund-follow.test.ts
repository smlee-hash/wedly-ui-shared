import { describe, it, expect } from "vitest";
import { deriveRefundFields, type RefundFollowConfig } from "./refund-follow";
import { evalFormulaForTier, type FieldDef, type TierData, type FormulaTerm } from "./index";

const col = (k: string, op: FormulaTerm["op"] = "+"): FormulaTerm => ({ op, unit: "column", columnKey: k });
const pct = (v: number, op: FormulaTerm["op"] = "*"): FormulaTerm => ({ op, unit: "percent", value: v });

// 운영 실제 계약 카드 (2026-07-22 JsonCache 실측 구조)
const CONTRACT: FieldDef[] = [
  { key: "계약일", label: "계약일", type: "date" },
  { key: "계약금", label: "계약금", type: "number" },
  {
    key: "[컨설턴트]_수수료", label: "[컨설턴트] 계약금 수수료", type: "formula",
    formula: [col("계약금"), pct(30)],
    conditional: {
      rules: [{
        leftKey: "52사업장주소지", right: { kind: "text", value: "서울, 경기, 인천" }, op: "contains",
        formula: [col("계약금"), pct(20)],
      }],
    },
  },
  {
    key: "[위들리]_수수료", label: "[위들리] 계약금 수수료", type: "formula",
    formula: [{ op: "+", unit: "group", terms: [col("계약금"), col("[컨설턴트]_수수료", "-")] }, pct(25)],
  },
  {
    key: "[하이브]_계약금_수수료", label: "[하이브] 계약금 수수료", type: "formula",
    formula: [col("계약금"), col("[컨설턴트]_수수료", "-"), col("[위들리]_수수료", "-")],
    tableExposed: true,
  },
];

const REFUND: FieldDef[] = [
  { key: "환불일", label: "환불일", type: "date" },
  { key: "환불금액", label: "환불 금액", type: "number" },
  { key: "환불파트너사수수료", label: "환불 파트너사 수수료", type: "number" },
  { key: "[위들리]_환불_수수료", label: "[위들리] 환불 수수료", type: "text" },
  { key: "환불컨설턴트수수료", label: "환불 컨설턴트 수수료", type: "number" },
];

const FOLLOW: RefundFollowConfig = {
  enabled: true,
  baseAmount: { contract: "계약금", refund: "환불금액" },
  pairs: [
    { refund: "환불파트너사수수료", contract: "[컨설턴트]_수수료" },
    { refund: "[위들리]_환불_수수료", contract: "[위들리]_수수료" },
    { refund: "환불컨설턴트수수료", contract: "[하이브]_계약금_수수료" },
  ],
};

const byKey = (fs: FieldDef[]) => new Map(fs.map((f) => [f.key, f]));

describe("deriveRefundFields", () => {
  it("꺼져 있으면 원본 그대로", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, { ...FOLLOW, enabled: false });
    expect(r.fields).toBe(REFUND);
    expect(r.warnings).toEqual([]);
  });

  it("칸 이름(key)은 하나도 바뀌지 않는다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    expect(r.fields.map((f) => f.key)).toEqual(REFUND.map((f) => f.key));
  });

  it("칸 이름표(label)도 환불용 그대로 유지", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    expect(byKey(r.fields).get("환불파트너사수수료")!.label).toBe("환불 파트너사 수수료");
  });

  it("글자칸이던 [위들리] 환불 수수료가 수식칸으로 바뀐다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    expect(byKey(r.fields).get("[위들리]_환불_수수료")!.type).toBe("formula");
  });

  it("식 안의 참조가 환불 칸으로 치환된다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    const f = byKey(r.fields).get("환불파트너사수수료")!;
    expect(f.formula![0].columnKey).toBe("환불금액");
    expect(f.derivedFromContract).toBe("[컨설턴트]_수수료");
  });

  it("괄호 안 참조도 치환된다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    const f = byKey(r.fields).get("[위들리]_환불_수수료")!;
    const group = f.formula![0];
    expect(group.unit).toBe("group");
    expect(group.terms![0].columnKey).toBe("환불금액");
    expect(group.terms![1].columnKey).toBe("환불파트너사수수료");
  });

  it("조건별 식(지역 조건)이 함께 따라온다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    const f = byKey(r.fields).get("환불파트너사수수료")!;
    expect(f.conditional!.rules[0].leftKey).toBe("52사업장주소지");
    expect(f.conditional!.rules[0].formula[0].columnKey).toBe("환불금액");
  });

  it("표 노출(tableExposed)은 따라오지 않는다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    expect(byKey(r.fields).get("환불컨설턴트수수료")!.tableExposed).toBeUndefined();
  });

  it("기준금액 칸에 부호 뒤집기 표시가 붙는다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, FOLLOW);
    expect(byKey(r.fields).get("환불금액")!.negateOnRead).toBe(true);
  });

  it("환불 카드에 없는 칸을 참조하면 그 짝만 건너뛰고 사유를 남긴다", () => {
    const contract = [...CONTRACT, {
      key: "착수금수수료", label: "착수금 수수료", type: "formula" as const,
      formula: [col("착수일"), pct(10)],
    }];
    const refund = [...REFUND, { key: "환불착수금수수료", label: "환불 착수금 수수료", type: "number" as const }];
    const follow: RefundFollowConfig = {
      ...FOLLOW,
      pairs: [...FOLLOW.pairs, { refund: "환불착수금수수료", contract: "착수금수수료" }],
    };
    const r = deriveRefundFields(contract, refund, follow);
    expect(byKey(r.fields).get("환불착수금수수료")!.type).toBe("number");
    expect(r.warnings.some((w) => w.refundKey === "환불착수금수수료" && w.reason.includes("착수일"))).toBe(true);
    // 나머지 짝은 정상 적용
    expect(byKey(r.fields).get("환불파트너사수수료")!.type).toBe("formula");
  });

  it("부호가 안 맞는 식은 차단되고, 그 칸을 참조하는 짝도 연쇄로 차단된다", () => {
    const contract: FieldDef[] = [
      { key: "계약금", label: "계약금", type: "number" },
      { key: "A", label: "A", type: "formula", formula: [col("계약금"), { op: "-", unit: "number", value: 50_000 }] },
      { key: "B", label: "B", type: "formula", formula: [col("계약금"), col("A", "-")] },
    ];
    const refund: FieldDef[] = [
      { key: "환불금액", label: "환불 금액", type: "number" },
      { key: "환불A", label: "환불 A", type: "number" },
      { key: "환불B", label: "환불 B", type: "number" },
    ];
    const r = deriveRefundFields(contract, refund, {
      enabled: true,
      baseAmount: { contract: "계약금", refund: "환불금액" },
      pairs: [{ refund: "환불A", contract: "A" }, { refund: "환불B", contract: "B" }],
    });
    expect(byKey(r.fields).get("환불A")!.type).toBe("number");
    expect(byKey(r.fields).get("환불B")!.type).toBe("number");
    expect(r.warnings).toHaveLength(2);
    // 적용된 짝이 하나도 없으면 부호 뒤집기 표시도 안 붙는다
    expect(byKey(r.fields).get("환불금액")!.negateOnRead).toBeUndefined();
  });

  it("기준금액 짝이 잘못됐으면 아무것도 안 바꾼다", () => {
    const r = deriveRefundFields(CONTRACT, REFUND, {
      ...FOLLOW,
      baseAmount: { contract: "없는칸", refund: "환불금액" },
    });
    expect(r.fields).toBe(REFUND);
    expect(r.warnings).toHaveLength(1);
  });

  // Task 2 코드 리뷰 지적사항: 기준금액칸이 수식(자동계산) 칸이면 negateOnRead 표시를 붙여도
  // 계산기(evalFormulaForTier)가 그 표시를 보기도 전에 재귀로 반환해버려 조용히 무시된다.
  // 관리자가 기준금액을 자동계산 칸으로 잘못 지정하면 파생 수수료가 전부 양수로 나와도
  // 아무 신호가 없다 — 이 함수 단계에서 미리 막아야 한다.
  it("기준금액 칸이 이미 수식(자동계산) 칸이면 아무것도 안 바꾸고 경고 1개만 남긴다", () => {
    const refund: FieldDef[] = REFUND.map((f) =>
      f.key === "환불금액"
        ? { ...f, type: "formula" as const, formula: [col("환불원금")] }
        : f,
    );
    const r = deriveRefundFields(CONTRACT, refund, FOLLOW);
    expect(r.fields).toBe(refund);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].refundKey).toBe("환불금액");
    expect(r.warnings[0].reason).toContain("자동");
  });
});

describe("검산 — 계약과 환불이 부호만 반대", () => {
  const derived = deriveRefundFields(CONTRACT, REFUND, FOLLOW).fields;
  const 평면 = { "52사업장주소지": "부산광역시 해운대구" };

  const 계약차수: TierData = { id: "c", label: "1차 정산", 계약금: 1_000_000 };
  const 환불차수: TierData = { id: "r", label: "1차 정산", 환불금액: 1_000_000 };

  const 계약값 = (k: string) =>
    evalFormulaForTier(byKey(CONTRACT).get(k)!, 계약차수, CONTRACT, new Set(), 평면);
  const 환불값 = (k: string) =>
    evalFormulaForTier(byKey(derived).get(k)!, 환불차수, derived, new Set(), 평면);

  it("[컨설턴트] +300,000 / 환불 −300,000", () => {
    expect(계약값("[컨설턴트]_수수료")).toBe(300_000);
    expect(환불값("환불파트너사수수료")).toBe(-300_000);
  });

  it("[위들리] +175,000 / 환불 −175,000", () => {
    expect(계약값("[위들리]_수수료")).toBe(175_000);
    expect(환불값("[위들리]_환불_수수료")).toBe(-175_000);
  });

  it("[하이브] +525,000 / 환불 −525,000", () => {
    expect(계약값("[하이브]_계약금_수수료")).toBe(525_000);
    expect(환불값("환불컨설턴트수수료")).toBe(-525_000);
  });

  it("지역 조건(서울·경기·인천 20%)도 환불에서 똑같이 걸린다", () => {
    const 수도권 = { "52사업장주소지": "서울특별시 강남구" };
    expect(evalFormulaForTier(byKey(CONTRACT).get("[컨설턴트]_수수료")!, 계약차수, CONTRACT, new Set(), 수도권)).toBe(200_000);
    expect(evalFormulaForTier(byKey(derived).get("환불파트너사수수료")!, 환불차수, derived, new Set(), 수도권)).toBe(-200_000);
  });

  it("환불금액 저장값은 양수 그대로", () => {
    환불값("환불파트너사수수료");
    expect(환불차수["환불금액"]).toBe(1_000_000);
  });
});
