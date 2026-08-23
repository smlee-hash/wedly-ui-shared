"use client";

import {
  forwardRef,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type MutableRefObject,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/**
 * 여러 줄 입력칸 (2026-08-23 신설) — Input 과 같은 테두리·초점·오류 문법.
 * 기본은 내용 길이에 맞춰 높이가 따라 는다. 고정 높이는 autosize={false}.
 */
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  autosize?: boolean;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as MutableRefObject<T | null>).current = node;
}

function resizeToContent(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, rows = 3, autosize = true, onChange, ...props }, ref) => {
    // id 를 안 넘겨도 라벨·오류가 칸에 연결되게(적대적 리뷰 — Checkbox 와 동일 문법)
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const value = props.value;

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        assignRef(ref, node);
        if (autosize && node) resizeToContent(node);
      },
      [ref, autosize],
    );

    useLayoutEffect(() => {
      if (!autosize) {
        if (innerRef.current) innerRef.current.style.height = "";
        return;
      }
      resizeToContent(innerRef.current);
    }, [autosize, value]);

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
      if (autosize) resizeToContent(e.currentTarget);
      onChange?.(e);
    };

    return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-wedly-sub font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <textarea
        ref={setRefs}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
        onChange={handleChange}
        className={cn(
          "rounded-lg border border-wedly-bd bg-white px-3 py-2 text-wedly-sub text-wedly-t1",
          "placeholder:text-wedly-muted",
          "focus:outline-none focus:ring-2 focus:ring-wedly-accent focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-wedly-red focus:ring-wedly-red",
          autosize && "resize-none overflow-hidden",
          className,
        )}
      />
      {error && <p id={errorId} className="text-wedly-hint text-wedly-red">{error}</p>}
    </div>
    );
  },
);

Textarea.displayName = "Textarea";
