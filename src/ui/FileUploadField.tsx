"use client";

import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { Upload, X } from "lucide-react";
import { cn } from "./cn";

function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept.split(",").some((raw) => {
    const token = raw.trim().toLowerCase();
    if (!token) return false;
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

/**
 * 파일 올리기 칸 — 점선 끌어놓기 영역. 영역을 누르거나 파일을 떨어뜨려 고른다.
 */
export function FileUploadField({
  label,
  accept,
  onSelect,
  className,
}: {
  label?: string;
  accept?: string;
  onSelect?: (file: File | null) => void;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reject, setReject] = useState<string | null>(null);

  const pick = (file: File | null) => {
    setName(file ? file.name : null);
    onSelect?.(file);
  };

  const applyFile = (file: File | null) => {
    if (file && !fileMatchesAccept(file, accept)) {
      setReject("이 형식의 파일은 올릴 수 없습니다.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setReject(null);
    pick(file);
  };

  const openPicker = () => inputRef.current?.click();

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) applyFile(file);
  };

  const onZoneKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  };

  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-wedly-label font-medium text-wedly-t2">
          {label}
        </label>
      )}
      {name ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border-2 border-dashed border-wedly-bd bg-white px-4 py-2",
            dragging && "border-wedly-accent bg-wedly-bg-blue/40",
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <span className="min-w-0 truncate text-wedly-hint text-wedly-t1">{name}</span>
          <button
            type="button"
            aria-label="선택한 파일 지우기"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              setReject(null);
              pick(null);
            }}
            className="ml-auto shrink-0 text-wedly-muted hover:text-wedly-red"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="파일을 끌어다 놓거나 눌러서 선택"
          onClick={openPicker}
          onKeyDown={onZoneKeyDown}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-wedly-bd bg-wedly-bg-gray/40 p-6",
            dragging && "border-wedly-accent bg-wedly-bg-blue/40",
            "cursor-pointer",
          )}
        >
          <Upload className="h-5 w-5 text-wedly-muted" aria-hidden="true" />
          <p className="text-wedly-hint text-wedly-muted">파일을 끌어다 놓거나 눌러서 선택</p>
        </div>
      )}
      {reject && <p className="mt-1 text-wedly-hint text-wedly-red">{reject}</p>}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
