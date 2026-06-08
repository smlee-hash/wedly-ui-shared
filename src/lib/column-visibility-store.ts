"use client";
// 이 앱에서 숨긴 기본정보 칸(라벨) 목록 읽기/쓰기 도우미. 사업자번호와 무관한 "이 앱 전역" 1행.
// 각 앱이 소스로 직접 소비하므로 상대경로 /api/column-visibility 는 그 앱의 저장통로(그 앱 키)로 연결된다.

const EMPTY: string[] = [];
let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

function normalize(v: unknown): string[] {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const x = (o as { hidden?: unknown }).hidden;
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : [];
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
  return fetchHiddenBasicColumns();
}

export function saveHiddenBasicColumns(next: string[]): Promise<string[]> {
  return fetch("/api/column-visibility", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hidden: next ?? [] }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { const v = normalize(j?.success ? j.data : null); cache = v; return v; })
    .catch(() => getCachedHiddenBasicColumns());
}
