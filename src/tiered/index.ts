// @wedly/ui-shared — 차수 카드(계약·정산·환불) 공용 로직 (모듈화 단계 13)
//
// 하이브·일루아·ERP 가 공유하는 "차수별 카드" 의 타입·계산기·파서를 모은다.
// 화면(React)·서버 통신과 무관한 순수 로직만 둔다.
//
// 도메인 분리 원칙 (이 보관함의 규칙):
//   - 공용(여기)  : 타입(FieldDef/TierData/ScoreCardDef/FormulaTerm…), 계산기(evalFormulaForTier),
//                   파서(parseTiers/parseScoreCards/parseFormulaTerms), 도우미(makeEmptyTier 등)
//   - 앱별(_components) : 기본 컬럼(DEFAULT_FIELDS)·기본 카드(DEFAULT_SCORECARDS) 등 도메인 데이터
//
// ⚠️ 기존 메인 표용 FormulaSpec(types/columns.ts)과는 다른 개념이다.
//    여기 FormulaTerm/FieldDef 는 "차수 카드"용 (여러 항·컬럼끼리 계산·결과 형식 선택 지원).

// "number" 는 일반 숫자, "percent" 는 같은 숫자형이지만 표시·편집 시 % 단위로 다룸
// "formula" 는 사람이 입력하지 않고 같은 차수의 다른 컬럼들로 자동 계산되는 컬럼(읽기전용)
export type FieldType = "text" | "date" | "number" | "percent" | "formula";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  // ── type === "formula" 일 때만 사용 (그 외 타입엔 없음) ──
  //   formula: 계산할 항(term)들. 왼쪽→오른쪽 순서로 순차 연산(괄호/우선순위 없음).
  //   formulaResult: 계산 결과 표시 형식 (number=원, percent=%). 기본 number.
  formula?: FormulaTerm[];
  formulaResult?: FormulaResultFormat;
  // ── type === "formula" 조건별 식 (선택적) ──
  //   conditionFieldKey: 기준 필드(기본정보 평면 필드) 키. 예 "54DB분류"
  //   rules: 기준 값별로 쓸 식. 먼저 맞는 규칙 우선. 매칭 없으면 formula(기본).
  //   미설정 시 기존과 100% 동일(앞호환).
  conditional?: {
    conditionFieldKey: string;
    rules: Array<{ whenValue: string; formula: FormulaTerm[] }>;
  };
}

// 합계 스코어카드 정의 — 어드민이 카드 제목, 색, 계산식, 추가/삭제 모두 편집 가능.
// 계산식: 카드 값 = sum(plus 컬럼들) - sum(minus 컬럼들)
export type ScoreCardColor = "gray" | "blue" | "yellow" | "green" | "purple" | "red";

// 직접 수식 항목 — 합산/차감 컬럼 외에 별도로 사용자가 입력하는 식.
// 예: { op: "*", value: 30, unit: "percent" } → 결과에 30% 곱하기
//     { op: "*", unit: "column", columnKey: "성공보수총액" } → 결과 × (모든 차수의 성공보수총액 합)
// 적용 순서: (합산 합 - 차감 합) 의 값에 custom 항목들이 순차로 적용된다.
export type CustomFormulaOp = "+" | "-" | "*" | "/";
export type CustomFormulaUnit = "number" | "percent" | "column";
export interface CustomFormulaItem {
  op: CustomFormulaOp;
  value: number;          // unit=column 이면 사용 안 됨 (0 으로 두면 됨)
  unit: CustomFormulaUnit;
  columnKey?: string;     // unit=column 일 때 참조할 차수 카드 컬럼 키
}

// ── 수식 컬럼 (type === "formula") ──
// 같은 차수 안의 다른 컬럼·숫자·퍼센트를 항(term)으로 이어 자동 계산하는 컬럼.
// 스코어카드의 직접 수식(CustomFormulaItem)과 같은 op/unit 체계를 재사용해 일관성 유지.
//   예) [{unit:"column",columnKey:"예상국세환급액"}, {op:"*",unit:"column",columnKey:"국세환급액수수료율"}]
//       → 예상국세환급액 × 국세환급액수수료율(%)  (퍼센트 컬럼은 자동으로 0~1 비율로 환산)
export type FormulaResultFormat = "number" | "percent";
export interface FormulaTerm {
  op: CustomFormulaOp;        // 첫 항은 무시됨 (시작값)
  unit: CustomFormulaUnit;    // "column" | "number" | "percent"
  columnKey?: string;         // unit="column" 일 때 참조 컬럼 키
  value?: number;             // unit="number" | "percent" 일 때 값
}

