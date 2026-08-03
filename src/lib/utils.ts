export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("ko-KR");
}

/**
 * 퍼센트 칸 표시 — 숫자면 "값%", 빈값은 "-", 숫자가 아니면 원문 유지.
 * 계산 없이 표시만 한다(0~1 환산 X). tiered(차수카드)의 percent와는 별개 맥락.
 */
export function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? `${n}%` : String(value);
}

// ── 시각 표시는 언제나 한국시간 ───────────────────────────────────────────────
// 왜(2026-08-03 사장님 실측): 종전엔 보는 사람 컴퓨터 시간대(getHours)로 그렸다. 그래서 베트남(+7)에
//  있는 컴퓨터에서 한국시간 18:07 인 등록일시가 16:07 로 보였다. 한국 회사의 업무 자료이므로 누가
//  어디서 보든 한국시간이어야 하고, 같은 화면의 이력 패널이 이미 한국시간 고정이라 서로 어긋나기도 했다.
// 한국은 서머타임이 없어(1988년 이후) 세계표준시 +9시간 고정이라 시간대 변환 없이 더하기로 충분하다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 값에 시간대 표시가 붙어 있나 — "…Z" 또는 "…+09:00" */
const HAS_TZ_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;
/** 시간대 표시가 없는 모양 — "2026-05-20", "2026-05-20T14:30", "2026-05-20 14:30:00" */
const NAIVE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;

interface WallClock { y: number; m: number; d: number; hh: number; mm: number }

function isRealWallClock(w: WallClock): boolean {
  if (w.m < 1 || w.m > 12 || w.d < 1 || w.d > 31 || w.hh > 23 || w.mm > 59) return false;
  const probe = new Date(Date.UTC(w.y, w.m - 1, w.d));
  return probe.getUTCMonth() === w.m - 1 && probe.getUTCDate() === w.d;
}

/**
 * 저장값 → 한국시간 벽시계. 날짜로 못 읽으면 null(호출부가 원문을 그대로 보여준다).
 * ★시간대 표시가 **없는** 값은 바꾸지 않고 적힌 그대로 읽는다 — 그런 값은 이미 한국시간 표기로
 *  저장된 것이라(날짜 입력칸이 만든 "2026-05-20T00:00" 등) 변환하면 도리어 어긋난다.
 */
function toKstWallClock(value: string): WallClock | null {
  const s = value.trim();
  if (!s) return null;
  const naive = NAIVE_SHAPE.exec(s);
  if (naive && !HAS_TZ_SUFFIX.test(s)) {
    const w = { y: +naive[1], m: +naive[2], d: +naive[3], hh: +(naive[4] ?? 0), mm: +(naive[5] ?? 0) };
    return isRealWallClock(w) ? w : null;
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + KST_OFFSET_MS);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(), hh: k.getUTCHours(), mm: k.getUTCMinutes() };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatDate(isoDate: string | null): string {
  if (!isoDate) return "-";
  const w = toKstWallClock(isoDate);
  if (!w) return isoDate;
  const date = `${w.y}.${pad2(w.m)}.${pad2(w.d)}`;
  // 시간 정보가 있으면 함께 표시 (date-only는 그대로 날짜만, 자정도 날짜만 — 종전 규칙 유지)
  if (isoDate.includes("T") && (w.hh !== 0 || w.mm !== 0)) {
    return `${date} ${pad2(w.hh)}:${pad2(w.mm)}`;
  }
  return date;
}

/** datetime-local input value 변환 ('YYYY-MM-DDTHH:mm') */
export function toLocalInputValue(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.slice(0, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00`;
  try {
    const d = new Date(v);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}`;
  } catch {
    return "";
  }
}

/** date input value 변환 ('YYYY-MM-DD') — 시간 제거(날짜만 칸용) */
export function toDateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  try {
    const d = new Date(v);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

export function formatDateTime(isoDate: string | null): string {
  if (!isoDate) return "-";
  // 날짜로 못 읽는 값("2026-13-45T99:99:99" 등)은 "NaN.NaN.NaN" 대신 원문 그대로 — 종전 가드 유지.
  const w = toKstWallClock(isoDate);
  if (!w) return isoDate;
  return `${w.y}.${pad2(w.m)}.${pad2(w.d)} ${pad2(w.hh)}:${pad2(w.mm)}`;
}

/**
 * 시간 차이를 사람말 형식으로 ("방금 전" / "5분 전" / "3시간 전" / 그 이상은 날짜 시각)
 * 히스토리·코멘트 패널 등에서 공통 사용.
 */
export function timeAgo(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "방금 전";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

// STATUS_COLORS 같은 도메인 데이터는 보관함에 두지 않음. 각 앱의 _components/utils.ts 에 정의.
// 부품에서 상태 색상이 필요하면 props 로 statusColors 를 받아 전달한다.
