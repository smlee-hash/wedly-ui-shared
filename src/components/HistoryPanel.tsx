// 공용 히스토리(상담기록) 패널 — 하이브·ERP·일루아 공유.
// 소스 진실: 하이브 HistoryPanel (기능·마크업·CSS 100% 동일) +
//   이미지 붙여넣기(ERP 출처, enableImagePaste prop 으로 게이트).
// 외부 의존 없이 adapter/props 주입 방식.

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "../lib/cn";
import { useAutoResizeTextarea } from "../hooks/useAutoResizeTextarea";
import { timeAgo as defaultTimeAgo } from "../lib/utils";
import { selfHostedFileUrl } from "../lib/self-hosted-file-url";
import { AlertTriangle, RotateCw } from "lucide-react";
import { saveFailureMessage, loadFailureMessage } from "../lib/persist-failure";
import { readDraft, writeDraft, clearDraft, shouldRestoreDraft, isDraftExpired } from "../lib/history-draft";
import {
  parseCommentBody,
  appendImageLines,
  historyThumbnailUrl,
  canEditOrDelete as coreCanEditOrDelete,
  hasRenderableRecap,
  kakaoReportFor,
  resolveKakaoSource,
  type UnifiedComment } from "../unified/history-core";
import { HistoryRecapCard } from "./HistoryRecapCard";
import { KakaoReportDialog } from "./KakaoReportDialog";

/** 대표님용 글을 기다리는 최대 시간 — 서버 쪽 AI 제한(45초)보다 조금 길게. */
const KAKAO_AI_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommentCategory = string;
export type ActiveTab = "all" | CommentCategory;
export type HistoryCategoryDef = { id: string; label: string; color?: "blue" | "green" | "purple" | "orange" | "red" | "gold" | "gray"; panelId?: string };

// 색상별 활성 탭 스타일 매핑 — 어드민이 색만 고르면 자동 적용
export const CATEGORY_COLOR_CLASS: Record<NonNullable<HistoryCategoryDef["color"]>, string> = {
  gray: "bg-wedly-bg-gray text-wedly-navy border-wedly-bd",
  blue: "bg-wedly-bg-blue text-wedly-accent-ink border-wedly-bd-blue",
  green: "bg-wedly-bg-green text-wedly-green-ink border-wedly-bd-green",
  purple: "bg-wedly-bg-purple text-wedly-purple-ink border-[var(--wedly-purple)]/30",
  orange: "bg-wedly-bg-yellow text-wedly-t1 border-wedly-orange/30",
  red: "bg-wedly-bg-red text-wedly-red-ink border-wedly-bd-red",
  gold: "bg-wedly-bg-yellow text-wedly-t1 border-wedly-gold/30",
};

export const DEFAULT_HISTORY_CATEGORIES: HistoryCategoryDef[] = [
  { id: "policy", label: "정책자금",        color: "blue" },
  { id: "free",   label: "무상지원금",      color: "green" },
  { id: "cert",   label: "인증제도 및 특허", color: "purple" },
];

export const CATEGORY_TABS_FALLBACK: { id: ActiveTab; label: string; activeColor: string }[] = [
  { id: "all", label: "통합", activeColor: CATEGORY_COLOR_CLASS.gray },
  ...DEFAULT_HISTORY_CATEGORIES.map((c) => ({
    id: c.id as ActiveTab,
    label: c.label,
    activeColor: CATEGORY_COLOR_CLASS[c.color || "gray"],
  })),
];

export const CATEGORY_TAB_KEY = "wedly-hive-history-category-last";

// ---------------------------------------------------------------------------
// Adapter types (R2)
// ---------------------------------------------------------------------------

export type HistoryFetchResult = { comments: UnifiedComment[]; latestMemo?: string; memoCount?: number };

export type HistoryAdapter = {
  fetch: () => Promise<HistoryFetchResult>;
  create: (i: { text: string; category?: string }) => Promise<UnifiedComment[]>;
  edit: (i: { commentId: string; text: string }) => Promise<UnifiedComment[]>;
  remove: (i: { commentId: string }) => Promise<UnifiedComment[]>;
  uploadImage?: (file: File) => Promise<string>;
};

/** clipboard 를 못 쓸 때 — 화면 밖 textarea 로 복사한다. */
/**
 * clipboard 를 못 쓸 때 — 화면 밖 textarea 로 복사한다.
 *
 * ★`execCommand` 의 **돌려주는 값을 반드시 본다.** 실패해도 「복사됨」으로 바꾸면,
 *  사용자는 복사된 줄 알고 카톡에 붙여넣는데 **전에 복사해 둔 엉뚱한 글이 대표님 채팅방에 붙는다**
 *  (2026-08-29 적대적 리뷰). 이 파일의 링크 복사(fallbackShowUrl)는 원래부터 이렇게 하고 있었다.
 * @returns 성공했으면 true
 */
function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS 사파리는 select() 만으로는 안 잡힌다
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// History Panel
// ---------------------------------------------------------------------------

