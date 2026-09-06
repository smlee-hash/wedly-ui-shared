import { describe, it, expect } from "vitest";
import {
  computeUnifiedSections,
  buildDomainSubTabs,
  buildBasicSection,
  COMMON_BASIC_FIELD_SPECS,
  HIVE_APP_BASIC_FIELDS,
  BASIC_FIELD_SPECS,
  type BasicFieldSpec,
  type ColumnLite,
  isCommonBasicLabel,
  DEFAULT_COMMON_BASIC_LABELS,
  ILLUA_APP_BASIC_FIELDS,
  isBasicColumnHidden,
} from "./sections";

// ── isCommonBasicLabel: 공통/앱별 판정 (색 구분·공유 트리거 단일 출처) ──
describe("isCommonBasicLabel — 공통/앱별 판정", () => {
  it("기본 공통 라벨은 공통(true)", () => {
    expect(isCommonBasicLabel("환급금여부")).toBe(true);
    expect(isCommonBasicLabel("이메일")).toBe(true);
    expect(isCommonBasicLabel("리포트")).toBe(true);
  });
  it("공백·대소문자 무시 매칭", () => {
    expect(isCommonBasicLabel("DB 분류")).toBe(true);
    expect(isCommonBasicLabel("내부db분류")).toBe(true);
    expect(isCommonBasicLabel(" 대표자명 ")).toBe(true);
  });
  it("앱별(일루아 전용·하이브 전용) 칸은 false", () => {
    expect(isCommonBasicLabel("주업종")).toBe(false);
    expect(isCommonBasicLabel("팀장")).toBe(false);
    expect(ILLUA_APP_BASIC_FIELDS.every((f) => isCommonBasicLabel(f.label))).toBe(false);
  });
  it("빈 라벨은 false", () => {
    expect(isCommonBasicLabel("")).toBe(false);
    expect(isCommonBasicLabel("   ")).toBe(false);
  });
  it("override.extra 는 공통으로 추가", () => {
    expect(isCommonBasicLabel("주업종", { extra: ["주업종"] })).toBe(true);
  });
  it("override.excluded 는 기본 공통이라도 앱별로 내림", () => {
    expect(isCommonBasicLabel("연락처", { excluded: ["연락처"] })).toBe(false);
  });
  it("기본 공통 라벨은 12개", () => {
    expect(DEFAULT_COMMON_BASIC_LABELS.length).toBe(12);
  });
});

// ── computeUnifiedSections: 시스템/컨테이너 키 제외 (하이브 원본 3건 이전) ──
describe("computeUnifiedSections — 시스템키 제외", () => {
  const cols = [
    { key: "02상호명", label: "상호명", type: "text" },
    { key: "_createdTime", label: "등록일시", type: "last_edited_time" },
  ] as never;

  it("명시 배치된 _createdTime 은 '일반 칸'으로는 안 나온다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명", "_createdTime"] }],
      {}, [], cols, { "02상호명": "A", _createdTime: "2026-06-01" },
    );
    expect(secs.find((s) => s.id === "basic")?.fields.map((f) => f.key)).not.toContain("_createdTime");
  });

  it("내부 컨테이너 키(정산정보)는 명시 배치돼도 계속 제외된다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명", "정산정보"] }],
      {}, [], cols, { "02상호명": "A" },
    );
    expect(secs.find((s) => s.id === "basic")?.fields.map((f) => f.key)).not.toContain("정산정보");
  });

  it("_createdTime 은 '기타'로 자동수집되지 않는다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명"] }],
      {}, [], cols, { "02상호명": "A", _createdTime: "2026-06-01" },
    );
    expect(secs.find((s) => s.id === "other")?.fields.map((f) => f.key) ?? []).not.toContain("_createdTime");
  });
});

