// 통합 보기(고객 360) 상세창의 "묶음(섹션)별 컬럼" 계산 — 순수 함수(읽기 전용 로직).
//
// 편집창(DetailModal)과 "같은 설정"을 공유한다:
//   - detailSections   : 어느 묶음에 어떤 칸이 기본 배치되는지 (ERP tax-amendment-shared-config 미러)
//   - sectionMapping   : 어드민이 명시적으로 옮긴 (컬럼키 → 묶음id) — 기본 배치를 덮어씀
//   - hiddenColumns    : 어드민이 숨긴 컬럼 (모든 묶음에서 제외)
//   - allColumns       : 표 컬럼 정의 (COLUMNS + 사용자 추가 컬럼) — 라벨/형식 출처
//   - row              : 한 업체 데이터 — 정의에 없지만 값이 있는 칸을 "기타"로 흡수하기 위함
//
// 편집창의 effectiveSections 와 동일한 의도(매핑 덮어쓰기 + 미배치 칸은 "기타"로) 를 따르되,
// 차수 카드·정산 카드 같은 편집창 전용 표시 모드는 빼고 모든 묶음을 "평면 칸 목록"으로 단순화한다.
// (통합 보기는 읽기 중심 + 칸 구성 편집 화면이므로 단순 표시가 적합)

import type { ColumnDef } from "../types/columns";

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
};

export type UnifiedSection = {
  id: string;
  label: string;
  kind?: string;        // "fields"(기본) | "settlement" | "files" | "meetings" — 이동 대상 제외 판정에 사용
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
 * @returns 묶음 배열(빈 묶음도 포함 — 화면에서 편집모드일 때만 보이도록 거를 수 있음). "기타"는 항상 마지막 근처.
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

  // 계약정보/환불정보가 일반 fields 모드면 차수 카드(tiered) 모드로 변환 — 상세창(DetailModal)의
  // effectiveSections 정규화와 동일. 상세창은 이 변환을 컴포넌트 안에서만 하므로, 통합 보기도 같은
  // 변환을 해야 자기영역 계약·환불이 "평면 칸"이 아니라 "수수료 카드 + 차수"로 보인다(라벨 공백 무시 매칭).
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
  //    (숨김 여부는 여기서 안 따지고 마지막 3단계에서 한 번에 걸러냄 — 기존 편집창과 동일한 순서)
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
      if (seenGlobal.has(k)) continue;     // 한 칸이 두 묶음에 중복 노출되지 않게
      if (hidden.has(k)) continue;
      if (SYSTEM_KEYS.has(k)) continue;
      const def = colMap.get(k);
      if (!def) continue;                  // 표/데이터에 없는 키(이 영역과 무관) 는 건너뜀
      fields.push(def);
      seenGlobal.add(k);
    }
    result.push({ id: s.id, label: s.label, kind: s.kind, fields });
  }
  return result;
}

// 영역(기본정보 제외) 상세의 "가로 하위 탭" 한 개를 나타내는 타입.
export type DomainSubTab = { id: string; label: string; kind: "history" | "section" | "detail" | "files" };

// 풍부한(특수) 묶음 종류 — 칸이 없어도(데이터가 _meetings·정산정보 등 특수 키에 들어있어 일반 칸으로 안 잡힘)
// 항상 탭으로 노출해야 한다. 그래야 미팅·계약·정산·환불 탭이 사라지지 않는다.
const RICH_SECTION_KINDS = new Set(["meetings", "settlement", "tiered-contract", "tiered-refund", "contract", "refund"]);
// 자기영역 하위 탭 표시 순서: 미팅 → 계약 → 정산 → 환불 → (그 외 묶음). 히스토리(맨앞)·파일(맨뒤)은 따로 붙임.
const OWN_KIND_ORDER: Record<string, number> = {
  meetings: 1, "tiered-contract": 2, contract: 2, settlement: 3, "tiered-refund": 4, refund: 4,
};

/**
 * 영역 탭(기본정보 제외)을 눌렀을 때 그 아래에 가로로 늘어놓을 하위 탭 목록을 만든다.
 *  - 항상 맨 앞에 "히스토리" 탭(기록).
 *  - 자기영역(편집 가능): 묶음(섹션)들을 탭으로. 풍부한 묶음(미팅·계약·정산·환불)은 칸이 없어도 항상,
 *    일반 묶음은 편집모드이거나 칸이 있을 때만 노출(빈 탭 방지). 맨 뒤에 "파일" 탭을 항상 붙인다.
 *  - 그 외 영역(읽기전용): "세부정보" 탭 하나(평평한 값 표).
 */
