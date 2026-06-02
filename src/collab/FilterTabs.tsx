"use client";

import type { ViewTab } from "./collab-filters";

export type FilterTabsProps = {
  tabs: ViewTab[];
  activeId: string;
  onSelect: (id: string) => void;
};

/** 표 위에 그리는 상태별 필터 탭 한 줄(표시 전용). 활성 탭 강조 + 좁은 화면 가로 스크롤. */
export function FilterTabs({ tabs, activeId, onSelect }: FilterTabsProps) {
  if (!tabs || tabs.length === 0) return null;
  return (
    <div className="mb-2 flex gap-1 overflow-x-auto border-b border-wedly-bd">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={
              "-mb-px flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors " +
              (active
                ? "border-wedly-accent text-wedly-accent"
                : "border-transparent text-wedly-muted hover:text-wedly-t2")
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
