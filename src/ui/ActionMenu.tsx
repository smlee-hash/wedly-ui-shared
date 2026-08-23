"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "./cn";

/**
 * 행동 메뉴 (2026-08-23 신설) — 점 세 개(또는 임의 트리거)를 누르면 행동 목록이 뜬다.
 * Radix Dropdown(신규 금지)의 표준 대체. 화살표로 항목을 오가고 Escape 는 메뉴만 닫는다.
 * 메뉴 몸통은 문서 몸통에 띄운다(포털+고정 좌표) — 표·스크롤 상자 안에서도 잘리지 않는다(독립 검사 실측 반영).
 */
export function ActionMenu({
  items,
  trigger,
  align = "right",
  className,
}: {
  items: Array<{ label: string; onSelect: () => void; danger?: boolean; disabled?: boolean }>;
  trigger?: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos(
        align === "right"
          ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }
          : { top: r.bottom + 4, left: Math.max(8, r.left) },
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      // 메뉴는 몸통에 띄워져 있어(포털) 뿌리 밖 — 메뉴 안 클릭은 닫지 않는다
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    // 열리면 첫 항목에 초점 — 읽기 도우미의 메뉴 계약
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    first?.focus();
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const moveFocus = (delta: number) => {
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    const idx = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(idx + delta + buttons.length) % buttons.length];
    next?.focus();
  };
  return (
    <div
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      onKeyDown={(e) => {
        if (!open) return;
        if (e.key === "Escape") {
          // 겉의 확인창까지 닫히지 않게 — 메뉴만 닫는다
          e.stopPropagation();
          setOpen(false);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger ? undefined : "더 보기 메뉴"}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          !trigger && "inline-flex h-8 w-8 items-center justify-center rounded-lg text-wedly-t2 hover:bg-wedly-bg-gray",
        )}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right }}
          onKeyDown={(e) => {
            // 포털이라 뿌리의 키 처리 밖 — 같은 규칙을 메뉴 자체에도 건다
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              moveFocus(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              moveFocus(-1);
            }
          }}
          className="z-[100] min-w-36 rounded-xl border border-wedly-bd bg-white py-1 shadow-[0_4px_16px_rgba(10,34,68,0.10)]"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-wedly-sub break-keep hover:bg-wedly-bg-gray focus:bg-wedly-bg-gray focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent",
                item.danger ? "text-wedly-red" : "text-wedly-t1",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