export function buildDomainSubTabs(
  isOwnDomain: boolean,
  nonBasicSections: { id: string; label: string; kind?: string; fields: unknown[] }[],
  editMode: boolean,
  showOtherSection = false,
): DomainSubTab[] {
  const tabs: DomainSubTab[] = [{ id: "__history__", label: "히스토리", kind: "history" }];
  // 자기영역·다른 영역 모두 같은 구성(미팅·계약·정산·환불·파일)으로 — 다른 영역은 호출부에서 '보기 전용'으로 렌더.
  // 다른 영역은 editMode=false 로 들어오므로, 빈 일반 묶음은 안 뜨고 풍부한 묶음(미팅/계약/정산/환불)·값이 있는 묶음만 보인다.
  const norm = (l?: string) => (l || "").replace(/\s+/g, "");
  const ordered = [...nonBasicSections].sort(
    (a, b) => (OWN_KIND_ORDER[a.kind || ""] ?? 50) - (OWN_KIND_ORDER[b.kind || ""] ?? 50),
  );
  for (const s of ordered) {
    const ln = norm(s.label);
    // 기본정보는 윗줄 별도 탭 → 하위 탭에서 제외
    if (s.id === "basic" || ln === "기본정보") continue;
    // 파일은 맨 뒤 "파일 업로드" 전용 탭(__files__) 하나만 → 설정에서 온 파일 묶음은 중복이라 제외
    if (s.kind === "files" || ln === "파일") continue;
    // "기타"는 자기영역에서 '기타 섹션 노출'을 켰을 때만 — 다른 영역(읽기전용)은 항상 숨김
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
// 통합 보기 "기본정보" 탭에 보일 표준 칸 + 종류. ERP 설정에 아직 "basic" 묶음이 없을 때
// 이 사양으로 만들어 채운다(편집창의 하드코딩 기본 묶음과 짝 맞춤). 각 칸은 후보 키 중
// 실제 존재하는(컬럼 정의 또는 데이터에 있는) 첫 키로 연결한다 — 앱·배포별 키 차이 흡수.
export type BasicFieldSpec = {
  label: string;                 // 화면에 보일 라벨(팀장/팀원 색칩 인식이 라벨 기준이라 중요)
  keys: string[];                // 후보 컬럼 키(앞에서부터 실제 존재하는 것 선택)
  labelAliases?: string[];       // 후보 키로 못 찾을 때, 이 이름표(라벨)를 가진 컬럼을 찾는다(키가 자동생성형일 때)
  type: ColumnDef["type"];
  format?: ColumnLite["format"];
};

// ─── 공통 11칸 (하이브·ERP·일루아 공유) ───
// 진행상태·팀장·팀원은 앱별로 다르므로 제외. 환급금여부는 공통 신규 추가.
// DB 담당/분류 분리(2026-06-07): 담당=54DB분류(하이브·ERP), 분류=16DB분류(일루아). 16DB분류를 담당 keys에서 떼어 분류로 이동.
// 각 칸은 앞에서부터 "그 앱에 실제 있는" 첫 키로 연결되므로, 같은 표가 여러 앱에서 동작한다.
// 종류(type)는 실제 컬럼 정의가 있으면 그 종류를 쓰고, 데이터에만 있는 키는 아래 type 를 보조로 쓴다.
export const COMMON_BASIC_FIELD_SPECS: BasicFieldSpec[] = [
  { label: "DB 담당",       keys: ["54DB분류"], labelAliases: ["DB담당"], type: "multi_select" },
  { label: "DB 분류",       keys: ["16DB분류", "DB분류", "분류"], labelAliases: ["DB분류", "DB 분류"], type: "select" },
  { label: "대표자명",      keys: ["03대표자명", "02대표자명", "대표자명"],                 type: "text" },
  { label: "연락처",        keys: ["04연락처", "03대표연락처", "대표연락처", "연락처"],       type: "phone_number" },
  { label: "이메일",        keys: ["53이메일", "이메일"],                                type: "email" },
  { label: "사업자번호",     keys: ["15사업자번호", "04사업자번호", "사업자번호"],           type: "text" },
  { label: "사업장주소지",   keys: ["52사업장주소지", "27주소지", "사업장주소지", "주소지", "주소"], type: "text" },
  { label: "사업자유형",     keys: ["14사업자유형", "사업자유형"],                         type: "select" },
  { label: "환급금여부",     keys: ["환급금여부"],                                        type: "select" },
  { label: "리포트",        keys: ["리포트", "검토보고서"],                              type: "file" },
  { label: "등록일시",       keys: ["_createdTime"],                                    type: "last_edited_time" },
];

// ─── 하이브 전용 2칸 ───
// 팀장·팀원은 하이브(경정청구)에서만 쓰는 칸.
export const HIVE_APP_BASIC_FIELDS: BasicFieldSpec[] = [
  { label: "팀장",          keys: ["팀장", "담당 팀장", "담당팀장"],   labelAliases: ["팀장", "담당팀장", "담당사무장"], type: "person" },
  { label: "팀원",          keys: ["팀원", "담당 팀원", "담당팀원"],   labelAliases: ["팀원", "담당팀원"],              type: "person" },
];

// ─── 기존 호환용 통짜 배열 (기존 사용처가 깨지지 않도록 유지) ───
// 구성: 공통 10칸 + 하이브 전용 2칸. 진행상태가 빠지고 환급금여부가 들어간 변화에 주의.
// 기존에 진행상태에 의존하던 곳이 있다면 COMMON_BASIC_FIELD_SPECS 에 직접 추가하거나
// 앱별 specs 배열을 조합해 buildBasicSection 에 넘기는 방식을 쓴다.
export const BASIC_FIELD_SPECS: BasicFieldSpec[] = [
  ...COMMON_BASIC_FIELD_SPECS,
  ...HIVE_APP_BASIC_FIELDS,
];

/**
 * 표준 사양(specs)으로 "기본정보" 묶음 한 개를 만든다.
 * 각 칸은 columns(정의) 또는 row(데이터)에 실제 존재하는 첫 후보키로 연결한다(없으면 그 칸은 건너뜀).
 * 라벨은 사양의 라벨로 통일한다(팀장/팀원 색칩 인식이 라벨 기준).
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
    // 후보 키 = 사양 키 + (이름표가 같은 컬럼들). 라벨 매칭은 DB분류·팀장처럼 실제 키가 커스텀/자동생성형이라
    // 사양 키와 다를 때 대비(예: 기본컬럼 '54DB분류'는 숨김·빈칸이고, 실제 값은 라벨 'DB분류' 커스텀컬럼에 있음).
    const candidates: string[] = [...spec.keys];
    if (spec.labelAliases && spec.labelAliases.length) {
      const wanted = new Set(spec.labelAliases.map(norm));
      for (const c of allColumns) {
        if (c.label && wanted.has(norm(c.label)) && !candidates.includes(c.key)) candidates.push(c.key);
      }
    }
    // 1순위: 행에 "값이 있는" 후보 → 빈 기본컬럼 대신 실제 값이 든 키를 고른다.
    let key = candidates.find(hasVal);
    // 2순위: 값은 없어도 컬럼/데이터에 존재하는 후보(빈 칸 표시용).
    if (!key) key = candidates.find((k) => colByKey.has(k) || rowKeys.has(k));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const def = colByKey.get(key);
    fields.push({
      key,
      label: spec.label,                 // 라벨은 표준 라벨로 통일
      type: def?.type ?? spec.type,      // 실제 컬럼 종류 우선, 없으면 사양 종류
      format: def?.format ?? spec.format,
    });
  }
  return { id: "basic", label: "기본정보", kind: "fields", fields };
}

/**
 * 기본정보 묶음에 팀장/팀원이 빠져 있으면(ERP 설정 경로 등) 컬럼 이름표(라벨)로 찾아 뒤에 보충한다.
 * 키가 자동생성형(team_leader_…/team_member_…)이라 fieldKeys 목록엔 없지만 라벨은 "팀장"/"팀원"이다.
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
    if (present.has(norm(w.label))) continue;              // 이미 있으면 건너뜀
    const wanted = new Set(w.aliases.map(norm));
    const col = allColumns.find((c) => wanted.has(norm(c.label)) && !haveKey.has(c.key));
    if (col) extra.push({ key: col.key, label: w.label, type: col.type ?? w.type, format: col.format });
  }
  return extra.length ? { ...section, fields: [...section.fields, ...extra] } : section;
}

/**
 * 기본정보 묶음에 '검토보고서(리포트)' 파일 칸이 빠져 있으면(숨김·빈값 등으로 제외돼도) 보충한다.
 * 사용자 요청: 기본정보에서 첨부파일(리포트)을 항상 보이게. 라벨은 '리포트'로 둔다
 * — UnifiedView 가 라벨 '리포트'를 보고 그 칸에 첨부파일 전체(_files)를 보여주기 때문(showAllFiles).
 */
export function ensureBasicReportField(section: UnifiedSection, allColumns: ColumnLite[]): UnifiedSection {
  if (section.fields.some((f) => f.type === "file")) return section; // 이미 파일 칸이 있으면 그대로
  const norm = (s?: string) => (s || "").replace(/\s+/g, "").toLowerCase();
  const wanted = new Set(["리포트", "검토보고서"].map(norm));
  const col =
    allColumns.find((c) => c.type === "file" && (wanted.has(norm(c.label)) || c.key === "검토보고서" || c.key === "리포트")) ||
    allColumns.find((c) => c.type === "file");
  if (!col) return section;
  const extra: ColumnLite = { key: col.key, label: "리포트", type: "file", format: col.format };
  return { ...section, fields: [...section.fields, extra] };
}
