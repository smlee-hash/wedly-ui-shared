// 분야(섹션) 정보 3앱 공용 보관함 — 키 규칙·검증 단일 원본.
// 순수 함수(서버·클라이언트 공용, prisma 의존 없음). 사업자번호 기준으로 ERP·하이브·일루아가
// 같은 공용 DB(JsonCache)의 같은 키를 읽고 쓴다. 키 규칙이 곧 3앱 공통 약속.
// 값 형태: settlement=공용 정산탭이 주는 JSON 문자열, history=댓글 배열.
export const SECSTORE_KINDS = [
  "settlement",
  "contract",
  "refund",
  "history",
  "files",
  "meetings",
] as const;
export type SecstoreKind = (typeof SECSTORE_KINDS)[number];

export function normalizeBizno(raw: unknown): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

export function isValidBizno(bizno: string): boolean {
  return /^[0-9]{1,20}$/.test(bizno);
}

export function isValidSection(section: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(section);
}

export function isValidKind(kind: string): kind is SecstoreKind {
  return (SECSTORE_KINDS as readonly string[]).includes(kind);
}

export function secstoreKey(bizno: string, section: string, kind: SecstoreKind): string {
  return `secstore:${bizno}:${section}:${kind}`;
}
