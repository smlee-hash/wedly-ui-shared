import { describe, it, expect } from "vitest";
import { fieldSelectOptions, GROUP_VALUE_PREFIX, type TabFieldDef } from "./tab-field-options";

const plain: TabFieldDef[] = [
  { key: "등록일시", label: "등록일시", type: "date" },
  { key: "대표자명", label: "대표자명", type: "text" },
];

const grouped: TabFieldDef[] = [
  { key: "등록일시", label: "등록일시", type: "date", group: "기본 칸" },
  { key: "대표자명", label: "대표자명", type: "text", group: "기본 칸" },
  { key: "tier:government-subsidy:계약:컨설팅담당", label: "컨설팅 담당", type: "select", group: "정부지원금 · 계약정보" },
  { key: "tier:government-subsidy:계약:계약일", label: "계약일", type: "date", group: "정부지원금 · 계약정보" },
  { key: "tier:tax-amendment:정산:인용확인일", label: "인용확인일", type: "date", group: "경정청구 · 정산정보" },
];

describe("fieldSelectOptions", () => {
  it("묶음 이름이 하나도 없으면 예전과 똑같은 평면 목록", () => {
    expect(fieldSelectOptions(plain)).toEqual([
      { value: "", label: "항목 선택…" },
      { value: "등록일시", label: "등록일시" },
      { value: "대표자명", label: "대표자명" },
    ]);
  });

  it("항목이 하나도 없어도 맨 앞 안내 줄은 남는다", () => {
    expect(fieldSelectOptions([])).toEqual([{ value: "", label: "항목 선택…" }]);
  });

  it("묶음이 바뀔 때마다 소제목 줄을 끼운다", () => {
    const out = fieldSelectOptions(grouped);
    const headers = out.filter((o) => o.isHeader).map((o) => o.label);
    expect(headers).toEqual(["기본 칸", "정부지원금 · 계약정보", "경정청구 · 정산정보"]);
  });

  it("소제목 줄만 고를 수 없게 표시되고, 실제 항목에는 그 표시가 안 붙는다", () => {
    const out = fieldSelectOptions(grouped);
    const keys = new Set(grouped.map((f) => f.key));
    for (const o of out) {
      // 실제 항목 줄에는 isHeader 가 붙으면 안 된다(붙으면 못 고르게 된다)
      if (keys.has(o.value)) expect(o.isHeader).toBeUndefined();
    }
    expect(out.filter((o) => o.isHeader).length).toBe(3);
    // 고를 수 있는 줄의 개수 = 안내 줄 1 + 항목 5
    expect(out.filter((o) => !o.isHeader).length).toBe(6);
  });

  it("고를 수 있는 줄의 차례와 이름표가 그대로 유지된다", () => {
    const pick = fieldSelectOptions(grouped).filter((o) => !o.isHeader);
    expect(pick).toEqual([
      { value: "", label: "항목 선택…" },
      { value: "등록일시", label: "등록일시" },
      { value: "대표자명", label: "대표자명" },
      { value: "tier:government-subsidy:계약:컨설팅담당", label: "컨설팅 담당" },
      { value: "tier:government-subsidy:계약:계약일", label: "계약일" },
      { value: "tier:tax-amendment:정산:인용확인일", label: "인용확인일" },
    ]);
  });

  it("소제목 줄의 이름표 값은 서로 겹치지 않고 실제 항목과도 안 겹친다", () => {
    const out = fieldSelectOptions([
      { key: "a", label: "가", type: "text", group: "묶음" },
      { key: "b", label: "나", type: "text", group: "다른 묶음" },
      { key: "c", label: "다", type: "text", group: "묶음" }, // 같은 이름이 다시 나옴
    ]);
    const values = out.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(out.filter((o) => o.isHeader).length).toBe(3);
    for (const h of out.filter((o) => o.isHeader)) {
      expect(h.value.startsWith(GROUP_VALUE_PREFIX)).toBe(true);
    }
  });

  it("묶음 이름이 빈 글자면 소제목을 안 만든다", () => {
    const out = fieldSelectOptions([
      { key: "a", label: "가", type: "text" },
      { key: "b", label: "나", type: "text", group: "묶음" },
    ]);
    expect(out.filter((o) => o.isHeader).map((o) => o.label)).toEqual(["묶음"]);
  });
});
