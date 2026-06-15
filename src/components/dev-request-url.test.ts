import { describe, it, expect } from "vitest";
import { buildDevRequestUrl } from "./dev-request-url";

const BASE = "https://wedly-dev-request-production.up.railway.app";

// 받는 쪽(별도 앱)은 searchParams.get() 으로 읽으므로, 동일하게 파싱해 값을 복원·검증한다.
function query(url: string): URLSearchParams {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

describe("buildDevRequestUrl — 기능요청 별도 앱 URL 조립", () => {
  it("app·requester·page·sourceUrl 을 받는 쪽이 원래 값 그대로 복원할 수 있게 담는다", () => {
    const url = buildDevRequestUrl({
      base: BASE,
      app: "wedly-erp",
      requester: "이상민",
      page: "통합 협업(시험) — 경정청구 · 전체",
      sourceUrl: "https://erp.wedly.kr/unified-collab",
    });
    expect(url.startsWith(BASE + "?")).toBe(true);
    const q = query(url);
    expect(q.get("app")).toBe("wedly-erp");
    expect(q.get("requester")).toBe("이상민");
    expect(q.get("page")).toBe("통합 협업(시험) — 경정청구 · 전체");
    expect(q.get("sourceUrl")).toBe("https://erp.wedly.kr/unified-collab");
  });

  it("sourceUrl 이 비면 sourceUrl 키를 넣지 않는다", () => {
    const url = buildDevRequestUrl({ base: BASE, app: "wedly-erp", requester: "", page: "정책자금", sourceUrl: "" });
    const q = query(url);
    expect(q.get("page")).toBe("정책자금");
    expect(q.has("sourceUrl")).toBe(false);
  });

  it("requester/page 빈 값도 안전하게 처리(키는 존재, 값은 빈 문자열)", () => {
    const url = buildDevRequestUrl({ base: BASE, app: "wedly-hive-collab", requester: "", page: "", sourceUrl: "" });
    const q = query(url);
    expect(q.get("app")).toBe("wedly-hive-collab");
    expect(q.get("requester")).toBe("");
    expect(q.get("page")).toBe("");
  });
});