export function HistoryPanel({
  onCountChange,
  focusCommentId,
  onFocusHandled,
  categories,
  onAddCategory,
  onDeleteCategory,
  hiddenFallbackIds,
  onHideFallback,
  onUnhideFallback,
  onRenameCategory,
  onReorderCategories,
  hideCategories,
  // R3 — new props
  adapter,
  currentUserName,
  isAdmin = false,
  ownSource = "hive",
  timeFormatter,
  pollingIntervalMs = 0,
  enableImagePaste = false,
  shareEnabled = false,
  sourceBadge = { label: "ERP", isForeign: (s) => !!s && s !== "hive" },
  confirmDialog,
  alertDialog,
  seedComments,
  readOnly = false,
  loadError = null,
  onRetryLoad,
  draftId,
  sendOnLeave,
  buildKakaoReport,
  // Hive compat — pageId kept for share URL generation
  pageId,
}: {
  /** 공유 링크 URL 생성에 사용 (선택). shareEnabled=true 일 때만 필요. */
  pageId?: string;
  onCountChange?: (count: number) => void;
  focusCommentId?: string;
  onFocusHandled?: () => void;
  categories?: HistoryCategoryDef[];
  onAddCategory?: () => void;
  onDeleteCategory?: (categoryId: string) => void;
  hiddenFallbackIds?: string[];
  onHideFallback?: (categoryId: string) => void;
  onUnhideFallback?: (categoryId: string) => void;
  onRenameCategory?: (categoryId: string, newLabel: string) => void;
  onReorderCategories?: (nextOrder: string[]) => void;
  hideCategories?: boolean;
  // R3 additions
  adapter: HistoryAdapter;
  currentUserName: string;
  isAdmin?: boolean;
  ownSource?: string;
  timeFormatter?: (iso: string) => string;
  pollingIntervalMs?: number;
  enableImagePaste?: boolean;
  shareEnabled?: boolean;
  sourceBadge?: { label: string; isForeign: (source?: string) => boolean };
  confirmDialog?: (message: string, opts?: { title?: string; danger?: boolean }) => Promise<boolean>;
  alertDialog?: (message: string, opts?: { title?: string }) => void;
  seedComments?: UnifiedComment[];
  /** 보기전용(하이브 정부지원금 등): 작성칸·수정·삭제 차단. 기본 false. */
  readOnly?: boolean;
  /** 부모가 첫 불러오기에 실패했으면 그 안내 문구. 주면 입력이 잠기고 다시 시도 단추가 뜬다. */
  loadError?: string | null;
  /** 다시 시도 단추를 눌렀을 때 부모가 할 일. 없으면 부품이 스스로 다시 불러온다. */
  onRetryLoad?: () => void;
  /** 치던 글을 브라우저에 담아 둘 때 쓸 이름표. 없으면 담아 두기를 하지 않는다. */
  draftId?: string;
  /** 화면을 떠날 때 치던 글을 살려 보내는 통로(선택). 성공 여부는 알 수 없다. */
  sendOnLeave?: (text: string) => void;
  /**
   * 카톡 보고문을 **서버에서** 만들어 오는 자리(선택).
   * 꽂아 주면 그 결과를 복사하고, 없거나 실패하면 기계적으로 다듬은 글(kakaoReportFor)로 떨어진다.
   * ★대표자께 보내는 글이라 말투를 다시 써야 한다 — 그 일은 AI 가 한다(ERP 가 꽂는다).
   */
  buildKakaoReport?: (c: UnifiedComment) => Promise<string>;
}) {
  // helper — relative time (R6)
  const tf = timeFormatter ?? defaultTimeAgo;

  // 카테고리 탭 줄 끝 "탭 편집" 작은 메뉴
  const [showCategoryEditMenu, setShowCategoryEditMenu] = useState(false);
  // 카테고리 수정 모드
  const [categoryRenameMode, setCategoryRenameMode] = useState(false);
  // 카테고리 숨김 관리 모달
  const [showCategoryHideManager, setShowCategoryHideManager] = useState(false);
  // 라벨 편집 중인 카테고리 id + draft
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  // 드래그 상태
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const categoryEditRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showCategoryEditMenu) return;
    const handler = (e: MouseEvent) => {
      if (categoryEditRootRef.current && categoryEditRootRef.current.contains(e.target as Node)) return;
      setShowCategoryEditMenu(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [showCategoryEditMenu]);

  // 수정 모드 상태
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  // R4: seed from seedComments when provided (else empty until adapter.fetch)
  const [comments, setComments] = useState<UnifiedComment[]>(seedComments ?? []);
  const [latestMemo, setLatestMemo] = useState<string>("");
  const [memoCount, setMemoCount] = useState<number>(0);
  const [loading, setLoading] = useState(!seedComments);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // ★불러오기 실패를 성공으로 위장하지 않는다 — 전에는 실패해도 조용히 빈 목록을 그렸다.
  const [selfLoadError, setSelfLoadError] = useState<string | null>(null);
  // 한 번이라도 제대로 불러온 적이 있나 — 자동 새로고침이 한 번 삐끗했다고 입력칸을 없애면
  // 치던 글이 통째로 날아간다(적대적 검토 지적). 첫 불러오기 실패만 잠근다.
  const [everLoaded, setEverLoaded] = useState(false);
  // ★부모가 준 목록이 실제로 바뀌면 따라간다(2026-08-26). 내용이 같으면 흔들지 않는다.
  //  전에는 첫 그림 때 한 번만 쓰여서, 저장 실패로 부모가 목록을 되돌려도 화면엔 글이 남았다.
  const seedSig = useMemo(
    () => (seedComments ? seedComments.map((c) => `${c.id} ${c.text}`).join("") : ""),
    [seedComments],
  );
  const lastSeedSigRef = useRef(seedSig);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(textareaRef, draft);
  useAutoResizeTextarea(editTextareaRef, editDraft);
  const bottomRef = useRef<HTMLDivElement>(null);

  // R9 — image paste state
  const [pastedImages, setPastedImages] = useState<{ file: File; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

  const [activeCategory, setActiveCategory] = useState<ActiveTab>(() => {
    if (typeof window === "undefined") return "all";
    const saved = localStorage.getItem(CATEGORY_TAB_KEY);
    if (typeof saved === "string" && saved.length > 0 && saved.length <= 64) return saved;
    return "all";
  });
  useEffect(() => {
    try { localStorage.setItem(CATEGORY_TAB_KEY, activeCategory); } catch { /* ignore */ }
  }, [activeCategory]);

  // ─── dialog helpers (R10) ───
  const doConfirm = useCallback(async (msg: string, opts?: { title?: string; danger?: boolean }) => {
    if (confirmDialog) return confirmDialog(msg, opts);
    return window.confirm(msg);
  }, [confirmDialog]);

  const doAlert = useCallback((msg: string, opts?: { title?: string }) => {
    if (alertDialog) alertDialog(msg, opts);
    else window.alert(msg);
  }, [alertDialog]);

  // 부모가 알려 준 실패가 우선(부모가 첫 불러오기를 맡은 구조), 없으면 부품이 스스로 겪은 실패.
  const shownLoadError = loadError ?? selfLoadError;
  // 못 불러온 상태에서 쓰면 "화면엔 있는데 서버엔 없는" 글이 생기고, 통째로 저장하는 구조라
  // 서버의 기존 기록을 덮을 위험이 있다. 그래서 못 불러오면 입력·수정·삭제를 모두 잠근다.
  //  ★단, 이미 제대로 불러온 적이 있으면(자동 새로고침이 잠깐 실패한 것) 잠그지 않는다.
  const locked = readOnly || loadError !== null || (selfLoadError !== null && !everLoaded);

  // ─── 히스토리 수정·삭제 동작 ───
  // R7: use canEditOrDelete from core
  const canEditOrDelete = useCallback((c: UnifiedComment) => {
    return coreCanEditOrDelete(c, { currentUserName, isAdmin, ownSource });
  }, [currentUserName, isAdmin, ownSource]);

  const startEdit = (c: UnifiedComment) => {
    setEditingCommentId(c.id);
    setEditDraft(c.text);
  };
  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditDraft("");
  };
  const saveEdit = async () => {
    if (!editingCommentId) return;
    const text = editDraft.trim();
    if (!text) { doAlert("내용을 입력해주세요"); return; }
    setEditSaving(true);
    try {
      // R4: use adapter.edit
      const updated = await adapter.edit({ commentId: editingCommentId, text });
      setComments(updated);
      cancelEdit();
    } catch (err) {
      // 수정 모드를 닫지 않는다 — 고치던 글이 사라지지 않게.
      doAlert(saveFailureMessage(err, "히스토리 수정"), { title: "저장 실패" });
    } finally {
      setEditSaving(false);
    }
  };
  const handleDeleteComment = async (commentId: string) => {
    const ok = await doConfirm("이 히스토리를 삭제하시겠습니까? 되돌릴 수 없습니다.", { title: "히스토리 삭제", danger: true });
    if (!ok) return;
    try {
      // R4: use adapter.remove
      const updated = await adapter.remove({ commentId });
      setComments(updated);
      onCountChange?.(updated.length);
    } catch (err) {
      doAlert(saveFailureMessage(err, "히스토리 삭제"), { title: "삭제 실패" });
    }
  };

  // ─── 히스토리 공유 — 링크 복사 + 포커스 처리 ───
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const focusedRef = useRef(false);
  const [kakaoDialog, setKakaoDialog] = useState<{
    comment: UnifiedComment;
    loading: boolean;
    text: string;
    source: "ai" | "fallback" | "none";
  } | null>(null);

  // ★열 때마다 번호를 올린다 — 같은 기록을 닫았다 다시 열어도 지난 요청의 늦은 응답이 새 창을 덮지 못하게(적대적 리뷰).
  const kakaoSeqRef = useRef(0);
  const openKakao = useCallback(async (c: UnifiedComment) => {
    const 기계글 = kakaoReportFor(c);
    const hasBuilder = !!buildKakaoReport;
    const seq = ++kakaoSeqRef.current;
    setKakaoDialog({
      comment: c,
      loading: hasBuilder,
      text: 기계글,
      source: resolveKakaoSource(hasBuilder, null),
    });
    if (!buildKakaoReport) return;
    // ★서버가 답을 안 주고 연결만 붙들면 창이 영원히 「다시 쓰는 중」이 된다 — 제한시간을 두고 기계글로 떨어진다.
    //  서버가 안 되면 기계글로 간다(창이 「AI 가 다시 쓰지 못했어요」로 밝힌다) — 단추가 아무 일도 안 하는 것보다 낫다.
    //  ★미리 만들기(마우스 올리면 호출)는 뺐다 — 원문을 고친 뒤에도 옛 글이 남는 구멍(리뷰 지적)이 있었고,
    //   지금은 서버가 기록 저장 시점에 미리 만들어 두므로 누르면 대개 캐시가 바로 온다(2026-09-02 사장님 지시).
    const aiText = await Promise.race([
      Promise.resolve()
        .then(() => buildKakaoReport(c))
        .then((t) => (typeof t === "string" && t.trim() ? t.trim() : null))
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), KAKAO_AI_TIMEOUT_MS)),
    ]);
    if (kakaoSeqRef.current !== seq) return; // 그 사이 닫혔거나 다른 창이 열렸다 — 버린다
    setKakaoDialog((cur) =>
      cur && cur.comment.id === c.id
        ? { comment: c, loading: false, text: aiText ?? 기계글, source: resolveKakaoSource(true, aiText) }
        : cur,
    );
  }, [buildKakaoReport]);
  const closeKakao = useCallback(() => {
    kakaoSeqRef.current += 1; // 닫은 뒤 도착하는 응답을 무효로
    setKakaoDialog(null);
  }, []);

  const copyText = useCallback(async (text: string): Promise<boolean> => {
    // ★복사가 **정말 됐을 때만** 성공으로 친다. 실패했는데 성공으로 보이면
    //  사용자가 카톡에 붙여넣을 때 전에 복사해 둔 엉뚱한 글이 대표님께 간다(적대적 리뷰).
    const 실패안내 = () =>
      doAlert("복사가 되지 않았습니다. 아래 글을 직접 복사해 주세요.\n\n" + text, { title: "복사 실패" });
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        if (fallbackCopy(text)) return true;
        실패안내();
        return false;
      }
    }
    if (fallbackCopy(text)) return true;
    실패안내();
    return false;
  }, [doAlert]);

  const handleShare = useCallback((commentId: string) => {
    if (typeof window === "undefined") return;
    if (!pageId) { doAlert("공유 링크를 만들 수 없습니다(식별자 없음)."); return; }
    const url = `${window.location.origin}/share/${encodeURIComponent(pageId)}?commentId=${encodeURIComponent(commentId)}&panel=history`;
    const onSuccess = () => {
      setCopiedId(commentId);
      setTimeout(() => setCopiedId((cur) => (cur === commentId ? null : cur)), 1800);
    };
    const fallbackShowUrl = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(ta);
        if (copied) { onSuccess(); return; }
      } catch { /* 폴백 실패 → 알림창으로 안내 */ }
      doAlert(`자동 복사에 실패했습니다. 아래 주소를 길게 눌러 직접 복사하세요:\n\n${url}`, { title: "히스토리 링크" });
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(onSuccess).catch(fallbackShowUrl);
    } else {
      fallbackShowUrl();
    }
  }, [pageId, doAlert]);

  // R4: adapter.fetch instead of raw fetch
  const fetchComments = useCallback(async () => {
    try {
      const r = await adapter.fetch();
      setComments(r.comments);
      if (r.latestMemo !== undefined) setLatestMemo(r.latestMemo);
      if (r.memoCount !== undefined) setMemoCount(r.memoCount);
      onCountChange?.(r.comments.length);
      setSelfLoadError(null);
      setEverLoaded(true);
    } catch (err) {
      // ★전에는 여기서 기록만 남기고 빈 목록을 그대로 뒀다 — 사용자는 "기록 0건"으로 읽었다.
      console.error("Failed to fetch comments:", err);
      setSelfLoadError(loadFailureMessage(err));
    } finally {
      setLoading(false);
    }
  }, [adapter, onCountChange]);

  useEffect(() => {
    fetchComments();
    // R5: gate polling on pollingIntervalMs > 0 and use prop value
    if (pollingIntervalMs > 0) {
      const intervalId = setInterval(fetchComments, pollingIntervalMs);
      return () => clearInterval(intervalId);
    }
    return undefined;
  }, [fetchComments, pollingIntervalMs]);

  useEffect(() => {
    if (!seedComments) return;
    if (lastSeedSigRef.current === seedSig) return;
    lastSeedSigRef.current = seedSig;
    setComments(seedComments);
    onCountChange?.(seedComments.length);
  }, [seedSig, seedComments, onCountChange]);

  // ─── 치던 글 지키기 (2026-08-26) ───────────────────────────────────────────
  // ★"보냈다"를 믿지 않는다 — 떠나는 순간 보낸 요청의 성공 여부는 알 수 없으므로,
  //   다시 열 때 **서버 목록과 대조해** 되살릴지 버릴지 판정한다.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const restoredRef = useRef(false);
  /** 떠날 때 보내기를 이미 걸었나 — 브라우저가 떠남 신호를 두 번 줘도 한 번만 보낸다. */
  const sentOnLeaveRef = useRef(false);

  // ① 다시 열었을 때: 담아 둔 글이 서버에 없으면 입력칸에 되살린다.
  useEffect(() => {
    if (!draftId || restoredRef.current || loading) return;
    // ★못 불러온 상태의 빈 목록을 "서버에 없다"로 믿으면, 이미 등록된 글을 또 되살려
    //  사용자가 보내기를 누르는 순간 같은 글이 2건이 된다(적대적 검토 지적).
    if (shownLoadError) return;
    restoredRef.current = true;
    const saved = readDraft(draftId);
    if (!saved) return;
    if (isDraftExpired(saved, Date.now())) {
      clearDraft(draftId);
      return;
    }
    if (!shouldRestoreDraft(saved.text, comments.map((c) => c.text))) {
      clearDraft(draftId); // 떠날 때 보낸 것이 실제로 들어갔다 — 담아 둔 것을 버린다
      return;
    }
    setDraft((cur) => (cur.trim() ? cur : saved.text));
  }, [draftId, loading, comments, shownLoadError]);

  // ② 치는 동안 계속 담아 둔다(잠깐 쉬었다 담아 두어 글자마다 저장하지 않게).
  useEffect(() => {
    if (!draftId) return;
    // 되살리기 판정 전에 빈 값으로 덮으면 담아 둔 글이 판정도 못 받고 지워진다.
    if (!restoredRef.current && !draft.trim()) return;
    sentOnLeaveRef.current = false; // 글이 바뀌었으니 떠날 때 다시 보낼 수 있다
    const t = window.setTimeout(() => writeDraft(draftId, draft), 400);
    return () => window.clearTimeout(t);
  }, [draftId, draft]);

  // ③ 화면을 벗어날 때.
  //    ★탭 전환·화면 잠금(hidden)에서는 **담아 두기만** 한다(적대적 검토 지적).
  //      여기서 보내면 다른 탭을 잠깐 본 것만으로 반쯤 친 글이 진짜 기록으로 등록되고,
  //      서버의 보호 규칙(화면이 못 본 글은 되살린다)이 그 반쪽 글을 영영 남긴다.
  //    ★진짜 떠날 때만 보내되 **딱 한 번**만 보낸다 — 브라우저가 떠남 신호를 두 번 주기 때문에
  //      막지 않으면 같은 글이 2건 등록된다.
  useEffect(() => {
    if (!draftId) return;
    const stash = () => {
      const text = draftRef.current;
      if (text.trim()) writeDraft(draftId, text);
    };
    /** 돌려주는 값: true 면 "떠나도 괜찮냐" 경고를 띄워야 한다. */
    const leave = (): boolean => {
      const text = draftRef.current;
      if (!text.trim()) return false;
      writeDraft(draftId, text);            // ㉠ 먼저 확실히 담아 둔다
      if (!sendOnLeave) return true;        // ㉢ 보낼 통로가 없다 → 경고
      if (sentOnLeaveRef.current) return false; // 이미 보냈다
      try {
        sendOnLeave(text);                  // ㉡ 성공 여부는 알 수 없다 — 다시 열 때 대조해 판정
        sentOnLeaveRef.current = true;
        return false;
      } catch {
        return true;                        // 보내기 자체를 못 걸었다 → 경고
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") stash();
    };
    const onPageHide = () => {
      leave();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leave()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      stash(); // 화면에서 사라질 때(상세창 닫기 등)도 담아 둔다 — 보내지는 않는다
    };
  }, [draftId, sendOnLeave]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments, loading, activeCategory]);

  // R9 — handlePaste (from ERP, gated by enableImagePaste)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!enableImagePaste) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && ALLOWED_IMAGE_TYPES.includes(item.type)) {
        const file = item.getAsFile();
        if (file) {
          if (file.size > MAX_IMAGE_SIZE) {
            doAlert(`이미지 크기가 10MB를 초과합니다: ${(file.size / (1024 * 1024)).toFixed(1)}MB`, { title: "오류" });
            continue;
          }
          imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      setPastedImages((prev) => [
        ...prev,
        ...imageFiles.map((file) => ({ file, preview: URL.createObjectURL(file) })),
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableImagePaste, doAlert]);

  const removePastedImage = (idx: number) => {
    setPastedImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSend = async () => {
    // R9: allow send when image present even if draft empty
    const hasText = draft.trim().length > 0;
    const hasImages = enableImagePaste && pastedImages.length > 0;
    if ((!hasText && !hasImages) || sending || uploading || locked) return;
    setSending(true);
    // ★올린 이미지 주소까지 합친 본문. 저장이 실패하면 이걸 통째로 입력칸에 되살린다
    //  (이미지는 이미 올라가 미리보기가 지워졌으므로, 본문만 되살리면 이미지 줄이 사라진다).
    let composed = "";
    try {
      const imageUrls: string[] = [];
      if (hasImages) {
        const toRevoke = pastedImages.map((p) => p.preview);
        try {
          if (!adapter.uploadImage) {
            doAlert("이미지 업로드가 지원되지 않습니다.", { title: "오류" });
            return;
          }
          setUploading(true);
          for (const img of pastedImages) {
            imageUrls.push(await adapter.uploadImage(img.file));
          }
        } catch (err) {
          doAlert(err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.", { title: "오류" });
          return;
        } finally {
          // 성공·실패 무관하게 미리보기 정리(메모리 누수 방지) + 첨부 비우기
          toRevoke.forEach((u) => URL.revokeObjectURL(u));
          setPastedImages([]);
          setUploading(false);
        }
      }
      // R9: appendImageLines from core (이미지 줄이 있으면 본문과 합침)
      composed = imageUrls.length > 0 ? appendImageLines(draft, imageUrls) : draft.trim();
      if (!composed) return;
      // 이미지가 붙었으면 입력칸도 합친 본문으로 맞춰 둔다 — 실패해도 이미지 줄이 남게.
      if (imageUrls.length > 0) setDraft(composed);

      const submitCategory: CommentCategory = activeCategory === "all" ? "general" : activeCategory;
      // R4: use adapter.create
      const updated = await adapter.create({ text: composed, category: submitCategory });
      setComments(updated);
      onCountChange?.(updated.length);
      setDraft("");
      if (draftId) clearDraft(draftId);
      textareaRef.current?.focus();
    } catch (err) {
      // ★전에는 기록만 남기고 사용자에게 아무 안내가 없었다 — 저장된 줄 알고 창을 닫았다.
      console.error("Failed to send comment:", err);
      if (composed) setDraft(composed);
      doAlert(saveFailureMessage(err, "히스토리"), { title: "저장 실패" });
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  // 화면에 노출되는 모든 카테고리 id 집합
  const knownCategoryIds = useMemo(() => {
    const set = new Set<string>(["policy", "free", "cert"]);
    for (const c of categories || []) set.add(c.id);
    return set;
  }, [categories]);

  useEffect(() => {
    if (categories === undefined) return;
    if (activeCategory === "all" || activeCategory === "general") return;
    if (knownCategoryIds.has(activeCategory)) return;
    setActiveCategory("all");
  }, [activeCategory, knownCategoryIds, categories]);

  // 카테고리별 카운트 (탭 배지)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, general: 0 };
    for (const c of comments) {
      counts.all += 1;
      const cat = c.category;
      if (cat && knownCategoryIds.has(cat)) {
        counts[cat] = (counts[cat] ?? 0) + 1;
      } else {
        counts.general += 1;
      }
    }
    return counts;
  }, [comments, knownCategoryIds]);

  // Oldest first + 활성 탭 필터링
  const sorted = useMemo(() => {
    const filtered = activeCategory === "all"
      ? comments
      : activeCategory === "general"
        ? comments.filter((c) => !c.category || !knownCategoryIds.has(c.category))
        : comments.filter((c) => c.category === activeCategory);
    return [...filtered].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [comments, activeCategory, knownCategoryIds]);

  // 공유 링크로 진입 시
  useEffect(() => {
    if (!focusCommentId || focusedRef.current || loading) return;
    const target = comments.find((c) => c.id === focusCommentId);
    if (!target) return;

    focusedRef.current = true;
    const cat = target.category;
    if (cat && knownCategoryIds.has(cat)) {
      setActiveCategory(cat);
    } else {
      setActiveCategory("general");
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = itemRefs.current[target.id];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setHighlightId(target.id);
          setTimeout(() => setHighlightId((cur) => (cur === target.id ? null : cur)), 2400);
        }
        onFocusHandled?.();
      });
    });
  }, [focusCommentId, comments, loading, onFocusHandled, knownCategoryIds]);

  const USER_COLORS = [
    "bg-wedly-accent",
    "bg-wedly-purple",
    "bg-wedly-green",
    "bg-wedly-orange",
    "bg-wedly-red",
    "bg-wedly-navy",
  ];
  const getUserColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
  };

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      {!hideCategories && (
      <div className="border-b border-wedly-bd/60 flex-shrink-0 flex items-center">
        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden pb-1 sm:pb-0">
        <div className="flex px-3 sm:px-6 min-w-max items-center">
        {(() => {
          const hiddenSet = new Set(hiddenFallbackIds || []);
          const userIdSet = new Set((categories || []).map((c) => c.id));
          const fallbackCats = CATEGORY_TABS_FALLBACK
            .filter((t) => t.id !== "all" && !hiddenSet.has(String(t.id)) && !userIdSet.has(String(t.id)))
            .map((t) => ({ id: t.id, label: t.label, removable: true, isFallback: true as const }));
          const userCats = (categories || []).map((c) => ({ id: c.id as ActiveTab, label: c.label, removable: true, isFallback: false as const }));
          const effectiveCats: { id: ActiveTab; label: string; removable: boolean; isFallback: boolean }[] = [
            { id: "all", label: "통합", removable: false, isFallback: false },
            ...fallbackCats,
            ...userCats,
          ];
          return effectiveCats.map((t) => {
            const isActive = activeCategory === t.id;
            const count = categoryCounts[t.id] || 0;
            const canEdit = isAdmin && categoryRenameMode && t.id !== "all";
            const isEditingLabel = editingCategoryId === t.id;
            const isDragging = draggingCategoryId === t.id;
            const commitRename = () => {
              const trimmed = categoryDraft.trim();
              if (trimmed && trimmed !== t.label && onRenameCategory) onRenameCategory(String(t.id), trimmed);
              setEditingCategoryId(null);
              setCategoryDraft("");
            };
            return (
              <div
                key={t.id}
                draggable={canEdit && !isEditingLabel}
                onDragStart={canEdit ? (e) => {
                  setDraggingCategoryId(String(t.id));
                  e.dataTransfer.effectAllowed = "move";
                  try { e.dataTransfer.setData("text/plain", String(t.id)); } catch { /* ignore */ }
                } : undefined}
                onDragOver={canEdit ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
                onDrop={canEdit && onReorderCategories ? (e) => {
                  e.preventDefault();
                  const from = draggingCategoryId;
                  setDraggingCategoryId(null);
                  if (!from || from === t.id) return;
                  const allIds = effectiveCats.filter((c) => c.id !== "all").map((c) => String(c.id));
                  const fromIdx = allIds.indexOf(from);
                  const toIdx = allIds.indexOf(String(t.id));
                  if (fromIdx < 0 || toIdx < 0) return;
                  const nextOrder = [...allIds];
                  nextOrder.splice(fromIdx, 1);
                  nextOrder.splice(toIdx, 0, from);
                  onReorderCategories(nextOrder);
                } : undefined}
                onDragEnd={() => setDraggingCategoryId(null)}
                className={cn(
                  "relative inline-flex items-center flex-shrink-0 my-1 mx-0.5",
                  isDragging && "opacity-40",
                  canEdit && !isEditingLabel && "cursor-grab active:cursor-grabbing"
                )}
              >
                {isEditingLabel ? (
                  <input
                    autoFocus
                    type="text"
                    value={categoryDraft}
                    maxLength={24}
                    onChange={(e) => setCategoryDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                      if (e.key === "Escape") { setEditingCategoryId(null); setCategoryDraft(""); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="px-3 py-2 text-[16px] sm:text-[13px] min-h-[40px] sm:min-h-[30px] font-semibold border border-wedly-accent rounded-full bg-white text-wedly-t1 outline-none focus:ring-2 focus:ring-wedly-accent/30 min-w-[80px]"
                  />
                ) : (
                  <button
                    onClick={() => {
                      if (canEdit) {
                        setEditingCategoryId(String(t.id));
                        setCategoryDraft(t.label);
                      } else {
                        setActiveCategory(t.id);
                      }
                    }}
                    className={cn(
                      "px-3 py-1.5 text-[13px] font-semibold rounded-full transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
                      isActive
                        ? "bg-wedly-bg-blue text-wedly-accent-ink"
                        : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2",
                      canEdit && "ring-1 ring-wedly-accent/30"
                    )}
                    title={canEdit ? "클릭해서 이름 수정 · 잡고 끌어서 순서 변경" : undefined}
                  >
                    <span>{t.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "tabular-nums text-[10.5px] font-semibold rounded px-1",
                        isActive ? "bg-white/70" : "bg-wedly-bg-gray"
                      )}>{count}</span>
                    )}
                  </button>
                )}
              </div>
            );
          });
        })()}
        </div>
        </div>
        {isAdmin && onAddCategory && (
          <div ref={categoryEditRootRef} className="relative pr-3 sm:pr-6 my-1 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowCategoryEditMenu((v) => !v); }}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap",
                showCategoryEditMenu
                  ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40"
                  : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
              )}
              title="탭 편집 (카테고리)"
              aria-label="탭 편집"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              탭 편집
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none" className={cn("transition-transform", showCategoryEditMenu && "rotate-180")}>
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showCategoryEditMenu && (
              <div className="absolute right-3 sm:right-6 top-full mt-1 z-50 bg-white border border-wedly-bd rounded-lg shadow-lg overflow-hidden min-w-[200px] py-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-wedly-muted uppercase tracking-wider border-b border-wedly-bd/60">
                  카테고리 관리
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onAddCategory(); setShowCategoryEditMenu(false); }}
                  className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  새 카테고리 추가
                </button>
                {onRenameCategory && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCategoryRenameMode((v) => !v); setShowCategoryEditMenu(false); }}
                    className={cn(
                      "w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2",
                      categoryRenameMode
                        ? "text-wedly-accent-ink bg-wedly-bg-blue/40 font-semibold"
                        : "text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink"
                    )}
                    title="사용자 정의 카테고리의 이름·순서 변경"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    {categoryRenameMode ? "카테고리 수정 종료" : "카테고리 수정 (이름·순서)"}
                  </button>
                )}
                {(onHideFallback || onUnhideFallback || onDeleteCategory) && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowCategoryHideManager(true); setShowCategoryEditMenu(false); }}
                    className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
                    title="카테고리 보임/숨김 토글 + 영구 삭제"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    카테고리 숨김 및 삭제
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* External memo */}
      {latestMemo && (
        <details className="border-b border-wedly-bd/60 bg-wedly-bg-yellow/30 group flex-shrink-0">
          <summary className="px-4 py-2 text-[11px] font-medium text-wedly-t2 cursor-pointer flex items-center justify-between">
            <span>외부 시스템 메모 (총 {memoCount}건) — 펼치기</span>
            <span className="text-wedly-t2 group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-4 pb-3 max-h-[140px] overflow-y-auto">
            <p className="text-[13px] text-wedly-t2 whitespace-pre-wrap leading-relaxed">
              {latestMemo}
            </p>
            <p className="text-[10px] text-wedly-t2 mt-1">
              * 가장 최근 메모만 표시됩니다.
            </p>
          </div>
        </details>
      )}

      {/* Comments list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-wedly-accent/30 border-t-wedly-accent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 && shownLoadError ? (
          /* ★못 불러온 것을 "아직 없습니다"로 위장하지 않는다(2026-08-26 배포본 확인에서 발견).
             그 문구가 뜨면 사용자는 기록이 0건이라고 읽는다 — 아래 오류 상자만 남긴다. */
          null
        ) : sorted.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-10 h-10 rounded-full bg-wedly-bg-gray flex items-center justify-center mx-auto mb-2">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M2 3h12v8a1 1 0 01-1 1H5l-3 3V3z" stroke="currentColor" strokeWidth="1.5" className="text-wedly-muted" />
              </svg>
            </div>
            <p className="text-[13px] text-wedly-muted">아직 히스토리가 없습니다</p>
          </div>
        ) : (
          sorted.map((c) => {
            const isHighlighted = highlightId === c.id;
            const isCopied = copiedId === c.id;
            // R9: parseCommentBody for rendering
            const bodyParts = parseCommentBody(c.text);
            // R9 본문 조각 — 정리 카드의 「원본 펼침」과 기존 렌더가 **같은 것**을 쓰게 한 번만 만든다.
            const bodyNodes = bodyParts.map((part, pi) =>
              part.type === "image" ? (
                <a key={pi} href={selfHostedFileUrl(part.url)} target="_blank" rel="noopener noreferrer" className="block my-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={historyThumbnailUrl(selfHostedFileUrl(part.url))} alt="첨부 이미지" className="max-w-full max-h-60 rounded-lg border border-wedly-bd hover:opacity-90 transition-opacity cursor-pointer" />
                </a>
              ) : (
                <span key={pi}>{part.value}{pi < bodyParts.length - 1 ? "\n" : ""}</span>
              )
            );
            return (
              <div
                key={c.id}
                ref={(el) => { itemRefs.current[c.id] = el; }}
                className={cn(
                  "group/comment relative scroll-mt-4 rounded-lg transition-shadow",
                  isHighlighted && "ring-2 ring-wedly-accent ring-offset-2 ring-offset-white"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0",
                    getUserColor(c.name)
                  )}>
                    {c.name.charAt(0)}
                  </div>
                  <span className="text-[12px] font-medium text-wedly-t1">{c.name}</span>
                  {/* R8: sourceBadge.isForeign + sourceBadge.label, same CSS classes */}
                  {sourceBadge.isForeign(c.source) && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-wedly-bg-gray text-wedly-t2 border border-wedly-bd"
                      title={`${sourceBadge.label}에서 작성된 기록입니다. 여기서는 읽기 전용입니다.`}
                    >
                      {sourceBadge.label}
                    </span>
                  )}
                  {/* R6: timeFormatter */}
                  <span className="text-[11px] text-wedly-muted tabular-nums">
                    {tf(c.createdAt)}
                  </span>
                  <div className="ml-auto inline-flex items-center gap-1.5">
                    <div className="inline-flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100 transition">
                    {!locked && canEditOrDelete(c) && editingCommentId !== c.id && (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          title="히스토리 수정"
                          aria-label="히스토리 수정"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-wedly-t2 hover:text-wedly-accent-ink hover:bg-wedly-bg-blue transition"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                          </svg>
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          title="히스토리 삭제"
                          aria-label="히스토리 삭제"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-wedly-t2 hover:text-wedly-red-ink hover:bg-wedly-bg-red transition"
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4l1 9a1 1 0 001 1h2a1 1 0 001-1l1-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span>삭제</span>
                        </button>
                      </>
                    )}
                    {/* R3: shareEnabled gates share button */}
                    {shareEnabled && (
                      <button
                        onClick={() => handleShare(c.id)}
                        title="히스토리 링크 복사"
                        aria-label="히스토리 링크 복사"
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] transition",
                          isCopied
                            ? "bg-wedly-bg-green text-wedly-green-ink opacity-100"
                            : "text-wedly-t2 hover:text-wedly-accent-ink hover:bg-wedly-bg-blue"
                        )}
                      >
                        {isCopied ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>복사됨</span>
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                              <path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.12 2.12 0 003 3l1.5-1.5M10.5 8.5L12 7a2.12 2.12 0 00-3-3L7.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>공유</span>
                          </>
                        )}
                      </button>
                    )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openKakao(c)}
                      title="대표님께 보낼 카톡 보고문을 보고 복사합니다"
                      aria-label="카톡 보고문 보기"
                      aria-haspopup="dialog"
                      className="inline-flex items-center gap-1 rounded-full border border-wedly-gold bg-wedly-bg-yellow px-2 py-[3px] text-[11px] font-semibold text-wedly-gold-ink transition duration-150 ease-out hover:-translate-y-px hover:shadow-sm focus-visible:outline-2 focus-visible:outline-wedly-accent"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7L5.6 21.3c-.1.3.3.6.5.4l4.6-3c.4 0 .9.1 1.3.1 5.5 0 10-3.6 10-8S17.5 3 12 3z" fill="currentColor" />
                      </svg>
                      <span>카톡 보고</span>
                    </button>
                  </div>
                </div>
                {editingCommentId === c.id ? (
                  <div className="ml-7 space-y-2">
                    <textarea
                      ref={editTextareaRef}
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit();
                      }}
                      rows={3}
                      className="w-full px-3 py-2 text-[16px] sm:text-[13px] border border-wedly-accent rounded-lg bg-white text-wedly-t1 resize-none outline-none focus:ring-2 focus:ring-wedly-accent/30 min-h-[56px] max-h-[320px] leading-relaxed overflow-y-auto"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="px-3 py-2 text-[14px] sm:text-[12px] min-h-[40px] sm:min-h-[30px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray disabled:opacity-50"
                      >
                        취소
                      </button>
                      <button
                        onClick={() => void saveEdit()}
                        disabled={editSaving || !editDraft.trim()}
                        className="px-3 py-2 text-[14px] sm:text-[12px] min-h-[40px] sm:min-h-[30px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 disabled:opacity-50"
                      >
                        {editSaving ? "저장 중..." : "저장"}
                      </button>
                    </div>
                  </div>
                ) : hasRenderableRecap(c) ? (
                  /* 정리본이 있으면 카드로. 원본은 카드 안에서 펼쳐 본다. */
                  <HistoryRecapCard recap={c.recap!}>{bodyNodes}</HistoryRecapCard>
                ) : (
                  /* R9: render via parseCommentBody — image parts → <img>, text parts → span */
                  <div className="ml-7 text-[13px] text-wedly-t2 whitespace-pre-wrap leading-relaxed bg-wedly-bg-gray rounded-lg px-3 py-2">
                    {bodyNodes}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ★못 불러왔을 때 — 옛 값으로 위장하지 않고 사실대로 알리고 입력을 잠근다.
          여기서 글을 쓰면 "화면엔 있는데 서버엔 없는" 어긋남이 생기고, 목록을 통째로
          저장하는 구조라 서버의 기존 기록을 덮을 위험이 있다. */}
      {shownLoadError && (
        <div className="mx-3 mb-2 flex items-start gap-2.5 rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3 py-2.5">
          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-wedly-red">
            <AlertTriangle className="h-4 w-4 text-white" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-wedly-red-ink break-keep">기록을 불러오지 못했어요</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-wedly-t2 break-keep">{shownLoadError}</p>
            {locked && (
              <p className="mt-1 text-[12px] leading-relaxed text-wedly-t2 break-keep">
                지금 쓰면 이미 있던 기록이 지워질 수 있어 입력을 잠갔습니다.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (onRetryLoad) {
                onRetryLoad();
                return;
              }
              setLoading(true);
              setSelfLoadError(null);
              fetchComments();
            }}
            className="flex flex-shrink-0 items-center gap-1 self-center rounded-lg border border-wedly-bd bg-white px-2.5 py-1.5 text-[12px] font-semibold text-wedly-t1 hover:bg-wedly-bg-gray"
          >
            <RotateCw className="h-3.5 w-3.5" />
            다시 시도
          </button>
        </div>
      )}

      {/* Composer — readOnly(보기전용)이면 작성칸 숨김 (노션 3867b6a9·하이브 정부지원금) */}
      {!locked && (
      <div className="border-t border-wedly-bd/60 px-4 py-3">
        {/* R9: image preview strip — only when enableImagePaste and images present */}
        {enableImagePaste && pastedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pastedImages.map((img, i) => (
              <div key={i} className="relative group/img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.preview} alt="붙여넣기 이미지" className="h-16 rounded-lg border border-wedly-bd object-cover" />
                <button
                  onClick={() => removePastedImage(i)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-wedly-red text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                >✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 한글 등 IME 조합 중 Enter는 무시 — 조합이 안 끝난 상태로 등록하면
              // 마지막 글자(예: "히스토리"의 "리")가 따로 또 등록되는 중복 입력 버그 방지.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            // R9: onPaste active only when enableImagePaste
            onPaste={enableImagePaste ? handlePaste : undefined}
            // R9: placeholder appends image hint when enableImagePaste
            placeholder={enableImagePaste
              ? "히스토리를 입력하세요... (Enter로 등록) · 이미지 Ctrl+V로 붙여넣기"
              : "히스토리를 입력하세요... (Enter로 등록)"}
            rows={2}
            className="flex-1 px-3 py-2 text-[16px] sm:text-[13px] border border-wedly-bd rounded-lg resize-none outline-none focus:ring-2 focus:ring-wedly-accent/20 focus:border-wedly-accent min-h-[96px] max-h-[320px] leading-relaxed overflow-y-auto"
          />
          <button
            onClick={handleSend}
            // R9: allow send when image present even if draft empty
            disabled={(!draft.trim() && !(enableImagePaste && pastedImages.length > 0)) || sending || uploading}
            className="self-end px-3 py-2 text-[13px] font-medium text-white bg-wedly-accent rounded-lg hover:bg-wedly-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? "업로드..." : sending ? "..." : "등록"}
          </button>
        </div>
      </div>
      )}

      {/* 카테고리 숨김 관리 모달 — 보임/숨김 토글 표 */}
      {showCategoryHideManager && (() => {
        const fallback = CATEGORY_TABS_FALLBACK.filter((t) => t.id !== "all").map((t) => ({ id: String(t.id), label: t.label, isFallback: true }));
        const userCats = (categories || []).map((c) => ({ id: c.id, label: c.label, isFallback: false }));
        const allRows = [...fallback, ...userCats];
        const hiddenSet = new Set(hiddenFallbackIds || []);
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowCategoryHideManager(false)} />
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wedly-bd flex flex-col max-h-[80vh]">
              <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
                <h3 className="text-wedly-sub font-bold text-wedly-navy">카테고리 숨김 관리</h3>
                <p className="mt-1 text-[12px] text-wedly-muted">화면에서 일시적으로 가려 둘 카테고리를 켜고 끌 수 있어요. 삭제와 달리 다시 보이기 가능합니다.</p>
              </div>
              <div className="px-5 py-3 overflow-y-auto flex-1 space-y-1.5">
                {allRows.length === 0 && (
                  <div className="text-[12px] text-wedly-muted py-4 text-center">아직 카테고리가 없습니다.</div>
                )}
                {allRows.map((row) => {
                  const isHidden = hiddenSet.has(row.id);
                  return (
                    <div key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-wedly-bd">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium text-wedly-t1 truncate">{row.label}</span>
                        {row.isFallback && <span className="text-[10px] text-wedly-t2 bg-wedly-bg-gray rounded px-1.5 py-0.5">기본</span>}
                        {isHidden && <span className="text-[10px] text-wedly-t1 bg-wedly-bg-yellow/40 border border-wedly-orange/30 rounded px-1.5 py-0.5">숨김</span>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (isHidden) onUnhideFallback?.(row.id);
                            else onHideFallback?.(row.id);
                          }}
                          className={cn(
                            "px-3 py-1 text-[12px] font-semibold rounded-md border transition-colors",
                            isHidden
                              ? "bg-wedly-accent text-white border-wedly-accent hover:brightness-110"
                              : "bg-white text-wedly-t2 border-wedly-bd hover:bg-wedly-bg-gray"
                          )}
                        >
                          {isHidden ? "다시 보이기" : "숨기기"}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await doConfirm(
                              `"${row.label}" 카테고리를 영구 삭제하시겠습니까? 옛 글은 통합 탭에서 계속 볼 수 있습니다. 되돌리기 어렵습니다.`,
                              { title: "카테고리 삭제", danger: true }
                            );
                            if (ok) {
                              if (row.isFallback) onHideFallback?.(row.id);
                              else onDeleteCategory?.(row.id);
                            }
                          }}
                          className="px-3 py-1 text-[12px] font-semibold rounded-md border border-wedly-bd-red bg-white text-wedly-red-ink hover:bg-wedly-bg-red/40 transition-colors"
                          title="카테고리 영구 삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCategoryHideManager(false)}
                  className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <KakaoReportDialog
        open={!!kakaoDialog}
        loading={kakaoDialog?.loading ?? false}
        text={kakaoDialog?.text ?? ""}
        source={kakaoDialog?.source ?? "none"}
        subtitle={kakaoDialog ? `${kakaoDialog.comment.name ?? ""} · ${tf(kakaoDialog.comment.createdAt)} 기록에서`.trim() : undefined}
        onClose={closeKakao}
        onCopy={copyText}
      />
    </div>
  );
}
