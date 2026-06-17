import { describe, it, expect } from "vitest";
import {
  resolveContainerKey,
  parseContainerKey,
  linkSection,
  baseAreaFields,
  AREA_CONTAINER_KEY,
  isLinkArea,
  isLinkMode,
  isReadonlyLink,
} from "./config";

const OWN = "tax-amendment";

describe("resolveContainerKey", () => {
  it("자기분야는 접두어 없는 키", () => {
    expect(resolveContainerKey(OWN, "settlement", OWN)).toBe("정산정보");
    expect(resolveContainerKey(OWN, "contract", OWN)).toBe("계약정보_차수");
    expect(resolveContainerKey(OWN, "refund", OWN)).toBe("환불정보_차수");
  });
  it("다른 섹션은 uc 접두어", () => {
    expect(resolveContainerKey("government-subsidy", "settlement", OWN)).toBe("uc:government-subsidy:정산정보");
    expect(resolveContainerKey("labor-subsidy", "refund", OWN)).toBe("uc:labor-subsidy:환불정보_차수");
  });
});

describe("parseContainerKey (역해석)", () => {
  it("접두어 없는 키 → 자기분야", () => {
    expect(parseContainerKey("정산정보", OWN)).toEqual({ section: OWN, area: "settlement" });
    expect(parseContainerKey("계약정보_차수", OWN)).toEqual({ section: OWN, area: "contract" });
  });
  it("uc 키 → 해당 섹션", () => {
    expect(parseContainerKey("uc:government-subsidy:정산정보", OWN)).toEqual({ section: "government-subsidy", area: "settlement" });
  });
  it("차수 컨테이너가 아니면 null", () => {
    expect(parseContainerKey("20확정수수료", OWN)).toBeNull();
    expect(parseContainerKey("uc:government-subsidy:기타", OWN)).toBeNull();
  });
});

describe("linkSection (옛 연결 승계)", () => {
  it("section 없으면 ownDomain", () => {
    expect(linkSection({ columnKey: "c", area: "settlement", tierFieldKey: "f", mode: "sum" } as any, OWN)).toBe(OWN);
    expect(linkSection({ columnKey: "c", section: "", area: "settlement", tierFieldKey: "f", mode: "sum" }, OWN)).toBe(OWN);
  });
  it("section 있으면 그대로", () => {
    expect(linkSection({ columnKey: "c", section: "labor-subsidy", area: "settlement", tierFieldKey: "f", mode: "sum" }, OWN)).toBe("labor-subsidy");
  });
});

describe("baseAreaFields (빈 섹션 기본 틀: 영역별)", () => {
  it("영역마다 같은 영역 키를 돌려줌(매핑 일관성)", () => {
    expect(baseAreaFields("settlement")).toBe(AREA_CONTAINER_KEY.settlement);
    expect(baseAreaFields("contract")).toBe(AREA_CONTAINER_KEY.contract);
  });
});

describe("형식 가드", () => {
  it("isLinkArea / isLinkMode", () => {
    expect(isLinkArea("settlement")).toBe(true);
    expect(isLinkArea("x")).toBe(false);
    expect(isLinkMode("sum")).toBe(true);
    expect(isLinkMode("y")).toBe(false);
  });
});

describe("isReadonlyLink", () => {
  it("sum 은 읽기전용", () => {
    expect(isReadonlyLink({ columnKey: "c", area: "contract", tierFieldKey: "t", mode: "sum" })).toBe(true);
  });
  it("latest 는 편집 가능", () => {
    expect(isReadonlyLink({ columnKey: "c", area: "contract", tierFieldKey: "t", mode: "latest" })).toBe(false);
  });
  it("readonly 플래그면 latest 라도 읽기전용(자동계산 칸)", () => {
    expect(isReadonlyLink({ columnKey: "c", area: "contract", tierFieldKey: "t", mode: "latest", readonly: true })).toBe(true);
  });
});
