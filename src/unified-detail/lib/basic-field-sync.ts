// 기본정보 칸 값 동기화 보조 — 같은 회사에 새 행이 들어올 때의 병합, 회사+칸별 저장 순서 줄.
// 화면(BasicInfoPanel)과 분리한 순수 조각이라 상태·React 의존이 없다.

const hasOwn = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** 칸 값 동치 — false·null·0·빈 문자열도 실제 값이다. 배열·객체는 내용으로 비교(새 행마다 새 인스턴스가 와도 같은 값이면 같다). */
export function sameFieldValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  return ak.every((k) => hasOwn(bo, k) && sameFieldValue(ao[k], bo[k]));
}

/**
 * 같은 회사에 새 행(next)이 들어왔을 때 화면용 값(local)에 반영한다.
 *  - 이전 행(prev)과 새 행에서 같은 값인 칸 → 손대지 않는다(화면에서 고친 값·보관소로 채운 값 보존).
 *  - 값이 바뀐 칸·새로 생긴 칸·사라진 칸 → 새 행 기준으로 반영. 단 isPending 인 칸(저장 중·저장 실패로 입력 유지 중)은 건너뛴다.
 * changedKeys 는 서버 쪽 값이 실제로 달라진 칸(보류 칸 포함) — 호출자가 '마지막 확정값'을 버릴 때 쓴다.
 */
export function mergeIncomingRow(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  local: Record<string, unknown>,
  isPending: (key: string) => boolean,
): { merged: Record<string, unknown>; changedKeys: string[]; baseline: Record<string, unknown> } {
  const merged = { ...local };
  const baseline = { ...prev };
  const changedKeys: string[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const hadPrev = hasOwn(prev, key);
    const hasNext = hasOwn(next, key);
    if (hadPrev === hasNext && (!hasNext || sameFieldValue(prev[key], next[key]))) continue;
    changedKeys.push(key);
    if (isPending(key)) continue;
    if (hasNext) merged[key] = next[key];
    else delete merged[key];
    if (hasNext) baseline[key] = next[key];
    else delete baseline[key];
  }
  return { merged, changedKeys, baseline };
}

// ── 저장 순서 줄 — 회사(entryId)+칸 키마다 받아들인 저장을 입력 순서대로 한 줄로 세운다. 다른 칸끼리는 병렬. ──
// 화면이 닫히거나 회사가 바뀌어도 이미 받아들인 저장은 끝까지 간다(줄은 모듈 단위라 화면 수명과 무관).
type Lane = { tail: Promise<void>; latest: number };
const lanes = new Map<string, Lane>();
let intentSeq = 0;

const laneKeyOf = (entryId: string, key: string) => `${entryId}\u0000${key}`;
export type BasicIntentLease = { key: string; valid: boolean };
const leases = new Map<string, BasicIntentLease>();

/** 화면 owner를 넘어 최신 입력을 판정한다. 닫힌 화면의 실패는 이어 쓰고 새 입력은 옛 lease를 영구 무효화한다. */
export function beginBasicIntent(entryId: string, key: string): BasicIntentLease {
  const id = laneKeyOf(entryId, key);
  const previous = leases.get(id);
  if (previous) previous.valid = false;
  const lease = { key: id, valid: true };
  leases.set(id, lease);
  return lease;
}
export function isCurrentBasicIntent(lease: BasicIntentLease): boolean {
  return lease.valid && leases.get(lease.key) === lease;
}
export function finishBasicIntent(lease: BasicIntentLease): void {
  lease.valid = false;
  if (leases.get(lease.key) === lease) leases.delete(lease.key);
}

/** 새 입력(저장 의도) 번호 — 전체에서 단조 증가. */
export function nextBasicIntentSeq(): number {
  return ++intentSeq;
}

/** 이 번호가 그 회사·칸의 가장 새 의도인가. 줄이 비었으면(뒤에 받아들인 저장이 없으면) true. */
export function isLatestBasicIntent(entryId: string, key: string, seq: number): boolean {
  const lane = lanes.get(laneKeyOf(entryId, key));
  return !lane || lane.latest === seq;
}

/**
 * task 를 그 회사·칸의 줄 맨 뒤에 붙여 앞선 저장이 끝난 다음 실행한다(앞선 저장이 실패해도 이어서 실행).
 * 반환 promise 는 task 결과를 그대로 전한다. 줄이 다 비면 모듈 표에서 지운다.
 */
export function enqueueBasicFieldWrite<T>(entryId: string, key: string, seq: number, task: () => Promise<T>): Promise<T> {
  const laneKey = laneKeyOf(entryId, key);
  const prev = lanes.get(laneKey);
  const run = (prev ? prev.tail : Promise.resolve()).then(task);
  const tail = run.then(() => undefined, () => undefined);
  const lane: Lane = { tail, latest: seq };
  lanes.set(laneKey, lane);
  void tail.then(() => { if (lanes.get(laneKey) === lane) lanes.delete(laneKey); });
  return run;
}
