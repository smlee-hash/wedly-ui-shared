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
// "select" 는 정해둔 보기 목록(options) 중 하나를 고르는 드롭다운 칸. 글자처럼 저장(빈값 "")·수식 참조 불가.
export type FieldType = "text" | "date" | "number" | "percent" | "formula" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  // ── type === "formula" 일 때만 사용 (그 외 타입엔 없음) ──
  //   formula: 계산할 항(term)들. 왼쪽→오른쪽 순서로 순차 연산(괄호/우선순위 없음).
  //   formulaResult: 계산 결과 표시 형식 (number=원, percent=%). 기본 number.
  formula?: FormulaTerm[];
  formulaResult?: FormulaResultFormat;
  // ── type === "formula" && formulaResult === "date" 일 때만: 날짜 계산 정의 ──
  dateFormula?: import("./date-formula").DateFormulaSpec;
  // ── type === "formula" 조건별 식 (선택적) ──
  //   rules: 위→아래 우선. 먼저 맞는 규칙의 식 사용, 아무 것도 안 맞으면 formula(그 외/기본).
  //   각 규칙: leftKey 칸 값이, right(직접 입력 글자 / 다른 칸 값)와 "같으면" 적용.
  //   ⚠️ 앞호환: 옛 형식 { conditionFieldKey, rules:[{whenValue, formula}] } 도 resolve 단계에서 그대로 흡수.
  conditional?: {
    /** @deprecated 옛 형식 전용. 새 데이터는 규칙별 leftKey 사용. */
    conditionFieldKey?: string;
    rules: Array<ConditionalRule>;
  };
  // ── type === "select" 일 때만 사용 (그 외 타입엔 없음) ──
  //   options: 고를 수 있는 보기 값 목록(순서 보존). optionColors: 보기별 색칩(선택, 미지정 시 기본 회색).
  options?: string[];
  optionColors?: Record<string, { bg: string; text: string }>;
  // ── ERP 전용 — 이 차수 칸을 경정청구 등 도메인 "표"에 차수별 줄로 노출할지. 하이브·일루아는 무시. ──
  tableExposed?: boolean;
  // ── 환불 차수카드 "계약 수식 따라가기" 전용 표시 (서버가 GET 때 붙임 — 저장하지 않는다) ──
  //   negateOnRead: 이 칸의 저장값을 수식에서 읽을 때 부호를 뒤집는다(환불 기준금액칸).
  //                 화면 표시·조건 판정은 저장값 그대로 — 계산에서만 음수.
  //   derivedFromContract: 이 칸의 계산식이 계약 카드의 어느 칸에서 왔는지(원본 칸 키).
  negateOnRead?: boolean;
  derivedFromContract?: string;
}

/** 조건 비교 대상(오른쪽): 직접 입력 글자 또는 다른 칸. */
export type ConditionCompare =
  | { kind: "text"; value: string }
  | { kind: "field"; key: string };

/** 조건 비교 방식. 미지정(옛 데이터)은 "eq"(같음)로 취급 — 앞호환. */
export type ConditionOp = "eq" | "neq" | "contains" | "notContains";

/** 조건 절 하나(원자). leftKey 칸 값을 right 와 op 로 비교. */
export interface ConditionClause {
  leftKey: string;
  right: ConditionCompare;
  op: ConditionOp;
}

/** 여러 조건 절을 묶는 방식. and=모두 만족, or=하나라도 만족. 미지정=and. */
export type ConditionCombine = "and" | "or";

