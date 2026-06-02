import { describe, it, expect } from "vitest";
import {
  computeUnifiedSections,
  buildDomainSubTabs,
  buildBasicSection,
  type BasicFieldSpec,
  type ColumnLite,
} from "./sections";

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
