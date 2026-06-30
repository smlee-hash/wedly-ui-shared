// 상세창 기본정보 "공통 컬럼 관리" 화면이 쓰는 순수 로직.
// 칸 정의(def) 배열을 불변(immutable)으로 추가/삭제/범위변경하고, 표 칸·선택지 입력을 def 로 만든다.
// 저장 위치(공통=basic-fields-common 전역 / 커스텀=ERP columnConfig)는 호출부(UnifiedDetailView)가 정한다.

// 기본정보 칸 1개 정의. 서버(validateBasicColumnDefs)가 받는 형태와 호환:
//   key/label/type 필수, scope 는 저장 위치(공통/커스텀) 표시, options 는 드롭다운 선택지.
export type BasicColDef = {
  key: string;
  label: string;
  type: string;
  scope?: "common" | "custom";
  options?: string[];
};

// 폼에서 고를 수 있는 칸 종류 — 서버 BASIC_COLUMN_TYPES 와 1:1(formula 제외).
// person(사람): 값 선택 시 그 앱 승인 사용자 목록(loadManagers)이 뜬다. 표에서 끌어온 사람 칸도
// 글자로 떨어지지 않고 사람으로 유지된다(colDefFromOwnColumn 이 isAllowedBasicType 로 판정).
export const BASIC_COL_TYPE_CHOICES: { value: string; label: string }[] = [
  { value: "text", label: "글자" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "select", label: "드롭다운(하나 선택)" },
  { value: "multi_select", label: "드롭다운(여러 선택)" },
  { value: "phone_number", label: "연락처" },
  { value: "email", label: "이메일" },
  { value: "file", label: "파일" },
  { value: "person", label: "사람" },
];

const ALLOWED_TYPES = new Set(BASIC_COL_TYPE_CHOICES.map((c) => c.value));

export function isAllowedBasicType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

// 드롭다운(select/multi_select)처럼 선택지가 필요한 종류인지.
export function isChoiceType(type: string): boolean {
  return type === "select" || type === "multi_select";
}

// 선택지 입력(줄바꿈 또는 쉼표로 구분)을 깔끔한 목록으로 — 앞뒤 공백 제거·빈값 제거·중복 제거(표기 유지).
export function parseChoices(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || "").split(/[\n,]/)) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// 이미 쓰인 키와 안 겹치는 칸 키를 만든다. base 가 비었으면 그대로, 겹치면 _2, _3… 접미사.
export function uniqueColKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// def 배열에 추가/교체(같은 key 면 교체). 입력 불변, 새 배열 반환.
export function upsertDef(defs: BasicColDef[], def: BasicColDef): BasicColDef[] {
  const i = defs.findIndex((d) => d.key === def.key);
  if (i < 0) return [...defs, def];
  const next = defs.slice();
  next[i] = def;
  return next;
}

// def 배열에서 key 제거. 입력 불변.
export function removeDef(defs: BasicColDef[], key: string): BasicColDef[] {
  return defs.filter((d) => d.key !== key);
}

// def 의 범위(공통/커스텀) 표시만 바꾼다. 입력 불변.
export function setDefScope(defs: BasicColDef[], key: string, scope: "common" | "custom"): BasicColDef[] {
  return defs.map((d) => (d.key === key ? { ...d, scope } : d));
}

// 표(테이블) 칸 1개를 기본정보 def 로 변환. 종류가 허용 밖이면 글자로 안전 폴백.
export function colDefFromOwnColumn(
  col: { key: string; label: string; type?: string; options?: string[] },
  scope: "common" | "custom",
): BasicColDef {
  const type = col.type && isAllowedBasicType(col.type) ? col.type : "text";
  const def: BasicColDef = { key: col.key, label: col.label, type, scope };
  if (isChoiceType(type) && Array.isArray(col.options) && col.options.length) {
    def.options = parseChoices(col.options.join("\n"));
  }
  return def;
}

// 폼 입력 → def. 선택지가 필요한 종류만 options 를 싣는다(빈 배열은 생략).
export function buildDefFromForm(input: {
  key: string;
  label: string;
  type: string;
  scope: "common" | "custom";
  choicesText?: string;
}): BasicColDef {
  const def: BasicColDef = {
    key: input.key,
    label: input.label.trim(),
    type: isAllowedBasicType(input.type) ? input.type : "text",
    scope: input.scope,
  };
  if (isChoiceType(def.type)) {
    const ch = parseChoices(input.choicesText || "");
    if (ch.length) def.options = ch;
  }
  return def;
}

// 사람(person) 칸은 항상 독립 키(custom_)를 갖게 한다. 표·하이브 유래 칸 키(예: "18계약담당자")를
// 그대로 쓰면 원본 칸과 값이 얽히고(별칭), 상세창의 사람칸 읽기전용 판정(isReadonlyPerson)이
// 'custom_ 아님'으로 잠가버린다. 독립 키를 주면 별도의 빈 칸으로 시작하고 사람 선택 편집이 된다.
// person 이 아니거나 이미 custom_ 키면 그대로 둔다(값 연결 보존). (NO.83 재작업)
export function ensureIndependentPersonKey(def: BasicColDef, taken: Iterable<string>): BasicColDef {
  if (def.type !== "person" || def.key.startsWith("custom_")) return def;
  return { ...def, key: uniqueColKey(`custom_${Date.now()}`, taken) };
}
