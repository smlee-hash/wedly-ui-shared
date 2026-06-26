import { describe, it, expect } from "vitest";
import { pickHistoryTargetGroup } from "./history-target";

const ORDER = ["tax-amendment", "government-subsidy", "labor-subsidy"];

describe("pickHistoryTargetGroup", () => {
  it("선호 분야에 히스토리 있으면 선호 분야", () => {
    const has = (k: string) => k === "tax-amendment" || k === "labor-subsidy";
    expect(pickHistoryTargetGroup(ORDER, has, "tax-amendment")).toBe("tax-amendment");
  });
  it("선호 분야에 히스토리 없으면 히스토리 있는 첫 분야(순서대로)", () => {
    const has = (k: string) => k === "labor-subsidy";
    expect(pickHistoryTargetGroup(ORDER, has, "tax-amendment")).toBe("labor-subsidy");
  });
  it("일루아: 선호=정부지원금, 정부지원금에 히스토리 있으면 그것", () => {
    const has = (k: string) => k === "government-subsidy";
    expect(pickHistoryTargetGroup(ORDER, has, "government-subsidy")).toBe("government-subsidy");
  });
  it("아무 분야에도 히스토리 없으면 null(폴백은 호출측이 결정)", () => {
    expect(pickHistoryTargetGroup(ORDER, () => false, "tax-amendment")).toBeNull();
  });
  it("선호 미지정이면 히스토리 있는 첫 분야", () => {
    const has = (k: string) => k === "government-subsidy";
    expect(pickHistoryTargetGroup(ORDER, has, undefined)).toBe("government-subsidy");
  });
  it("선호 분야가 목록(visible)에 없으면 무시하고 히스토리 있는 첫 분야", () => {
    const has = (k: string) => k === "labor-subsidy";
    expect(pickHistoryTargetGroup(ORDER, has, "cert")).toBe("labor-subsidy");
  });
  it("forcePreferred: 선호 분야에 히스토리가 없어도 항상 선호 분야를 고른다(일루아 NO.80c)", () => {
    // 경정청구만 히스토리 있고 정부지원금은 없음 — 평소엔 경정청구로 폴백
    const has = (k: string) => k === "tax-amendment";
    // force 없으면(기존·ERP): 경정청구로 폴백
    expect(pickHistoryTargetGroup(ORDER, has, "government-subsidy")).toBe("tax-amendment");
    // force 있으면(일루아): 히스토리 유무와 무관하게 항상 정부지원금
    expect(pickHistoryTargetGroup(ORDER, has, "government-subsidy", true)).toBe("government-subsidy");
  });
  it("forcePreferred 라도 선호 분야가 목록에 없으면 폴백한다(안전망)", () => {
    const has = (k: string) => k === "tax-amendment";
    expect(pickHistoryTargetGroup(ORDER, has, "no-such-group", true)).toBe("tax-amendment");
  });
});
