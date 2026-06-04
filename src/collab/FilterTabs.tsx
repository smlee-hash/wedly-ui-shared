"use client";

import type { ViewTab } from "./collab-filters";

export type FilterTabsProps = {
  tabs: ViewTab[];
  activeId: string;
  onSelect: (id: string) => void;
};

/** 표 위에 그리는 상태별 필터 탭 한 줄(표시 전용). 하이브와 동일한 알약 모양 —
 *  회색 띠 위에 탭들이 놓이고, 활성 탭만 흰 알약+옅은 그림자로 떠 보임. 좁은 화면은 가로 스크롤. */
export function FilterTabs({ tabs, activeId, onSelect }: FilterTabsProps) {
  if (!tabs || tabs.length === 0) return null;
  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={
              "flex flex-shrink-0 items-center whitespace-nowrap rounded-lg transition-colors " +
              (active ? "bg-white shadow-sm" : "hover:bg-white/50")
            }
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              className={
                "min-h-[40px] px-3 py-1.5 text-[14px] font-medium transition-colors sm:min-h-[30px] sm:text-[13px] " +
                (active ? "text-wedly-navy" : "text-wedly-muted hover:text-wedly-t2")
              }
            >
              {tab.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
