"use client";

import type { CSSProperties, ReactNode } from "react";

// 본문 폭 규칙(세 앱 공통 — 고정 베이크).
const WIDE_TABLE_MAIN =
  "flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6 pb-20 lg:pb-6 w-full min-w-0";
const DEFAULT_MAIN =
  "flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 lg:p-6 pb-20 lg:pb-6 mx-auto w-full max-w-[1600px] min-w-0";

export type MainVariant = "fullBleed" | "wideTable" | "default";

export type CollapsibleShellProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  sidebar: ReactNode;
  topNav?: ReactNode;
  children: ReactNode;
  mainVariant: MainVariant;
  fullBleedClassName?: string;
  containerStyle?: CSSProperties;
  overlays?: ReactNode;
};

// 사이드바 접힘에 따라 본문 가로폭을 채우는 공용 틀(순수 표현용, 상태 없음).
// 메뉴·상단바·곁다리는 슬롯(props)으로 받는다. 접힘 상태는 collapsed 로 받아 좌측 여백을 이동.
export function CollapsibleShell({
  collapsed,
  mobileOpen,
  onCloseMobile,
  sidebar,
  topNav,
  children,
  mainVariant,
  fullBleedClassName,
  containerStyle,
  overlays,
}: CollapsibleShellProps) {
  const mainClass =
    mainVariant === "fullBleed"
      ? fullBleedClassName ?? "flex-1 overflow-hidden"
      : mainVariant === "wideTable"
      ? WIDE_TABLE_MAIN
      : DEFAULT_MAIN;

  return (
    <div className="h-screen overflow-hidden" style={containerStyle}>
      {/* 모바일 오버레이 */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onCloseMobile} />
      )}
      {sidebar}
      <div
        className={`ml-0 h-full flex flex-col overflow-x-hidden transition-[margin-left] duration-200 ease-out ${
          collapsed ? "lg:ml-[60px]" : "lg:ml-[260px]"
        }`}
      >
        {topNav}
        <main className={mainClass}>{children}</main>
      </div>
      {overlays}
    </div>
  );
}
