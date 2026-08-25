"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "./useAnchoredPosition";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

/**
 * 자동완성 입력칸 (2026-08-23 신설) — 치면 목록이 걸러지고 화살표·엔터로 고른다.
 * 고정 선택지는 CustomSelect, 쳐서 찾는 곳은 이 부품.
 * 목록에서 고르지 않고 떠나면 친 글자는 버리고 저장값으로 되돌린다(화면-저장값 어긋남 방지 — 적대적 리뷰).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "입력해 검색",
  label,
  id,
  className,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const pos = useAnchoredPosition(open, anchorRef);
  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      // 목록은 몸통에 띄워져 있어(포털) 뿌리 밖 — 목록 안 클릭은 닫지 않는다
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setQuery(valueRef.current);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const filtered = options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase()));
  const activeSafe = Math.min(active, Math.max(0, filtered.length - 1));
  const pick = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };
  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <div ref={anchorRef} className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[activeSafe] ? `${listId}-opt-${activeSafe}` : undefined}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // 목록 클릭(onMouseDown 이 먼저 옴) 외의 이탈 — 안 고른 글자는 저장값으로 원복
            setOpen(false);
            setQuery(valueRef.current);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive(Math.min(activeSafe + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(Math.max(activeSafe - 1, 0));
            } else if (e.key === "Enter" && open && filtered[activeSafe]) {
              e.preventDefault();
              pick(filtered[activeSafe]);
            } else if (e.key === "Escape" && open) {
              // 겉의 확인창(Modal)까지 닫히지 않게 — 목록만 닫는다
              e.stopPropagation();
              setOpen(false);
              setQuery(valueRef.current);
            }
          }}
          className="h-9 w-full rounded-lg border border-wedly-bd bg-white pl-3 pr-8 text-wedly-sub text-wedly-t1 placeholder:text-wedly-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-wedly-accent"
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wedly-muted" aria-hidden="true" />
      </div>
      {open && pos && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{
            position: "fixed",
            left: pos.left,
            width: pos.width,
            maxHeight: Math.min(pos.maxHeight, 208),
            ...(pos.placement === "down" ? { top: pos.top } : { bottom: pos.bottom }),
          }}
          className="z-[100] overflow-y-auto rounded-lg border border-wedly-bd bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-wedly-hint text-wedly-muted">일치하는 항목이 없습니다</li>}
          {filtered.map((opt, i) => (
            <li
              key={opt}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={opt === value}
              ref={(el) => {
                if (i === activeSafe && el) el.scrollIntoView({ block: "nearest" });
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "cursor-pointer px-3 py-1.5 text-wedly-sub break-keep",
                i === activeSafe ? "bg-wedly-bg-blue text-wedly-t1" : "text-wedly-t2",
                opt === value && "font-semibold text-wedly-accent-ink",
              )}
            >
              {opt}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
