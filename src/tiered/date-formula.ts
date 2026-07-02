// @wedly/ui-shared — 차수카드 "날짜 수식" 순수 계산기
//
// 숫자 엔진(evalFormulaForTier)과 분리된 날짜 전용 계산기. 시간대 영향이 없도록
// UTC 기준 y/m/d 정수 연산만 한다. 입출력 날짜는 "YYYY-MM-DD" 문자열.
//
//   방식 ① offset : 기준 날짜 + (일/주/개월 더하기·빼기) 여러 항
//   방식 ② weekday: 기준 날짜가 속한 주(월요일 시작)에서 N주 뒤의 특정 요일
import type { FieldDef, TierData } from "./index";

export type YMD = { y: number; m: number; d: number }; // m: 1~12

// "YYYY-MM-DD"(뒤에 시간 붙어도 됨) → {y,m,d}. 실제 존재하는 날짜가 아니면 null.
export function parseISODate(s: unknown): YMD | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

export function toISO(v: YMD): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${v.y}-${p(v.m)}-${p(v.d)}`;
}

// n일 더하기(음수면 빼기). 월·연 자동 넘김.
export function addDays(y: number, m: number, d: number, n: number): YMD {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Math.trunc(n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// n개월 더하기(음수면 빼기). 목표 달에 그 날(d)이 없으면 그 달 말일로 보정(1/31 + 1개월 = 2/28).
export function addMonths(y: number, m: number, d: number, n: number): YMD {
  const total = y * 12 + (m - 1) + Math.trunc(n);
  const ny = Math.floor(total / 12);
  const nm0 = ((total % 12) + 12) % 12; // 0-based 월
  const lastDay = new Date(Date.UTC(ny, nm0 + 1, 0)).getUTCDate(); // 다음 달 0일 = 이번 달 말일
  return { y: ny, m: nm0 + 1, d: Math.min(d, lastDay) };
}

// 그 날짜가 속한 주(월~일)의 월요일.
export function mondayOf(y: number, m: number, d: number): YMD {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=일 … 6=토
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// ── 날짜 수식 정의 ──
export type DateOffsetUnit = "day" | "week" | "month";
export interface DateOffset { amount: number; unit: DateOffsetUnit; } // amount 음수 = 빼기
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=일 … 6=토
export type DateFormulaSpec =
  | { mode: "offset"; baseKey: string; offsets: DateOffset[] }
  | { mode: "weekday"; baseKey: string; weeksAhead: number; weekday: Weekday };

// 저장된 날짜 수식 정의를 안전하게 파싱. baseKey 없으면 undefined.
export function parseDateFormula(raw: unknown): DateFormulaSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const baseKey = typeof o.baseKey === "string" ? o.baseKey : "";
  if (!baseKey) return undefined;
  if (o.mode === "weekday") {
    const weeksAhead = typeof o.weeksAhead === "number" && Number.isFinite(o.weeksAhead) ? Math.trunc(o.weeksAhead) : 0;
    const wd = (typeof o.weekday === "number" && o.weekday >= 0 && o.weekday <= 6) ? (Math.trunc(o.weekday) as Weekday) : 5;
    return { mode: "weekday", baseKey, weeksAhead, weekday: wd };
  }
  const units: DateOffsetUnit[] = ["day", "week", "month"];
  const offsets: DateOffset[] = Array.isArray(o.offsets)
    ? (o.offsets as unknown[]).flatMap((it) => {
        if (!it || typeof it !== "object") return [];
        const x = it as Record<string, unknown>;
        if (typeof x.amount !== "number" || !Number.isFinite(x.amount)) return [];
        const unit = units.includes(x.unit as DateOffsetUnit) ? (x.unit as DateOffsetUnit) : "day";
        return [{ amount: Math.trunc(x.amount), unit }];
      })
    : [];
  return { mode: "offset", baseKey, offsets };
}

// 한 차수(tier)에서 날짜 수식 칸(field)의 값을 "YYYY-MM-DD"로 계산.
//   - 기준 날짜: tier[baseKey] 우선 → 없으면 conditionValues[baseKey].
//     baseKey가 또 다른 날짜 수식 칸이면 재귀(순환은 seen으로 차단 → null).
//   - 기준이 비었거나 날짜 형식이 아니면 null(화면 "-").
export function evalDateFormulaForTier(
  field: FieldDef,
  tier: TierData,
  fields: FieldDef[],
  seen: ReadonlySet<string> = new Set<string>(),
  conditionValues?: Record<string, unknown>,
): string | null {
  if (seen.has(field.key)) return null;
  const spec = parseDateFormula(field.dateFormula);
  if (!spec) return null;
  const nextSeen = new Set(seen);
  nextSeen.add(field.key);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const getBase = (key: string): YMD | null => {
    const ref = byKey.get(key);
    if (ref && ref.type === "formula" && ref.formulaResult === "date") {
      return parseISODate(evalDateFormulaForTier(ref, tier, fields, nextSeen, conditionValues));
    }
    const tv = ref ? tier[key] : undefined;
    const raw = tv !== undefined && tv !== null && tv !== "" ? tv : conditionValues?.[key];
    return parseISODate(raw);
  };

  let cur = getBase(spec.baseKey);
  if (!cur) return null;

  if (spec.mode === "offset") {
    for (const o of spec.offsets) {
      if (o.unit === "month") cur = addMonths(cur.y, cur.m, cur.d, o.amount);
      else cur = addDays(cur.y, cur.m, cur.d, o.unit === "week" ? o.amount * 7 : o.amount);
    }
  } else {
    const mon = mondayOf(cur.y, cur.m, cur.d);
    const offFromMon = spec.weekday === 0 ? 6 : spec.weekday - 1; // 월=0 … 일=6
    cur = addDays(mon.y, mon.m, mon.d, spec.weeksAhead * 7 + offFromMon);
  }
  return toISO(cur);
}
