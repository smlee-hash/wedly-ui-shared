"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ColumnDef } from "../types/columns";
import { useFieldOptions } from "./field-options-context";
// 글자·숫자 입력기는 공용 부품(@wedly/ui-shared)을 그대로 사용 — 표 셀·상세창·하이브와 100% 동일.
import { TextEditor, NumberEditor, isCommonBasicLabel, renderUnifiedFieldValue, detectPersonChipRole, formatPercent, type CommonFieldOverride } from "../index";
// 선택 칸 본문(옵션 추가·색칠)·사람 선택 위젯도 하이브와 같은 공용 부품 사용.
import { SelectDropdownBody, MultiPersonEditor } from "@wedly/detail-modal-shared";
import { cn } from "../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: default format (read-only display)
// ─────────────────────────────────────────────────────────────────────────────
export function formatFieldValue(col: ColumnDef, value: unknown): string {
  if (value == null || value === "") return "—";
  const v = String(value);
  if (col.type === "number" && col.format === "currency") {
    const n = Number(v.replace(/,/g, ""));
    if (!isNaN(n)) return n.toLocaleString("ko-KR") + "원";
  }
  if (col.type === "percent") return formatPercent(value);
  if (col.type === "checkbox") return value ? "✓" : "—";
  if (col.type === "file") {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length > 0)
        return arr.map((f: { name?: string; fileName?: string }) => f.name ?? f.fileName ?? "파일").join(", ");
    } catch {
      /* ignore */
    }
    return "—";
  }
  if (col.type === "date" || col.type === "last_edited_time") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
    }
  }
  return v || "—";
}

// ─────────────────────────────────────────────────────────────────────────────
// 글자·숫자 입력기는 공용 부품(@wedly/ui-shared)을 그대로 사용 (위에서 import).
// 종전 ERP 자체 사본은 제거 — 표 셀·상세창·하이브와 100% 동일. 외부 호환 위해 같은 이름으로 재노출.
// ─────────────────────────────────────────────────────────────────────────────
export { TextEditor, NumberEditor };

export function DateEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      type="date"
      defaultValue={value ? value.split("T")[0] : ""}
      onChange={(e) => {
        if (e.target.value) onSave(e.target.value);
      }}
      onBlur={(e) => {
        if (e.target.value && e.target.value !== value?.split("T")[0]) onSave(e.target.value);
      }}
      className="px-2 py-1 text-[13px] border border-wedly-accent/40 rounded-md outline-none focus:ring-2 focus:ring-wedly-accent/20 bg-white"
    />
  );
}

// 선택 칸 어댑터 — 공용 SelectDropdownBody 를 ERP 옵션 저장소(localStorage)에 연결한다.
// 하이브 HiveSelectDropdownBody 와 같은 패턴. 색은 표 셀과 동일 소스(커스텀 → STATUS_COLORS → SELECT_BADGE_COLORS)로 일관.
function ErpSelectDropdownBody({
  value,
  options,
  fieldKey,
  onSave,
  onClose,
  allowDelete = false,
}: {
  value: string;
  options: string[];
  fieldKey: string;
  onSave: (next: string) => void;
  onClose: () => void;
  allowDelete?: boolean;
}) {
  const fo = useFieldOptions();
  return (
    <SelectDropdownBody
      value={value}
      options={options}
      onSave={onSave}
      onClose={onClose}
      onAddOption={(opt) => fo.addCustomOption(fieldKey, opt)}
      onDeleteOption={(opt) => fo.removeCustomOption(fieldKey, opt)}
      onSetColor={(opt, color) => fo.setOptionColor(opt, color)}
      getColorClass={(opt) => fo.getOptionColorClass(opt, fo.STATUS_COLORS, fo.SELECT_BADGE_COLORS)}
      colorFamilies={fo.OPTION_COLOR_FAMILIES}
      globalChangeEvent="option-color-changed"
      allowDelete={allowDelete}
    />
  );
}

