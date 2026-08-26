import { describe, it, expect } from "vitest";
import { draftKey, shouldRestoreDraft, isDraftExpired, DRAFT_TTL_MS } from "./history-draft";

describe("draftKey", () => {
  it("패널마다 다른 이름을 쓴다 — 다른 회사 글이 섞이면 안 된다", () => {
    expect(draftKey("1234567890:policy-fund")).not.toBe(draftKey("9999999999:policy-fund"));
  });

  it("이름표가 보관소 이름과 겹치지 않게 앞에 표시가 붙는다", () => {
    expect(draftKey("a")).toMatch(/^wedly-history-draft:/);
  });
});

describe("shouldRestoreDraft", () => {
  it("서버에 없는 글이면 되살린다", () => {
    expect(shouldRestoreDraft("보내려던 글", ["다른 글"])).toBe(true);
  });

  it("★서버에 이미 같은 글이 있으면 버린다 — 떠날 때 보낸 것이 실제로 들어간 경우", () => {
    expect(shouldRestoreDraft("보내려던 글", ["앞선 글", "보내려던 글"])).toBe(false);
  });

  it("앞뒤 공백만 다른 것도 같은 글로 본다", () => {
    expect(shouldRestoreDraft("  보내려던 글\n", ["보내려던 글"])).toBe(false);
  });

  it("빈 글은 되살리지 않는다", () => {
    expect(shouldRestoreDraft("   ", [])).toBe(false);
    expect(shouldRestoreDraft("", [])).toBe(false);
  });

  it("★이미지 줄이 붙은 글도 통째로 대조한다 — 본문만 같고 이미지가 다르면 되살린다", () => {
    const withImg = "메모\n[이미지] https://a/1.png";
    expect(shouldRestoreDraft(withImg, ["메모"])).toBe(true);
    expect(shouldRestoreDraft(withImg, [withImg])).toBe(false);
  });
});

describe("isDraftExpired", () => {
  const t0 = Date.parse("2026-08-26T00:00:00.000Z");

  it("갓 담아 둔 것은 안 지났다", () => {
    expect(isDraftExpired({ text: "a", savedAt: new Date(t0).toISOString() }, t0 + 1000)).toBe(false);
  });

  it("보관 기간을 넘기면 지난 것", () => {
    expect(isDraftExpired({ text: "a", savedAt: new Date(t0).toISOString() }, t0 + DRAFT_TTL_MS + 1)).toBe(true);
  });

  it("시각이 깨진 값이면 지난 것으로 본다(되살려서 엉뚱한 글이 튀어나오지 않게)", () => {
    expect(isDraftExpired({ text: "a", savedAt: "이건 시각이 아님" }, t0)).toBe(true);
  });
});
