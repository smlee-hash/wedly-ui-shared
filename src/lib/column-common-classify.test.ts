import { describe, it, expect } from "vitest";
import { pickCommonColumns } from "./column-common-classify";
import type { CommonFieldOverride } from "../unified/sections";

describe("pickCommonColumns", () => {
  const override: CommonFieldOverride = { extra: ["영업 담당", "진행상태"], excluded: [] };

  it("리포트 사양 키(검토보고서)는 정식 이름 '리포트'로 공통 처리", () => {
    const r = pickCommonColumns([{ key: "검토보고서", label: "검토보고서" }], override);
    expect(r.commonColumnKeys).toEqual(["검토보고서"]);
    expect(r.commonLabelByKey["검토보고서"]).toBe("리포트");
  });

  it("override.extra 라벨 칸(영업 담당·진행상태)을 공통에 포함", () => {
    const cols = [
      { key: "영업담당", label: "영업 담당" },
      { key: "05진행상태", label: "진행상태" },
    ];
    const r = pickCommonColumns(cols, override);
    expect(new Set(r.commonColumnKeys)).toEqual(new Set(["영업담당", "05진행상태"]));
  });

  it("override 없으면 override.extra 칸은 공통 아님", () => {
    const r = pickCommonColumns([{ key: "영업담당", label: "영업 담당" }], null);
    expect(r.commonColumnKeys).toEqual([]);
  });

  it("excluded 라벨은 제외", () => {
    const ov: CommonFieldOverride = { extra: [], excluded: ["사업자유형"] };
    const r = pickCommonColumns([{ key: "14사업자유형", label: "사업자유형" }], ov);
    expect(r.commonColumnKeys).toEqual([]);
  });

  it("commonBasicFields 라벨 보정: 표 원본 라벨이 달라도 서버 정식 라벨로 판정", () => {
    const ov: CommonFieldOverride = { extra: ["조회 담당자"], excluded: [] };
    const cols = [{ key: "custom_1780658876045", label: "접수 담당자" }];
    const r = pickCommonColumns(cols, ov, [{ key: "custom_1780658876045", label: "조회 담당자" }]);
    expect(r.commonColumnKeys).toEqual(["custom_1780658876045"]);
    expect(r.commonLabelByKey["custom_1780658876045"]).toBe("조회 담당자");
  });

  it("공통 아닌 칸은 빠진다", () => {
    const r = pickCommonColumns([{ key: "즉시환급금", label: "즉시환급금" }], override);
    expect(r.commonColumnKeys).toEqual([]);
    expect(r.commonLabelByKey).toEqual({});
  });
});