/** 조건 규칙 한 줄. (옛 형식 whenValue 도 읽기 호환 위해 optional 로 같이 둠) */
export interface ConditionalRule {
  /** 여러 조건 절(AND/OR). 비어있지 않으면 단일(leftKey/right/op) 대신 이걸 사용. */
  clauses?: ConditionClause[];
  /** clauses 묶는 방식(미지정=and). 절 2개 이상일 때만 의미. */
  combine?: ConditionCombine;
  /** 기준 칸(정산정보 칸 또는 기본정보 평면 필드) 키. 옛 형식이면 비고 conditionFieldKey 사용. */
  leftKey?: string;
  /** 비교 대상. 옛 형식이면 비고 whenValue(텍스트)로 흡수. */
  right?: ConditionCompare;
  /** 비교 방식(같음/다름/포함/미포함). 미지정이면 "eq"(같음). */
  op?: ConditionOp;
  /** @deprecated 옛 형식 전용. */
  whenValue?: string;
  formula: FormulaTerm[];
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
export type FormulaResultFormat = "number" | "percent" | "date";
// 묶음(괄호) 단위 추가 — group 이면 terms 안의 식을 먼저(괄호처럼) 계산. (한 겹만)
export type FormulaTermUnit = CustomFormulaUnit | "group";
export interface FormulaTerm {
  op: CustomFormulaOp;        // 첫 항은 무시됨 (시작값)
  unit: FormulaTermUnit;      // "column" | "number" | "percent" | "group"
  columnKey?: string;         // unit="column" 일 때 참조 컬럼 키
  value?: number;             // unit="number" | "percent" 일 때 값
  terms?: FormulaTerm[];      // unit="group" 일 때 묶음 안 식 (안쪽은 group 불가)
}

// 저장된 수식 항 배열을 안전하게 파싱 — 알 수 없는 값은 기본값으로 보정.
// allowGroup=false 면 묶음(group)을 일반 항으로도 안 잡아 제거(한 겹 강제).
export function parseFormulaTerms(raw: unknown, allowGroup = true): FormulaTerm[] {
  if (!Array.isArray(raw)) return [];
  const allowedOps: CustomFormulaOp[] = ["+", "-", "*", "/"];
  const allowedUnits: CustomFormulaUnit[] = ["number", "percent", "column"];
  const out: FormulaTerm[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const op = allowedOps.includes(o.op as CustomFormulaOp) ? (o.op as CustomFormulaOp) : "+";
    if (o.unit === "group") {
      if (!allowGroup) continue; // 안쪽의 group 은 버림(한 겹만 허용)
      const inner = parseFormulaTerms(o.terms, false);
      if (inner.length > 0) out.push({ op, unit: "group", terms: inner });
      continue; // 빈 묶음은 버림
    }
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

// 조건별 식 고르기 — 규칙마다 leftKey 칸 값과 right(글자/다른 칸) 를 "같음" 비교. 먼저 맞는 규칙의 식.
//   getValue(key): 그 키의 값을 돌려줌(정산정보 칸 우선, 없으면 기본정보 평면 — 호출부가 구성).
//   매칭: 양쪽을 글자로 보고, 다중값(배열/콤마·줄바꿈)은 공통 값 하나라도 있으면 일치. 빈 값은 매칭 안 함.
//   옛 형식(conditionFieldKey + whenValue)도 흡수.
export function resolveConditionalFormula(
  field: FieldDef,
  getValue: (key: string) => unknown,
): FormulaTerm[] | undefined {
  const cond = field.conditional;
  if (!cond || !Array.isArray(cond.rules) || cond.rules.length === 0) return field.formula;
  const valuesOf = (raw: unknown): string[] => {
    if (raw === null || raw === undefined) return [];
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter((s) => s !== "");
    return String(raw).split(/[,\n;]+/).map((x) => x.trim()).filter((s) => s !== "");
  };
  // 한 값을 글자로 — 배열이면 쉼표로 이어 붙임(부분 포함 비교용).
  const asText = (raw: unknown): string => {
    if (raw === null || raw === undefined) return "";
    if (Array.isArray(raw)) return raw.map((v) => String(v).trim()).filter((s) => s !== "").join(", ");
    return String(raw).trim();
  };
  // op 별 일치 판정. 기준 칸/비교 값 중 하나라도 비면 어떤 op 도 매칭 안 함 → 기본식.
  const matches = (op: ConditionOp, a: unknown, b: unknown): boolean => {
    const A = valuesOf(a), B = valuesOf(b);
    if (A.length === 0 || B.length === 0) return false;
    const tokenEq = A.some((x) => B.includes(x)); // 토큰(쉼표/줄바꿈) 교집합 = 같음 기준
    if (op === "neq") return !tokenEq;
    // 포함/미포함: 비교값을 토큰으로 나눠(같음과 같은 축) 그 중 하나라도 기준칸 글자에 부분 포함되면 일치.
    //   (비교값이 단일 값이면 "기준칸이 그 글자를 부분 포함" 과 동일. 콤마 다중값이면 OR 로 일관.)
    if (op === "contains") return B.some((t) => asText(a).includes(t));
    if (op === "notContains") return !B.some((t) => asText(a).includes(t));
    return tokenEq; // "eq" 및 미지정 기본
  };
  // 한 규칙의 조건 절 목록: 새 형식(clauses) 우선, 없으면 옛 단일 조건 1개로 구성.
  const clausesOf = (rule: ConditionalRule): ConditionClause[] => {
    if (Array.isArray(rule.clauses) && rule.clauses.length > 0) {
      return rule.clauses.filter((c) => c && !!c.leftKey);
    }
    const leftKey = rule.leftKey ?? cond.conditionFieldKey;
    if (!leftKey) return [];
    const right = rule.right ?? { kind: "text" as const, value: rule.whenValue ?? "" };
    return [{ leftKey, right, op: rule.op ?? "eq" }];
  };
  const test = (c: ConditionClause): boolean => {
    const left = getValue(c.leftKey);
    const rv = c.right.kind === "field" ? getValue(c.right.key) : c.right.value;
    return matches(c.op ?? "eq", left, rv);
  };
  for (const rule of cond.rules) {
    if (!rule || !Array.isArray(rule.formula)) continue;
    const clauses = clausesOf(rule);
    if (clauses.length === 0) continue;
    // combine=or → 하나라도 만족, 그 외(and/미지정) → 모두 만족.
    const ok = rule.combine === "or" ? clauses.some(test) : clauses.every(test);
    if (ok) return rule.formula;
  }
  return field.formula;
}

// 이 formula 칸의 계산 결과가 (차수 밖 평면 기본정보에서) 달라질 수 있는 "의존 평면 칸 키"들.
//  - 조건부 수식: 각 규칙 조건 칸(leftKey·clauses[].leftKey·field-kind 오른쪽 key)·옛 conditionFieldKey
//  - 날짜 수식: dateFormula.baseKey
//  - leftKey/baseKey 가 또 다른 (차수) 수식 칸을 가리키면 그 칸 의존까지 재귀 수집(seen 순환 차단).
// 수식 항(term)의 columnKey 는 차수 안 값이라 평면 의존 아님 → 제외.
// (저장 경로가 "조건/기준 칸 단독 저장"을 감지해 연결 표값을 재계산할 때 쓴다.)
export function formulaDependencyKeys(
  field: FieldDef,
  fields: FieldDef[] = [],
  seen: ReadonlySet<string> = new Set<string>(),
): string[] {
  if (seen.has(field.key)) return [];
  const nextSeen = new Set(seen);
  nextSeen.add(field.key);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out = new Set<string>();
  const addDep = (k: string | undefined | null) => {
    if (!k || typeof k !== "string") return;
    out.add(k);
    const ref = byKey.get(k);
    if (ref && ref.type === "formula" && ref.key !== field.key) {
      for (const d of formulaDependencyKeys(ref, fields, nextSeen)) out.add(d);
    }
  };
  const cond = field.conditional;
  if (cond && Array.isArray(cond.rules)) {
    if (cond.conditionFieldKey) addDep(cond.conditionFieldKey);
    for (const rule of cond.rules) {
      if (!rule) continue;
      const clauses: ConditionClause[] =
        Array.isArray(rule.clauses) && rule.clauses.length > 0
          ? rule.clauses
          : rule.leftKey || cond.conditionFieldKey
            ? [{
                leftKey: (rule.leftKey ?? cond.conditionFieldKey) as string,
                right: rule.right ?? { kind: "text", value: rule.whenValue ?? "" },
                op: rule.op ?? "eq",
              }]
            : [];
      for (const c of clauses) {
        if (!c) continue;
        addDep(c.leftKey);
        if (c.right && c.right.kind === "field") addDep(c.right.key);
      }
    }
  }
  const df = field.dateFormula as { baseKey?: unknown } | undefined;
  if (df && typeof df.baseKey === "string" && df.baseKey) addDep(df.baseKey);
  return [...out];
}

// 항 사슬을 순차 계산(왼→오, 우선순위 없음). 묶음(group) 안에서도 재사용한다.
// operand: 한 항의 값과 "실제 입력이 있었는지". (group 항은 호출부 operand 가 재귀 처리)
function evalTermChain(
  terms: FormulaTerm[],
  operand: (t: FormulaTerm) => { v: number; has: boolean },
): { v: number; has: boolean } {
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
  return { v: cur, has: anyInput };
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
  conditionValues?: Record<string, unknown>,
): number | null {
  if (seen.has(field.key)) return null; // 순환 참조 차단 (조건 평가에서 자기 칸 참조 대비 먼저)
  const nextSeen = new Set(seen);
  nextSeen.add(field.key);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  // 조건 비교용 값 조회: 정산정보 칸(수식 칸이면 계산값, 그 외 저장값) 우선 → 없으면 기본정보 평면 값.
  const getCondValue = (key: string): unknown => {
    const ref = byKey.get(key);
    if (ref && ref.type === "formula") {
      return evalFormulaForTier(ref, tier, fields, nextSeen, conditionValues);
    }
    const tv = ref ? tier[key] : undefined;
    if (tv !== undefined && tv !== null && tv !== "") return tv;
    return conditionValues?.[key];
  };
  const terms = resolveConditionalFormula(field, getCondValue);
  if (!Array.isArray(terms) || terms.length === 0) return null;

  // 한 항의 값 + "실제 입력이 있었는지" 반환
  const operand = (t: FormulaTerm): { v: number; has: boolean } => {
    if (t.unit === "group") {
      const inner = Array.isArray(t.terms) ? t.terms : [];
      if (inner.length === 0) return { v: 0, has: false };
      const r = evalTermChain(inner, operand); // 묶음 안 먼저 계산
      return r.has ? { v: r.v, has: true } : { v: 0, has: false };
    }
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
      const r = evalFormulaForTier(ref, tier, fields, nextSeen, conditionValues);
      return r === null ? { v: 0, has: false } : { v: r, has: true };
    }
    const raw = tier[ref.key];
    if (raw === null || raw === undefined || raw === "") return { v: 0, has: false };
    const num = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(num)) return { v: 0, has: false };
    const scaled = ref.type === "percent" ? num / 100 : num;
    // 환불 차수카드: 기준금액칸에 negateOnRead 가 붙으면 계산할 때만 음수로 읽는다(저장값·화면은 그대로).
    // scaled !== 0 가드: 저장값이 0이면 뒤집어도 -0 이 되어 "-0원"으로 보이는 표시 버그 방지.
    return { v: ref.negateOnRead && scaled !== 0 ? -scaled : scaled, has: true };
  };

  const result = evalTermChain(terms, operand);
  if (!result.has || !Number.isFinite(result.v)) return null;
  return result.v;
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

// ── 날짜 수식 (결과 형식 "date") ──
export {
  parseDateFormula,
  evalDateFormulaForTier,
  parseISODate,
  toISO,
  addDays,
  addMonths,
  mondayOf,
} from "./date-formula";
export type {
  DateFormulaSpec,
  DateOffset,
  DateOffsetUnit,
  Weekday,
  YMD,
} from "./date-formula";

// ── 환불 차수카드 "계약 수식 따라가기" ──
export * from "./sign-safety";
export * from "./refund-follow";
