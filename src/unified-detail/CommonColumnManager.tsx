"use client";
// 상세창 기본정보 "공통 컬럼 관리" 본문 (관리자 전용, ERP).
// - 추가된 칸 목록: 각 칸의 범위(공통=3앱 / 커스텀=이 앱) 토글 + 삭제
// - 칸 추가: 이름·형식·(드롭다운이면)선택지·범위
// - 표에서 불러오기: 그 페이지 표의 칸을 골라 기본정보에 추가
// 저장은 한 곳(basic-fields API)으로 — 서버가 scope 로 공통/커스텀을 갈라 저장하고
// 공통 칸 라벨을 값 연동 인식에 함께 반영(1단계). 표준 11칸은 코드 상수라 여기 안 나온다.
import { useEffect, useMemo, useState } from "react";
import {
  BASIC_COL_TYPE_CHOICES,
  isChoiceType,
  uniqueColKey,
  upsertDef,
  removeDef,
  setDefScope,
  colDefFromOwnColumn,
  buildDefFromForm,
  type BasicColDef,
} from "../lib/basic-col-manager";

const typeLabel = (t: string) => BASIC_COL_TYPE_CHOICES.find((c) => c.value === t)?.label ?? t;
const norm = (s: string) => (s || "").replace(/\s+/g, "").toLowerCase();