// ── buildDomainSubTabs: 하위 탭 구성 (신규 확장) ──
describe("buildDomainSubTabs", () => {
  it("항상 히스토리로 시작하고 파일로 끝난다", () => {
    const tabs = buildDomainSubTabs(true, [], false);
    expect(tabs[0].id).toBe("__history__");
    expect(tabs[tabs.length - 1].id).toBe("__files__");
  });

  it("풍부한 묶음(정산)은 칸이 없어도 탭으로 노출된다", () => {
    const tabs = buildDomainSubTabs(true, [{ id: "set", label: "정산정보", kind: "settlement", fields: [] }], false);
    expect(tabs.map((t) => t.id)).toContain("set");
  });

  it("빈 일반 묶음은 편집모드가 아니면 숨기고, 편집모드면 보인다", () => {
    const plain = [{ id: "memo", label: "메모", kind: "fields", fields: [] }];
    expect(buildDomainSubTabs(true, plain, false).map((t) => t.id)).not.toContain("memo");
    expect(buildDomainSubTabs(true, plain, true).map((t) => t.id)).toContain("memo");
  });

  it("'기타'는 showOtherSection 과 자기영역일 때만 보인다", () => {
    const other = [{ id: "other", label: "기타", kind: "fields", fields: [{ key: "x", label: "x" }] }];
    expect(buildDomainSubTabs(true, other, false, false).map((t) => t.id)).not.toContain("other");
    expect(buildDomainSubTabs(true, other, false, true).map((t) => t.id)).toContain("other");
    expect(buildDomainSubTabs(false, other, false, true).map((t) => t.id)).not.toContain("other");
  });
});

// ── COMMON_BASIC_FIELD_SPECS / HIVE_APP_BASIC_FIELDS / BASIC_FIELD_SPECS ──
describe("기본정보 사양 분리", () => {
  it("COMMON_BASIC_FIELD_SPECS 는 12개다", () => {
    expect(COMMON_BASIC_FIELD_SPECS).toHaveLength(12);
  });

  it("COMMON_BASIC_FIELD_SPECS 에 환급금여부가 포함된다", () => {
    expect(COMMON_BASIC_FIELD_SPECS.map((s) => s.label)).toContain("환급금여부");
  });

  it("누가담당 칸(새 이름 'DB 분류') 후보키는 하이브키 우선 + 59DB담당(일루아 18파트너사는 파트너사 칸이라 제외)", () => {
    const spec = COMMON_BASIC_FIELD_SPECS.find((s) => s.label === "DB 분류");
    expect(spec?.keys).toEqual(["custom_1779774393414_b1wc", "59DB담당"]);
    expect(spec?.keys).not.toContain("18파트너사");
  });

  it("COMMON_BASIC_FIELD_SPECS 에 진행상태가 포함된다 (NO.56 — 3앱 공통·값 공유)", () => {
    expect(COMMON_BASIC_FIELD_SPECS.map((s) => s.label)).toContain("진행상태");
  });

  it("HIVE_APP_BASIC_FIELDS 는 2개(팀장·팀원)다", () => {
    expect(HIVE_APP_BASIC_FIELDS).toHaveLength(2);
    const labels = HIVE_APP_BASIC_FIELDS.map((s) => s.label);
    expect(labels).toContain("팀장");
    expect(labels).toContain("팀원");
  });

  it("BASIC_FIELD_SPECS 는 COMMON 12개 + HIVE 2개 = 14개다", () => {
    expect(BASIC_FIELD_SPECS).toHaveLength(14);
  });

  it("BASIC_FIELD_SPECS 는 COMMON 뒤에 HIVE 가 붙은 순서다", () => {
    const labels = BASIC_FIELD_SPECS.map((s) => s.label);
    const commonLabels = COMMON_BASIC_FIELD_SPECS.map((s) => s.label);
    const hiveLabels = HIVE_APP_BASIC_FIELDS.map((s) => s.label);
    expect(labels.slice(0, 12)).toEqual(commonLabels);
    expect(labels.slice(12)).toEqual(hiveLabels);
  });

  it("환급금여부 키가 하이브키 우선 + 공용키이고 type 이 select 다", () => {
    const spec = COMMON_BASIC_FIELD_SPECS.find((s) => s.label === "환급금여부");
    expect(spec?.keys).toEqual(["custom_1780316171826", "환급금여부"]);
    expect(spec?.type).toBe("select");
  });

  it("이메일 후보키는 신청자이메일까지 포함한다 (정부지원금·노무지원금 통합 DB 키, 2026-09-06)", () => {
    const spec = COMMON_BASIC_FIELD_SPECS.find((s) => s.label === "이메일");
    expect(spec?.keys).toEqual(["53이메일", "이메일", "신청자이메일"]);
    expect(spec?.type).toBe("email");
  });
});

