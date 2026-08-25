"use client";

/**
 * 드래그로 컬럼(행) 순서를 바꾸는 섹션 본문
 *
 * 도메인 의존성 0 — 순수 props 형태.
 *   - 드래그 상태(orderedFields, draggingKey, dragOverKey)와 핸들러는 부모가 useFieldOrder 같은
 *     훅을 호출해서 props 로 넘김.
 *   - 각 행 본문은 renderRow(field) 슬롯에 위임.
 *   - 오른쪽 어드민 메뉴(행 옆 3점)도 renderAdminMenu(field) 슬롯에 위임 — 보관함의
 *     FieldRowAdminMenu 를 부모가 가져다 쓰면 됨.
 *
 * 콜백 관례:
 *   - onHideColumn 은 이 부품의 좌측 X 버튼(deleteMode) 에서 직접 호출.
 *   - onDeleteColumn / onChangeType / onMoveColumn 같은 행별 동작은 이 부품에 직접 prop 으로
 *     주지 말고, renderAdminMenu 슬롯 안의 FieldRowAdminMenu 에 직접 연결할 것.
 *
 * AGENTS.md §5-4 cell-detail-parity 와 무관 — 이 부품은 상세 모달 전용 wrapper.
 */

import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// 일반(generic) 필드 — 최소한 key 와 label 만 있으면 됨.
export interface OrderableField {
  key: string;
  label: string;
}

export type DraggableFieldsSectionProps<T extends OrderableField> = {
  sectionId: string;
  sectionLabel?: string;
  isAdmin: boolean;
  /** 어드민 편집 모드 — 드래그 핸들·이름 편집 잠금 해제 */
  editMode?: boolean;
  /** 삭제 모드 — 각 행 좌측에 X 버튼(섹션에서 숨기기) */
  deleteMode?: boolean;

  // ── 드래그앤드롭 상태 (useFieldOrder 같은 훅에서 그대로 전달) ──
  orderedFields: T[];
  isOrderLoaded: boolean;
  draggingKey: string | null;
  dragOverKey: string | null;
  handleDragStart: (key: string) => (e: React.DragEvent) => void;
  handleDragOver: (key: string) => (e: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (key: string) => (e: React.DragEvent) => void;
  handleDragEnd: () => void;

  // ── 슬롯 ──
  /** 각 행의 본문(편집 가능한 라벨·값 영역). 부모가 자체 EditableFieldRow 등 사용. */
  renderRow: (field: T) => ReactNode;
  /** 각 행 오른쪽 어드민 3점 메뉴 (호버 시 노출). 평상시엔 안 보이게. */
  renderAdminMenu?: (field: T) => ReactNode;

  // ── 콜백 ──
  /** 삭제 모드에서 좌측 X 버튼 클릭 시 — 이 섹션에서 컬럼 숨기기 */
  onHideColumn?: (key: string) => void;
  /** 비어 있는 섹션에서 + 새 컬럼 추가 버튼 클릭 시 */
  onAddColumn?: (sectionId: string, sectionLabel: string) => void;
};

export function DraggableFieldsSection<T extends OrderableField>({
  sectionId,
  sectionLabel,
  isAdmin,
  editMode = false,
  deleteMode = false,
  orderedFields,
  isOrderLoaded,
  draggingKey,
  dragOverKey,
  handleDragStart,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragEnd,
  renderRow,
  renderAdminMenu,
  onHideColumn,
  onAddColumn,
}: DraggableFieldsSectionProps<T>) {
  // 컬럼 순서 응답 도착 전엔 본문 안 그림 — 깜빡임 차단 (응답 후 한 번에 안정 위치 표시)
  if (!isOrderLoaded) {
    return (
      <div className="py-6 flex items-center justify-center text-[12px] text-wedly-muted">
        <div className="w-4 h-4 border-2 border-wedly-bd border-t-wedly-accent rounded-full animate-spin mr-2" />
        불러오는 중…
      </div>
    );
  }

  if (orderedFields.length === 0) {
    return (
      <div className="py-4 space-y-2">
        <p className="text-[12px] text-wedly-muted">
          이 섹션에는 컬럼이 없습니다. 어드민이 컬럼을 추가하거나 다른 섹션에서 옮기면 여기에 표시됩니다.
        </p>
        {isAdmin && onAddColumn && (
          <button
            type="button"
            onClick={() => onAddColumn(sectionId, sectionLabel || sectionId)}
            className="w-full py-2 rounded-lg border-2 border-dashed border-wedly-accent/40 text-[12px] font-bold text-wedly-accent-ink hover:bg-wedly-bg-blue/30 transition-colors"
          >
            + 새 컬럼 추가
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-50">
      {orderedFields.map((field) => {
        const isDragging = draggingKey === field.key;
        const isDragOver = Boolean(dragOverKey === field.key && draggingKey && draggingKey !== field.key);
        return (
          <div
            key={field.key}
            draggable={isAdmin && editMode}
            onDragStart={handleDragStart(field.key)}
            onDragOver={handleDragOver(field.key)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop(field.key)}
            onDragEnd={handleDragEnd}
            className={cn(
              "relative group/drag transition-colors",
              isDragging && "opacity-40",
              isDragOver && "bg-wedly-bg-blue/40 rounded-md"
            )}
          >
            <div className="flex items-stretch gap-1">
              {isAdmin && editMode && (
                // 드래그 핸들 — editMode 일 때만. 평상시엔 실수로 컬럼 위치 안 바뀌도록 잠금.
                <span
                  draggable
                  onDragStart={handleDragStart(field.key)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center justify-center w-10 sm:w-7 min-h-[40px] sm:min-h-0 flex-shrink-0 self-stretch text-wedly-accent-ink bg-wedly-bg-blue/20 hover:bg-wedly-bg-blue/50 cursor-grab active:cursor-grabbing select-none rounded-md transition-colors"
                  title="여기를 잡고 끌어서 컬럼 순서 변경"
                  aria-label="컬럼 순서 변경 핸들"
                >
                  <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                    <circle cx="4" cy="4" r="1.5" />
                    <circle cx="8" cy="4" r="1.5" />
                    <circle cx="4" cy="8" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="4" cy="12" r="1.5" />
                    <circle cx="8" cy="12" r="1.5" />
                  </svg>
                </span>
              )}
              {deleteMode && isAdmin && onHideColumn && (
                <button
                  type="button"
                  onClick={() => onHideColumn(field.key)}
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-wedly-red text-white hover:brightness-110 transition flex-shrink-0 self-center ml-1"
                  title={`'${field.label}' 컬럼을 이 섹션에서 숨기기`}
                  aria-label="컬럼 숨기기"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <div className="flex-1 min-w-0">{renderRow(field)}</div>
              {isAdmin && editMode && !deleteMode && renderAdminMenu && (
                <div className="flex items-center pr-1 md:opacity-0 md:group-hover/drag:opacity-100 transition">
                  {renderAdminMenu(field)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