// 저장된 수식 항 배열을 안전하게 파싱 — 알 수 없는 값은 기본값으로 보정.
export function parseFormulaTerms(raw: unknown): FormulaTerm[] {
  if (!Array.isArray(raw)) return [];
  const allowedOps: CustomFormulaOp[] = ["+", "-", "*", "/"];
  const allowedUnits: CustomFormulaUnit[] = ["number", "percent", "column"];
  const out: FormulaTerm[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const op = allowedOps.includes(o.op as CustomFormulaOp) ? (o.op as CustomFormulaOp) : "+";
    const unit = allowedUnits.includes(o.unit as CustomFormulaUnit) ? (o.unit as CustomFormulaUnit) : "number";
    const value = typeof o.value === "number" && Number.isFinite(o.value) ? o.value : 0;
    const term: FormulaTerm = { op, unit, value };
    if (unit === "column" && typeof o.columnKey === "string") term.columnKey = o.columnKey;
    out.push(term);
  }
  return out;
}

export interface ScoreCardDef {
  id: string;
  label: string;
  color: ScoreCardColor;
  formula: {
    plus: string[];
    minus: string[];
    // 직접 수식 3분류:
    //   plusCustom — 합산 결과에만 적용 (예: 합산 × 0.3)
    //   minusCustom — 차감 결과에만 적용 (예: 차감 × 0.1)
    //   custom — 최종 (합산-차감) 결과에 적용
    custom?: CustomFormulaItem[];
    plusCustom?: CustomFormulaItem[];
    minusCustom?: CustomFormulaItem[];
  };
}

// 카드 색상 → Tailwind 클래스 토큰 매핑 (위들리 디자인)
export const SCORECARD_COLOR_CLASSES: Record<ScoreCardColor, { bg: string; valueText: string; labelText: string }> = {
  gray:   { bg: "bg-wedly-bg-gray",   valueText: "text-wedly-navy",   labelText: "text-wedly-muted" },
  blue:   { bg: "bg-wedly-bg-blue",   valueText: "text-wedly-accent", labelText: "text-wedly-accent" },
  yellow: { bg: "bg-wedly-bg-yellow", valueText: "text-wedly-orange", labelText: "text-wedly-orange" },
  green:  { bg: "bg-wedly-bg-green",  valueText: "text-wedly-green",  labelText: "text-wedly-green" },
  purple: { bg: "bg-wedly-bg-purple", valueText: "text-wedly-purple", labelText: "text-wedly-purple" },
  red:    { bg: "bg-wedly-bg-red",    valueText: "text-wedly-red",    labelText: "text-wedly-red" },
};

export function makeScoreCardId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 직접 수식 항목 배열 파싱 — 알 수 없는 값은 안전하게 필터링
function parseCustomItems(raw: unknown): CustomFormulaItem[] {
  if (!Array.isArray(raw)) return [];
  const allowedOps: CustomFormulaOp[] = ["+", "-", "*", "/"];
  const allowedUnits: CustomFormulaUnit[] = ["number", "percent", "column"];
  const out: CustomFormulaItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const op = allowedOps.includes(o.op as CustomFormulaOp) ? (o.op as CustomFormulaOp) : "*";
    const value = typeof o.value === "number" && Number.isFinite(o.value) ? o.value : 0;
    const unit = allowedUnits.includes(o.unit as CustomFormulaUnit) ? (o.unit as CustomFormulaUnit) : "number";
    const columnKey = typeof o.columnKey === "string" ? o.columnKey : undefined;
    const item: CustomFormulaItem = { op, value, unit };
    if (columnKey) item.columnKey = columnKey;
    out.push(item);
  }
  return out;
}

