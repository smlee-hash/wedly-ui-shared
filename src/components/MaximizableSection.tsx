"use client";

/**
 * 표 영역을 "화면 전체로 넓게 보기(최대화)" 할 수 있게 감싸는 공용 래퍼.
 *
 * - 최대화 시 `fixed inset-0` 덮개로 사이드바·상단을 덮는다(ERP CollabTable과 동일 마크업).
 * - Esc 로 해제.
 * - headerSlot: 최대화 시 덮개 맨 위에 함께 보일 헤더(예: 탭바). 평소엔 앱이 덮개 밖에서 그리므로
 *   여기선 안 그린다(= CollabTable 의 headerSlot 동작과 동일).
 *
 * 2026-06-14(2단계): 자체 "표 최대화" 버튼줄을 없애고, 버튼은 보기/표시/페이지 줄(TopControls
 * 또는 앱 자체 컨트롤 줄)로 옮긴다. 그래서 children 을 함수로 받아 `{maximized, toggleMaximized}`
 * 를 넘긴다 — 앱이 그 값으로 <MaximizeButton> 을 원하는 위치에 둔다. (옛 ReactNode children 도 허용.)
 */
import { useEffect, useState, type ReactNode } from "react";

export type MaximizableApi = {
  maximized: boolean;
  toggleMaximized: () => void;
};

type Props = {
  /** 최대화 시 덮개 맨 위에 보일 헤더(예: 탭바). 평소엔 앱이 덮개 밖에서 그린다. */
  headerSlot?: ReactNode;
  /** 감쌀 표 블록. 함수면 `{maximized, toggleMaximized}` 를 받아 버튼을 원하는 위치에 둘 수 있다. */
  children: ReactNode | ((api: MaximizableApi) => ReactNode);
};

export function MaximizableSection({ headerSlot, children }: Props) {
  const [maximized, setMaximized] = useState(false);
  const toggleMaximized = () => setMaximized((m) => !m);

  // Esc 로 최대화 해제
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);

  const body = typeof children === "function" ? children({ maximized, toggleMaximized }) : children;

  return (
    <div className={maximized ? "fixed inset-0 z-[70] bg-white overflow-y-auto p-3 sm:p-4" : undefined}>
      {maximized && headerSlot && <div className="mb-2">{headerSlot}</div>}
      {body}
    </div>
  );
}
