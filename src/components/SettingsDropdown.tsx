"use client";

/**
 * 관리 도구 드롭다운 — 톱니 버튼 + 펼침 메뉴
 * (SubsidyClient.tsx 모듈화 D 2단계, 2026-05-25)
 *
 * 기본은 어드민용(7개 기본 메뉴 + 사용자 추가 항목).
 * 2026-07-23부터 부모가 전 직원용 축약 메뉴(menusForAll)를 넘기면 비어드민에게도 뜬다 — 그때는 editable=false 로 꾸미기 없이 목록만.
 * 편집 모드에서: 끌어서 순서 이동 / 제목 수정 / 숨김·복원 / 사용자 추가 항목 삭제 / 새 항목 추가
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export type SettingsMenuItem = {
  id: string;
  label: string;
  icon: string;
  onClick: () => void;
  isCustom?: boolean;
  url?: string;
};

export type SettingsCustomItem = { id: string; label: string; url?: string };

type Props = {
  // 어드민 전용 — 어드민이 아니면 트리거 자체 렌더 안 됨 (부모가 isAdmin gate)
  // 그래도 부품 안에서도 추가 가드 (이중)
  baseMenus: SettingsMenuItem[];
  // 조건부 서식 활성 규칙 수 (배지 표시)
  cfActiveCount: number;
  // 서버 동기화 상태 + 콜백
  settingsMenuOrder: string[];
  persistSettingsMenuOrder: (next: string[]) => void;
  settingsMenuLabelOverrides: Record<string, string>;
  persistSettingsMenuLabel: (id: string, label: string) => void;
  settingsMenuHidden: string[];
  persistSettingsMenuHidden: (next: string[]) => void;
  settingsMenuCustom: SettingsCustomItem[];
  persistSettingsMenuCustom: (
    updater: SettingsCustomItem[] | ((prev: SettingsCustomItem[]) => SettingsCustomItem[]),
  ) => void;
  isSafeMenuUrl: (url: string) => boolean;
  // 안내 토스트
  onToast: (msg: { message: string; type: "success" | "error" }) => void;
  // 메뉴 꾸미기(순서·이름·숨김·항목 추가) 허용 여부. 기본 true(어드민).
  // 전 직원에게 여는 축약 메뉴에서는 false — 저장 통로가 없어 편집이 헛도는 것을 막는다.
  editable?: boolean;
};

export function SettingsDropdown({
  baseMenus,
  cfActiveCount,
  settingsMenuOrder,
  persistSettingsMenuOrder,
  settingsMenuLabelOverrides,
  persistSettingsMenuLabel,
  settingsMenuHidden,
  persistSettingsMenuHidden,
  settingsMenuCustom,
  persistSettingsMenuCustom,
  isSafeMenuUrl,
  onToast,
  editable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 편집 모드 UI 토글 (서버 저장 X — 한 세션 안에서만 유지)
  const [editingMode, setEditingMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemLabel, setEditingItemLabel] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // 드래그앤드롭 임시 상태
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // 드롭다운 닫히면 편집 모드/입력 상태 자동 해제 — 다음에 열 때 ⋮⋮ 가 갑자기 등장하는 혼란 방지
  useEffect(() => {
    if (!open && editingMode) {
      setEditingMode(false);
      setEditingItemId(null);
      setAddingItem(false);
    }
  }, [open, editingMode]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // 사용자 추가 항목 → 메뉴 형태로 변환 (외부 링크 열기 또는 라벨만)
  const customAsMenus: SettingsMenuItem[] = settingsMenuCustom.map((c) => ({
    id: c.id,
    label: c.label,
    icon: "🔗",
    isCustom: true,
    url: c.url,
    onClick: () => {
      if (c.url && c.url.trim()) {
        try {
          window.open(c.url, "_blank", "noopener,noreferrer");
        } catch {
          /* ignore */
        }
      } else {
        onToast({ message: `'${c.label}' 항목은 링크가 없습니다`, type: "success" });
      }
    },
  }));

  const allMenus = [...baseMenus, ...customAsMenus];
  const byId = new Map(allMenus.map((m) => [m.id, m]));
  const ordered: SettingsMenuItem[] = [];
  const seen = new Set<string>();
  for (const id of settingsMenuOrder) {
    const m = byId.get(id);
    if (m) {
      ordered.push(m);
      seen.add(id);
    }
  }
  for (const m of allMenus) {
    if (!seen.has(m.id)) ordered.push(m);
  }
  const hiddenSet = new Set(settingsMenuHidden);
  const visible = editingMode ? ordered : ordered.filter((m) => !hiddenSet.has(m.id));

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full inline-flex items-center justify-center gap-1.5 h-[44px] md:h-[36px] px-3 text-[13px] font-semibold border rounded-lg transition-colors whitespace-nowrap",
          open
            ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40"
            : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1",
        )}
        title="관리 도구"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        관리 도구
        <svg
          width="8"
          height="8"
          viewBox="0 0 12 12"
          fill="none"
          className={cn("transition-transform ml-0.5", open && "rotate-180")}
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 md:left-auto md:right-0 top-full mt-1 z-50 bg-white border border-wedly-bd rounded-lg shadow-lg min-w-[260px] py-1">
          {editable && (
          <div className="px-3 py-1.5 border-b border-wedly-bd/60 flex items-center justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEditingMode((v) => !v);
                setEditingItemId(null);
                setAddingItem(false);
              }}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-semibold transition-colors",
                editingMode ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1",
              )}
            >
              {editingMode ? "완료" : "편집"}
            </button>
          </div>
          )}
          {visible.map((m) => {
            const isDragging = draggingId === m.id;
            const isDragOver = dragOverId === m.id && draggingId && draggingId !== m.id;
            const isHidden = hiddenSet.has(m.id);
            const isEditingLabel = editingItemId === m.id;
            const displayLabel = settingsMenuLabelOverrides[m.id] || m.label;
            return (
              <div
                key={m.id}
                draggable={editingMode}
                onDragStart={(e) => {
                  if (!editingMode) {
                    e.preventDefault();
                    return;
                  }
                  setDraggingId(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  try {
                    e.dataTransfer.setData("text/plain", m.id);
                  } catch {
                    /* ignore */
                  }
                }}
                onDragOver={(e) => {
                  if (!editingMode) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverId(m.id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  if (!editingMode) return;
                  e.preventDefault();
                  const from = draggingId;
                  setDraggingId(null);
                  setDragOverId(null);
                  if (!from || from === m.id) return;
                  const cur = ordered.map((x) => x.id);
                  const fromIdx = cur.indexOf(from);
                  const toIdx = cur.indexOf(m.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  const next = [...cur];
                  next.splice(fromIdx, 1);
                  next.splice(toIdx, 0, from);
                  persistSettingsMenuOrder(next);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 transition-colors",
                  editingMode ? "cursor-grab active:cursor-grabbing" : "",
                  isDragging && "opacity-40",
                  isDragOver && "bg-wedly-bg-blue/40",
                  isHidden && "opacity-50",
                )}
              >
                {editingMode && (
                  <span className="pl-2 text-wedly-muted/60 select-none" title="끌어서 순서 이동">
                    ⋮⋮
                  </span>
                )}
                {isEditingLabel ? (
                  <input
                    autoFocus
                    value={editingItemLabel}
                    onChange={(e) => setEditingItemLabel(e.target.value)}
                    onBlur={() => {
                      persistSettingsMenuLabel(m.id, editingItemLabel);
                      setEditingItemId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        persistSettingsMenuLabel(m.id, editingItemLabel);
                        setEditingItemId(null);
                      }
                      if (e.key === "Escape") {
                        setEditingItemId(null);
                      }
                    }}
                    className="flex-1 px-2 py-1.5 text-[12.5px] border border-wedly-accent rounded outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingMode) return; // 편집 모드에서는 클릭 무시
                      m.onClick();
                      setOpen(false);
                    }}
                    className="flex-1 flex items-center gap-2 px-2 py-2 text-[12.5px] text-left text-wedly-t1 hover:bg-wedly-bg-blue/30 transition-colors"
                  >
                    <span className="text-[14px] leading-none">{m.icon}</span>
                    {displayLabel}
                    {m.id === "conditional-format" && cfActiveCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-wedly-bg-blue text-wedly-accent-ink text-[10.5px] font-bold tabular-nums">
                        {cfActiveCount}
                      </span>
                    )}
                  </button>
                )}
                {editingMode && !isEditingLabel && (
                  <div className="flex items-center gap-0.5 pr-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingItemId(m.id);
                        setEditingItemLabel(displayLabel);
                      }}
                      title="제목 수정"
                      className="w-6 h-6 inline-flex items-center justify-center rounded text-wedly-t2 hover:text-wedly-accent-ink hover:bg-wedly-bg-blue/40"
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {m.isCustom ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          persistSettingsMenuCustom((prev) => prev.filter((x) => x.id !== m.id));
                        }}
                        title="삭제"
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-wedly-t2 hover:text-wedly-red-ink hover:bg-wedly-bg-red/40"
                      >
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M3 4h10M6 4V3h4v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = isHidden
                            ? settingsMenuHidden.filter((x) => x !== m.id)
                            : [...settingsMenuHidden, m.id];
                          persistSettingsMenuHidden(next);
                        }}
                        title={isHidden ? "보이기" : "숨김"}
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-wedly-t2 hover:text-wedly-t1 hover:bg-wedly-bg-gray"
                      >
                        {isHidden ? (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.3" />
                            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {/* 새 항목 추가 (편집 모드에서만) */}
          {editingMode && (
            <div className="border-t border-wedly-bd/60 mt-1 pt-1">
              {addingItem ? (
                <div className="px-2 py-2 space-y-1.5">
                  <input
                    autoFocus
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setAddingItem(false);
                        setNewLabel("");
                        setNewUrl("");
                      }
                    }}
                    placeholder="항목 제목 (예: 매뉴얼)"
                    className="w-full px-2 py-1.5 text-[12.5px] border border-wedly-bd rounded outline-none focus:border-wedly-accent"
                  />
                  <input
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setAddingItem(false);
                        setNewLabel("");
                        setNewUrl("");
                      }
                    }}
                    placeholder="링크 주소 (선택, 비워두면 라벨만)"
                    className="w-full px-2 py-1.5 text-[12.5px] border border-wedly-bd rounded outline-none focus:border-wedly-accent"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const label = newLabel.trim();
                        if (!label) return;
                        const url = newUrl.trim();
                        if (url && !isSafeMenuUrl(url)) {
                          onToast({ message: "링크 주소는 http(s):// 로 시작하거나 / 경로만 허용됩니다", type: "error" });
                          return;
                        }
                        let id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        const existing = new Set(settingsMenuCustom.map((x) => x.id));
                        while (existing.has(id)) {
                          id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        }
                        persistSettingsMenuCustom((prev) => [...prev, { id, label, url: url || undefined }]);
                        setNewLabel("");
                        setNewUrl("");
                        setAddingItem(false);
                      }}
                      className="flex-1 px-2 py-1 text-[11.5px] font-semibold bg-wedly-accent text-white rounded hover:bg-wedly-accent/90"
                    >
                      추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingItem(false);
                        setNewLabel("");
                        setNewUrl("");
                      }}
                      className="px-2 py-1 text-[11.5px] text-wedly-t2 border border-wedly-bd rounded hover:bg-wedly-bg-gray"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItem(true)}
                  className="w-full px-3 py-1.5 text-[12px] text-wedly-accent-ink hover:bg-wedly-bg-blue/30 transition-colors flex items-center gap-1.5"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  새 항목 추가
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
