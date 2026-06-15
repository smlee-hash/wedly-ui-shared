"use client";

import { useEffect, useState } from "react";
import { resolveStoredCollapsed } from "./sidebar-collapse-core";

export type SidebarCollapseState = {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  setMobileOpen: (v: boolean) => void;
};

// 사이드바 접힘 상태 + 새로고침 유지(브라우저 저장 + 쿠키) 공용 머리.
// cookieName 만 앱마다 다르게 넘긴다. (예: "wedly-sidebar-collapsed")
// initialCollapsed: 서버가 쿠키에서 읽어 넘긴 첫 화면 초기값(서버·클라이언트 일치).
export function useSidebarCollapse(opts: {
  cookieName: string;
  initialCollapsed: boolean;
}): SidebarCollapseState {
  const { cookieName, initialCollapsed } = opts;
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // 접힘 변경 시: 브라우저 저장(개인) + 쿠키(서버 첫 화면용) 양쪽에 보관.
  useEffect(() => {
    try { localStorage.setItem(cookieName, String(collapsed)); } catch {}
    document.cookie = `${cookieName}=${collapsed}; path=/; max-age=31536000; SameSite=Lax`;
  }, [collapsed, cookieName]);

  // 마운트 1회: 쿠키가 없던 기존 사용자는 브라우저 저장값으로 한 번 복원.
  useEffect(() => {
    try {
      const next = resolveStoredCollapsed(localStorage.getItem(cookieName), collapsed);
      if (next !== null) setCollapsed(next);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    collapsed,
    mobileOpen,
    toggle: () => setCollapsed((p) => !p),
    toggleMobile: () => setMobileOpen((p) => !p),
    setMobileOpen,
  };
}
