// 기능요청 별도 앱(wedly-dev-request) iframe URL 조립 — 순수 함수(테스트 대상).
// sourceUrl(요청 페이지 링크)은 호출부에서 살아있는 현재 주소(window.location.href)를 넘긴다.
export interface DevRequestUrlParams {
  base: string;
  app: string;
  requester: string;
  page: string;
  sourceUrl: string;
}

export function buildDevRequestUrl({ base, app, requester, page, sourceUrl }: DevRequestUrlParams): string {
  const params = new URLSearchParams({ app, requester, page });
  if (sourceUrl) params.set("sourceUrl", sourceUrl);
  return `${base}?${params.toString()}`;
}