// ── buildBasicSection: 기본정보 표준 묶음 (신규 확장) ──
describe("buildBasicSection", () => {
  const cols: ColumnLite[] = [
    { key: "03대표자명", label: "대표", type: "text" },
    { key: "15사업자번호", label: "사업자번호", type: "text" },
  ];
  const specs: BasicFieldSpec[] = [
    { label: "대표자명", keys: ["03대표자명", "대표자명"], type: "text" },
    { label: "사업자번호", keys: ["15사업자번호", "사업자번호"], type: "text" },
    { label: "없는칸", keys: ["zzz없는키"], type: "text" },
  ];

  it("후보 키 중 실제 있는 첫 키로 연결하고 표준 라벨을 쓴다", () => {
    const sec = buildBasicSection(specs, cols, { "03대표자명": "홍길동" });
    const rep = sec.fields.find((f) => f.key === "03대표자명");
    expect(rep?.label).toBe("대표자명");          // 라벨은 표준 라벨로 통일
    expect(sec.id).toBe("basic");
  });

  it("어느 후보 키도 없으면 그 칸은 건너뛴다", () => {
    const sec = buildBasicSection(specs, cols, {});
    expect(sec.fields.map((f) => f.label)).not.toContain("없는칸");
  });
});

import { resolveCommonFieldId } from "./sections";

describe("resolveCommonFieldId — override 반영 공유판정", () => {
  it("기본 공통칸: 키가 공통 spec 키면 그 라벨 반환", () => {
    expect(resolveCommonFieldId("53이메일", "이메일")).toBe("이메일");
    expect(resolveCommonFieldId("03대표자명", "대표자명")).toBe("대표자명");
  });
  it("앱별칸: 기본+override 없으면 null", () => {
    expect(resolveCommonFieldId("25주업종", "주업종")).toBe(null);
  });
  it("내림(excluded): 기본 공통칸을 앱별로 내리면 null", () => {
    expect(resolveCommonFieldId("53이메일", "이메일", { excluded: ["이메일"] })).toBe(null);
  });
  it("올림(extra): 앱별칸을 공통으로 올리면 라벨 반환", () => {
    expect(resolveCommonFieldId("25주업종", "주업종", { extra: ["주업종"] })).toBe("주업종");
  });
  it("라벨 매칭은 공백·대소문자 무시", () => {
    expect(resolveCommonFieldId("25주업종", "주업종", { extra: [" 주 업 종 "] })).toBe("주업종");
    expect(resolveCommonFieldId("53이메일", "이메일", { excluded: [" 이메일 "] })).toBe(null);
  });
  it("이름표로 매칭된 키(표준 키 아님)라도 라벨이 공통이면 공유 + 정규 라벨 통일", () => {
    expect(resolveCommonFieldId("custom_db_class_x9", "내부 DB 분류")).toBe("내부 DB 분류");
    expect(resolveCommonFieldId("custom_db_class_x9", "내부db분류")).toBe("내부 DB 분류");
    expect(resolveCommonFieldId("custom_db_class_x9", "내부 DB 분류", { excluded: ["내부 DB 분류"] })).toBe(null);
  });
});

describe("isBasicColumnHidden (앱별 숨김 판정)", () => {
  it("숨김 목록에 있으면 true", () => {
    expect(isBasicColumnHidden("연락처", ["연락처"])).toBe(true);
  });
  it("공백·대소문자 무시 매칭", () => {
    expect(isBasicColumnHidden(" 연락처 ", ["연락처"])).toBe(true);
  });
  it("숨김 목록에 없으면 false", () => {
    expect(isBasicColumnHidden("대표자명", ["연락처"])).toBe(false);
  });
  it("상호명은 목록에 있어도 항상 보임(보호)", () => {
    expect(isBasicColumnHidden("상호명", ["상호명"])).toBe(false);
  });
  it("빈 라벨·빈 목록은 숨김 아님", () => {
    expect(isBasicColumnHidden("", ["연락처"])).toBe(false);
    expect(isBasicColumnHidden("연락처", [])).toBe(false);
  });
});
