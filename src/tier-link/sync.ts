// 차수 카드 ↔ 리스트 컬럼 양방향 연동 — 순수 계산(섹션 인식).
import {
  isReadonlyLink,
  linkSection,
  parseContainerKey,
  resolveContainerKey,
  type ColumnTierLink,
  type LinkArea,
} from "./config";
import { evalFormulaForTier, type FieldDef, type TierData } from "../tiered";

type Tier = Record<string, unknown>;

// computeLinkedValue 가 formula 차수 칸을 계산하려면 그 (섹션·영역)의 칸 정의가 필요하다.
// 미제공 시 기존 동작(저장값 읽기) 그대로 = 완전 뒤호환.
export type ComputeCtx = { fields?: FieldDef[] };

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

export function computeLinkedValue(tiers: Tier[], link: ColumnTierLink, ctx?: ComputeCtx): number | string | null {
  const field = ctx?.fields?.find((f) => f.key === link.tierFieldKey);
  const isFormula = field?.type === "formula";
  // formula 차수 칸은 값이 저장돼 있지 않다 → 차수 카드와 동일한 계산기로 그때그때 계산(PARITY).
  const valAt = (t: Tier): number | null =>
    isFormula
      ? evalFormulaForTier(field as FieldDef, t as unknown as TierData, ctx!.fields as FieldDef[])
      : toNum(t[link.tierFieldKey]);
  if (link.mode === "sum") {
    let any = false, total = 0;
    for (const t of tiers) {
      const n = valAt(t);
      if (n !== null) { any = true; total += n; }
    }
    return any ? total : null;
  }
  if (tiers.length === 0) return null;
  if (isFormula) return valAt(tiers[tiers.length - 1]); // formula 최신차수: 계산값(없으면 null)
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

// 주어진 차수 배열로 그 (섹션,영역)에 걸린 연결의 평면값 계산. 저장소 무관 — 호출자가 차수 제공.
// (자기분야는 entry.data 컨테이너에서, 다른 섹션은 별도 보관함(secstore)에서 차수를 읽어 넘긴다.)
export function recomputeFlatFromTiers(
  tiers: Tier[],
  links: ColumnTierLink[],
  section: string,
  area: LinkArea,
  ownDomain: string,
  fields?: FieldDef[],
): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const link of links) {
    if (linkSection(link, ownDomain) !== section) continue;
    if (link.area !== area) continue;
    out[link.columnKey] = computeLinkedValue(tiers, link, { fields });
  }
  return out;
}

// 한 컨테이너(entry.data)가 바뀌었을 때 그 (섹션,영역)에 걸린 연결의 평면값 재계산. data[containerKey]는 이미 새 값.
export function recomputeFlatForContainer(
  data: Record<string, unknown>,
  links: ColumnTierLink[],
  containerKey: string,
  ownDomain: string,
  fields?: FieldDef[],
): Record<string, number | string | null> {
  const parsed = parseContainerKey(containerKey, ownDomain);
  if (!parsed) return {};
  const { tiers, ok } = parseTierContainer(data[containerKey]);
  if (!ok) return {};
  return recomputeFlatFromTiers(tiers, links, parsed.section, parsed.area, ownDomain, fields);
}

export type SyncOutcome = { synced: Record<string, number | string | null> } | { rejected: string };

// 저장 1건(key,value)에 대해 연결 동기화. data 는 호출자가 in-place 갱신.
export function applyColumnTierSync(
  data: Record<string, unknown>,
  key: string,
  value: unknown,
  links: ColumnTierLink[],
  ownDomain: string,
  fields?: FieldDef[],
): SyncOutcome {
  // 경우 A — 차수 컨테이너 저장
  if (parseContainerKey(key, ownDomain)) {
    return { synced: recomputeFlatForContainer(data, links, key, ownDomain, fields) };
  }
  // 경우 B — 연결된 컬럼 직접 수정
  const link = links.find((l) => l.columnKey === key);
  if (link) {
    if (isReadonlyLink(link)) {
      const why = link.mode === "sum" ? "합계" : "자동계산";
      return { rejected: `'${key}' 은 ${why}(읽기전용) 연결이라 직접 수정할 수 없습니다. 차수 카드에서 수정하세요.` };
    }
    const section = linkSection(link, ownDomain);
    // 다른 섹션 차수는 별도 보관함(secstore)에 있어 이 경로(entry.data)로는 동기화 못 함.
    // 표에서의 직접 편집은 무시(읽기 전용 거울) — 차수 편집은 상세창(→ secstore 저장 훅)에서 반영된다.
    if (section !== ownDomain) return { synced: {} };
    const containerKey = resolveContainerKey(section, link.area, ownDomain);
    const { tiers, ok } = parseTierContainer(data[containerKey]);
    if (!ok) return { synced: {} };
    data[containerKey] = applyLatestEdit(tiers, link, value);
    return { synced: recomputeFlatForContainer(data, links, containerKey, ownDomain, fields) };
  }
  // 경우 C — 무관
  return { synced: {} };
}
