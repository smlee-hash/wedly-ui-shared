"use client";

/**
 * 상세 모달의 상위 패널(상세정보 / 히스토리 / 파일 외 사용자 정의)을 추가하는 작은 모달.
 * 도메인 의존성 0 — props 만 받음. 디자인은 AGENTS.md §6-1 위들리 표준.
 *
 * 종류:
 *   - memo : 텍스트 메모 (가장 단순, 위험도 0)
 *   - embed: 외부 페이지 iframe (https 만 허용, sandbox 강제)
 *   - fields: 컬럼 모음 (기존 properties 패널과 같은 구조 — 후속 지원)
 *   - history: 히스토리 (별도 코멘트 영역 — 후속 지원)
 *   - files: 파일 (별도 카테고리 — 후속 지원)
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export type PanelKind = "memo" | "embed" | "fields" | "history" | "files";

export type PanelEditorAddPayload = {
  id: string;
  label: string;
  kind: PanelKind;
  embedUrl?: string;
};

export type CustomPanelItem = {
  id: string;
  label: string;
  kind: PanelKind;
  embedUrl?: string;
};

const PANEL_KIND_OPTIONS: Array<{ value: PanelKind; label: string; description: string; supported: boolean }> = [
  { value: "memo",   label: "텍스트 메모",  description: "사업장마다 자유롭게 쓸 수 있는 긴 글 영역", supported: true },
  { value: "embed",  label: "외부 페이지",  description: "다른 웹페이지(예: 노션·구글시트)를 패널 안에 띄움. https 만 허용", supported: true },
  { value: "fields", label: "컬럼 모음",    description: "상세정보 패널처럼 하위 섹션과 컬럼들로 구성. 만든 뒤 안에서 섹션·컬럼을 추가하세요.", supported: true },
  { value: "history",label: "히스토리",      description: "별도 코멘트·기록 영역. 패널마다 독립된 글 묶음. 만든 뒤 안에서 카테고리·코멘트 작성.", supported: true },
  { value: "files",  label: "파일 모음",    description: "별도 파일 첨부 영역. 패널마다 독립된 파일 묶음.", supported: true },
];

function makePanelId(): string {
  let rand = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    rand = Array.from(arr).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6);
  } else {
    rand = Math.floor(Math.random() * 1e9).toString(36).slice(0, 6);
  }
  return `panel-${Date.now().toString(36).slice(-4)}-${rand}`;
}

function isValidHttpsUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function PanelEditorAddModal({
  open,
  existingIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  existingIds: string[];
  onClose: () => void;
  onConfirm: (payload: PanelEditorAddPayload) => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<PanelKind>("memo");
  const [embedUrl, setEmbedUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLabel("");
      setKind("memo");
      setEmbedUrl("");
      setErr(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setErr("패널 이름을 입력해 주세요.");
      return;
    }
    if (trimmed.length > 24) {
      setErr("패널 이름은 24자 이내로 입력해 주세요.");
      return;
    }
    if (kind === "embed") {
      const urlTrim = embedUrl.trim();
      if (!urlTrim) {
        setErr("외부 페이지 주소(https://...)를 입력해 주세요.");
        return;
      }
      if (!isValidHttpsUrl(urlTrim)) {
        setErr("https:// 로 시작하는 정상 주소만 가능합니다.");
        return;
      }
    }
    // id 만들기 + 중복 방지
    let id = makePanelId();
    while (existingIds.includes(id)) id = makePanelId();
    onConfirm({
      id,
      label: trimmed,
      kind,
      embedUrl: kind === "embed" ? embedUrl.trim() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-wedly-bd">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
          <h3 className="text-wedly-sub font-bold text-wedly-navy">새 상위 패널 만들기</h3>
          <p className="mt-1 text-[12px] text-wedly-muted">상세 모달 좌상단(상세 정보 · 히스토리 · 파일) 옆에 새 탭을 추가합니다.</p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-wedly-t2 mb-1.5">패널 이름</label>
            <input
              ref={inputRef}
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); if (err) setErr(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
                if (e.key === "Escape") onClose();
              }}
              placeholder="예: 메모 / 거래내역 / 외부 자료"
              className={cn(
                "w-full px-3 py-2 text-[15px] sm:text-[13px] border rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none transition-colors",
                err
                  ? "border-wedly-red focus:border-wedly-red focus:ring-2 focus:ring-wedly-red/20"
                  : "border-wedly-bd focus:border-wedly-accent focus:ring-2 focus:ring-wedly-accent/30 hover:border-wedly-accent/50"
              )}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-wedly-t2 mb-1.5">패널 종류</label>
            <div className="space-y-1.5">
              {PANEL_KIND_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg border transition-colors",
                    !opt.supported
                      ? "border-wedly-bd bg-wedly-bg-gray/40 opacity-60 cursor-not-allowed"
                      : kind === opt.value
                        ? "border-wedly-accent bg-wedly-bg-blue/30 cursor-pointer"
                        : "border-wedly-bd hover:bg-wedly-bg-gray cursor-pointer"
                  )}
                >
                  <input
                    type="radio"
                    name="panel-kind"
                    value={opt.value}
                    checked={kind === opt.value}
                    onChange={() => { if (opt.supported) { setKind(opt.value); setErr(null); } }}
                    disabled={!opt.supported}
                    className="mt-0.5 accent-wedly-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-wedly-t1">{opt.label}</span>
                      {!opt.supported && (
                        <span className="text-[10px] font-semibold text-wedly-orange bg-wedly-bg-yellow/40 border border-wedly-orange/30 rounded px-1.5 py-0.5">곧 지원</span>
                      )}
                    </div>
                    <div className="text-[11px] text-wedly-muted mt-0.5">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {kind === "embed" && (
            <div>
              <label className="block text-[12px] font-semibold text-wedly-t2 mb-1.5">외부 페이지 주소 (https 만)</label>
              <input
                type="url"
                value={embedUrl}
                onChange={(e) => { setEmbedUrl(e.target.value); if (err) setErr(null); }}
                placeholder="https://example.com/document"
                className={cn(
                  "w-full px-3 py-2 text-[14px] sm:text-[12px] border rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none transition-colors font-mono",
                  err && err.includes("https")
                    ? "border-wedly-red focus:border-wedly-red focus:ring-2 focus:ring-wedly-red/20"
                    : "border-wedly-bd focus:border-wedly-accent focus:ring-2 focus:ring-wedly-accent/30"
                )}
              />
              <p className="mt-1 text-[11px] text-wedly-muted">
                일부 사이트는 외부에서 띄우는 것을 막아 빈 화면이 보일 수 있습니다 (보안 정책).
              </p>
            </div>
          )}
          {err && <p className="text-[11px] text-wedly-red">{err}</p>}
        </div>
        <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors"
          >
            패널 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 패널 관리 통합 모달 — 추가/이름수정/삭제를 한 화면에서.
 *   - 상단: "+ 새 패널 만들기" 버튼 (클릭 시 onRequestAdd 콜백 — 부모가 PanelEditorAddModal 띄움)
 *   - 본문: 기존 사용자 정의 패널 목록. 각 행은 이름 인라인 편집(연필) + X 삭제 + 종류 칩.
 *   - 기본 패널(상세정보/히스토리/파일)은 항상 회색으로 비활성 — 어드민도 못 만지게.
 */
