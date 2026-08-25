"use client";

// 자동 입력 규칙 편집 모달 — 어드민 전용
// ERP 의 동일 시스템 포팅. 데이터: /api/entries/auto-fill-rules
//
// 규칙 예: 진행상태 = "계약완료" 일 때 → 계약담당자 = "홍길동" 자동 입력
//
// 디자인: AGENTS.md 의 위들리 시스템 규칙 100% 적용
//   - CustomSelect (native select 금지)
//   - 위들리 색상·모서리·간격·모달 패턴
//   - 알림/확인은 자체 위들리 모달

import { useEffect, useState } from "react";
import { CustomSelect } from "@wedly/detail-modal-shared";

export type AutoFillOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "starts_with" | "ends_with"
  | "is_edited" | "is_empty" | "is_not_empty";

export type AutoFillRule = {
  id: string;
  name?: string;
  whenKey: string;
  whenOperator: AutoFillOperator;
  whenValue: string;
  thenKey: string;
  thenValue: string;
};

const OPERATOR_OPTIONS: { value: AutoFillOperator; label: string }[] = [
  { value: "equals", label: "= (같음)" },
  { value: "not_equals", label: "≠ (같지 않음)" },
  { value: "contains", label: "포함" },
  { value: "not_contains", label: "포함하지 않음" },
  { value: "starts_with", label: "로 시작" },
  { value: "ends_with", label: "로 끝남" },
  { value: "is_edited", label: "편집됨 (모든 값)" },
  { value: "is_empty", label: "비어 있음" },
  { value: "is_not_empty", label: "값 있음" },
];

const operatorNeedsValue = (op: AutoFillOperator) =>
  op !== "is_edited" && op !== "is_empty" && op !== "is_not_empty";

function makeId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ColumnLite = { key: string; label: string; type: string; group?: string };

