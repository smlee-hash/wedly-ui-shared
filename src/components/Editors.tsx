"use client";

/**
 * 글자·숫자·날짜 인라인 입력기 — 표 셀과 상세 모달 양쪽이 같은 부품 사용
 *
 * AGENTS.md §5-4 cell-detail-parity 규칙:
 *   같은 컬럼 형식이면 표 셀과 상세 모달 두 곳의 편집 UI 는 100% 동일해야 한다.
 *
 * 디자인 — 위들리 표준 입력칸 패턴 (AGENTS.md §6-3):
 *   border border-wedly-bd / rounded-lg / focus:ring-2 focus:ring-wedly-accent/30 등.
 *
 * 동작:
 *   - 마운트 시 입력칸 자동 포커스 + 글자 입력기는 전체 선택
 *   - Enter / blur 시 저장
 *   - Escape 시 원래 값 복원
 *   - 날짜 입력기는 토스트형(달력 펼침) 옵션과 인라인 모드 둘 다 지원
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toLocalInputValue, toDateInputValue } from "../lib/utils";

const BASE_CLASS =
  "w-full rounded-lg border border-wedly-bd bg-white px-2 py-1 text-sm text-wedly-navy outline-none focus:border-wedly-accent focus:ring-1 focus:ring-wedly-accent/30";

// ── 글자 입력 ──
export function TextEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => onSave(draft);

  return (
    <input
      ref={ref}
      type="text"
      className={BASE_CLASS}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          onSave(value);
        }
      }}
    />
  );
}

// ── 숫자 입력 ──
export function NumberEditor({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value !== null ? String(value) : "");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onSave(null);
    } else {
      const num = Number(trimmed.replace(/,/g, ""));
      onSave(isNaN(num) ? value : num);
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      className={`${BASE_CLASS} tabular-nums`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          onSave(value);
        }
      }}
    />
  );
}

// ── 날짜 입력 ──
//
// 사용 위치에 따라 두 모드:
//   1) 상세 모달 — 입력칸 자체가 행 안에 들어감 (인라인). 기본 모드.
//   2) 표 셀 — 셀 자리에 작은 anchor 만 두고 input 은 떠 있는(portal) 위치로. portal 모드.
//
// onClose 가 주어지면 portal 모드, 없으면 인라인 모드.
export function DateEditor({
  value,
  onSave,
  onClose,
  withTime = false,
}: {
  value: string;
  onSave: (v: string) => void;
  onClose?: () => void;
  withTime?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initialValue = value ? (withTime ? toLocalInputValue(value) : toDateInputValue(value)) : "";
  const [draft, setDraft] = useState(initialValue);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const usePortal = !!onClose;

  useEffect(() => {
    if (!usePortal) {
      ref.current?.focus();
      return;
    }
    if (wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPos({ top: rect.top + window.scrollY, left: rect.left + window.scrollX });
    }
  }, [usePortal]);

  useEffect(() => {
    if (usePortal && pos && ref.current) ref.current.showPicker?.();
  }, [pos, usePortal]);

  const commit = () => {
    if (usePortal) {
      if (draft !== initialValue) onSave(draft);
      onClose?.();
    } else {
      onSave(draft);
    }
  };

  // 인라인 모드 — 그대로 행 안에 그림
  if (!usePortal) {
    return (
      <input
        ref={ref}
        type={withTime ? "datetime-local" : "date"}
        className={BASE_CLASS}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            onSave(value);
          }
        }}
      />
    );
  }

  // portal 모드 — 셀 위치에 띄움
  return (
    <>
      <div ref={wrapRef} className="h-6" />
      {pos && typeof document !== "undefined" && createPortal(
        <input
          ref={ref}
          type={withTime ? "datetime-local" : "date"}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") onClose?.();
          }}
          className={`fixed ${BASE_CLASS} shadow-lg z-[9999]`}
          style={{ top: pos.top, left: pos.left }}
        />,
        document.body,
      )}
    </>
  );
}

// 표 셀과 상세 모달 양쪽이 같은 부품을 가져다 쓸 수 있도록 별칭도 함께 노출
export { TextEditor as CellTextEditor };
export { NumberEditor as CellNumberEditor };
export { DateEditor as CellDateEditor };