export function PanelManagerModal({
  open,
  customPanels,
  builtinPanels,
  onClose,
  onRequestAdd,
  onRename,
  onDelete,
}: {
  open: boolean;
  customPanels: CustomPanelItem[];
  /** 기본 패널(상세정보/히스토리/파일) — 표시만, 편집 불가 */
  builtinPanels: Array<{ id: string; label: string }>;
  onClose: () => void;
  onRequestAdd: () => void;
  onRename: (panelId: string, newLabel: string) => void;
  onDelete: (panelId: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraft("");
    }
  }, [open]);

  if (!open) return null;

  const KIND_LABEL: Record<PanelKind, string> = {
    memo: "텍스트 메모",
    embed: "외부 페이지",
    fields: "컬럼 모음",
    history: "히스토리",
    files: "파일 모음",
  };

  const commitRename = (id: string) => {
    const trimmed = draft.trim();
    const cur = customPanels.find((p) => p.id === id);
    if (trimmed && cur && trimmed !== cur.label && trimmed.length <= 24) {
      onRename(id, trimmed);
    }
    setEditingId(null);
    setDraft("");
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-wedly-bd flex flex-col max-h-[80vh]">
        <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60 flex items-center justify-between">
          <div>
            <h3 className="text-wedly-sub font-bold text-wedly-navy">상위 패널 관리</h3>
            <p className="mt-1 text-[12px] text-wedly-muted">상세 모달 좌상단의 탭들을 추가·이름수정·삭제합니다.</p>
          </div>
          <button
            type="button"
            onClick={onRequestAdd}
            className="px-3 py-1.5 rounded-lg bg-wedly-accent text-white text-[12px] font-bold hover:brightness-110 transition-colors flex items-center gap-1 flex-shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            새 패널
          </button>
        </div>
        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-wedly-muted uppercase tracking-wider mb-1.5">기본 패널</p>
            <div className="space-y-1">
              {builtinPanels.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-wedly-bg-gray/50 border border-wedly-bd/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-medium text-wedly-t1 truncate">{p.label}</span>
                    <span className="text-[10px] text-wedly-muted bg-white rounded px-1.5 py-0.5 border border-wedly-bd/60">기본</span>
                  </div>
                  <span className="text-[11px] text-wedly-muted">변경 불가</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-wedly-muted uppercase tracking-wider mb-1.5">
              사용자 정의 패널 ({customPanels.length}개)
            </p>
            {customPanels.length === 0 ? (
              <div className="rounded-xl border border-dashed border-wedly-bd p-6 text-center text-[12px] text-wedly-muted">
                아직 추가한 패널이 없습니다. 우상단 &quot;새 패널&quot; 버튼으로 만들어 보세요.
              </div>
            ) : (
              <div className="space-y-1">
                {customPanels.map((p) => {
                  const isEditing = editingId === p.id;
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-wedly-bd bg-white hover:border-wedly-accent/40 transition-colors">
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={draft}
                          maxLength={24}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commitRename(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); commitRename(p.id); }
                            if (e.key === "Escape") { setEditingId(null); setDraft(""); }
                          }}
                          className="flex-1 min-w-0 px-2 py-1 text-[13px] border border-wedly-accent rounded outline-none focus:ring-2 focus:ring-wedly-accent/30 bg-white"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingId(p.id); setDraft(p.label); }}
                          className="flex-1 min-w-0 text-left text-[13px] font-medium text-wedly-t1 truncate hover:text-wedly-accent-ink transition-colors"
                          title="클릭해서 이름 수정"
                        >
                          {p.label}
                        </button>
                      )}
                      <span className="text-[10px] text-wedly-accent-ink bg-wedly-bg-blue/40 rounded px-1.5 py-0.5 flex-shrink-0">
                        {KIND_LABEL[p.kind]}
                      </span>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => { setEditingId(p.id); setDraft(p.label); }}
                          className="w-6 h-6 rounded hover:bg-wedly-bg-gray text-wedly-muted hover:text-wedly-t2 flex items-center justify-center flex-shrink-0"
                          title="이름 수정"
                          aria-label="이름 수정"
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                            <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDelete(p.id)}
                        className="w-6 h-6 rounded hover:bg-wedly-bg-red text-wedly-muted hover:text-wedly-red-ink flex items-center justify-center flex-shrink-0"
                        title="패널 삭제"
                        aria-label="패널 삭제"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                          <path d="M3 5h10M5 5V3a1 1 0 011-1h4a1 1 0 011 1v2M5 5v9a1 1 0 001 1h4a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
