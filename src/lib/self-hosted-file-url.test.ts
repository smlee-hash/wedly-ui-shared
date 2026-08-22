import { describe, it, expect, afterEach, vi } from "vitest";
import { selfHostedFileUrl, selfHostedFileUrlFrom } from "./self-hosted-file-url";

const SELF = "https://erp.wedly.kr";
const HIVE = "https://wedly-hive-collab-production-1dce.up.railway.app";

describe("selfHostedFileUrlFrom — 형제 앱 업로드 주소를 자기 앱 경로로", () => {
  it("erp.wedly.kr 업로드 절대주소 → 상대주소", () => {
    expect(selfHostedFileUrlFrom("https://erp.wedly.kr/api/upload/abc123", HIVE)).toBe(
      "/api/upload/abc123",
    );
  });
  it("wedly-erp-production.up.railway.app 업로드 절대주소 → 상대주소", () => {
    expect(
      selfHostedFileUrlFrom("https://wedly-erp-production.up.railway.app/api/upload/abc123", SELF),
    ).toBe("/api/upload/abc123");
  });
  it("wedly-hive-collab-production-1dce.up.railway.app 업로드 절대주소 → 상대주소", () => {
    expect(
      selfHostedFileUrlFrom(
        "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123",
        SELF,
      ),
    ).toBe("/api/upload/abc123");
  });
  it("wedly-illua-collab-production.up.railway.app 업로드 절대주소 → 상대주소", () => {
    expect(
      selfHostedFileUrlFrom(
        "https://wedly-illua-collab-production.up.railway.app/api/upload/abc123",
        SELF,
      ),
    ).toBe("/api/upload/abc123");
  });

  it("자기 앱 주소면 원본 문자열 그대로 (바뀌지 않음)", () => {
    const original = "https://erp.wedly.kr/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("우리 앱이 아닌 호스트는 그대로", () => {
    const original = "https://prod-files.notion-static.com/abc/file.png";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("경로가 /api/upload/ 가 아닌 형제 앱 주소는 그대로", () => {
    const original = "https://wedly-hive-collab-production-1dce.up.railway.app/api/entries/1";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("경로 조각이 둘 이상(/api/upload/a/b)이면 그대로", () => {
    const original = "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/a/b";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("물음표 뒤 값이 붙은 형제 앱 주소는 상대주소로 바뀌되 질의문자열이 보존된다", () => {
    expect(
      selfHostedFileUrlFrom(
        "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123?w=480",
        SELF,
      ),
    ).toBe("/api/upload/abc123?w=480");
  });

  it("대문자가 섞인 호스트도 바뀐다", () => {
    expect(
      selfHostedFileUrlFrom(
        "https://WEDLY-ERP-PRODUCTION.UP.RAILWAY.APP/api/upload/abc123",
        SELF,
      ),
    ).toBe("/api/upload/abc123");
  });

  it("https 가 아닌 주소는 그대로 — 프로토콜 검사가 사라지면 잡힌다", () => {
    // 우리 집 이름을 단 ftp 주소. 파서는 통과시키지만 열 수 있는 파일이 아니다.
    const original = "ftp://erp.wedly.kr/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, HIVE)).toBe(original);
  });

  it("암호화 안 된 주소(http)도 그대로 — 형제 함수와 같은 잣대", () => {
    const original = "http://erp.wedly.kr/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, HIVE)).toBe(original);
  });

  it("표준이 아닌 문(포트)이 붙은 주소는 그대로 — 정확한 집 목록의 뜻을 흐리지 않게", () => {
    const original = "https://erp.wedly.kr:8443/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, HIVE)).toBe(original);
  });

  it("주소 뒤 자리표(#)를 잃지 않는다 — PDF 쪽번호가 붙은 주소", () => {
    expect(
      selfHostedFileUrlFrom(
        "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123#page=3",
        SELF,
      ),
    ).toBe("/api/upload/abc123#page=3");
  });

  it("빈 문자열 → 빈 문자열", () => {
    expect(selfHostedFileUrlFrom("", SELF)).toBe("");
  });

  it('해석 불가능한 쓰레기 문자열("::::") → 그대로', () => {
    expect(selfHostedFileUrlFrom("::::", SELF)).toBe("::::");
  });

  it("data: 로 시작하는 주소는 그대로", () => {
    const original = "data:image/png;base64,AAAA";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  // ★호스트 판정이 "wedly.kr 로 끝나면 통과" 처럼 헐거워지는 것을 잡는 시험.
  //  이 세 줄이 없으면 목록을 끝글자 판정으로 바꿔도 시험이 전부 통과한다(2026-08-23 실측).
  it("버려진 하위 도메인은 우리 앱이 아니다 — 그대로", () => {
    const original = "https://old.wedly.kr/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("이름이 비슷한 남의 집도 우리 앱이 아니다 — 그대로", () => {
    const original = "https://notwedly-erp-production.up.railway.app/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("우리 집 이름을 앞에 붙인 남의 집도 그대로", () => {
    const original = "https://wedly-erp-production.up.railway.app.evil.example/api/upload/abc123";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });

  it("상대주소(/api/upload/abc)는 자기 앱과 같은 origin 이므로 원본 그대로", () => {
    const original = "/api/upload/abc";
    expect(selfHostedFileUrlFrom(original, SELF)).toBe(original);
  });
});

describe("selfHostedFileUrl — 실제로 부르는 껍데기", () => {
  // ★이 묶음이 없으면 7자리가 실제로 쓰는 함수가 한 번도 안 돌아간다.
  //  시험이 node 환경이라 브라우저 갈래(location 이 있는 쪽)가 통째로 빠졌고,
  //  껍데기가 엉뚱한 집 주소를 기준 삼아도 전부 초록이었다(2026-08-23 적대적 리뷰 지적).
  afterEach(() => { vi.unstubAllGlobals(); });

  it("location 이 없으면(서버에서 그릴 때) 원본을 그대로 돌려준다", () => {
    const original = "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123";
    expect(selfHostedFileUrl(original)).toBe(original);
  });

  it("형제 앱 주소 → 지금 보고 있는 앱의 상대주소", () => {
    vi.stubGlobal("location", { origin: SELF, href: SELF + "/" });
    expect(
      selfHostedFileUrl("https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123"),
    ).toBe("/api/upload/abc123");
  });

  it("★지금 보고 있는 앱이 기준이다 — 자기 앱 주소는 안 바뀐다", () => {
    vi.stubGlobal("location", { origin: HIVE, href: HIVE + "/" });
    const original = "https://wedly-hive-collab-production-1dce.up.railway.app/api/upload/abc123";
    expect(selfHostedFileUrl(original)).toBe(original);
  });

  it("우리 앱이 아닌 곳은 안 바뀐다", () => {
    vi.stubGlobal("location", { origin: SELF, href: SELF + "/" });
    const original = "https://prod-files.notion-static.com/abc/file.png";
    expect(selfHostedFileUrl(original)).toBe(original);
  });
});
