"use client";
// 이 앱에서 숨긴 기본정보 칸(라벨) 목록 읽기/쓰기 도우미. 사업자번호와 무관한 "이 앱 전역" 1행.
// 각 앱이 소스로 직접 소비하므로 상대경로 /api/column-visibility 는 그 앱의 저장통로(그 앱 키)로 연결된다.

const EMPTY: string[] = [];
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;
// 저장 순번: 빠르게 여러 번 켜고 끌 때, 마지막 저장의 서버 응답만 최종값으로 반영한다(늦게 도착한 옛 응답 무시).
let saveSeq = 0;

// 값이 바뀌면(저장·강제 새로고침) 구독한 화면에 즉시 알린다.
// → 관리자가 설정을 바꾸면 이미 떠 있는 목록 표·상세창이 새로고침 없이 곧바로 반영된다.
type Listener = (hidden: string[]) => void;
const listeners = new Set<Listener>();

function emit(): void {
  const v = cache ?? EMPTY;
  // Set 복사 후 순회: 알림 도중 구독/해제가 일어나도 안전
  for (const listener of Array.from(listeners)) {
    try {
      listener(v);
    } catch {
      // 한 화면의 오류가 다른 화면 알림을 막지 않도록 무시
    }
  }
}

/** 숨김 목록 변경을 구독한다. 반환된 함수를 호출하면 구독 해제된다. */
export function subscribeHiddenBasicColumns(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function normalize(v: unknown): string[] {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const x = (o as { hidden?: unknown }).hidden;
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
}

// 두 목록이 (순서 무관) 같은 라벨 집합인지 — 불필요한 재알림(다시 그리기)을 건너뛰기 위한 비교
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}

export function getCachedHiddenBasicColumns(): string[] {
  return cache ?? EMPTY;
}

export function fetchHiddenBasicColumns(): Promise<string[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/api/column-visibility", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { const v = normalize(j?.success ? j.data : null); cache = v; return v; })
    .catch(() => EMPTY)
    .finally(() => { inflight = null; });
  return inflight;
}

export function refreshHiddenBasicColumns(): Promise<string[]> {
  cache = null;
  return fetchHiddenBasicColumns().then((v) => { emit(); return v; });
}

// 저장: 서버 응답을 기다리지 않고 화면에 먼저 반영(낙관적)한 뒤, 뒤에서 서버에 기록한다.
// → 켜고 끄는 즉시 표·상세창·스위치가 움직여 "뚝뚝 끊김" 없이 매끄럽게 느껴진다.
export function saveHiddenBasicColumns(next: string[]): Promise<string[]> {
  const prev = cache; // 저장 실패 시 되돌릴 직전 값
  const optimistic = normalize({ hidden: next });
  cache = optimistic;
  emit(); // 1) 클릭 즉시 화면 반영(서버 기다리지 않음)
  const mySeq = ++saveSeq;
  return fetch("/api/column-visibility", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden: next ?? [] }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j == null || j.success !== true) throw new Error("save failed");
      const v = normalize(j.data);
      if (mySeq === saveSeq) {
        // 마지막 저장만 최종 보정한다(늦게 온 옛 응답은 무시)
        cache = v;
        if (!sameSet(v, optimistic)) emit(); // 서버 값이 다를 때만 다시 알림
      }
      return v;
    })
    .catch(() => {
      // 마지막 저장이 실패하면 직전 값으로 되돌려 표·스위치를 원상복구
      if (mySeq === saveSeq) {
        cache = prev ?? EMPTY;
        emit();
      }
      return cache ?? EMPTY;
    });
}
