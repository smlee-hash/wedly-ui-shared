import { describe, it, expect } from "vitest";
import {
  deriveRefundFlag,
  TAX_AMENDMENT_COLLAB_VISIBLE,
  TAX_AMENDMENT_EXTRA_COLUMNS,
} from "./tax-amendment-collab-view";

describe("deriveRefundFlag — 총환급금 → 있음/없음", () => {
  it("총환급금이 양수면 '있음'", () => {
    expect(deriveRefundFlag({ "10총환급금": 1500000 })).toBe("있음");
  });
  it("0·빈값·없음은 '없음'", () => {
    expect(deriveRefundFlag({ "10총환급금": 0 })).toBe("없음");
    expect(deriveRefundFlag({ "10총환급금": "" })).toBe("없음");
    expect(deriveRefundFlag({})).toBe("없음");
  });
  it("콤마·원 같은 글자가 섞인 금액도 숫자로 해석", () => {
    expect(deriveRefundFlag({ "10총환급금": "1,200,000원" })).toBe("있음");
    expect(deriveRefundFlag({ "10총환급금": "0" })).toBe("없음");
  });
});

describe("경정청구 협업 뷰 프리셋", () => {
  it("하이브 순서(팀장·팀원 제외) 8개 컬럼", () => {
    expect(TAX_AMENDMENT_COLLAB_VISIBLE).toEqual([
      "_createdTime",
      "54DB분류",
      "02상호명",
      "환급금여부",
      "정부지원금리포트",
      "05경정계약진행상태",
      "03대표자명",
      "04연락처",
    ]);
  });
  it("새 공용 컬럼 2개가 select 형식", () => {
    const keys = TAX_AMENDMENT_EXTRA_COLUMNS.map((c) => c.key);
    expect(keys).toEqual(["환급금여부", "정부지원금리포트"]);
    expect(TAX_AMENDMENT_EXTRA_COLUMNS.every((c) => c.type === "select")).toBe(true);
  });
});
