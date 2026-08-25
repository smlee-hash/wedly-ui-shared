"use client";

import { useState } from "react";
import { CustomSelect } from "@wedly/detail-modal-shared";
import { buildTabFromDraft, EMPTY_OPTION_VALUE } from "./collab-filters";
import type { ViewTab, FilterCondition, FilterOperator, TabFilterMatch } from "./collab-filters";

type FieldDef = { key: string; label: string; type: string };
/** 표시 형식 선택지(예: 표/캘린더). */
type ViewModeOption = { value: string; label: string; hint?: string };

type Props = {
  tab: ViewTab;
  /** 거르기 조건에서 고를 수 있는 항목들(key·label·type) */
  fields: FieldDef[];
  /** 항목별 선택지 목록(상태값 등) */
  getFieldOptions: (fieldKey: string) => string[];
  /** 표시 형식 선택지. 주면 "표시 형식" 토글이 보이고, 생략하면 숨김(캘린더 없는 앱). */
  viewModes?: ViewModeOption[];
  onSave: (tab: ViewTab) => void;
  /** 없으면 삭제 버튼 숨김(예: 전체 탭) */
  onDelete?: (id: string) => void;
  onClose: () => void;
};

type OperatorChoice = { value: FilterOperator; label: string };

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "같음",
  not_equals: "다름",
  in: "다중 선택(포함)",
  not_in: "다중 선택(제외)",
  contains: "텍스트 포함",
  not_contains: "텍스트 미포함",
  is_empty: "비어 있음",
  is_not_empty: "값 있음",
  on_or_before: "이 날짜 이전",
  on_or_after: "이 날짜 이후",
  date_between: "기간",
  date_today: "오늘",
  date_yesterday: "어제",
  date_this_week: "이번 주",
  date_this_month: "이번 달",
  date_last_month: "지난 달",
};

const NO_VALUE_OPS: FilterOperator[] = ["is_empty", "is_not_empty"];

/** 조건 적용 방식 고르기 — 라벨은 비개발자 기준(그리고/또는). */
const MATCH_CHOICES: { value: TabFilterMatch; label: string }[] = [
  { value: "all", label: "모든 조건 만족 (그리고)" },
  { value: "any", label: "하나라도 만족 (또는)" },
];

/** 항목 종류에 맞는 연산 후보. '다중 선택(포함/제외)'은 select·status·multi_select 에서만 제공
 *  (날짜·숫자·자유 텍스트엔 의미가 약해 의도적으로 뺌). 단 matchesFilter 는 어느 항목이든 not_in 을 처리한다. */
function operatorsForType(type: string | undefined): OperatorChoice[] {
  const mk = (vals: FilterOperator[]): OperatorChoice[] =>
    vals.map((v) => ({ value: v, label: OPERATOR_LABELS[v] }));
  switch (type) {
    case "select":
    case "status":
      return mk(["equals", "in", "not_in", "is_empty", "is_not_empty"]);
    case "multi_select":
      return mk(["in", "not_in", "equals", "contains", "is_empty", "is_not_empty"]);
    case "date":
    case "last_edited_time":
      return mk(["is_empty", "is_not_empty", "on_or_before", "equals"]);
    case "number":
      return mk(["equals", "is_empty", "is_not_empty"]);
    default:
      return mk(["equals", "contains", "is_empty", "is_not_empty"]);
  }
}

/**
 * 통합협업 표 위 필터 탭 편집창(공용) — 이름 + 표시 형식(표/캘린더) + 거르기 조건(그리고/또는 선택).
 * 하이브 편집창과 같은 방식. viewModes 를 주면 표/캘린더 전환 토글이 나온다.
 */