export function parseScoreCards(raw: unknown): ScoreCardDef[] | null {
  if (!Array.isArray(raw)) return null;
  const allowedColors: ScoreCardColor[] = ["gray", "blue", "yellow", "green", "purple", "red"];
  const result: ScoreCardDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id : makeScoreCardId();
    const label = typeof o.label === "string" ? o.label : "";
    const color = (allowedColors.includes(o.color as ScoreCardColor) ? o.color : "gray") as ScoreCardColor;
    const f = (o.formula && typeof o.formula === "object") ? (o.formula as Record<string, unknown>) : {};
    const plus = Array.isArray(f.plus) ? (f.plus as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const minus = Array.isArray(f.minus) ? (f.minus as unknown[]).filter((x): x is string => typeof x === "string") : [];
    // 직접 수식 3 슬롯 — 미정의면 빈 배열로 두고, 비어 있으면 결과 객체에서 제외 (불필요한 키 차단)
    const custom = parseCustomItems(f.custom);
    const plusCustom = parseCustomItems(f.plusCustom);
    const minusCustom = parseCustomItems(f.minusCustom);
    const formula: ScoreCardDef["formula"] = { plus, minus };
    if (custom.length > 0) formula.custom = custom;
    if (plusCustom.length > 0) formula.plusCustom = plusCustom;
    if (minusCustom.length > 0) formula.minusCustom = minusCustom;
    result.push({ id, label, color, formula });
  }
  return result;
}

export type TierData = {
  id: string;
  label: string;
  /** 차수 카드가 속한 세부 섹션 식별값. 없으면 첫 번째 세부 섹션 자동 배정 (호환). */
  _subSectionId?: string;
} & Record<string, string | number | null | undefined>;

export const ORDINAL_KO = ["1차", "2차", "3차", "4차", "5차", "6차", "7차", "8차", "9차", "10차", "11차", "12차"];

