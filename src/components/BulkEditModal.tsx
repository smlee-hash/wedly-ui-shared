"use client";

// 선택 행 일괄 수정 모달 — ERP 의 동일 컴포넌트 포팅
// 받는 쪽: /api/entries/bulk-update (어드민 전용)
// 모든 select 는 위들리 CustomSelect 사용 — native select 의 OS 기본 펼침 박스 차단

import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "@wedly/detail-modal-shared";

type ColumnLite = {
  key: string;
  label: string;
  type: string;
  options?: string[];
};

const EDITABLE_TYPES = new Set([
  "text",
  "number",
  "date",
  "select",
  "multi_select",
  "person",
  "checkbox",
  "email",
  "phone_number",
  "status",
  "percent",
]);

export default function BulkEditModal({
  selectedIds,
  columns,
  onClose,
  onComplete,
}: {
  selectedIds: string[];
  columns: ColumnLite[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const editableColumns = useMemo(
    () => columns.filter((c) => EDITABLE_TYPES.has(c.type) && !c.key.startsWith("_")),
    [columns]
  );

  const [columnKey, setColumnKey] = useState<string>(editableColumns[0]?.key || "");
  const [value, setValue] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);
  // 위들리 확인 모달 — 브라우저 기본 confirm 대신 사용 (AGENTS.md 규칙)
  const [showConfirm, setShowConfirm] = useState(false);
  // 위들리 오류 모달 — 브라우저 기본 alert 대신 사용
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setValue("");
  }, [columnKey]);

  const selectedColumn = editableColumns.find((c) => c.key === columnKey);

  // 위들리 디자인 확인 모달 열기 — 브라우저 기본 confirm 안 씀
  function handleSubmit() {
    if (!selectedColumn) return;
    if (selectedIds.length === 0) return;
    setShowConfirm(true);
  }

  // 확인 모달에서 "확인" 누르면 실제 적용
  async function confirmApply() {
    if (!selectedColumn) return;
    setShowConfirm(false);
    setSubmitting(true);
    setResult(null);
    try {
      let parsed: string | number | boolean | null = value;
      if (selectedColumn.type === "number" || selectedColumn.type === "percent") {
        parsed = value === "" ? null : Number(value.replace(/,/g, ""));
        if (typeof parsed === "number" && !isFinite(parsed)) {
          setErrorMsg("올바른 숫자를 입력하세요.");
          setSubmitting(false);
          return;
        }
      } else if (selectedColumn.type === "checkbox") {
        parsed = value === "true";
      } else if (value === "") {
        parsed = null;
      }

      const res = await fetch(`/api/entries/bulk-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, key: columnKey, value: parsed }),
      });
      const json = await res.json();
      if (json.success) {
        setResult({ updated: json.data.updated, failed: json.data.failed });
        onComplete();
      } else {
        setErrorMsg(json.error?.message || "일괄 수정 실패");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  function renderValueInput() {
    if (!selectedColumn) return null;
    const t = selectedColumn.type;

    if (t === "select" || t === "status") {
      const opts = selectedColumn.options || [];
      return (
        <CustomSelect
          value={value}
          onChange={setValue}
          options={[
            { value: "", label: "(비움)" },
            ...opts.map((o) => ({ value: o, label: o })),
          ]}
        />
      );
    }
    if (t === "checkbox") {
      return (
        <CustomSelect
          value={value}
          onChange={setValue}
          options={[
            { value: "", label: "(비움)" },
            { value: "true", label: "체크함" },
            { value: "false", label: "체크 안 함" },
          ]}
        />
      );
    }
    if (t === "date") {
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-wedly-bd bg-white px-3 py-2 text-sm text-wedly-t1 transition-colors hover:border-wedly-accent/60 focus:border-wedly-accent focus:outline-none focus:ring-2 focus:ring-wedly-bd-blue"
        />
      );
    }
    if (t === "number" || t === "percent") {
      return (
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t === "percent" ? "퍼센트 숫자 입력 (예: 30)" : "숫자 입력 (비우면 값 지움)"}
            className={`w-full rounded-lg border border-wedly-bd bg-white px-3 py-2 text-sm tabular-nums text-wedly-t1 placeholder:text-wedly-muted transition-colors hover:border-wedly-accent/60 focus:border-wedly-accent focus:outline-none focus:ring-2 focus:ring-wedly-bd-blue ${t === "percent" ? "pr-7" : ""}`}
          />
          {t === "percent" && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-wedly-muted text-[13px] pointer-events-none">%</span>
          )}
        </div>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="새 값을 입력하세요 (비우면 값 지움)"
        className="w-full rounded-lg border border-wedly-bd bg-white px-3 py-2 text-sm text-wedly-t1 placeholder:text-wedly-muted transition-colors hover:border-wedly-accent/60 focus:border-wedly-accent focus:outline-none focus:ring-2 focus:ring-wedly-bd-blue"
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-wedly-bd bg-white shadow-[0_20px_60px_-10px_rgba(10,34,68,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-wedly-bd px-5 py-4 bg-gradient-to-b from-white to-wedly-bg-gray/30">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wedly-bg-blue text-wedly-accent-ink">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-wedly-section font-semibold text-wedly-t1">선택 항목 일괄 수정</h2>
              <p className="mt-0.5 text-[12px] text-wedly-muted">
                선택한 <span className="font-semibold text-wedly-accent-ink">{selectedIds.length}</span>개 행의 한 컬럼 값을 한 번에 바꿉니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-wedly-muted hover:text-wedly-t1 transition-colors"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {result ? (
            <div className="rounded-xl border border-wedly-bd-green bg-wedly-bg-green p-4">
              <div className="flex items-center gap-2 text-wedly-green-ink">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm font-semibold">처리 완료</p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-wedly-bd-green/60 bg-white px-3 py-2">
                  <p className="text-[11px] text-wedly-muted">성공</p>
                  <p className="text-base font-bold text-wedly-green-ink tabular-nums">{result.updated.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="rounded-lg border border-wedly-bd/60 bg-white px-3 py-2">
                  <p className="text-[11px] text-wedly-muted">실패</p>
                  <p className={`text-base font-bold tabular-nums ${result.failed > 0 ? "text-wedly-red" : "text-wedly-t2"}`}>
                    {result.failed.toLocaleString("ko-KR")}건
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-wedly-t2">바꿀 컬럼</label>
                <CustomSelect
                  value={columnKey}
                  onChange={setColumnKey}
                  options={editableColumns.map((c) => ({ value: c.key, label: c.label }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-wedly-t2">새 값</label>
                {renderValueInput()}
                <p className="mt-1.5 text-[11px] text-wedly-muted">
                  비워두고 적용하면 해당 컬럼 값이 모두 지워집니다.
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-[var(--wedly-gold)]/30 bg-wedly-bg-yellow px-3 py-2.5 text-[12px] text-wedly-t2">
                <svg className="mt-0.5 shrink-0 text-wedly-t1" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l7 13H1L8 1z M8 6v3 M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>한 번 적용하면 되돌릴 수 없습니다. 선택한 행이 맞는지 다시 확인하세요.</span>
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 border-t border-wedly-bd bg-wedly-bg-gray/30 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-wedly-bd bg-white px-4 py-2 text-sm font-medium text-wedly-t2 transition-colors hover:bg-wedly-bg-gray"
          >
            {result ? "닫기" : "취소"}
          </button>
          {!result && (
            <button
              onClick={handleSubmit}
              disabled={submitting || !columnKey}
              className="inline-flex items-center gap-1.5 rounded-lg bg-wedly-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting && (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8A6 6 0 114.8 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
              {submitting ? "처리 중..." : `${selectedIds.length}개에 적용`}
            </button>
          )}
        </div>
      </div>

      {/* 위들리 확인 모달 — 브라우저 기본 confirm 대신 (AGENTS.md 규칙) */}
      {showConfirm && selectedColumn && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-wedly-bd bg-white shadow-2xl animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
              <h3 className="text-wedly-sub font-bold text-wedly-navy">일괄 수정 확인</h3>
            </div>
            <div className="px-5 py-4 text-[13px] text-wedly-t2 leading-relaxed">
              선택한 <span className="font-semibold text-wedly-accent">{selectedIds.length}</span>개 행의
              <br />
              <span className="font-medium text-wedly-t1">'{selectedColumn.label}'</span> 값을
              <br />
              <span className="font-medium text-wedly-t1">'{value || "(비움)"}'</span> 로 바꾸시겠습니까?
              <p className="mt-2 text-[11px] text-wedly-muted">한 번 적용하면 되돌릴 수 없습니다.</p>
            </div>
            <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-[13px] font-medium text-wedly-t2 bg-white border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmApply}
                className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors"
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 위들리 오류 모달 — 브라우저 기본 alert 대신 */}
      {errorMsg && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setErrorMsg(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-wedly-bd bg-white shadow-2xl animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-wedly-bg-red text-wedly-red-ink">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1l7 13H1L8 1zM8 6v3M8 11.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="text-wedly-sub font-bold text-wedly-navy">알림</h3>
            </div>
            <div className="px-5 py-4 text-[13px] text-wedly-t1 leading-relaxed">
              {errorMsg}
            </div>
            <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex items-center justify-end">
              <button
                onClick={() => setErrorMsg(null)}
                className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors"
                autoFocus
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
