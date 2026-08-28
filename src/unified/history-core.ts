// 공용 히스토리(상담기록) 패널 — 순수 로직·타입.
//
// React/DOM 의존 없음(node 환경에서 타입검사·단위테스트 가능). 브라우저 전용 타입(File 등)을
// 쓰는 어댑터 인터페이스는 화면 부품(components/HistoryPanel.tsx)에 둔다.
//
// 하이브·ERP·일루아가 같은 히스토리 부품을 쓰되, 앱마다 다른 부분(저장 방식·분류 사용 여부·
// 이미지 붙여넣기·시간 표시·관리자 권한)은 부품에 "설정/어댑터"로 주입한다. 이 파일은 그중
// 앱과 무관한 순수 규칙(본문 파싱·권한 판정·정렬·분류 집계)만 담는다.

/** 정리본의 종류 — 카드 아이콘·색을 이걸로 고른다. */
export type RecapKind = "call" | "contract" | "document" | "schedule" | "issue" | "note";

/**
 * AI 가 원문을 읽어 만든 **정리본**. 원문(`text`)은 절대 덮어쓰지 않고 곁에 붙는다.
 * 셋 다 옵션이라, 이 칸이 없는 옛 기록은 지금과 100% 똑같이 그려진다.
 */
export type CommentRecap = {
  /** 프롬프트 판 번호 — 프롬프트를 고치면 올려서 다시 만들게 한다. */
  v: number;
  kind: RecapKind;
  /** 눈이 먼저 갈 한 줄. 카드에서 굵기 600 은 이 줄 하나뿐이다. */
  headline: string;
  /** 라벨-값 묶음. 최대 6개(넘는 건 만드는 쪽에서 자른다). */
  facts: { label: string; value: string }[];
  /** 다음 할 일. 최대 4개. */
  nextSteps: string[];
};

/** 한 건의 히스토리(코멘트) — 양쪽 앱 공통 상위 자료형(superset). */
export type UnifiedComment = {
  id: string;
  /** 작성자 표시 이름(색 해시·본인 글 판정에 사용) */
  name: string;
  /** 본문. 이미지 줄("[이미지] https://...")을 포함할 수 있다. */
  text: string;
  /** 작성 시각(ISO 8601 문자열) */
  createdAt: string;
  /** 분류 id(하이브). ERP는 없음(undefined). */
  category?: string;
  /** 작성 출처: "hive" | "erp" | ... (없으면 자기 앱 글로 간주) */
  source?: string;
  /** AI 정리본(있을 때만). 없으면 원문을 지금처럼 그린다. */
  recap?: CommentRecap;
  /** "부재" 같은 짧은 글 — 정리할 게 없다고 판정된 것. 스윕이 다시 시도하지 않는다. */
  recapSkip?: boolean;
};

/** 분류(카테고리) 정의 — 탭으로 표시된다. */
export type HistoryCategoryDef = { id: string; label: string };

/** 항상 첫 탭(통합) id. */
export const ALL_TAB_ID = "all";
/** 분류가 지정되지 않았거나 알 수 없는 분류의 글이 모이는 탭 id. */
export const GENERAL_TAB_ID = "general";

