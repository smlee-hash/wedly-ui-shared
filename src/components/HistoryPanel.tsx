// 공용 히스토리(상담기록) 패널 — 하이브·ERP·일루아 공유.
// 소스 진실: 하이브 HistoryPanel (기능·마크업·CSS 100% 동일) +
//   이미지 붙여넣기(ERP 출처, enableImagePaste prop 으로 게이트).
// 외부 의존 없이 adapter/props 주입 방식.

"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "../lib/cn";
import { timeAgo as defaultTimeAgo } from "../lib/utils";
import {
  parseCommentBody,
  appendImageLines,
  canEditOrDelete as coreCanEditOrDelete,
  type UnifiedComment,
} from "../unified/history-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommentCategory = string;
export type ActiveTab = "all" | CommentCategory;
export type HistoryCategoryDef = { id: string; label: string; color?: "blue" | "green" | "purple" | "orange" | "red" | "gold" | "gray"; panelId?: string };

// 색상별 활성 탭 스타일 매핑 — 어드민이 색만 고르면 자동 적용
export const CATEGORY_COLOR_CLASS: Record<NonNullable<HistoryCategoryDef["color"]>, string> = {
  gray: "bg-wedly-bg-gray text-wedly-navy border-wedly-bd",
  blue: "bg-wedly-bg-blue text-wedly-accent border-wedly-bd-blue",
  green: "bg-wedly-bg-green text-wedly-green border-wedly-bd-green",
  purple: "bg-wedly-bg-purple text-wedly-purple border-[var(--wedly-purple)]/30",
  orange: "bg-wedly-bg-yellow text-wedly-orange border-wedly-orange/30",
  red: "bg-wedly-bg-red text-wedly-red border-wedly-bd-red",
  gold: "bg-wedly-bg-yellow text-wedly-gold border-wedly-gold/30",
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      doAlert(err instanceof Error ? err.message : "수정 실패", { title: "오류" });
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
      doAlert(err instanceof Error ? err.message : "삭제 실패", { title: "오류" });
    }
  };

  // ─── 히스토리 공유 — 링크 복사 + 포커스 처리 ───
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const focusedRef = useRef(false);

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
    } catch (err) {
      console.error("Failed to fetch comments:", err);
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
    if ((!hasText && !hasImages) || sending || uploading) return;
    setSending(true);
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
      const text = imageUrls.length > 0 ? appendImageLines(draft, imageUrls) : draft.trim();
      if (!text) return;

      const submitCategory: CommentCategory = activeCategory === "all" ? "general" : activeCategory;
      // R4: use adapter.create
      const updated = await adapter.create({ text, category: submitCategory });
      setComments(updated);
      onCountChange?.(updated.length);
      setDraft("");
      textareaRef.current?.focus();
    } catch (err) {
      console.error("Failed to send comment:", err);
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
                        ? "bg-wedly-bg-blue text-wedly-accent"
                        : "text-wedly-muted hover:bg-wedly-bg-gray hover:text-wedly-t2",
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
                  ? "border-wedly-accent text-wedly-accent bg-wedly-bg-blue/40"
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
                  className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent transition flex items-center gap-2"
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
                        ? "text-wedly-accent bg-wedly-bg-blue/40 font-semibold"
                        : "text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent"
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
                    className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent transition flex items-center gap-2"
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
          <summary className="px-4 py-2 text-[11px] font-medium text-wedly-muted cursor-pointer flex items-center justify-between">
            <span>외부 시스템 메모 (총 {memoCount}건) — 펼치기</span>
            <span className="text-wedly-muted group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-4 pb-3 max-h-[140px] overflow-y-auto">
            <p className="text-[13px] text-wedly-t2 whitespace-pre-wrap leading-relaxed">
              {latestMemo}
            </p>
            <p className="text-[10px] text-wedly-muted mt-1">
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
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-wedly-bg-gray text-wedly-muted border border-wedly-bd"
                      title={`${sourceBadge.label}에서 작성된 기록입니다. 여기서는 읽기 전용입니다.`}
                    >
                      {sourceBadge.label}
                    </span>
                  )}
                  {/* R6: timeFormatter */}
                  <span className="text-[11px] text-wedly-muted tabular-nums">
                    {tf(c.createdAt)}
                  </span>
                  <div className="ml-auto inline-flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 focus-within:opacity-100 transition">
                    {!readOnly && canEditOrDelete(c) && editingCommentId !== c.id && (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          title="히스토리 수정"
                          aria-label="히스토리 수정"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-wedly-muted hover:text-wedly-accent hover:bg-wedly-bg-blue transition"
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
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] text-wedly-muted hover:text-wedly-red hover:bg-wedly-bg-red transition"
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
                            ? "bg-wedly-bg-green text-wedly-green opacity-100"
                            : "text-wedly-muted hover:text-wedly-accent hover:bg-wedly-bg-blue"
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
                </div>
                {editingCommentId === c.id ? (
                  <div className="ml-7 space-y-2">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void saveEdit();
                      }}
                      rows={3}
                      className="w-full px-3 py-2 text-[16px] sm:text-[13px] border border-wedly-accent rounded-lg bg-white text-wedly-t1 resize-y outline-none focus:ring-2 focus:ring-wedly-accent/30"
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
                ) : (
                  /* R9: render via parseCommentBody — image parts → <img>, text parts → span */
                  <div className="ml-7 text-[13px] text-wedly-t2 whitespace-pre-wrap leading-relaxed bg-wedly-bg-gray rounded-lg px-3 py-2">
                    {bodyParts.map((part, pi) =>
                      part.type === "image" ? (
                        <a key={pi} href={part.url} target="_blank" rel="noopener noreferrer" className="block my-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={part.url} alt="첨부 이미지" className="max-w-full max-h-60 rounded-lg border border-wedly-bd hover:opacity-90 transition-opacity cursor-pointer" />
                        </a>
                      ) : (
                        <span key={pi}>{part.value}{pi < bodyParts.length - 1 ? "\n" : ""}</span>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — readOnly(보기전용)이면 작성칸 숨김 (노션 3867b6a9·하이브 정부지원금) */}
      {!readOnly && (
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
            className="flex-1 px-3 py-2 text-[16px] sm:text-[13px] border border-wedly-bd rounded-lg resize-none outline-none focus:ring-2 focus:ring-wedly-accent/20 focus:border-wedly-accent"
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
                <h3 className="text-[15px] font-bold text-wedly-navy">카테고리 숨김 관리</h3>
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
                        {row.isFallback && <span className="text-[10px] text-wedly-muted bg-wedly-bg-gray rounded px-1.5 py-0.5">기본</span>}
                        {isHidden && <span className="text-[10px] text-wedly-orange bg-wedly-bg-yellow/40 border border-wedly-orange/30 rounded px-1.5 py-0.5">숨김</span>}
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
                          className="px-3 py-1 text-[12px] font-semibold rounded-md border border-wedly-bd-red bg-white text-wedly-red hover:bg-wedly-bg-red/40 transition-colors"
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
    </div>
  );
}