export default function AutoFillRulesModal({
  columns,
  onClose,
  onSaved,
}: {
  columns: ColumnLite[];
  onClose: () => void;
  onSaved?: (rules: AutoFillRule[]) => void;
}) {
  const [rules, setRules] = useState<AutoFillRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/entries/auto-fill-rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && Array.isArray(j.data?.rules)) {
          setRules(j.data.rules);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // 후보 컬럼 필터 — _ 시작 키는 시스템 키지만, 차수 카드 컬럼(_meeting_…, _settle_…)은
  // group 정보로 구분되므로 group 이 명시된 컬럼은 허용
  const editableColumns = columns.filter((c) => {
    if (c.group && c.group !== "기본") return true;
    return !c.key.startsWith("_") && c.type !== "auto_increment_id";
  });

  const addRule = () => {
    const first = editableColumns[0]?.key || "";
    setRules((prev) => [
      ...prev,
      {
        id: makeId(),
        name: "",
        whenKey: first,
        whenOperator: "equals",
        whenValue: "",
        thenKey: first,
        thenValue: "",
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<AutoFillRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/entries/auto-fill-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const j = await res.json();
      if (j.success) {
        setSuccessMsg(`${rules.length}개 규칙이 저장되었습니다`);
        onSaved?.(rules);
      } else {
        setErrorMsg(j.error || "저장 실패");
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-wedly-bd bg-white shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-wedly-bd px-5 py-4 bg-gradient-to-b from-white to-wedly-bg-gray/30">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wedly-bg-blue text-wedly-accent-ink">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-wedly-section font-semibold text-wedly-t1">자동 입력 규칙 편집</h2>
              <p className="mt-0.5 text-[12px] text-wedly-muted">
                특정 컬럼 값에 따라 다른 컬럼이 자동으로 채워지도록 규칙을 만들 수 있습니다.
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[13px] text-wedly-muted">
              <div className="w-4 h-4 border-2 border-wedly-bd border-t-wedly-accent rounded-full animate-spin mr-2" />
              불러오는 중…
            </div>
          ) : (
            <>
              {rules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-wedly-bd p-8 text-center text-[13px] text-wedly-muted">
                  아직 자동 입력 규칙이 없습니다. 아래 "+ 규칙 추가" 버튼으로 첫 규칙을 만드세요.
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((r, idx) => (
                    <div key={r.id} className="rounded-xl border border-wedly-bd bg-wedly-bg-gray/30 p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-wedly-muted">규칙 {idx + 1}</p>
                        <button
                          onClick={() => removeRule(r.id)}
                          className="text-[11px] text-wedly-red-ink hover:bg-wedly-bg-red px-2 py-1 rounded transition-colors"
                        >
                          ✕ 삭제
                        </button>
                      </div>
                      {/* 규칙 이름 (선택) */}
                      <input
                        type="text"
                        value={r.name || ""}
                        onChange={(e) => updateRule(r.id, { name: e.target.value })}
                        placeholder="규칙 이름 (선택)"
                        className="w-full px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent"
                      />
                      {/* 조건 (when) */}
                      <div className="rounded-lg bg-white border border-wedly-bd p-3 space-y-2">
                        <p className="text-[10px] font-bold text-wedly-accent">조건 (이 컬럼이 …)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2">
                          <CustomSelect
                            value={r.whenKey}
                            onChange={(v) => updateRule(r.id, { whenKey: v })}
                            options={editableColumns.map((c) => ({
                              value: c.key,
                              // 그룹이 "기본" 외이면 라벨 앞에 [그룹] 표시해 차수 카드 컬럼 구분
                              label: c.group && c.group !== "기본" ? `[${c.group}] ${c.label}` : c.label,
                            }))}
                          />
                          <CustomSelect
                            value={r.whenOperator}
                            onChange={(v) => updateRule(r.id, { whenOperator: v as AutoFillOperator })}
                            options={OPERATOR_OPTIONS}
                          />
                        </div>
                        {operatorNeedsValue(r.whenOperator) && (
                          <input
                            type="text"
                            value={r.whenValue}
                            onChange={(e) => updateRule(r.id, { whenValue: e.target.value })}
                            placeholder="비교할 값"
                            className="w-full px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent"
                          />
                        )}
                      </div>
                      {/* 결과 (then) */}
                      <div className="rounded-lg bg-white border border-wedly-bd p-3 space-y-2">
                        <p className="text-[10px] font-bold text-wedly-green">결과 (이 컬럼에 자동 입력)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2">
                          <CustomSelect
                            value={r.thenKey}
                            onChange={(v) => updateRule(r.id, { thenKey: v })}
                            options={editableColumns.map((c) => ({
                              value: c.key,
                              label: c.group && c.group !== "기본" ? `[${c.group}] ${c.label}` : c.label,
                            }))}
                          />
                          <input
                            type="text"
                            value={r.thenValue}
                            onChange={(e) => updateRule(r.id, { thenValue: e.target.value })}
                            placeholder="입력할 값"
                            className="w-full px-3 py-2 text-[13px] border border-wedly-bd rounded-lg bg-white text-wedly-t1 placeholder:text-wedly-muted focus:outline-none focus:ring-2 focus:ring-wedly-accent/30 focus:border-wedly-accent"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={addRule}
                className="mt-3 w-full py-2.5 text-[13px] font-medium text-wedly-accent-ink border border-dashed border-wedly-accent/40 rounded-lg hover:bg-wedly-bg-blue/30 transition-colors"
              >
                + 규칙 추가
              </button>
              <div className="mt-3 px-3 py-2.5 rounded-xl border border-wedly-bd-blue/30 bg-wedly-bg-blue/30 text-[11px] text-wedly-t2 leading-relaxed">
                💡 규칙은 행 데이터가 변경될 때마다 자동 적용됩니다 (적용 로직은 곧 활성화 예정).
                저장하면 모든 사용자에게 같은 규칙이 적용됩니다.
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
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wedly-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving && (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M14 8A6 6 0 114.8 3.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* 위들리 오류 모달 */}
      {errorMsg && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setErrorMsg(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-wedly-bd bg-white shadow-2xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60">
              <h3 className="text-wedly-sub font-bold text-wedly-navy">오류</h3>
            </div>
            <div className="px-5 py-4 text-[13px] text-wedly-t1">{errorMsg}</div>
            <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end">
              <button onClick={() => setErrorMsg(null)} className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 위들리 성공 모달 */}
      {successMsg && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { setSuccessMsg(null); onClose(); }}>
          <div className="w-full max-w-sm rounded-2xl border border-wedly-bd bg-white shadow-2xl animate-modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-wedly-bd/60 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-wedly-bg-green text-wedly-green-ink">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="text-wedly-sub font-bold text-wedly-navy">저장 완료</h3>
            </div>
            <div className="px-5 py-4 text-[13px] text-wedly-t1">{successMsg}</div>
            <div className="px-5 py-3 bg-wedly-bg-gray/50 border-t border-wedly-bd/60 flex justify-end">
              <button onClick={() => { setSuccessMsg(null); onClose(); }} className="px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
