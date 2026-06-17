// 차수 카드 ↔ 리스트 컬럼 연결 — 서버·클라이언트 공용 상수/타입(순수). 섹션 인식 버전.
export type LinkArea = "settlement" | "contract" | "refund";
export type LinkMode = "sum" | "latest";

export type ColumnTierLink = {
  columnKey: string;     // 표 컬럼 키
  section?: string;      // 상위 섹션 key(DOMAIN_GROUPS). 없으면 읽을 때 ownDomain 으로 승계
  area: LinkArea;        // 정산/계약/환불 차수 카드
  tierFieldKey: string;  // 차수 카드 안의 칸 키
  mode: LinkMode;        // sum=합계(읽기전용) | latest=최신차수(편집)
};

// 영역 → entry.data 안의 (자기분야) 차수 데이터 저장 키
export const AREA_CONTAINER_KEY: Record<LinkArea, string> = {
  settlement: "정산정보",
  contract: "계약정보_차수",
  refund: "환불정보_차수",
};

export function isLinkArea(v: unknown): v is LinkArea {
  return v === "settlement" || v === "contract" || v === "refund";
}
export function isLinkMode(v: unknown): v is LinkMode {
  return v === "sum" || v === "latest";
}

function baseToArea(base: string): LinkArea | null {
  if (base === AREA_CONTAINER_KEY.settlement) return "settlement";
  if (base === AREA_CONTAINER_KEY.contract) return "contract";
  if (base === AREA_CONTAINER_KEY.refund) return "refund";
  return null;
}

// 빈 섹션 기본 틀: 영역별로 경정청구의 같은 영역 키(=AREA_CONTAINER_KEY). 매핑 일관성 보장용.
export function baseAreaFields(area: LinkArea): string {
  return AREA_CONTAINER_KEY[area];
}

// 옛 연결 승계: section 비어있으면 ownDomain.
export function linkSection(link: ColumnTierLink, ownDomain: string): string {
  return link.section && link.section.trim() ? link.section : ownDomain;
}

// (섹션, 영역) → entry.data 컨테이너 키. 자기분야는 접두어 없음, 그 외는 uc:{section}: 접두어.
export function resolveContainerKey(section: string, area: LinkArea, ownDomain: string): string {
  const base = AREA_CONTAINER_KEY[area];
  return section === ownDomain ? base : `uc:${section}:${base}`;
}

// 컨테이너 키 → {section, area}. 차수 컨테이너가 아니면 null.
export function parseContainerKey(key: string, ownDomain: string): { section: string; area: LinkArea } | null {
  const m = key.match(/^uc:([^:]+):(.+)$/);
  if (m) {
    const area = baseToArea(m[2]);
    return area ? { section: m[1], area } : null;
  }
  const area = baseToArea(key);
  return area ? { section: ownDomain, area } : null;
}

// 연결 가능한 표 컬럼 타입 — formula·file·person 등 제외.
export const LINKABLE_COL_TYPES = new Set(["number", "percent", "date", "text", "select"]);

// 합계가 의미 없는 타입은 최신차수(편집)로만.
export function isLatestOnlyLinkType(type: string | undefined): boolean {
  return type === "select" || type === "percent";
}

export type LinkableColumn = { key: string; label: string; type: string };
type ColLike = { key: string; label?: string; type: string };

// 표 컬럼 후보 = 정적 + 커스텀 병합(같은 키 뒤가 덮음), 비연결 타입·내부 접두어 제외.
export function buildLinkableColumns(...groups: ColLike[][]): LinkableColumn[] {
  const byKey = new Map<string, LinkableColumn>();
  const order: string[] = [];
  for (const g of groups) {
    for (const c of g) {
      if (!c || typeof c.key !== "string" || !c.key) continue;
      if (!byKey.has(c.key)) order.push(c.key);
      byKey.set(c.key, { key: c.key, label: c.label || c.key, type: c.type });
    }
  }
  return order
    .map((k) => byKey.get(k)!)
    .filter((c) => LINKABLE_COL_TYPES.has(c.type) && !c.key.startsWith("_") && !c.key.startsWith("__tier__"));
}

export function buildColumnLabelMap(...groups: ColLike[][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) for (const c of g) if (c?.key) out[c.key] = c.label || c.key;
  return out;
}
