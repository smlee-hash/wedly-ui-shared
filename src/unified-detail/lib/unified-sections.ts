// 통합 보기(고객 360) 상세창 — 묶음(섹션)별 컬럼 계산 — 순수 함수(읽기 전용 로직).
//
// 하이브 src/lib/unified-sections.ts 를 ERP 도메인으로 포팅.
// 변경점:
//   - ColumnDef 임포트: "@/(erp)/tax-amendment/columns" → "../../types/columns"
//   - BASIC_FIELD_SPECS: @wedly/ui-shared 의 COMMON_BASIC_FIELD_SPECS(공통 10개)로 교체.
//     ERP는 앱별 전용 컬럼(팀장·팀원)이 없으므로 공통 10개만 사용.
//   - 로직·타입·상수는 하이브와 100% 동일 유지(Phase 2+ 에서 동일 인터페이스 사용).

import type { ColumnDef } from "../../types/columns";
import { COMMON_BASIC_FIELD_SPECS } from "../../unified/sections";

export type SectionDef = {
  id: string;
  label: string;
  kind?: string;
  fieldKeys?: string[];
  removable?: boolean;
};

export type ColumnLite = {
  key: string;
  label: string;
  type?: ColumnDef["type"];
  format?: ColumnDef["format"];
  options?: string[]; // select/multi_select 선택지(공용 추가 칸 정의에서 실려옴)
};

export type UnifiedSection = {
  id: string;
  label: string;
  kind?: string; // "fields"(기본) | "settlement" | "files" | "meetings"
  fields: ColumnLite[];
};

// 통합 보기 본문에 "일반 칸"으로 그리면 안 되는 시스템/특수 키 — 기타에도 노출 금지.
const SYSTEM_KEYS = new Set<string>([
  "정산정보", "_meetings", "_files", "_id", "_createdTime", "_isNew",
  "_hiveTransferredAt", "매출VAT포함", "매출VAT제외",
]);

/**
 * 묶음별 컬럼 목록을 계산한다.
 * @param ownFallbackKeys 정의가 비어 있을 때 "기본정보" 묶음으로 쓸 최소 칸 목록(선택).
 * @returns 묶음 배열(빈 묶음도 포함). "기타"는 항상 마지막 근처.
 */
export function computeUnifiedSections(
  detailSections: SectionDef[],
  sectionMapping: Record<string, string> | null | undefined,
  hiddenColumns: string[],
  allColumns: ColumnDef[],
  row: Record<string, unknown> | null,
): UnifiedSection[] {
  const hidden = new Set(hiddenColumns || []);
  const mapping = sectionMapping || {};

  // 칸 정의 조회표 — allColumns 우선, row 에만 있는 키는 text 로 보충.
  const colMap = new Map<string, ColumnLite>();
  for (const c of allColumns) {
    if (!colMap.has(c.key)) {
      colMap.set(c.key, { key: c.key, label: c.label, type: c.type, format: c.format });
    }
  }
  if (row) {
    for (const k of Object.keys(row)) {
      if (k.startsWith("_")) continue;
      if (SYSTEM_KEYS.has(k)) continue;
      if (!colMap.has(k)) colMap.set(k, { key: k, label: k, type: "text" });
    }
  }

  // 기본 묶음 복사 (fieldKeys 는 새 배열로 — 원본 불변)
  const sections = (detailSections || [])
    .filter((s) => s && typeof s.id === "string" && typeof s.label === "string")
    .map((s) => ({ id: s.id, label: s.label, kind: s.kind, fieldKeys: [...(s.fieldKeys || [])] }));

  // 계약정보/환불정보가 일반 fields 모드면 차수 카드(tiered) 모드로 변환.
  {
    const normLabel = (l?: string) => (l || "").replace(/\s+/g, "");
    for (const s of sections) {
      const ln = normLabel(s.label);
      if (ln === "계약정보" && (!s.kind || s.kind === "fields")) { s.kind = "tiered-contract"; s.fieldKeys = []; }
      else if (ln === "환불정보" && (!s.kind || s.kind === "fields")) { s.kind = "tiered-refund"; s.fieldKeys = []; }
    }
  }

  // "기타" 묶음 보장 — 미배치 칸 흡수용.
  let other = sections.find((s) => s.id === "other");
  if (!other) {
    other = { id: "other", label: "기타", kind: "fields", fieldKeys: [] };
    sections.push(other);
  }

  // 1) 어드민 명시 매핑 적용 — 해당 키를 모든 묶음에서 빼고 지정 묶음에 추가.
  for (const [colKey, targetId] of Object.entries(mapping)) {
    for (const s of sections) {
      const i = s.fieldKeys.indexOf(colKey);
      if (i >= 0) s.fieldKeys.splice(i, 1);
    }
    const target = sections.find((s) => s.id === targetId);
    if (target && !target.fieldKeys.includes(colKey)) target.fieldKeys.push(colKey);
  }

  // 2) 어느 묶음에도 안 들어간 표 컬럼은 "기타"로 자동 수집.
  const covered = new Set<string>();
  for (const s of sections) for (const k of s.fieldKeys) covered.add(k);
  for (const c of allColumns) {
    if (c.type === "auto_increment_id") continue;
    if (SYSTEM_KEYS.has(c.key)) continue;
    if (hidden.has(c.key)) continue;
    if (covered.has(c.key)) continue;
    other.fieldKeys.push(c.key);
    covered.add(c.key);
  }

  // 3) 각 묶음의 칸 목록을 만든다 — 숨김·시스템·미정의 키 제외, 중복 제거.
  const result: UnifiedSection[] = [];
  const seenGlobal = new Set<string>();
  for (const s of sections) {
    const fields: ColumnLite[] = [];
    for (const k of s.fieldKeys) {
      if (seenGlobal.has(k)) continue;
      if (hidden.has(k)) continue;
      if (SYSTEM_KEYS.has(k)) continue;
      const def = colMap.get(k);
      if (!def) continue;
      fields.push(def);
      seenGlobal.add(k);
    }
    result.push({ id: s.id, label: s.label, kind: s.kind, fields });
  }
  return result;
}

