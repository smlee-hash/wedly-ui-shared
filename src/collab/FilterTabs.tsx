"use client";

import { useState, type ReactNode } from "react";
import type { ViewTab } from "./collab-filters";

export type FilterTabsAdmin = {
  /** 드래그로 순서 변경 후 새 탭 배열 */
  onReorder: (nextTabs: ViewTab[]) => void;
  /** "+" 새 탭 추가 */
  onAdd: () => void;
  /** 탭 더블클릭 → 편집창 열기 */
  onEdit: (tab: ViewTab) => void;
};

export type FilterTabsProps = {
  tabs: ViewTab[];
  activeId: string;
  onSelect: (id: string) => void;
  /** 관리자 편집 모드(생략 시 표시 전용 — 기존과 100% 동일) */
  admin?: FilterTabsAdmin;
  /** 탭 줄 오른쪽 끝(＋추가 뒤)에 끼워 넣을 추가 버튼(예: "탭 관리"). 앱별 선택. */
  trailing?: ReactNode;
};

/** 표 위에 그리는 상태별 필터 탭 한 줄. 하이브와 동일한 알약 모양 —
 *  회색 띠 위에 탭들이 놓이고, 활성 탭만 흰 알약+옅은 그림자로 떠 보임. 좁은 화면은 가로 스크롤.
 *  admin 이 주어지면(관리자) 끌어 옮기기·＋추가·더블클릭 편집이 켜진다. 없으면 표시 전용(기존과 동일). */
export function FilterTabs({ tabs, activeId, onSelect, admin, trailing }: FilterTabsProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  if (!tabs || tabs.length === 0) return null;

  const handleDrop = (toIdx: number) => {
    if (!admin || dragIdx === null || dragIdx === toIdx) {
      setDragIdx(null);
      return;
    }
    const next = [...tabs];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    setDragIdx(null);
    admin.onReorder(next);
  };

  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((tab, idx) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            draggable={admin ? true : undefined}
            onDragStart={admin ? () => setDragIdx(idx) : undefined}
            onDragOver={admin ? (e) => e.preventDefault() : undefined}
            onDrop={admin ? () => handleDrop(idx) : undefined}
            className={
              "flex flex-shrink-0 items-center whitespace-nowrap rounded-lg transition-colors " +
              (active ? "bg-white shadow-sm" : "hover:bg-white/50") +
              (admin && dragIdx === idx ? " opacity-40" : "")
            }
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              onDoubleClick={admin ? () => admin.onEdit(tab) : undefined}
              title={admin ? "클릭=보기 · 더블클릭=이름·조건 편집 · 끌어서 순서 변경" : undefined}
              className={
                "min-h-[40px] px-3 py-1.5 text-[14px] font-medium transition-colors sm:min-h-[30px] sm:text-[13px] " +
                (active ? "text-wedly-navy" : "text-wedly-muted hover:text-wedly-t2") +
                (admin ? " cursor-grab active:cursor-grabbing" : "")
              }
            >
              {tab.viewMode === "calendar" && <span className="mr-1 text-[11px]">🗓</span>}
              {tab.label}
            </button>
          </div>
        );
      })}
      {admin && (
        <button
          type="button"
          onClick={admin.onAdd}
          title="새 탭 추가"
          className="flex-shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-medium text-wedly-muted transition-colors hover:bg-white/60 hover:text-wedly-navy sm:text-[13px]"
        >
          ＋
        </button>
      )}
      {trailing}
    </div>
  );
}
