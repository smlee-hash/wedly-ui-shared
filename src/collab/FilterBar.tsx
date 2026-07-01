"use client";
import React, { useMemo, useState } from "react";
import { cn } from "../lib/cn";
import type { ColumnDef } from "../types/columns";
import { EMPTY_OPTION_VALUE, type FilterOperator } from "./collab-filters";
import {
  type FilterItem, type FilterCategory,
  filterCategory, operatorsFor, defaultOperator, genItemId, isValueNeeded,
} from "./filter-items";

export type FilterField = { key: string; label: string; type: ColumnDef["type"] | string };

export type FilterBarProps = {
  fields: FilterField[];
  items: FilterItem[];
  onChange: (items: FilterItem[]) => void;
  visible: boolean;
  onToggleVisible: () => void;
  onReset: () => void;
  getOptions: (fieldKey: string) => string[];
  getOptionColorClass?: (opt: string) => string;
  isAdmin?: boolean;
  /** 관리자: 현재 필터들을 '기본 필터'로 서버 저장. 있으면 저장 버튼 노출. */
  onSaveAsDefault?: () => void;
  savingDefault?: boolean;
};

const CHIP = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px]";

export function FilterBar({
  fields, items, onChange, visible, onToggleVisible, onReset,
  getOptions, getOptionColorClass, isAdmin, onSaveAsDefault, savingDefault,
}: FilterBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const fieldByKey = useMemo(() => {
    const m = new Map<string, FilterField>();
    for (const f of fields) m.set(f.key, f);
    return m;
  }, [fields]);

  const appliedCount = items.filter((it) => isComplete(it)).length;

  function patch(id: string, next: Partial<FilterItem>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }
  function remove(id: string) {
    onChange(items.filter((it) => it.id !== id));
    if (openId === id) setOpenId(null);
  }
  function addNew() {
    const first = fields[0];
    if (!first) return;
    const cat = filterCategory(first.type);
    const it: FilterItem = { id: genItemId(), field: first.key, operator: defaultOperator(cat) };
    onChange([...items, it]);
    setOpenId(it.id);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-l-2 border-wedly-bd-blue/50 pl-2.5">
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "필터 접기" : "필터 펼치기"}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-wedly-muted transition-colors hover:bg-wedly-bg-blue/40 hover:text-wedly-navy"
        title={visible ? "필터 접기" : "필터 펼치기"}
      >
        {visible ? <EyeIcon /> : <EyeOffIcon />}
      </button>

      {!visible && appliedCount > 0 && (
        <span className="rounded-lg bg-wedly-bg-blue/50 px-2 py-1 text-[12px] text-wedly-navy">
          필터 {appliedCount}개 적용 중
        </span>
      )}

      {visible && (
        <>
          {items.map((it) => {
            const field = fieldByKey.get(it.field);
            const cat: FilterCategory = field ? filterCategory(field.type) : "text";
            return (
              <div key={it.id} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === it.id ? null : it.id)}
                  className={cn(
                    CHIP,
                    it.pinned
                      ? "border-wedly-bd-blue bg-wedly-bg-blue/40 text-wedly-navy"
                      : isComplete(it)
                        ? "border-wedly-bd bg-wedly-bg-gray text-wedly-t1"
                        : "border-wedly-bd bg-white text-wedly-muted",
                  )}
                >
                  {it.pinned && <PinIcon />}
                  <span>{chipLabel(field?.label || it.field, it, cat)}</span>
                  <ChevronIcon />
                </button>
                {!it.pinned && (
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    aria-label="필터 삭제"
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-wedly-muted text-white hover:bg-wedly-red"
                  >
                    <XIcon />
                  </button>
                )}
                {openId === it.id && field && (
                  <FilterPopover
                    item={it}
                    field={field}
                    cat={cat}
                    fields={fields}
                    getOptions={getOptions}
                    getOptionColorClass={getOptionColorClass}
                    onPatch={(n) => patch(it.id, n)}
                    onClose={() => setOpenId(null)}
                  />
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addNew}
            className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2.5 py-1.5 text-[13px] text-wedly-t2 transition-colors hover:bg-wedly-bg-gray"
          >
            <PlusIcon /> 필터
          </button>

          <button
            type="button"
            onClick={onReset}
            aria-label="필터 초기화"
            title="필터 초기화"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-wedly-muted transition-colors hover:bg-wedly-bg-gray hover:text-wedly-navy"
          >
            <RefreshIcon />
          </button>

          {isAdmin && onSaveAsDefault && (
            <button
              type="button"
              onClick={onSaveAsDefault}
              disabled={savingDefault}
              className="ml-auto rounded-lg border border-wedly-bd-blue px-2.5 py-1.5 text-[12px] text-wedly-navy transition-colors hover:bg-wedly-bg-blue/40 disabled:opacity-50"
              title="현재 필터를 이 표의 기본 필터로 저장(모든 사용자에게 고정 노출)"
            >
              {savingDefault ? "저장 중…" : "기본 필터로 저장"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function isComplete(it: FilterItem): boolean {
  if (!isValueNeeded(it.operator)) return true;
  if (it.operator === "in" || it.operator === "not_in") return Array.isArray(it.value) && it.value.length > 0;
  if (it.operator === "date_between") return Array.isArray(it.value) && !!it.value[0] && !!it.value[1];
  return typeof it.value === "string" && it.value.trim() !== "";
}

function chipLabel(fieldLabel: string, it: FilterItem, cat: FilterCategory): string {
  const opLabel = operatorsFor(cat).find((o) => o.op === it.operator)?.label ?? "";
  if (!isValueNeeded(it.operator)) return `${fieldLabel}: ${opLabel}`;
  if (Array.isArray(it.value)) {
    if (it.operator === "date_between") return it.value[0] && it.value[1] ? `${fieldLabel}: ${it.value[0]}~${it.value[1]}` : `${fieldLabel}: 기간`;
    return it.value.length ? `${fieldLabel}: ${it.value.join(", ")}` : `${fieldLabel}: ${opLabel}`;
  }
  return it.value ? `${fieldLabel} ${opLabel}: ${it.value}` : `${fieldLabel}: ${opLabel}`;
}

function FilterPopover({
  item, field, cat, fields, getOptions, getOptionColorClass, onPatch, onClose,
}: {
  item: FilterItem; field: FilterField; cat: FilterCategory; fields: FilterField[];
  getOptions: (k: string) => string[]; getOptionColorClass?: (o: string) => string;
  onPatch: (n: Partial<FilterItem>) => void; onClose: () => void;
}) {
  const ops = operatorsFor(cat);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-wedly-bd bg-white p-3 shadow-lg">
        <label className="mb-1 block text-[11px] text-wedly-muted">컬럼</label>
        <select
          disabled={item.pinned}
          value={item.field}
          onChange={(e) => {
            const nf = fields.find((f) => f.key === e.target.value);
            const ncat = nf ? filterCategory(nf.type) : "text";
            onPatch({ field: e.target.value, operator: defaultOperator(ncat), value: undefined });
          }}
          className="mb-2 w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px] disabled:bg-wedly-bg-gray disabled:text-wedly-muted"
        >
          {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>

        <label className="mb-1 block text-[11px] text-wedly-muted">조건</label>
        <select
          value={item.operator}
          onChange={(e) => onPatch({ operator: e.target.value as FilterOperator, value: undefined })}
          className="mb-2 w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px]"
        >
          {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
        </select>

        <ValueEditor
          item={item}
          field={field}
          getOptions={getOptions}
          getOptionColorClass={getOptionColorClass}
          onPatch={onPatch}
        />

        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-wedly-bd px-2.5 py-1 text-[12px] text-wedly-t2 hover:bg-wedly-bg-gray">닫기</button>
        </div>
      </div>
    </>
  );
}

function ValueEditor({
  item, field, getOptions, getOptionColorClass, onPatch,
}: {
  item: FilterItem; field: FilterField;
  getOptions: (k: string) => string[]; getOptionColorClass?: (o: string) => string;
  onPatch: (n: Partial<FilterItem>) => void;
}) {
  const op = item.operator;
  if (!isValueNeeded(op)) return null;

  if (op === "in" || op === "not_in") {
    // '(미입력)'을 맨 앞에 — 빈 값(미입력) 항목도 포함/제외로 고를 수 있게(탭 편집창과 동일).
    const base = getOptions(field.key);
    const opts = base.includes(EMPTY_OPTION_VALUE) ? base : [EMPTY_OPTION_VALUE, ...base];
    const selected = new Set(Array.isArray(item.value) ? item.value : []);
    return (
      <div className="max-h-40 overflow-y-auto rounded-lg border border-wedly-bd p-1">
        {opts.length === 0 && <div className="px-2 py-1 text-[12px] text-wedly-muted">선택지 없음</div>}
        {opts.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-wedly-bg-gray">
            <input
              type="checkbox"
              checked={selected.has(o)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(o); else next.delete(o);
                onPatch({ value: [...next] });
              }}
            />
            <span className={cn("rounded px-1.5 py-0.5", getOptionColorClass?.(o))}>{o}</span>
          </label>
        ))}
      </div>
    );
  }

  if (op === "date_between") {
    const v = Array.isArray(item.value) ? item.value : ["", ""];
    return (
      <div className="flex items-center gap-1">
        <input type="date" value={v[0] || ""} onChange={(e) => onPatch({ value: [e.target.value, v[1] || ""] })}
          className="w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px]" />
        <span className="text-wedly-muted">~</span>
        <input type="date" value={v[1] || ""} onChange={(e) => onPatch({ value: [v[0] || "", e.target.value] })}
          className="w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px]" />
      </div>
    );
  }

  if (op === "on_or_before" || op === "on_or_after") {
    return (
      <input type="date" value={typeof item.value === "string" ? item.value : ""}
        onChange={(e) => onPatch({ value: e.target.value })}
        className="w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px]" />
    );
  }

  return (
    <input type="text" value={typeof item.value === "string" ? item.value : ""} placeholder="값 입력"
      onChange={(e) => onPatch({ value: e.target.value })}
      className="w-full rounded-lg border border-wedly-bd px-2 py-1.5 text-[13px]" />
  );
}

// ── 아이콘(선 스타일, 공용 표 톤 유지) ─────────────────────────
const I = "h-4 w-4";
function EyeIcon() { return (<svg className={I} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>); }
function EyeOffIcon() { return (<svg className={I} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 4.6A9.7 9.7 0 0112 4.5c6.5 0 10 7 10 7a17 17 0 01-3.1 4M6.1 6.1A17 17 0 002 11.5s3.5 7 10 7c1 0 2-.15 2.9-.4" strokeLinecap="round" strokeLinejoin="round" /></svg>); }
function PinIcon() { return (<svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v5l3 3v2h-5v6l-1 1-1-1v-6H4v-2l3-3V4H6V2h10v2z" /></svg>); }
function ChevronIcon() { return (<svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>); }
function XIcon() { return (<svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg>); }
function PlusIcon() { return (<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>); }
function RefreshIcon() { return (<svg className={I} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 11-3-6.7L21 8m0-5v5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>); }

export default FilterBar;