// 선택 칸 포털 래퍼 — 트리거(칸) 위치 기준으로 화면에 띄운다(모달 클리핑 방지). 하이브 SelectEditor 와 동일.
export function SelectEditor({
  value,
  options,
  fieldKey,
  onSave,
  onClose,
  canDelete = false,
}: {
  value: string;
  options: string[];
  fieldKey: string;
  onSave: (v: string) => void;
  onClose: () => void;
  canDelete?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 트리거 위치 기준으로 화면 좌표 계산 — 아래 공간이 모자라면 위로 펼침.
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const dropH = 320;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - Math.min(dropH, rect.top - 8) - 4;
      setPos({ top, left: rect.left });
    }
  }, []);

  // 바깥 클릭 감지 — 띄운 본문(ref) 밖을 누르면 닫는다.
  useEffect(() => {
    if (!pos) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, pos]);

  return (
    <>
      {/* 칸 위치를 잡기 위한 0높이 기준점(흐름 안에 둠) */}
      <div ref={anchorRef} className="h-0" />
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={ref}
            className="fixed w-64 max-h-[320px] overflow-y-auto rounded-2xl border border-wedly-bd bg-white shadow-[0_10px_30px_-6px_rgba(10,34,68,0.18)]"
            style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
          >
            <ErpSelectDropdownBody
              value={value}
              options={options}
              fieldKey={fieldKey}
              onSave={onSave}
              onClose={onClose}
              allowDelete={canDelete}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Editable field row — tax-amendment fields only
// ─────────────────────────────────────────────────────────────────────────────
// ── MultiSelectEditor — DetailModal과 동일한 토글 UI + comma-space 저장 형식 ──
function MultiSelectEditor({
  value,
  options,
  fieldKey,
  onSave,
  onClose,
}: {
  value: string;
  options: string[];
  fieldKey?: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const fo = useFieldOptions();
  const selected = new Set(value ? value.split(", ") : []);
  const ref = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [newOpt, setNewOpt] = useState("");
  const [newColor, setNewColor] = useState(fo.OPTION_COLOR_PALETTE[0]);
  const [liveOptions, setLiveOptions] = useState(options);
  const addInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);
  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);
  const toggle = (opt: string) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onSave(Array.from(next).join(", "));
  };
  const handleAdd = () => {
    const name = newOpt.trim();
    if (!name || liveOptions.includes(name)) return;
    if (fieldKey) fo.addCustomOption(fieldKey, name);
    fo.setOptionColor(name, { bg: newColor.bg, text: newColor.text });
    setLiveOptions((prev) => [...prev, name]);
    setNewOpt("");
    setAdding(false);
  };
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 w-full sm:w-[260px] max-w-[calc(100vw-32px)] max-h-[300px] overflow-y-auto bg-white border border-wedly-bd rounded-xl shadow-lg z-50 py-1"
    >
      {liveOptions.map((opt) => {
        const colorClass = fo.getOptionColorClass(opt, fo.STATUS_COLORS, fo.SELECT_BADGE_COLORS);
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-wedly-bg-gray flex items-center gap-2"
          >
            <div
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                selected.has(opt) ? "bg-wedly-accent border-wedly-accent" : "border-wedly-bd",
              )}
            >
              {selected.has(opt) && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6l2.5 2.5 4.5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={cn("inline-block px-2 py-0.5 rounded-md text-[11px] font-medium", colorClass)}>{opt}</span>
          </button>
        );
      })}
      <div className="border-t border-wedly-bd/60 mt-1 pt-1 px-2 pb-1">
        {adding ? (
          <div className="space-y-1.5">
            <input
              ref={addInputRef}
              value={newOpt}
              onChange={(e) => setNewOpt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="새 옵션 이름"
              className="w-full px-2 py-1 text-[12px] border border-wedly-bd rounded-lg outline-none focus:border-wedly-accent"
            />
            <div className="flex flex-wrap gap-1">
              {fo.OPTION_COLOR_PALETTE.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all",
                    newColor.name === c.name ? "border-wedly-navy scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={!newOpt.trim()}
                className="px-2 py-0.5 text-[11px] font-medium text-white bg-wedly-accent rounded-md disabled:opacity-40"
              >
                추가
              </button>
              <button onClick={() => setAdding(false)} className="px-2 py-0.5 text-[11px] text-wedly-muted">
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-left px-1 py-1 text-[12px] text-wedly-accent hover:text-wedly-accent/80 font-medium"
          >
            + 새 옵션 추가
          </button>
        )}
      </div>
    </div>
  );
}