export default function TabEditorModal({ tab, fields, getFieldOptions, viewModes, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<ViewTab>(() => ({
    ...tab,
    filters: (tab.filters || []).map((f) => ({ ...f })),
  }));

  const currentMode = draft.viewMode || viewModes?.[0]?.value || "table";
  const filterMatch: TabFilterMatch = draft.filterMatch === "any" ? "any" : "all";

  const setLabel = (label: string) => setDraft((d) => ({ ...d, label }));

  const updateFilter = (idx: number, patch: Partial<FilterCondition>) =>
    setDraft((d) => ({
      ...d,
      filters: d.filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }));

  const changeField = (idx: number, fieldKey: string) => {
    const fieldDef = fields.find((f) => f.key === fieldKey);
    const firstOp = operatorsForType(fieldDef?.type)[0]?.value ?? "equals";
    updateFilter(idx, { field: fieldKey, operator: firstOp, value: undefined });
  };

  // 연산이 바뀌면 값 형식도 달라지므로 값 초기화.
  const changeOperator = (idx: number, op: FilterOperator) => updateFilter(idx, { operator: op, value: undefined });

  const addCondition = () =>
    setDraft((d) => ({ ...d, filters: [...d.filters, { field: "", operator: "equals" as FilterOperator }] }));

  const removeCondition = (idx: number) =>
    setDraft((d) => ({ ...d, filters: d.filters.filter((_, i) => i !== idx) }));

  const toggleMultiValue = (idx: number, opt: string) =>
    setDraft((d) => ({
      ...d,
      filters: d.filters.map((f, i) => {
        if (i !== idx) return f;
        const cur = Array.isArray(f.value) ? f.value : [];
        const next = cur.includes(opt) ? cur.filter((v) => v !== opt) : [...cur, opt];
        return { ...f, value: next };
      }),
    }));

  const canSave = draft.label.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    // 항목 안 고른 빈 조건만 제외. '전체' 탭도 조건을 가질 수 있다.
    // buildTabFromDraft 로 통째 보존(columns/isPreset/viewMode 등 숨은 필드 유지).
    const cleaned = draft.filters.filter((f) => f.field);
    // 조건 적용 방식은 '또는'일 때만 저장하고, '그리고'(기본)면 칸 자체를 지운다 →
    // 되돌렸을 때 옛 값이 남아 끄기가 안 먹히는 일이 없다.
    const base = buildTabFromDraft(draft, draft.label.trim(), cleaned);
    if (filterMatch === "any") base.filterMatch = "any";
    else delete base.filterMatch;
    onSave(base);
  };

  const modeHint = viewModes?.find((vm) => vm.value === currentMode)?.hint;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-wedly-section font-bold text-wedly-navy">탭 편집</h2>
          <button onClick={onClose} className="text-wedly-muted hover:text-wedly-t2" title="닫기">✕</button>
        </div>

        {/* 이름 */}
        <label className="mb-1 block text-sm font-medium text-wedly-t2">탭 이름</label>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={30}
          placeholder="예: 수금 대상"
          className="mb-4 w-full rounded-lg border border-wedly-bd px-3 py-2 text-sm focus:border-wedly-accent focus:outline-none"
        />

        {/* 표시 형식(표/캘린더) — viewModes 가 있을 때만 */}
        {viewModes && viewModes.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-wedly-t2">표시 형식</label>
            <div className="grid grid-cols-2 gap-2">
              {viewModes.map((vm) => {
                const active = currentMode === vm.value;
                return (
                  <button
                    key={vm.value}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, viewMode: vm.value }))}
                    className={
                      "flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[14px] font-medium transition-colors sm:min-h-[36px] sm:text-[13px] " +
                      (active
                        ? "border-wedly-accent bg-wedly-bg-blue text-wedly-accent-ink"
                        : "border-wedly-bd bg-white text-wedly-t2 hover:bg-wedly-bg-gray")
                    }
                  >
                    {vm.label}
                  </button>
                );
              })}
            </div>
            {modeHint && (
              <p className="mt-2 rounded border border-wedly-orange/30 bg-wedly-bg-yellow/40 p-2 text-[11px] text-wedly-t1">
                {modeHint}
              </p>
            )}
          </div>
        )}

        {/* 거르기 조건 — '전체' 탭 포함 모든 탭에서 표시. 조건이 없으면 전체를 보여준다. */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-wedly-t2">거르기 조건</span>
        </div>

        {/* 조건 적용 방식 — 조건 여러 개를 '그리고'로 묶을지 '또는'으로 묶을지(NO.127). 기본 '그리고'. */}
        <div className="mb-2 grid grid-cols-2 gap-2">
          {MATCH_CHOICES.map((c) => {
            const active = filterMatch === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, filterMatch: c.value }))}
                className={
                  "flex min-h-[40px] items-center justify-center rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors sm:min-h-[34px] sm:text-[12px] " +
                  (active
                    ? "border-wedly-accent bg-wedly-bg-blue text-wedly-accent-ink"
                    : "border-wedly-bd bg-white text-wedly-t2 hover:bg-wedly-bg-gray")
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="mb-2 text-[12px] text-wedly-muted">
          {filterMatch === "any"
            ? "조건 중 하나라도 만족하는 항목을 보여줍니다. 다중 선택(제외)는 하나라도 해당하면 뺍니다."
            : "모든 조건을 동시에 만족하는 항목만 보여줍니다. 다중 선택(제외)는 모두 해당할 때만 뺍니다."}
        </p>

        <div className="space-y-2">
          {draft.filters.length === 0 && (
            <p className="rounded-lg bg-wedly-bg-gray/60 px-3 py-2 text-[13px] text-wedly-t2">
              조건이 없으면 전체 항목을 보여줍니다.
            </p>
          )}
          {draft.filters.map((filter, idx) => {
            const fieldDef = fields.find((f) => f.key === filter.field);
            const ops = operatorsForType(fieldDef?.type);
            const options = fieldDef ? getFieldOptions(fieldDef.key) : [];
            const needsValue = !NO_VALUE_OPS.includes(filter.operator);
            const isMulti =
              filter.operator === "in" || filter.operator === "not_in" || filter.operator === "contains";
            return (
              <div key={idx} className="rounded-lg border border-wedly-bd bg-wedly-bg-gray/40 p-2">
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <CustomSelect
                      value={filter.field}
                      onChange={(v) => changeField(idx, v)}
                      placeholder="항목 선택…"
                      options={[{ value: "", label: "항목 선택…" }, ...fields.map((f) => ({ value: f.key, label: f.label }))]}
                    />
                  </div>
                  <div className="w-[124px] flex-shrink-0">
                    <CustomSelect
                      value={filter.operator}
                      onChange={(v) => changeOperator(idx, v as FilterOperator)}
                      options={ops.map((op) => ({ value: op.value, label: op.label }))}
                    />
                  </div>
                  <button
                    onClick={() => removeCondition(idx)}
                    className="flex-shrink-0 rounded p-1 text-wedly-muted hover:text-wedly-red"
                    title="조건 삭제"
                  >
                    ✕
                  </button>
                </div>

                {needsValue && (
                  <div className="mt-2">
                    {isMulti && options.length > 0 ? (
                      <div className="grid max-h-36 grid-cols-2 gap-1 overflow-y-auto">
                        {((filter.operator === "in" || filter.operator === "not_in") ? [EMPTY_OPTION_VALUE, ...options] : options).map((opt) => {
                          const sel = Array.isArray(filter.value) && filter.value.includes(opt);
                          return (
                            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12px] hover:bg-white">
                              <input
                                type="checkbox"
                                checked={sel}
                                onChange={() => toggleMultiValue(idx, opt)}
                                className="rounded border-wedly-bd text-wedly-accent"
                              />
                              {opt}
                            </label>
                          );
                        })}
                      </div>
                    ) : isMulti ? (
                      <input
                        type="text"
                        value={Array.isArray(filter.value) ? filter.value.join(", ") : ""}
                        onChange={(e) =>
                          updateFilter(idx, {
                            value: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder="값을 쉼표로 구분 (예: 있음, 없음)"
                        className="w-full rounded-md border border-wedly-bd bg-white px-2 py-1.5 text-[13px]"
                      />
                    ) : filter.operator === "equals" && options.length > 0 ? (
                      <CustomSelect
                        value={typeof filter.value === "string" ? filter.value : ""}
                        onChange={(v) => updateFilter(idx, { value: v })}
                        placeholder="선택…"
                        options={[{ value: "", label: "선택…" }, { value: EMPTY_OPTION_VALUE, label: EMPTY_OPTION_VALUE }, ...options.map((o) => ({ value: o, label: o }))]}
                      />
                    ) : fieldDef?.type === "date" ? (
                      <input
                        type="date"
                        value={typeof filter.value === "string" ? filter.value : ""}
                        onChange={(e) => updateFilter(idx, { value: e.target.value })}
                        className="w-full rounded-md border border-wedly-bd bg-white px-2 py-1.5 text-[13px]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={typeof filter.value === "string" ? filter.value : ""}
                        onChange={(e) => updateFilter(idx, { value: e.target.value })}
                        placeholder="값 입력…"
                        className="w-full rounded-md border border-wedly-bd bg-white px-2 py-1.5 text-[13px]"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={addCondition} className="mt-2 text-[13px] font-medium text-wedly-accent hover:underline">
          + 조건 추가
        </button>

        <div className="mt-5 flex items-center justify-between">
          <div>
            {onDelete && (
              <button onClick={() => onDelete(draft.id)} className="text-[13px] font-medium text-wedly-red hover:underline">
                탭 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-wedly-bd px-4 py-2 text-sm font-medium text-wedly-t2 hover:bg-wedly-bg-gray"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-wedly-navy px-4 py-2 text-sm font-semibold text-white hover:bg-wedly-navy/90 disabled:opacity-40"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
