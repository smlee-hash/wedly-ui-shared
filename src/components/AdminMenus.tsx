"use client";

/**
 * 상세 모달 안 어드민 메뉴 두 종
 *   - FieldRowAdminMenu: 컬럼(행) 옆 3점 메뉴 (다른 섹션 이동·숨김·삭제·타입 변경)
 *   - SectionAdminMenu: 섹션 헤더 옆 ⚙️ 메뉴 (컬럼 추가·순서 초기화·삭제 모드·편집 모드 토글)
 *
 * 둘 다 도메인 의존성 없음. props 만 받음.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";

export function FieldRowAdminMenu({
  fieldKey,
  fieldLabel,
  currentSectionId,
  allSections,
  onMoveColumn,
  onHideColumn,
  onDeleteColumn,
  canDelete,
  onChangeType,
  canChangeType,
}: {
  fieldKey: string;
  fieldLabel: string;
  currentSectionId: string;
  allSections: Array<{ id: string; label: string; kind?: string }>;
  onMoveColumn: (columnKey: string, targetSectionId: string) => void;
  onHideColumn?: (key: string) => void;
  onDeleteColumn?: (key: string) => void;
  canDelete?: boolean;
  onChangeType?: (key: string) => void;
  canChangeType?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // ⚠️ 중요: 메뉴 내부 클릭은 무시 — contains 체크 없이 무조건 닫으면
    // 메뉴 안 버튼 클릭의 mousedown 단계에서 메뉴가 사라져 click 이벤트가 도달하지 못함.
    const handler = (e: MouseEvent) => {
      if (rootRef.current && rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  // 이동 가능한 섹션 = 일반 fields + 차수 카드(계약/환불). settlement/meetings/files 같은 특수 카드는 제외.
  // id 도 함께 검사 — 계약(contract)/환불(refund) 섹션은 sectionsProp 의 kind 가 "fields" 로 와도
  // effectiveSections 안에서 tiered 로 자동 변환되므로 id 기준으로 통과.
  const moveTargets = allSections.filter((s) => {
    if (s.id === currentSectionId) return false;
    // settlement / meetings / files 만 명시적으로 제외
    if (s.kind === "settlement" || s.kind === "meetings" || s.kind === "files") return false;
    return true;
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-6 h-6 rounded text-wedly-muted hover:bg-wedly-bg-gray hover:text-wedly-t2 opacity-60 hover:opacity-100 transition"
        title={`${fieldLabel} 관리`}
        aria-label="컬럼 관리"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-wedly-bd rounded-lg shadow-lg overflow-hidden min-w-[200px] py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-wedly-muted uppercase tracking-wider border-b border-wedly-bd/60">
            다른 섹션으로 이동
          </div>
          {moveTargets.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-wedly-muted">이동 가능한 섹션이 없습니다</p>
          ) : (
            moveTargets.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onMoveColumn(fieldKey, s.id); setOpen(false); }}
                className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition"
              >
                {s.label}
              </button>
            ))
          )}
          {(onHideColumn || (onDeleteColumn && canDelete) || (onChangeType && canChangeType)) && (
            <>
              <div className="border-t border-wedly-bd/60 my-1" />
              {onChangeType && canChangeType && (
                <button
                  type="button"
                  onClick={() => { onChangeType(fieldKey); setOpen(false); }}
                  className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M2 6h12M2 10h12M5 3l-3 3 3 3M11 7l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  데이터 형식 변경
                </button>
              )}
              {onHideColumn && (
                <button
                  type="button"
                  onClick={() => { onHideColumn(fieldKey); setOpen(false); }}
                  className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1 transition flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8s2-4 6-4 6 4 6 4-2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  상세모달에서 숨기기 (전체 사용자)
                </button>
              )}
              {onDeleteColumn && canDelete && (
                <button
                  type="button"
                  onClick={() => { onDeleteColumn(fieldKey); setOpen(false); }}
                  className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-red-ink hover:bg-wedly-bg-red/40 transition flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5h10M5 5V3a1 1 0 011-1h4a1 1 0 011 1v2M5 5v9a1 1 0 001 1h4a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  이 컬럼 삭제
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function SectionAdminMenu({
  sectionId,
  sectionLabel,
  onAddColumn,
  onResetOrder,
  hasCustomOrder,
  compact = false,
  onToggleDeleteMode,
  deleteMode = false,
  onToggleEditMode,
  editMode = false,
  onShowHiddenColumns,
  hiddenCount = 0,
  onToggleOtherSection,
  showOtherSection = false,
  onAddSection,
  onDeleteSection,
  canDeleteSection = false,
  onManagePanels,
}: {
  sectionId: string;
  sectionLabel: string;
  onAddColumn?: (sectionId: string, sectionLabel: string) => void;
  onResetOrder?: () => void;
  hasCustomOrder?: boolean;
  compact?: boolean;  // true 면 작은 톱니바퀴 아이콘만
  onToggleDeleteMode?: () => void;
  deleteMode?: boolean;
  /** 컬럼 수정 모드(드래그·이름 편집) 토글 */
  onToggleEditMode?: () => void;
  editMode?: boolean;
  /** 숨김 컬럼 복원 모달 열기 */
  onShowHiddenColumns?: () => void;
  hiddenCount?: number;
  /** "기타" 섹션 보이기/숨기기 토글 */
  onToggleOtherSection?: () => void;
  showOtherSection?: boolean;
  /** "새 섹션 추가" 버튼 클릭 시 호출 — 각 앱이 SectionEditorAddModal 띄움 */
  onAddSection?: () => void;
  /** "이 섹션 삭제" 버튼 클릭 시 호출 — 각 앱이 SectionEditorDeleteConfirm 띄움 */
  onDeleteSection?: () => void;
  /** 이 섹션을 삭제할 수 있는지 — 기본 섹션은 false */
  canDeleteSection?: boolean;
  /** "상위 패널 관리" 클릭 시 호출 — 부모가 PanelManagerModal 띄움 */
  onManagePanels?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative inline-flex"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={compact
          ? cn(
              "inline-flex items-center justify-center w-5 h-5 rounded transition-colors",
              open || deleteMode
                ? "text-wedly-accent-ink bg-wedly-bg-blue/60"
                : "text-wedly-muted hover:bg-wedly-bg-gray hover:text-wedly-t2"
            )
          : cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors",
              open
                ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40"
                : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
            )
        }
        title="탭 편집 (섹션·패널)"
        aria-label="탭 편집"
      >
        {compact ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            탭 편집
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" className={cn("transition-transform", open && "rotate-180")}>
              <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-wedly-bd rounded-lg shadow-lg overflow-hidden min-w-[200px] py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold text-wedly-muted uppercase tracking-wider border-b border-wedly-bd/60">
            컬럼 관리
          </div>
          {onAddColumn && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddColumn(sectionId, sectionLabel); setOpen(false); }}
              className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              새 컬럼 추가
            </button>
          )}
          {onToggleEditMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleEditMode(); setOpen(false); }}
              className={cn(
                "w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2",
                editMode
                  ? "text-wedly-accent-ink bg-wedly-bg-blue/40 font-semibold"
                  : "text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              {editMode ? "컬럼 수정 모드 종료" : "컬럼 수정 모드"}
            </button>
          )}
          {onShowHiddenColumns && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShowHiddenColumns(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2 text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              숨김 컬럼 복원
            </button>
          )}
          {onToggleDeleteMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleDeleteMode(); setOpen(false); }}
              className={cn(
                "w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2",
                deleteMode
                  ? "text-wedly-red-ink bg-wedly-bg-red/40 font-semibold"
                  : "text-wedly-t2 hover:bg-wedly-bg-red/40 hover:text-wedly-red-ink"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M5 5V3a1 1 0 011-1h4a1 1 0 011 1v2M5 5v9a1 1 0 001 1h4a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {deleteMode ? "컬럼 삭제 모드 종료" : "컬럼 삭제 모드"}
            </button>
          )}
          {onResetOrder && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onResetOrder(); setOpen(false); }}
              disabled={!hasCustomOrder}
              className={cn(
                "w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2",
                hasCustomOrder
                  ? "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
                  : "text-wedly-muted cursor-not-allowed"
              )}
              title={hasCustomOrder ? "" : "사용자 정의 순서가 없습니다"}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 1 0 2-4.5M2 3v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              컬럼 순서 초기화
            </button>
          )}
          {onManagePanels && (
            <>
              <div className="px-3 py-1.5 mt-1 text-[10px] font-semibold text-wedly-muted uppercase tracking-wider border-t border-wedly-bd/60">
                상위 패널
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onManagePanels(); setOpen(false); }}
                className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
                title="상위 패널 추가·이름수정·삭제"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="2" y="8" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                상위 패널 관리
              </button>
            </>
          )}
          {(onAddSection || onDeleteSection || onToggleOtherSection) && (
            <div className="px-3 py-1.5 mt-1 text-[10px] font-semibold text-wedly-muted uppercase tracking-wider border-t border-wedly-bd/60">
              섹션 관리
            </div>
          )}
          {onAddSection && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddSection(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink transition flex items-center gap-2"
              title="새 하위 섹션을 추가합니다"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 6.5v3M6.5 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              새 섹션 추가
            </button>
          )}
          {onToggleOtherSection && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleOtherSection(); setOpen(false); }}
              className={cn(
                "w-full px-3 py-1.5 text-[12px] text-left transition flex items-center gap-2",
                showOtherSection
                  ? "text-wedly-accent-ink bg-wedly-bg-blue/40 font-semibold"
                  : "text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink"
              )}
              title={showOtherSection ? "기타 섹션을 숨깁니다" : "기타 섹션을 표시합니다"}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                {showOtherSection ? (
                  <>
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                  </>
                ) : (
                  <>
                    <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </>
                )}
              </svg>
              {showOtherSection ? "기타 섹션 숨기기" : "기타 섹션 노출"}
            </button>
          )}
          {onDeleteSection && canDeleteSection && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDeleteSection(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-[12px] text-left text-wedly-red-ink hover:bg-wedly-bg-red/40 transition flex items-center gap-2"
              title="이 섹션을 삭제합니다 (안 컬럼은 기타로 이동)"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M5 5V3a1 1 0 011-1h4a1 1 0 011 1v2M5 5v9a1 1 0 001 1h4a1 1 0 001-1V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              이 섹션 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
