"use client";
// 전역 "공통/앱별" 설정 읽기/쓰기 도우미. 사업자번호와 무관한 전역 1행을 다룬다.
// 각 앱이 소스로 직접 소비하므로 상대경로 /api/common-fields 는 그 앱의 저장통로로 연결된다.
import type { CommonFieldOverride } from "../unified/sections";

const EMPTY: CommonFieldOverride = { extra: [], excluded: [] };
let cache: CommonFieldOverride | null = null;
let inflight: Promise<CommonFieldOverride> | null = null;

function normalize(v: unknown): CommonFieldOverride {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return { extra: arr(o.extra), excluded: arr(o.excluded) };
}

export function getCachedCommonOverride(): CommonFieldOverride {
  return cache ?? EMPTY;
}

export function fetchCommonFieldsOverride(): Promise<CommonFieldOverride> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/api/common-fields", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { const v = normalize(j?.success ? j.data : null); cache = v; return v; })
    .catch(() => EMPTY)
    .finally(() => { inflight = null; });
  return inflight;
}

export function refreshCommonFieldsOverride(): Promise<CommonFieldOverride> {
  cache = null;
  return fetchCommonFieldsOverride();
}

export function saveCommonFieldsOverride(next: CommonFieldOverride): Promise<CommonFieldOverride> {
  return fetch("/api/common-fields", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extra: next.extra ?? [], excluded: next.excluded ?? [] }),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { const v = normalize(j?.success ? j.data : null); cache = v; return v; })
    .catch(() => getCachedCommonOverride());
}
