// 세 앱(ERP·하이브·일루아)은 같은 파일 창고를 쓴다. 다른 앱이 올린 파일의 절대주소
// (예: https://wedly-hive-…/api/upload/abc)를 그대로 열면, 그 앱이 파일 통로에
// 로그인 검사를 달았을 때 미리보기가 로그인 창으로 튕긴다. 창고는 같으므로
// 자기 앱 경로로 바꾸기만 하면 같은 파일이 나온다.
// ★다운로드용 절대주소는 서버가 통행증을 붙여 대신 받아 오므로 이 함수를 쓰지 않는다.

/** 파일 창고를 공유하는 WEDLY 앱 호스트. "wedly.kr 로 끝남" 같은 뭉뚱그린 판정 금지. */
const WEDLY_APP_HOSTS = new Set([
  "erp.wedly.kr",
  "wedly-erp-production.up.railway.app",
  "wedly-hive-collab-production-1dce.up.railway.app",
  "wedly-illua-collab-production.up.railway.app",
]);

const UPLOAD_PATH = /^\/api\/upload\/[^/]+$/;

/**
 * 형제 앱의 `/api/upload/<한 조각>` 절대주소를 자기 앱 상대경로로 바꾼다.
 * 시험 가능 — 브라우저 전역을 쓰지 않는다.
 */
export function selfHostedFileUrlFrom(url: string, selfOrigin: string): string {
  if (url === "") return url;

  let u: URL;
  try {
    u = new URL(url, selfOrigin);
  } catch {
    return url;
  }

  // 형제 함수(internal-file-token.ts)와 같은 규칙 — https 만, 표준 포트만.
  // 「정확한 집 목록」의 뜻을 흐리지 않으려면 여기서도 같은 잣대를 써야 한다
  // (2026-08-23 적대적 리뷰: 같은 규칙이 세 벌 서로 다르게 적혀 있었다).
  if (u.protocol !== "https:") return url;
  if (u.port !== "") return url;
  if (u.origin === selfOrigin) return url;
  if (!WEDLY_APP_HOSTS.has(u.hostname.toLowerCase())) return url;
  if (!UPLOAD_PATH.test(u.pathname)) return url;

  return u.pathname + u.search + u.hash;
}

/** 브라우저용 얇은 껍데기. 서버에서 그릴 때는 location 이 없으니 원본을 그대로 둔다. */
export function selfHostedFileUrl(url: string): string {
  if (typeof location === "undefined") return url;
  return selfHostedFileUrlFrom(url, location.origin);
}