// ── PersonEditor — 공용 사람선택 위젯(@wedly/detail-modal-shared MultiPersonEditor)으로 통일 ──
// 검색·명단·선택 패널은 3앱 공용 부품(하이브·일루아와 동일). ERP 상세창 카드 overflow 에 잘리지
// 않도록 위치잡기만 createPortal + 트리거 좌표로 처리(기존 ERP 방식 유지). person 칸은 단일 → single.
// loadManagers prop 으로 담당자 목록 로드 — ERP 전용 /api/unified-collab/managers 경로를 숨김.
function PersonEditor({
  value,
  onSave,
  onClose,
  loadManagers,
}: {
  value: string;
  onSave: (v: string | null) => void;
  onClose: () => void;
  loadManagers: () => Promise<{ id: string; name: string }[]>;
}) {
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    loadManagers()
      .then((data) => setManagers(data))
      .catch(() => {});
  }, [loadManagers]);
  // 트리거(칸) 위치 기준으로 화면 좌표 계산 — 아래 공간이 모자라면 위로 펼침.
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const dropH = 280;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - Math.min(dropH, rect.top - 8) - 4;
      setPos({ top, left: rect.left, width: rect.width });
    }
  }, []);
  // 직원 명단 → 공용 위젯이 받는 이름 문자열 배열(이름만 저장 → 하이브·일루아 호환).
  const userNames = managers.map((m) => m.name);
  return (
    <>
      {/* 칸 위치를 잡기 위한 0높이 기준점(흐름 안에 둠) */}
      <div ref={anchorRef} className="h-0" />
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 240), zIndex: 9999 }}
          >
            <MultiPersonEditor
              value={value ?? ""}
              userNames={userNames}
              onSave={(v) => onSave(v === "" ? null : v)}
              onClose={onClose}
              single
            />
          </div>,
          document.body,
        )}
    </>
  );
}

// ── FileEditor — DetailModal과 동일한 업로드 UI (POST /api/upload → [{name, url}] JSON string) ──
function FileEditor({
  value,
  fieldKey,
  onSave,
}: {
  value: string;
  fieldKey: string;
  onSave: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valRef = useRef(value);
  valRef.current = value;

  let files: { name: string; url: string }[] = [];
  if (typeof value === "string" && value) {
    try { files = JSON.parse(value); } catch { /* ignore */ }
  }

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || uploading) return;
    setUploading(true);
    try {
      const currentVal = valRef.current;
      let existingFiles: { name: string; url: string }[] = [];
      if (typeof currentVal === "string" && currentVal) {
        try { existingFiles = JSON.parse(currentVal); } catch { /* ignore */ }
      }
      const uploaded: { name: string; url: string }[] = [];
      const failed: string[] = [];
      for (const file of Array.from(selectedFiles)) {
        if (file.size > 2 * 1024 * 1024 * 1024) {
          failed.push(`${file.name}: 파일 크기 초과`);
          continue;
        }
        try {
          const formData = new FormData();
          formData.append("file", file);
          const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
          const contentType = uploadRes.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            failed.push(`${file.name}: 서버 오류 (${uploadRes.status})`);
            continue;
          }
          const uploadJson = await uploadRes.json();
          if (uploadJson.success) {
            uploaded.push({ name: uploadJson.data.fileName, url: uploadJson.data.url });
          } else {
            failed.push(`${file.name}: ${uploadJson.error || "알 수 없는 오류"}`);
          }
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : "네트워크 오류"}`);
        }
      }
      if (failed.length > 0) alert(`파일 업로드 실패:\n${failed.join("\n")}`);
      if (uploaded.length === 0) return;
      const allFiles = [...existingFiles, ...uploaded];
      onSave(JSON.stringify(allFiles));
    } catch (err) {
      console.error("File upload error:", err);
      alert(`파일 업로드 중 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [uploading, onSave]);

  const handleDelete = useCallback((index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onSave(updated.length > 0 ? JSON.stringify(updated) : "");
  }, [files, onSave]);

  return (
    <div className="space-y-1.5">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 sm:py-1.5 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 group/file">
          <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-0 truncate text-[14px] sm:text-[13px] text-wedly-t1 hover:text-wedly-accent"
          >
            📎 {f.name}
          </a>
          <button
            onClick={() => handleDelete(i)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-wedly-muted hover:text-wedly-red hover:bg-wedly-bg-red transition opacity-0 group-hover/file:opacity-100"
            title="파일 삭제"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      ))}
      <label
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[14px] sm:text-[13px] text-wedly-accent font-medium cursor-pointer",
          uploading && "opacity-60 cursor-not-allowed",
        )}
      >
        <input ref={fileInputRef} type="file" multiple onChange={handleUpload} disabled={uploading} className="sr-only" />
        {uploading ? "업로드 중..." : "+ 파일 첨부"}
      </label>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// 저장 전 확인 모달 — 브라우저 기본 confirm 대신 위들리 디자인 모달(AGENTS.md 규칙).