// 영역(기본정보 제외) 상세의 "가로 하위 탭" 한 개.
export type DomainSubTab = { id: string; label: string; kind: "history" | "section" | "detail" | "files" };

// 풍부한(특수) 묶음 — 칸이 없어도 항상 탭으로 노출해야 한다.
const RICH_SECTION_KINDS = new Set(["meetings", "settlement", "tiered-contract", "tiered-refund", "contract", "refund"]);

// 자기영역 하위 탭 정렬 순서 — domain-config 의 OWN_KIND_ORDER 와 동일.
const OWN_KIND_ORDER: Record<string, number> = {
  meetings: 1, "tiered-contract": 2, contract: 2, settlement: 3, "tiered-refund": 4, refund: 4,
};

/**
 * 영역 탭(기본정보 제외)을 눌렀을 때 가로로 늘어놓을 하위 탭 목록을 만든다.
 *  - 항상 맨 앞에 "히스토리" 탭.
 *  - 자기영역: 묶음들을 탭으로(풍부한 묶음은 항상, 일반 묶음은 칸이 있을 때만). 맨 뒤에 "파일".
 *  - 다른 영역(읽기전용): "세부정보" 탭 하나.
 */
export function buildDomainSubTabs(
  isOwnDomain: boolean,
  nonBasicSections: { id: string; label: string; kind?: string; fields: unknown[] }[],
  editMode: boolean,
  showOtherSection = false,
): DomainSubTab[] {
  const tabs: DomainSubTab[] = [{ id: "__history__", label: "히스토리", kind: "history" }];
  const norm = (l?: string) => (l || "").replace(/\s+/g, "");
  const ordered = [...nonBasicSections].sort(
    (a, b) => (OWN_KIND_ORDER[a.kind || ""] ?? 50) - (OWN_KIND_ORDER[b.kind || ""] ?? 50),
  );
  for (const s of ordered) {
    const ln = norm(s.label);
    if (s.id === "basic" || ln === "기본정보") continue;
    if (s.kind === "files" || ln === "파일") continue;
    if ((s.id === "other" || ln === "기타") && (!showOtherSection || !isOwnDomain)) continue;
    const isRich = RICH_SECTION_KINDS.has(s.kind || "");
    if (isRich || editMode || s.fields.length > 0) {
      tabs.push({ id: s.id, label: s.label, kind: "section" });
    }
  }
  tabs.push({ id: "__files__", label: "파일", kind: "files" });
  return tabs;
}

// ─── 기본정보 묶음 표준 사양 ───
export type BasicFieldSpec = {
  label: string;
  keys: string[];
  labelAliases?: string[];
  type: ColumnDef["type"];
  format?: ColumnLite["format"];
};

// ERP 전용 기본칸 — 하이브의 HIVE_APP_BASIC_FIELDS 와 같은 자리. 다른 앱엔 없는 ERP만의 상세창 기본정보 칸.
export const ERP_APP_BASIC_FIELDS: BasicFieldSpec[] = [
  { label: "영업 담당", keys: ["영업담당"], type: "select" },
];

