// 차수 카드 ↔ 리스트 컬럼 양방향 연동 — 순수 계산(섹션 인식).
import {
  AREA_CONTAINER_KEY,
  linkSection,
  parseContainerKey,
  resolveContainerKey,
  type ColumnTierLink,
} from "./config";

type Tier = Record<string, unknown>;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function parseTierContainer(raw: unknown): { tiers: Tier[]; ok: boolean } {
  if (raw === null || raw === undefined || raw === "") return { tiers: [], ok: true };
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("[")) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return { tiers: arr.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? { ...(x as Tier) } : {})), ok: true };
      } catch { /* 깨진 글자열 */ }
    }
    return { tiers: [], ok: false };
  }
  if (Array.isArray(raw)) return { tiers: raw.map((x) => (x && typeof x === "object" && !Array.isArray(x) ? { ...(x as Tier) } : {})), ok: true };
  if (typeof raw === "object") return { tiers: [{ ...(raw as Tier) }], ok: true };
  return { tiers: [], ok: false };
}

export function computeLinkedValue(tiers: Tier[], link: ColumnTierLink): number | string | null {
  if (link.mode === "sum") {
    let any = false, total = 0;
    for (const t of tiers) {
      const n = toNum(t[link.tierFieldKey]);
      if (n !== null) { any = true; total += n; }
    }
    return any ? total : null;
  }
  if (tiers.length === 0) return null;
  const last = tiers[tiers.length - 1];
  const v = last[link.tierFieldKey];
  if (v === null || v === undefined || v === "") return null;
  const n = toNum(v);
  return n !== null ? n : (typeof v === "string" ? v : null);
}

export function applyLatestEdit(tiers: Tier[], link: ColumnTierLink, value: unknown): Tier[] {
  if (tiers.length === 0) {
    return [{ id: `tier-1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: "1차", [link.tierFieldKey]: value }];
  }
  const out = tiers.map((t) => ({ ...t }));
  out[out.length - 1] = { ...out[out.length - 1], [link.tierFieldKey]: value };
  return out;
}

// 한 컨테이너가 바뀌었을 때 그 (섹션,영역)에 걸린 연결의 평면값 재계산. data[containerKey]는 이미 새 값.
export function recomputeFlatForContainer(
  data: Record<string, unknown>,
  links: ColumnTierLink[],
  containerKey: string,
  ownDomain: string,
): Record<string, number | string | null> {
  const parsed = parseContainerKey(containerKey, ownDomain);
  if (!parsed) return {};
  const { tiers, ok } = parseTierContainer(data[containerKey]);
  if (!ok) return {};
  const out: Record<string, number | string | null> = {};
  for (const link of links) {
    if (linkSection(link, ownDomain) !== parsed.section) continue;
    if (link.area !== parsed.area) continue;
    out[link.columnKey] = computeLinkedValue(tiers, link);
  }
  return out;
}

export type SyncOutcome = { synced: Record<string, number | string | null> } | { rejected: string };

// 저장 1건(key,value)에 대해 연결 동기화. data 는 호출자가 in-place 갱신.
export function applyColumnTierSync(
  data: Record<string, unknown>,
  key: string,
  value: unknown,
  links: ColumnTierLink[],
  ownDomain: string,
): SyncOutcome {
  // 경우 A — 차수 컨테이너 저장
  if (parseContainerKey(key, ownDomain)) {
    return { synced: recomputeFlatForContainer(data, links, key, ownDomain) };
  }
  // 경우 B — 연결된 컬럼 직접 수정
  const link = links.find((l) => l.columnKey === key);
  if (link) {
    if (link.mode === "sum") return { rejected: `'${key}' 은 합계(읽기전용) 연결이라 직접 수정할 수 없습니다.` };
    const section = linkSection(link, ownDomain);
    const containerKey = resolveContainerKey(section, link.area, ownDomain);
    const { tiers, ok } = parseTierContainer(data[containerKey]);
    if (!ok) return { synced: {} };
    data[containerKey] = applyLatestEdit(tiers, link, value);
    return { synced: recomputeFlatForContainer(data, links, containerKey, ownDomain) };
  }
  // 경우 C — 무관
  return { synced: {} };
}