// 이전 값(빨강·취소선) → 변경 값(초록·굵게) 으로 무엇이 어떻게 바뀌는지 색으로 또렷이 구분.
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmEditDialog({
  label,
  oldVal,
  newVal,
  onConfirm,
  onCancel,
}: {
  label: string;
  oldVal: unknown;
  newVal: string | number | boolean | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const fmt = (v: unknown) =>
    v === null || v === undefined || v === "" ? "(빈 값)" : String(v);
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-wedly-bd bg-white shadow-[0_20px_60px_-10px_rgba(10,34,68,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wedly-bg-blue text-wedly-accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-wedly-navy">수정 확인</h3>
            <p className="truncate text-[12px] text-wedly-muted">
              <span className="font-semibold text-wedly-t2">{label}</span> 칸을 아래와 같이 바꿉니다.
            </p>
          </div>
        </div>
        {/* 본문 — 이전 값(빨강) → 변경 값(초록) */}
        <div className="space-y-1.5 px-5 pb-2">
          <div className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3.5 py-2.5">
            <div className="mb-0.5 text-[11px] font-semibold text-wedly-red">이전 값</div>
            <div className="break-words text-[14px] font-medium text-wedly-red line-through decoration-wedly-red/40">{fmt(oldVal)}</div>
          </div>
          <div className="flex justify-center text-wedly-muted">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14m0 0l-5-5m5 5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="rounded-xl border border-wedly-bd-green bg-wedly-bg-green px-3.5 py-2.5">
            <div className="mb-0.5 text-[11px] font-semibold text-wedly-green">변경 값</div>
            <div className="break-words text-[14px] font-bold text-wedly-green">{fmt(newVal)}</div>
          </div>
        </div>
        {/* 버튼 */}
        <div className="mt-2 flex justify-end gap-2 border-t border-wedly-bd/60 bg-wedly-bg-gray/40 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-wedly-t2 transition-colors hover:bg-wedly-bg-gray"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-wedly-accent px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditableFieldRow({
  col,
  value,
  onUpdate,
  isAdmin = false,
  colorCommon = false,
  commonOverride,
  loadManagers,
}: {
  col: ColumnDef;
  value: unknown;
  onUpdate: (key: string, newVal: string | number | boolean | null) => void;
  isAdmin?: boolean;
  /** 기본정보 섹션에서만 true — 공통 칸 제목을 파랑(앱별=회색). */
  colorCommon?: boolean;
  /** 공통/앱별 전역 설정(관리자 토글) — 색 판정에 반영. */
  commonOverride?: CommonFieldOverride | null;
  /** person 칸 담당자 목록 로드 — 어댑터 경유. 없으면 빈 목록으로 폴백. */
  loadManagers?: () => Promise<{ id: string; name: string }[]>;
}) {
  const fo = useFieldOptions();
  const [editing, setEditing] = useState(false);
  // 저장 직전 확인 모달 대기 상태 — 값이 실제로 바뀌면 styled 확인창(ConfirmEditDialog)을 띄운다.
  const [pendingSave, setPendingSave] = useState<{ newVal: string | number | boolean | null } | null>(null);
  // 편집 가능한 형식만 입력칸을 띄운다. person·읽기전용 타입은 표시만(빈 입력칸 방지).
  // multi_select·file은 편집 가능 — isReadonly에서 제외.
  const isReadonly = fo.READONLY_TYPES.has(col.type) || fo.isReadonlyPerson(col);

  const handleSave = useCallback(
    (newVal: string | number | boolean | null) => {
      setEditing(false);
      // 의도치 않은 수정 방지 — 단일 값 저장 직전 확인 모달. multi_select(태그 토글)는 매번 묻기 불편하므로 제외(즉시 반영).
      // 값이 안 바뀌면 묻지 않음. 통합 상세창의 기본정보·일반 칸이 모두 이 관문(EditableFieldRow)을 거친다.
      if (col.type !== "multi_select" && String(newVal ?? "") !== String(value ?? "")) {
        setPendingSave({ newVal });
        return;
      }
      onUpdate(col.key, newVal);
    },
    [col.key, col.type, value, onUpdate],
  );

  // 표시용 값 — 하이브 EditableFieldRow 와 100% 동일한 형태(빈값 문구·선택 배지·남색 글자·글씨크기).
  const isEmpty = value === null || value === undefined || value === "";
  const displayValue = (() => {
    // 파일 칸: 항상 업로드 UI를 보여준다(빈 값이어도).
    if (col.type === "file") {
      let files: { name: string; url: string }[] = [];
      if (typeof value === "string" && value) {
        try { files = JSON.parse(value as string); } catch { /* ignore */ }
      }
      if (files.length === 0) {
        return <span className="text-wedly-muted text-[13px]">파일 없음 (클릭해 업로드)</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-wedly-bg-gray text-[12px] text-wedly-t2">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="text-wedly-muted">
                <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              {f.name}
            </span>
          ))}
        </div>
      );
    }
    if (isEmpty) {
      // 하이브와 동일: 편집 가능 칸은 "비어 있음", 읽기전용 칸은 "-"
      return <span className="text-wedly-muted">{isReadonly ? "-" : "비어 있음"}</span>;
    }
    if (col.type === "multi_select" && typeof value === "string" && value) {
      return (
        <div className="flex flex-wrap gap-1">
          {(value as string).split(", ").map((t) => (
            <span
              key={t}
              className={cn(
                "inline-block px-2 py-0.5 rounded-md text-[11px] font-medium",
                fo.getOptionColorClass(t, fo.STATUS_COLORS, fo.SELECT_BADGE_COLORS),
              )}
            >
              {t}
            </span>
          ))}
        </div>
      );
    }
    if (col.type === "select" || col.type === "status") {
      return (
        <span
          className={`inline-block rounded-md px-2.5 py-0.5 text-[13px] sm:text-[12px] font-medium ${fo.getOptionColorClass(
            String(value),
            fo.STATUS_COLORS,
            fo.SELECT_BADGE_COLORS,
          )}`}
        >
          {String(value)}
        </span>
      );
    }
    if (col.type === "last_edited_time") {
      return <span className="text-[15px] sm:text-[13px] text-wedly-muted">{formatFieldValue(col, value)}</span>;
    }
    if (col.type === "date") {
      // 하이브는 날짜를 남색으로(굵기 없이) — 금액 칸만 굵게.
      return <span className="text-[15px] sm:text-[13px] text-wedly-navy">{formatFieldValue(col, value)}</span>;
    }
    if ((col.type === "number" && col.format === "currency") || col.type === "percent") {
      return (
        <span className="text-[15px] sm:text-[13px] tabular-nums font-medium text-wedly-navy">
          {formatFieldValue(col, value)}
        </span>
      );
    }
    // 팀장/팀원 사람 칸 → 공용 색 칩(점+알약). 표 셀과 동일 규칙. 그 외 person 은 글자.
    if (col.type === "person" && detectPersonChipRole(col.label)) {
      return renderUnifiedFieldValue(col, value);
    }
    return (
      <span className="text-[15px] sm:text-[13px] font-medium text-wedly-navy">{formatFieldValue(col, value)}</span>
    );
  })();

  return (
    // 모바일 2단(라벨 위/값 아래), 데스크탑 가로 정렬 — 하이브 EditableFieldRow 와 동일.
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 py-3 sm:py-2 px-1 sm:min-h-[36px] group">
      <div
        className={`w-full sm:w-[160px] sm:flex-shrink-0 text-[13px] font-medium sm:font-normal leading-tight sm:truncate ${
          colorCommon && isCommonBasicLabel(col.label, commonOverride) ? "text-wedly-accent" : "text-wedly-muted"
        }`}
      >
        {col.label}
      </div>
      <div className="flex-1 text-[15px] sm:text-[13px] text-wedly-t1 min-w-0 relative">
        {col.type === "file" ? (
          // 파일 칸: 항상 편집 UI를 직접 표시(클릭-to-edit 패턴 대신 항상 열려 있음)
          <FileEditor
            value={String(value ?? "")}
            fieldKey={col.key}
            onSave={(v) => onUpdate(col.key, v)}
          />
        ) : editing && !isReadonly ? (
          <>
            {(col.type === "text" ||
              col.type === "title" ||
              col.type === "email" ||
              col.type === "phone_number") && (
              <TextEditor value={String(value ?? "")} onSave={handleSave} />
            )}
            {(col.type === "number" || col.type === "percent") && (
              <NumberEditor
                value={value != null && value !== "" ? Number(value) : null}
                onSave={handleSave}
              />
            )}
            {col.type === "date" && (
              <DateEditor value={String(value ?? "")} onSave={handleSave} />
            )}
            {(col.type === "select" || col.type === "status") && (
              <SelectEditor
                value={String(value ?? "")}
                options={fo.getFieldOptions(col.key)}
                fieldKey={col.key}
                onSave={(v) => handleSave(v || null)}
                onClose={() => setEditing(false)}
                canDelete={isAdmin}
              />
            )}
            {col.type === "multi_select" && (
              <MultiSelectEditor
                value={String(value ?? "")}
                options={fo.getFieldOptions(col.key)}
                fieldKey={col.key}
                /* 토글마다 저장하되 창은 닫지 않음(여러 개 선택 가능). 바깥 클릭(onClose) 때만 닫는다. */
                onSave={(v) => onUpdate(col.key, v || null)}
                onClose={() => setEditing(false)}
              />
            )}
            {col.type === "person" && (
              <PersonEditor
                value={String(value ?? "")}
                onSave={(v) => handleSave(v)}
                onClose={() => setEditing(false)}
                loadManagers={loadManagers ?? (() => Promise.resolve([]))}
              />
            )}
          </>
        ) : col.type === "checkbox" ? (
          <button
            onClick={() => !isReadonly && onUpdate(col.key, !value)}
            className="flex items-center px-2 sm:px-1 py-1.5 sm:py-0.5 -mx-1 min-h-[40px] sm:min-h-[26px]"
          >
            <div
              className={`w-[18px] h-[18px] rounded border flex items-center justify-center transition-colors ${
                value ? "bg-wedly-accent border-wedly-accent" : "border-wedly-bd hover:border-wedly-accent"
              }`}
            >
              {!!value && (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6l2.5 2.5 4.5-5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </button>
        ) : (
          // 값 영역 전체를 누르면 바로 편집 — 하이브와 동일. 옆에 따라붙던 '편집' 버튼은 제거.
          <div
            onClick={isReadonly ? undefined : () => setEditing(true)}
            className={`rounded-md px-2 sm:px-1 py-1.5 sm:py-0.5 -mx-1 min-h-[40px] sm:min-h-[26px] flex items-center justify-between gap-2 ${
              !isReadonly ? "cursor-pointer hover:bg-wedly-bg-gray transition-colors active:bg-wedly-bg-blue/30" : ""
            }`}
          >
            <div className="flex-1 min-w-0">{displayValue}</div>
          </div>
        )}
      </div>
      {pendingSave && (
        <ConfirmEditDialog
          label={col.label || col.key}
          oldVal={value}
          newVal={pendingSave.newVal}
          onConfirm={() => {
            onUpdate(col.key, pendingSave.newVal);
            setPendingSave(null);
          }}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </div>
  );
}
