// 공용 히스토리(상담기록) 패널 — 순수 로직·타입.
//
// React/DOM 의존 없음(node 환경에서 타입검사·단위테스트 가능). 브라우저 전용 타입(File 등)을
// 쓰는 어댑터 인터페이스는 화면 부품(components/HistoryPanel.tsx)에 둔다.
//
// 하이브·ERP·일루아가 같은 히스토리 부품을 쓰되, 앱마다 다른 부분(저장 방식·분류 사용 여부·
// 이미지 붙여넣기·시간 표시·관리자 권한)은 부품에 "설정/어댑터"로 주입한다. 이 파일은 그중
// 앱과 무관한 순수 규칙(본문 파싱·권한 판정·정렬·분류 집계)만 담는다.

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