/** 화면에 그릴 탭 1개. */
export type HistoryTab = {
  id: string; // "all" | "general" | categoryId
  label: string;
  /** 통합 탭 등 삭제 불가 항목은 false. */
  removable: boolean;
  /** 내장(기본) 분류 탭이면 true. */
  isFallback: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// 본문(이미지 줄) 파싱 — ERP의 "[이미지] url" 인라인 표기를 양쪽 앱이 공유.
// ─────────────────────────────────────────────────────────────────────────────

/** 한 줄이 이미지 줄인지 판정하는 정규식(캡처그룹 1 = url). */
export const IMAGE_LINE_RE = /^\[이미지\]\s*(https?:\/\/.+?)\s*$/;

export type CommentBodyPart =
  | { type: "text"; value: string }
  | { type: "image"; url: string };

/** 본문을 줄 단위로 나눠 이미지 줄/텍스트 줄로 분류한다. */
export function parseCommentBody(text: string): CommentBodyPart[] {
  if (!text) return [];
  const parts: CommentBodyPart[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(IMAGE_LINE_RE);
    if (m) parts.push({ type: "image", url: m[1] });
    else parts.push({ type: "text", value: line });
  }
  return parts;
}

/** 작성 본문 + 업로드된 이미지 url 들을 하나의 저장 본문으로 합친다(이미지만 작성 허용). */
export function appendImageLines(text: string, urls: string[]): string {
  const imageLines = (urls ?? []).filter(Boolean).map((u) => `[이미지] ${u}`);
  return [text.trim(), ...imageLines].filter(Boolean).join("\n");
}

/**
 * 히스토리 인라인 이미지용 썸네일 URL — 우리 파일 서빙 URL(`/api/upload/{id}`)에만 `?w=` 를 붙여
 * 서버가 즉석 축소한 webp 를 받게 한다. 그 외 URL(외부 이미지 등)·이미 w= 있는 URL·빈값은 그대로.
 * 원본 링크(<a href>)는 이 값을 쓰지 않고 원본 URL 을 유지한다(클릭 시 원본 새 탭).
 */
export function historyThumbnailUrl(url: string, width = 480): string {
  if (!url) return url;
  const path = url.split("?")[0];
  if (!/\/api\/upload\/[^/?#]+$/.test(path)) return url; // 우리 서빙 URL 아님 → 그대로
  if (/[?&]w=/.test(url)) return url;                     // 이미 부착됨 → 중복 방지
  return `${url}${url.includes("?") ? "&" : "?"}w=${width}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 편집·삭제 권한 — 다른 앱에서 쓴 글은 관리자만, 내 앱 글은 본인 또는 관리자.
// ─────────────────────────────────────────────────────────────────────────────

export function canEditOrDelete(
  comment: { name: string; source?: string },
  opts: { currentUserName: string; isAdmin?: boolean; ownSource?: string },
): boolean {
  const { currentUserName, isAdmin, ownSource } = opts;
  const foreign = !!(comment.source && ownSource && comment.source !== ownSource);
  if (foreign) return !!isAdmin; // 다른 앱에서 작성된 글은 관리자만 수정/삭제
  if (isAdmin) return true;
  return !!currentUserName && comment.name === currentUserName;
}

// ─────────────────────────────────────────────────────────────────────────────
// 정렬·분류 집계·필터 — 하이브 로직과 동일.
// ─────────────────────────────────────────────────────────────────────────────

/** 오래된 글이 위로(오름차순). 입력 배열은 변형하지 않는다. */
export function sortCommentsAsc(comments: UnifiedComment[]): UnifiedComment[] {
  return [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 표시할 분류 탭 목록을 만든다.
 *  - [통합] 항상 첫 번째(삭제 불가)
 *  - 내장 분류(fallbacks) 중 숨김(hiddenFallbackIds) 제외, 사용자분류와 id 중복 제외
 *  - 사용자 정의 분류(categories)
 */
export function buildEffectiveTabs(args: {
  categories?: HistoryCategoryDef[];
  fallbacks?: HistoryCategoryDef[];
  hiddenFallbackIds?: string[];
}): HistoryTab[] {
  const categories = args.categories ?? [];
  const fallbacks = args.fallbacks ?? [];
  const hidden = new Set(args.hiddenFallbackIds ?? []);
  const userIds = new Set(categories.map((c) => c.id));

  const tabs: HistoryTab[] = [{ id: ALL_TAB_ID, label: "통합", removable: false, isFallback: false }];
  for (const f of fallbacks) {
    if (hidden.has(f.id) || userIds.has(f.id)) continue;
    tabs.push({ id: f.id, label: f.label, removable: false, isFallback: true });
  }
  for (const c of categories) {
    tabs.push({ id: c.id, label: c.label, removable: true, isFallback: false });
  }
  return tabs;
}

/** 탭 목록에서 "통합/미분류"를 뺀 실제 분류 id 집합. */
export function knownCategoryIds(tabs: HistoryTab[]): Set<string> {
  return new Set(tabs.filter((t) => t.id !== ALL_TAB_ID && t.id !== GENERAL_TAB_ID).map((t) => t.id));
}

/**
 * 탭별 글 개수. 알 수 없는/없는 분류의 글은 "미분류(general)"로 집계.
 * 반환: { all: 전체, [categoryId]: n, general: 미분류수 }
 */
export function computeCategoryCounts(
  comments: UnifiedComment[],
  known: Set<string>,
): Record<string, number> {
  const counts: Record<string, number> = { [ALL_TAB_ID]: comments.length, [GENERAL_TAB_ID]: 0 };
  for (const c of comments) {
    if (c.category && known.has(c.category)) {
      counts[c.category] = (counts[c.category] ?? 0) + 1;
    } else {
      counts[GENERAL_TAB_ID] += 1;
    }
  }
  return counts;
}

/** 활성 탭 기준으로 글을 거른다. */
export function filterByCategory(
  comments: UnifiedComment[],
  activeCategory: string,
  known: Set<string>,
): UnifiedComment[] {
  if (activeCategory === ALL_TAB_ID) return comments;
  if (activeCategory === GENERAL_TAB_ID) {
    return comments.filter((c) => !c.category || !known.has(c.category));
  }
  return comments.filter((c) => c.category === activeCategory);
}

/**
 * 이 기록을 정리 카드로 그릴 것인가.
 * ★핵심 한 줄이 비어 있으면 **안 그린다** — 아이콘만 있고 내용이 없는 빈 카드가 뜨면
 *  사용자는 "정리에 실패한 것"이 아니라 "원문이 사라진 것"으로 읽는다.
 */
export function hasRenderableRecap(c: { recap?: CommentRecap }): boolean {
  const r = c.recap;
  return !!r && typeof r.headline === "string" && r.headline.trim().length > 0;
}

/** 정리본 종류 목록. 카드 아이콘 조회는 이 배열 소속으로만 판정한다. */
export const RECAP_KINDS: readonly RecapKind[] = [
  "call",
  "contract",
  "document",
  "schedule",
  "issue",
  "note",
];

/** 모르는 종류·물려받은 이름("toString" 등)을 안전하게 「기록」으로 떨어뜨린다.
 *  ★그냥 KIND[kind] 로 찾으면 "toString" 이 Object 내장 함수를 돌려줘 판정을 통과한다. */
export function safeRecapKind(kind: unknown): RecapKind {
  if (typeof kind === "string") {
    for (const k of RECAP_KINDS) {
      if (k === kind) return k;
    }
  }
  return "note";
}

/** 카드가 그릴 수 있는 모양으로만 남긴다 — 글자가 아닌 값·빈 값·null 항목을 걸러낸다. */
export function safeRecapLines(recap: CommentRecap): {
  facts: { label: string; value: string }[];
  nextSteps: string[];
} {
  const rawFacts: unknown = recap.facts;
  const facts: { label: string; value: string }[] = [];
  if (Array.isArray(rawFacts)) {
    for (const item of rawFacts) {
      if (item === null || typeof item !== "object") continue;
      const label = (item as { label?: unknown }).label;
      const value = (item as { value?: unknown }).value;
      if (typeof label !== "string" || typeof value !== "string") continue;
      if (!label.trim() || !value.trim()) continue;
      facts.push({ label, value });
    }
  }

  const rawSteps: unknown = recap.nextSteps;
  const nextSteps: string[] = [];
  if (Array.isArray(rawSteps)) {
    for (const s of rawSteps) {
      if (typeof s === "string" && s.trim()) nextSteps.push(s);
    }
  }
  return { facts, nextSteps };
}
