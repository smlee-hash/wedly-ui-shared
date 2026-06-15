import { describe, it, expect } from "vitest";
import {
  TAX_AMENDMENT_COLLAB_VISIBLE,
  TAX_AMENDMENT_EXTRA_COLUMNS,
  TAX_AMENDMENT_COLLAB_COLORS,
} from "./tax-amendment-collab-view";

// deriveRefundFlag 는 2026-06-08 제거됨 — 하이브 손입력(O/X)이 본체가 됐으므로 자동어림 불필요.

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
  it("새 공용 컬럼 2개 — 환급금여부=select, 정부지원금리포트=file", () => {
    const keys = TAX_AMENDMENT_EXTRA_COLUMNS.map((c) => c.key);
    expect(keys).toEqual(["환급금여부", "정부지원금리포트"]);
    const types = Object.fromEntries(TAX_AMENDMENT_EXTRA_COLUMNS.map((c) => [c.key, c.type]));
    expect(types["환급금여부"]).toBe("select");
    expect(types["정부지원금리포트"]).toBe("file");
  });
});