export function makeEmptyTier(idx: number, fields: FieldDef[]): TierData {
  const ord = ORDINAL_KO[idx] || `${idx + 1}차`;
  const tier: TierData = {
    id: `tier-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: `${ord} 정산`,
  };
  for (const f of fields) {
    // 수식 컬럼은 사람이 입력하지 않고 자동 계산되므로 저장값은 비워둠(null).
    tier[f.key] = (f.type === "number" || f.type === "percent" || f.type === "formula") ? null : "";
  }
  return tier;
}

export function makeDefaultTiers(fields: FieldDef[]): TierData[] {
  // 기본 차수 1개만. 필요 시 + 차수 추가 버튼으로 확장
  return [makeEmptyTier(0, fields)];
}

export function parseTiers(raw: unknown, fields: FieldDef[]): TierData[] {
  if (!raw) return makeDefaultTiers(fields);
  let arr: unknown;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return makeDefaultTiers(fields); }
  } else { arr = raw; }
  if (!Array.isArray(arr) || arr.length === 0) return makeDefaultTiers(fields);

  return arr.map((t, i): TierData => {
    const ord = ORDINAL_KO[i] || `${i + 1}차`;
    const item = (t || {}) as Record<string, unknown>;
    const tier: TierData = {
      id: typeof item.id === "string" ? item.id : `tier-${i + 1}-${i}`,
      label: typeof item.label === "string" ? item.label : `${ord} 정산`,
    };
    for (const f of fields) {
      const v = item[f.key];
      // 수식 컬럼은 화면에서 매번 다시 계산 — 저장값은 신뢰하지 않고 null 로 둠.
      if (f.type === "number" || f.type === "percent" || f.type === "formula") {
        tier[f.key] = typeof v === "number" ? v : (v === null || v === undefined || v === "" ? null : Number(v) || null);
      } else {
        tier[f.key] = typeof v === "string" ? v : "";
      }
    }
    return tier;
  });
}

export function relabelTiers(tiers: TierData[]): TierData[] {
  return tiers.map((t, i) => ({ ...t, label: `${ORDINAL_KO[i] || `${i + 1}차`} 정산` }));
}

export function generateFieldKey(label: string, existing: FieldDef[]): string {
  const base = label.trim().replace(/\s+/g, "_") || "field";
  let key = base;
  let n = 1;
  const used = new Set(existing.map((f) => f.key));
  while (used.has(key)) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
}

// ── 수식 컬럼 계산 (순수 함수 — 화면/앱과 무관) ──
// 수식 컬럼이 참조로 쓸 수 있는 컬럼 타입인지 (글자·날짜 컬럼은 계산에 못 씀).
export function isNumericFieldType(type: FieldType): boolean {
  return type === "number" || type === "percent" || type === "formula";
}

// 조건별 식 고르기 — field.conditional 가 있으면 conditionValue 에 맞는 규칙의 식을, 없거나 매칭 안 되면 field.formula 를 돌려준다.
// 매칭: 단일 문자열은 일치, 배열/콤마 문자열(다중 선택)은 그 안에 whenValue 가 '포함'되면 일치. 먼저 맞는 규칙 우선.
export function resolveConditionalFormula(
  field: FieldDef,
  conditionValue: unknown,
): FormulaTerm[] | undefined {
  const cond = field.conditional;
  if (!cond || !Array.isArray(cond.rules) || cond.rules.length === 0) return field.formula;
  const matches = (when: string): boolean => {
    if (conditionValue === null || conditionValue === undefined) return false;
    if (Array.isArray(conditionValue)) return conditionValue.some((v) => String(v).trim() === when);
    const s = String(conditionValue).trim();
    if (s === when) return true;
    return s.split(/[,\n;]+/).map((x) => x.trim()).includes(when);
  };
  for (const rule of cond.rules) {
    if (rule && typeof rule.whenValue === "string" && Array.isArray(rule.formula) && matches(rule.whenValue)) {
      return rule.formula;
    }
  }
  return field.formula;
}

// 한 차수(tier)에서 수식 컬럼(field)의 값을 계산한다.
//   - 숫자 컬럼: 저장값 그대로
//   - 퍼센트 컬럼/퍼센트 값: 0~1 비율로 환산 (10% → 0.1) — 곱셈이 자연스럽게 맞도록
//   - 수식 컬럼 참조: 재귀 계산 (순환 참조는 0 으로 차단)
// 반환: 계산된 "자연값". 입력이 하나도 없으면 null (화면에 "-" 표시).
export function evalFormulaForTier(
  field: FieldDef,
  tier: TierData,
  fields: FieldDef[],
  seen: ReadonlySet<string> = new Set<string>(),
): number | null {
  const terms = field.formula;
  if (!Array.isArray(terms) || terms.length === 0) return null;
  if (seen.has(field.key)) return null; // 순환 참조 차단
  const nextSeen = new Set(seen);
  nextSeen.add(field.key);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  // 한 항의 값 + "실제 입력이 있었는지" 반환
  const operand = (t: FormulaTerm): { v: number; has: boolean } => {
    if (t.unit === "number") {
      const v = typeof t.value === "number" && Number.isFinite(t.value) ? t.value : 0;
      return { v, has: true };
    }
    if (t.unit === "percent") {
      const v = typeof t.value === "number" && Number.isFinite(t.value) ? t.value : 0;
      return { v: v / 100, has: true };
    }
    // unit === "column"
    const ref = t.columnKey ? byKey.get(t.columnKey) : undefined;
    if (!ref) return { v: 0, has: false };
    if (ref.type === "formula") {
      const r = evalFormulaForTier(ref, tier, fields, nextSeen);
      return r === null ? { v: 0, has: false } : { v: r, has: true };
    }
    const raw = tier[ref.key];
    if (raw === null || raw === undefined || raw === "") return { v: 0, has: false };
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) return { v: 0, has: false };
    return { v: ref.type === "percent" ? num / 100 : num, has: true };
  };

  let cur = 0;
  let anyInput = false;
  for (let i = 0; i < terms.length; i++) {
    const { v, has } = operand(terms[i]);
    if (has) anyInput = true;
    if (i === 0) { cur = v; continue; }
    const op = terms[i].op;
    if (op === "+") cur += v;
    else if (op === "-") cur -= v;
    else if (op === "*") cur *= v;
    else if (op === "/") cur = v === 0 ? cur : cur / v; // 0 으로 나누기 안전 처리
  }
  if (!anyInput || !Number.isFinite(cur)) return null;
  return cur;
}

// 수식 계산 결과를 표시 문자열로. number → "1,234,567원", percent → "12.5%".
export function formatFormulaResult(value: number | null, resultFormat?: FormulaResultFormat): string {
  if (value === null || !Number.isFinite(value)) return "";
  if (resultFormat === "percent") {
    const pct = Math.round(value * 100 * 100) / 100; // 비율 → %, 소수점 최대 2자리
    return `${pct.toLocaleString("ko-KR")}%`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}
