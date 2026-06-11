// 통합 상세창 "값 표시" 순수 로직 — React 의존 0 (node 테스트 가능).
//
// 하이브 FieldEditors.tsx 의 읽기 분기(422–495)와 동일한 순서·규칙으로
// "어떤 모양으로 그릴지"를 디스크립터로 산출한다. 실제 JSX 변환은 field-display.tsx 가 담당.
// 날짜·통화 포맷은 ui-shared 공용 util 을 그대로 사용(하이브와 동일 출력).

import { formatCurrency, formatDate, formatDateTime } from "../lib/utils";
import type { ColumnLite } from "./sections";

export type FileItem = { fileName?: string; name?: string; url?: string; fileUrl?: string };

export type FieldDisplayOptions = {
  /** 빈 값 표기: true→"-", false→"비어 있음" (기본 true — 통합 읽기표시). */
  isReadonly?: boolean;
  /** select/status 배지 색상 맵 (앱별 STATUS_COLORS). */
  statusColors?: Record<string, string>;
  /** 추가 배지 색상 맵 (앱별 SELECT_BADGE_COLORS 등). */
  badgeColors?: Record<string, string>;
  /** 사람 식별자→이름 해석. 없으면 원문 그대로 표시. */
  resolvePersonName?: (raw: string) => string;
};

export type FieldValueKind =
  | "empty"
  | "person-chip"
  | "file"
  | "datetime"
  | "select"
  | "currency"
  | "date"
  | "text";

export type FieldValueDescriptor = {
  kind: FieldValueKind;
  /** 단일 표시 문자열 (empty/datetime/select/currency/date/text). */
  text?: string;
  /** person-chip 이름 목록. */
  names?: string[];
  /** file 목록. */
  files?: FileItem[];
  /** person-chip 색: 팀장 true / 팀원 false. */
  isLeader?: boolean;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** 파일 값(JSON 배열 문자열 / 객체 배열 / 쉼표 구분 문자열)을 FileItem[] 로 정규화. */
export function parseFiles(raw: unknown): FileItem[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return (raw as unknown[])
      .map((f) => (typeof f === "string" ? ({ fileName: f } as FileItem) : (f as FileItem)))
      .filter((f) => Boolean(f.fileName ?? f.name));
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[")) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          return arr
            .map((f: unknown) => (typeof f === "string" ? ({ fileName: f } as FileItem) : (f as FileItem)))
            .filter((f) => Boolean(f.fileName ?? f.name));
        }
      } catch {
        /* JSON 아니면 쉼표 문자열로 처리 */
      }
    }
    return s
      .split(/[,;]/)
      .map((n) => ({ fileName: n.trim() } as FileItem))
      .filter((f) => Boolean(f.fileName));
  }
  return [];
}

export function fileLabel(f: FileItem): string {
  return f.fileName ?? f.name ?? "파일";
}

export function fileHref(f: FileItem): string | undefined {
  return f.url ?? f.fileUrl;
}

function normLabel(label: string | undefined): string {
  return (label || "").replace(/\s/g, "").toLowerCase();
}

/**
 * 사람값에 이메일이 붙어 있으면("이름 <a@b.com>" / "이름 | a@b.com" / "이름 (a@b.com)")
 * 이름만 남긴다. resolvePersonName 이 없을 때의 안전 기본값 — 칩에 이메일이 노출되지 않도록.
 * (하이브 unifyPersonDisplay 의 "이름만 표시" 동작과 동일한 방향.)
 */
export function cleanPersonName(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^(.+?)\s*[<(|]\s*[^\s@]+@[^\s)>]+\)?>?\s*$/);
  return m && m[1].trim() ? m[1].trim() : s;
}

/**
 * 사람 칸 라벨 → 색 칩 역할. 표 셀·상세창이 공유하는 단일 규칙.
 * 팀장/담당팀장/담당사무장 → "leader", 팀원/담당팀원 → "member", 그 외 person 칸 → null(칩 아님).
 */
export function detectPersonChipRole(label: string | undefined): "leader" | "member" | null {
  const ln = normLabel(label);
  if (ln === "팀장" || ln === "담당팀장" || ln === "담당사무장") return "leader";
  if (ln === "팀원" || ln === "담당팀원") return "member";
  return null;
}

/** 팀장/팀원 색 칩 색상(WEDLY 토큰) — 표 셀·상세창 공용. */
export function personChipClasses(role: "leader" | "member"): { bg: string; text: string; dot: string } {
  return role === "leader"
    ? { bg: "bg-wedly-bg-blue", text: "text-wedly-accent", dot: "bg-wedly-accent" }
    : { bg: "bg-wedly-bg-green", text: "text-wedly-green", dot: "bg-wedly-green" };
}

/**
 * 하이브 읽기 분기와 동일한 순서로 표시 디스크립터를 만든다.
 * 순서: file → empty → 팀장/팀원칩 → last_edited_time → select/status → currency → date → ISO일시 → 기본텍스트.
 * (multi_select 별도 분기 없음 — 하이브와 동일하게 기본 텍스트로 떨어뜨림.)
 */
export function classifyUnifiedFieldValue(
  field: ColumnLite,
  value: unknown,
  opts: FieldDisplayOptions = {},
): FieldValueDescriptor {
  const { isReadonly = true, resolvePersonName } = opts;
  const emptyText = isReadonly ? "-" : "비어 있음";

  // 파일 타입: 값 유무와 무관히 파일로 분류 (빈 파일 → empty)
  if (field.type === "file") {
    const files = parseFiles(value);
    return files.length ? { kind: "file", files } : { kind: "empty", text: emptyText };
  }

  if (value === null || value === undefined || value === "") {
    return { kind: "empty", text: emptyText };
  }

  // 팀장/팀원 라벨 → 색 칩 (표 셀·상세창 공용 규칙)
  const personRole = detectPersonChipRole(field.label);
  if (personRole && typeof value === "string" && value.trim()) {
    const names = value
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (resolvePersonName ? resolvePersonName(s) : cleanPersonName(s)));
    return { kind: "person-chip", names, isLeader: personRole === "leader" };
  }

  if (field.type === "last_edited_time") {
    return { kind: "datetime", text: formatDateTime(String(value)) };
  }

  if (field.type === "select" || field.type === "status") {
    return { kind: "select", text: String(value) };
  }

  if (field.format === "currency" && typeof value === "number") {
    return { kind: "currency", text: formatCurrency(value) };
  }

  if (field.type === "date" && typeof value === "string") {
    return { kind: "date", text: formatDate(value) };
  }

  // 등록일자 등 "2026-05-20T01:15:14Z" 형태 문자열 → 한국 일시 형식으로 통일
  if (typeof value === "string" && ISO_RE.test(value)) {
    return { kind: "datetime", text: formatDateTime(value) };
  }

  return { kind: "text", text: String(value) };
}