export function CommonColumnManager({
  ownColumns = [],
  reservedLabels = [],
  loadDefs,
  saveDefs,
  onChanged,
}: {
  ownColumns?: Array<{ key: string; label: string; type?: string; options?: string[] }>;
  // 이미 기본정보에 보이는 칸(표준 11칸 등)의 라벨 — 표에서 불러오기 후보에서 제외(중복·값분리 방지).
  reservedLabels?: string[];
  loadDefs: () => Promise<BasicColDef[]>;
  saveDefs: (fields: BasicColDef[]) => Promise<{ ok: boolean; error?: string }>;
  onChanged?: () => void;
}) {
  const [defs, setDefs] = useState<BasicColDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 칸 추가 폼
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [choicesText, setChoicesText] = useState("");
  const [scope, setScope] = useState<"common" | "custom">("common");
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(loadDefs())
      .then((d) => { if (!cancelled) setDefs(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setError("칸 목록을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadDefs]);

  // 공통으로 저장(서버가 scope 로 분리). 성공 시 상태 갱신 + 부모에 알림. 실패는 배너로 정직 표시.
  const persist = async (next: BasicColDef[]) => {
    setBusy(true);
    setError(null);
    const res = await saveDefs(next).catch(() => ({ ok: false, error: "저장 중 오류가 발생했습니다." }));
    if (res?.ok) {
      setDefs(next);
      onChanged?.();
    } else {
      setError(res?.error || "저장에 실패했습니다. 다시 시도해 주세요.");
    }
    setBusy(false);
    return !!res?.ok;
  };

  const takenKeys = useMemo(() => new Set(defs.map((d) => d.key)), [defs]);

  const addColumn = (def: BasicColDef): Promise<boolean> => persist(upsertDef(defs, def));
  const handleAddFromForm = async () => {
    if (!label.trim() || busy) return;
    const key = uniqueColKey(`custom_${Date.now()}`, takenKeys);
    const def = buildDefFromForm({ key, label, type, scope, choicesText });
    const ok = await addColumn(def);
    if (ok) { setLabel(""); setType("text"); setChoicesText(""); }
  };
  const handlePull = async (col: { key: string; label: string; type?: string; options?: string[] }) => {
    if (busy) return;
    const def = colDefFromOwnColumn(col, scope);
    // 키 충돌 시 회피(표 키가 이미 추가돼 있을 때)
    if (takenKeys.has(def.key)) { setError("이미 추가된 칸입니다."); return; }
    const ok = await addColumn(def);
    if (ok) setPickOpen(false);
  };
  const toggleScope = async (key: string, makeCommon: boolean) => {
    await persist(setDefScope(defs, key, makeCommon ? "common" : "custom"));
  };
  const handleDelete = async (key: string) => {
    if (busy) return;
    if (!confirm("이 칸을 삭제하시겠습니까? (모든 사용자에게 적용됩니다)")) return;
    await persist(removeDef(defs, key));
  };

  // "표에서 불러오기" 후보 = 이미 추가된 칸 + 이미 기본정보에 보이는 표준 칸을 뺀 표 칸.
  // (표준 칸을 다른 키로 불러오면 같은 칸이 두 줄 생기고 값이 갈라지므로 라벨 기준으로 제외.)
  const pullCandidates = useMemo(() => {
    const usedKeys = new Set(defs.map((d) => d.key));
    const usedLabels = new Set([...defs.map((d) => norm(d.label)), ...reservedLabels.map(norm)]);
    return ownColumns.filter((c) => c && c.key && !usedKeys.has(c.key) && !usedLabels.has(norm(c.label)));
  }, [ownColumns, defs, reservedLabels]);

  if (loading) return <div className="text-[14px] text-wedly-muted">불러오는 중…</div>;

  const inputCls = "w-full text-[13px] border border-wedly-bd rounded-lg px-2.5 py-1.5 outline-none focus:border-wedly-accent";

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3 py-2 text-[12px] text-wedly-red" role="alert">
          {error}
        </div>
      )}

      {/* ── 추가된 칸 목록 ── */}
      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-wedly-t1">추가된 칸</h3>
        <p className="text-[12px] text-wedly-muted">
          <b>공통(3앱)</b>으로 두면 3개 앱에 같은 칸이 생기고 값이 함께 맞춰집니다. <b>이 앱만</b>으로 두면 이 앱(ERP)에서만 보입니다.
        </p>
        {defs.length === 0 ? (
          <div className="rounded-xl border border-wedly-bd/60 px-3 py-3 text-[12px] text-wedly-muted">추가된 칸이 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {defs.map((d) => {
              const isCommon = d.scope !== "custom";
              return (
                <div key={d.key} className="flex items-center justify-between gap-3 rounded-xl border border-wedly-bd/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[14px] text-wedly-t1 truncate">{d.label}</div>
                    <div className="text-[11px] text-wedly-muted">{typeLabel(d.type)}{isChoiceType(d.type) && d.options?.length ? ` · 선택지 ${d.options.length}개` : ""}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-wedly-muted">{isCommon ? "공통(3앱)" : "이 앱만"}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggleScope(d.key, !isCommon)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${isCommon ? "bg-wedly-accent" : "bg-wedly-bg-gray"}`}
                        aria-pressed={isCommon}
                        title={isCommon ? "공통 (3앱 값 공유)" : "이 앱만 (ERP 전용)"}
                      >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isCommon ? "translate-x-5" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDelete(d.key)}
                      className="text-[11px] text-wedly-red hover:bg-wedly-bg-red/40 px-1.5 py-0.5 rounded border border-wedly-bd-red/60 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 칸 추가 ── */}
      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-wedly-t1">칸 추가</h3>
        <div className="rounded-xl border border-wedly-bd/60 p-3 space-y-3">
          <div>
            <label className="block text-[11px] text-wedly-muted mb-1">칸 이름</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddFromForm(); }}
              placeholder="예: 비고"
              className={inputCls}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[11px] text-wedly-muted mb-1">형식</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} bg-white`}>
                {BASIC_COL_TYPE_CHOICES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-wedly-muted mb-1">범위</label>
              <select value={scope} onChange={(e) => setScope(e.target.value as "common" | "custom")} className={`${inputCls} bg-white`}>
                <option value="common">공통 (3앱)</option>
                <option value="custom">이 앱만 (ERP)</option>
              </select>
            </div>
          </div>
          {isChoiceType(type) && (
            <div>
              <label className="block text-[11px] text-wedly-muted mb-1">선택지 (줄바꿈 또는 쉼표로 구분)</label>
              <textarea
                value={choicesText}
                onChange={(e) => setChoicesText(e.target.value)}
                placeholder={"예: 상\n중\n하"}
                rows={3}
                className={`${inputCls} resize-y`}
              />
            </div>
          )}
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setPickOpen((v) => !v)}
              className="text-[12px] text-wedly-accent hover:underline"
            >
              {pickOpen ? "표에서 불러오기 닫기" : "＋ 표에서 칸 불러오기"}
            </button>
            <button
              type="button"
              onClick={handleAddFromForm}
              disabled={!label.trim() || busy}
              className="px-3 py-1.5 text-[12px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              추가
            </button>
          </div>

          {/* ── 표에서 불러오기 ── */}
          {pickOpen && (
            <div className="rounded-lg border border-wedly-bd/60 bg-wedly-bg-gray/40 p-2 space-y-1 max-h-[200px] overflow-y-auto">
              <p className="text-[11px] text-wedly-muted px-1 pb-1">위 <b>범위</b>로 추가됩니다. 칸을 누르면 바로 추가돼요.</p>
              {pullCandidates.length === 0 ? (
                <div className="text-[12px] text-wedly-muted px-1 py-2">불러올 표 칸이 없습니다.</div>
              ) : (
                pullCandidates.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={busy}
                    onClick={() => handlePull(c)}
                    className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white text-[13px] text-wedly-t1 disabled:opacity-50"
                  >
                    <span className="truncate">{c.label}</span>
                    <span className="text-[11px] text-wedly-muted flex-shrink-0">{typeLabel(c.type || "text")}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