// 칸 이름 변경 후유증 보정: "내부 DB 분류"의 옛 별칭(라벨 "DB 분류")이, 이름이 바뀐 '59DB담당'
// (현재 라벨 "DB 분류")을 잘못 가리킨다. 표 표시 보정(fillCommonKeys)이 59DB담당을 하이브 값으로 채우면
// 상세창의 "내부 DB 분류"가 그 채워진 값을 잡아 '담당사' 칸(숨김 대상)으로 연결돼 화면에서 사라졌다.
// → ERP에선 그 별칭만 비워, 정식 키(54DB분류)로 바르게 연결한다. (fillCommonKeys 는 keys 만 쓰므로 표 영향 없음.)
const ERP_COMMON_BASIC_FIELD_SPECS: BasicFieldSpec[] = COMMON_BASIC_FIELD_SPECS.map((s) =>
  s.label === "내부 DB 분류" ? { ...s, labelAliases: [] } : s,
);

// ERP 기본정보 칸 사양 — 공통 10개 + ERP 전용 칸(영업 담당). 상세창 기본정보·공통/앱별 설정에 함께 반영.
export const BASIC_FIELD_SPECS: BasicFieldSpec[] = [...ERP_COMMON_BASIC_FIELD_SPECS, ...ERP_APP_BASIC_FIELDS];

/**
 * 표준 사양으로 "기본정보" 묶음 한 개를 만든다.
 * 각 칸은 columns(정의) 또는 row(데이터)에 실제 존재하는 첫 후보키로 연결.
 */
export function buildBasicSection(
  specs: BasicFieldSpec[],
  allColumns: ColumnLite[],
  row: Record<string, unknown> | null,
): UnifiedSection {
  const colByKey = new Map(allColumns.map((c) => [c.key, c]));
  const rowKeys = new Set(row ? Object.keys(row) : []);
  const norm = (s?: string) => (s || "").replace(/\s+/g, "").toLowerCase();
  const hasVal = (k: string) => {
    const v = row ? row[k] : undefined;
    return v !== undefined && v !== null && String(v).trim() !== "" && !(Array.isArray(v) && v.length === 0);
  };
  const fields: ColumnLite[] = [];
  const seen = new Set<string>();
  for (const spec of specs) {
    const candidates: string[] = [...spec.keys];
    if (spec.labelAliases && spec.labelAliases.length) {
      const wanted = new Set(spec.labelAliases.map(norm));
      for (const c of allColumns) {
        if (c.label && wanted.has(norm(c.label)) && !candidates.includes(c.key)) candidates.push(c.key);
      }
    }
    let key = candidates.find(hasVal);
    if (!key) key = candidates.find((k) => colByKey.has(k) || rowKeys.has(k));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const def = colByKey.get(key);
    fields.push({
      key,
      label: spec.label,
      type: def?.type ?? spec.type,
      format: def?.format ?? spec.format,
    });
  }
  return { id: "basic", label: "기본정보", kind: "fields", fields };
}

/**
 * 기본정보 묶음에 팀장/팀원이 빠져 있으면 컬럼 라벨로 찾아 뒤에 보충한다.
 */
export function ensureBasicTeamFields(section: UnifiedSection, allColumns: ColumnLite[]): UnifiedSection {
  const norm = (s?: string) => (s || "").replace(/\s+/g, "").toLowerCase();
  const present = new Set(section.fields.map((f) => norm(f.label)));
  const haveKey = new Set(section.fields.map((f) => f.key));
  const want: { label: string; aliases: string[]; type: ColumnDef["type"] }[] = [
    { label: "팀장", aliases: ["팀장", "담당팀장", "담당사무장"], type: "person" },
    { label: "팀원", aliases: ["팀원", "담당팀원"], type: "person" },
  ];
  const extra: ColumnLite[] = [];
  for (const w of want) {
    if (present.has(norm(w.label))) continue;
    const wanted = new Set(w.aliases.map(norm));
    const col = allColumns.find((c) => wanted.has(norm(c.label)) && !haveKey.has(c.key));
    if (col) extra.push({ key: col.key, label: w.label, type: col.type ?? w.type, format: col.format });
  }
  return extra.length ? { ...section, fields: [...section.fields, ...extra] } : section;
}

/**
 * 기본정보 묶음에 리포트(파일) 칸이 빠져 있으면 보충한다.
 * 라벨 '리포트' 로 두면 Phase 2 렌더러가 그 칸에 첨부파일 전체(_files)를 보여줌.
 */
export function ensureBasicReportField(section: UnifiedSection, allColumns: ColumnLite[]): UnifiedSection {
  if (section.fields.some((f) => f.type === "file")) return section;
  const norm = (s?: string) => (s || "").replace(/\s+/g, "").toLowerCase();
  const wanted = new Set(["리포트", "검토보고서"].map(norm));
  const col =
    allColumns.find((c) => c.type === "file" && (wanted.has(norm(c.label)) || c.key === "검토보고서" || c.key === "리포트")) ||
    allColumns.find((c) => c.type === "file");
  if (!col) return section;
  const extra: ColumnLite = { key: col.key, label: "리포트", type: "file", format: col.format };
  return { ...section, fields: [...section.fields, extra] };
}
