"use client";

/**
 * 표 영역을 "화면 전체로 넓게 보기(최대화)" 할 수 있게 감싸는 공용 래퍼.
 *
 * - 최대화 시 `fixed inset-0` 덮개로 사이드바·상단을 덮는다(ERP CollabTable과 동일 마크업).
 * - Esc 로 해제. 우측 정렬 컨트롤 줄에 최대화 버튼(+ toolsSlot: 정렬 패널 등)을 둔다.
 * - headerSlot: 최대화 시 덮개 맨 위에 함께 보일 헤더(예: 탭바). 평소엔 앱이 덮개 밖에서 그리므로
 *   여기선 안 그린다(= CollabTable 의 headerSlot 동작과 동일).
 *
 * ERP 는 CollabTable 안에서 같은 동작을 제공한다. 하이브·일루아는 표 블록(툴바+표)을 이 부품으로
 * 감싸고 탭을 headerSlot 으로 넘겨 ERP 와 동일한 표 최대화를 갖는다.
 */
import { useEffect, useState, type ReactNode } from "react";

type Props = {
  /** 최대화 시 덮개 맨 위에 보일 헤더(예: 탭바). 평소엔 앱이 덮개 밖에서 그린다. */
  headerSlot?: ReactNode;
  /** 최대화 버튼 왼쪽에 함께 둘 추가 컨트롤(예: 정렬 패널). 미지정 시 최대화 버튼만 표시. */
  toolsSlot?: ReactNode;
  /** 감쌀 표 블록(툴바 + 표). */
  children: ReactNode;
};

export function MaximizableSection({ headerSlot, toolsSlot, children }: Props) {
  const [maximized, setMaximized] = useState(false);

  // Esc 로 최대화 해제
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);

  return (
    <div className={maximized ? "fixed inset-0 z-[70] bg-white overflow-y-auto p-3 sm:p-4" : undefined}>
      {maximized && headerSlot && <div className="mb-2">{headerSlot}</div>}
      <div className="mb-1 flex items-center justify-end gap-2">
        {toolsSlot}
        <button
          type="button"
          onClick={() => setMaximized((m) => !m)}
          title={maximized ? "최대화 해제 (Esc)" : "표를 화면 전체로 넓게 보기"}
          className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2.5 py-1.5 text-[12px] font-medium text-wedly-t2 transition-colors hover:bg-wedly-bg-gray"
        >
          {maximized ? "↙ 최대화 해제" : "⛶ 표 최대화"}
        </button>
      </div>
      {children}
    </div>
  );
}
