"use client";
import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "@wedly/detail-modal-shared";
import {
  buildLinkableColumns,
  buildColumnLabelMap,
  isLatestOnlyLinkType,
  type ColumnTierLink,
  type LinkArea,
  type LinkMode,
} from "../tier-link/config";

export type TierFieldDef = { key: string; label: string; type: string };

export type TierLinkAdapter = {
  ownDomain: string;                              // 예 "tax-amendment"
  sections: { key: string; label: string }[];     // DOMAIN_GROUPS 매핑
  staticColumns: TierFieldDef[];                   // 정적 표 컬럼
  customColumns?: TierFieldDef[];                  // 직접 추가 칸
  erpCustomColumns?: TierFieldDef[];               // ERP 미러 칸(하이브용, 없으면 생략)
  loadFields: (section: string, area: LinkArea) => Promise<TierFieldDef[]>; // 그 섹션 칸(빈 배열 가능)
  loadLinks: () => Promise<ColumnTierLink[]>;
  saveLinks: (links: ColumnTierLink[]) => Promise<{ ok: boolean; error?: string }>;
  previewMigrate?: (link: ColumnTierLink) => Promise<{ migrate: number; conflict: number; aligned: number } | null>;
  applyMigrate?: (link: ColumnTierLink) => Promise<{ ok: boolean; error?: string }>;
};

const AREA_LABEL: Record<LinkArea, string> = { settlement: "정산", contract: "계약", refund: "환불" };

export default function ColumnTierLinksManager({ adapter }: { adapter: TierLinkAdapter }) {
  const [links, setLinks] = useState<ColumnTierLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [colKey, setColKey] = useState("");
  const [section, setSection] = useState(adapter.sections[0]?.key ?? adapter.ownDomain);
  const [area, setArea] = useState<LinkArea>("settlement");
  const [fieldKey, setFieldKey] = useState("");
  const [mode, setMode] = useState<LinkMode>("sum");
  const [areaFields, setAreaFields] = useState<TierFieldDef[]>([]);
  const [usingBase, setUsingBase] = useState(false); // 빈 섹션 기본 틀 사용중 표시

  const linkableCols = useMemo(
    () => buildLinkableColumns(adapter.staticColumns, adapter.customColumns ?? [], adapter.erpCustomColumns ?? []),
    [adapter.staticColumns, adapter.customColumns, adapter.erpCustomColumns],
  );
  const colOptions = useMemo(
    () => [{ value: "", label: "선택…" }, ...linkableCols.map((c) => ({ value: c.key, label: c.label }))],
    [linkableCols],
  );
  const colLabelMap = useMemo(
    () => buildColumnLabelMap(adapter.staticColumns, adapter.customColumns ?? [], adapter.erpCustomColumns ?? []),
    [adapter.staticColumns, adapter.customColumns, adapter.erpCustomColumns],
  );
  const fieldOptions = useMemo(() => areaFields.map((f) => ({ value: f.key, label: f.label })), [areaFields]);
  const selectedColType = useMemo(() => linkableCols.find((c) => c.key === colKey)?.type, [linkableCols, colKey]);
  // 선택한 차수 칸이 자동계산(formula)이면: 사람이 못 고치는 칸 → 최신차수 읽기전용으로만 연결.
  const tierFieldIsFormula = useMemo(() => areaFields.find((f) => f.key === fieldKey)?.type === "formula", [areaFields, fieldKey]);
  const sectionLabel = (k: string) => adapter.sections.find((s) => s.key === k)?.label ?? k;

  useEffect(() => { if (isLatestOnlyLinkType(selectedColType) && mode !== "latest") setMode("latest"); }, [selectedColType, mode]);
  useEffect(() => { if (tierFieldIsFormula && mode !== "latest") setMode("latest"); }, [tierFieldIsFormula, mode]);

  useEffect(() => {
    adapter.loadLinks().then((ls) => { setLinks(ls); setLoading(false); }).catch(() => setLoading(false));
  }, [adapter]);

  // (섹션,영역) 차수 칸 로드 + 빈 섹션이면 ownDomain 같은 영역 칸을 기본 틀로.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 자동계산(formula) 칸도 포함 — 연결 시 표에 그 계산값을 읽기전용으로 보여준다.
      let fs = await adapter.loadFields(section, area).catch(() => []);
      let base = false;
      if (fs.length === 0 && section !== adapter.ownDomain) {
        fs = await adapter.loadFields(adapter.ownDomain, area).catch(() => []);
        base = fs.length > 0;
      }
      if (cancelled) return;
      setAreaFields(fs);
      setUsingBase(base);
      setFieldKey(fs[0]?.key ?? "");
    })();
    return () => { cancelled = true; };
  }, [adapter, section, area]);

  async function persist(next: ColumnTierLink[]) {
    setSaving(true);
    const res = await adapter.saveLinks(next).catch(() => ({ ok: false, error: "네트워크 오류" }));
    setSaving(false);
    if (res.ok) { setLinks(next); setNotice("저장되었습니다."); }
    else setNotice(res.error || "저장 실패");
  }

  async function addLink() {
    if (!colKey || !fieldKey) { setNotice("컬럼과 차수 칸을 고르세요."); return; }
    if (links.some((l) => l.columnKey === colKey)) { setNotice("이미 연결된 컬럼입니다."); return; }
    const link: ColumnTierLink = { columnKey: colKey, section, area, tierFieldKey: fieldKey, mode, ...(tierFieldIsFormula ? { readonly: true } : {}) };
    if (adapter.previewMigrate && adapter.applyMigrate) {
      const pv = await adapter.previewMigrate(link);
      if (pv) setNotice(`이동 ${pv.migrate} · 충돌 ${pv.conflict} · 정렬 ${pv.aligned} 적용합니다.`);
      const mig = await adapter.applyMigrate(link);
      if (!mig.ok) { setNotice(mig.error || "이동 실패"); return; }
    }
    await persist([...links, link]);
    setColKey("");
  }

  function removeLink(columnKey: string) { persist(links.filter((x) => x.columnKey !== columnKey)); }

  if (loading) return <div className="py-6 text-center text-[12px] text-wedly-muted">불러오는 중…</div>;

  return (
    <div className="px-3 sm:px-6 py-3 sm:py-4 max-w-3xl mx-auto">
      <h1 className="text-lg sm:text-xl font-bold text-wedly-navy">차수 ↔ 컬럼 연결 설정</h1>
      <p className="mt-1 text-[12px] sm:text-[13px] text-wedly-muted">상위 섹션 → 세부(계약/정산/환불) → 차수 칸을 골라 표 컬럼과 짝지으면 양쪽이 함께 바뀝니다.</p>

      {/* 현재 연결 목록 */}
      <div className="mt-4 space-y-2">
        {links.length === 0 && (
          <div className="rounded-xl border border-dashed border-wedly-bd p-8 text-center text-[13px] text-wedly-muted">아직 연결이 없습니다. 아래에서 추가하세요.</div>
        )}
        {links.map((l) => (
          <div key={l.columnKey} className="flex items-center justify-between rounded-xl border border-wedly-bd bg-white px-4 py-3 shadow-sm">
            <div className="text-[13px] text-wedly-t1">
              <span className="font-semibold">{colLabelMap[l.columnKey] || l.columnKey}</span>
              <span className="text-wedly-muted"> ↔ {sectionLabel(l.section ?? adapter.ownDomain)} · {AREA_LABEL[l.area]} · {l.tierFieldKey}</span>
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-wedly-bg-blue text-wedly-accent">{l.readonly ? "최신차수(읽기전용)" : l.mode === "sum" ? "합계(읽기전용)" : "최신차수(편집)"}</span>
            </div>
            <button onClick={() => removeLink(l.columnKey)} disabled={saving} className="px-3 py-2 text-[13px] font-medium text-white bg-wedly-red rounded-lg hover:bg-wedly-red/90 transition-colors">해제</button>
          </div>
        ))}
      </div>

      {/* 추가 폼 */}
      <div className="mt-6 rounded-2xl border border-wedly-bd bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-[14px] font-bold text-wedly-navy">연결 추가</h2>

        <div>
          <label className="block text-[12px] text-wedly-muted mb-1">표 컬럼</label>
          <CustomSelect value={colKey} onChange={setColKey} options={colOptions} size="sm" />
        </div>

        {/* 상위 섹션 (신규) */}
        <div>
          <label className="block text-[12px] text-wedly-muted mb-1">상위 섹션</label>
          <CustomSelect value={section} onChange={setSection} options={adapter.sections.map((s) => ({ value: s.key, label: s.label }))} size="sm" />
        </div>

        {/* 세부(영역) */}
        <div>
          <label className="block text-[12px] text-wedly-muted mb-1">차수 카드</label>
          <div className="flex gap-2">
            {(["settlement", "contract", "refund"] as LinkArea[]).map((a) => (
              <button key={a} onClick={() => setArea(a)} className={`px-3 py-2 rounded-lg text-[13px] border ${area === a ? "bg-wedly-bg-blue text-wedly-accent border-wedly-bd-blue font-semibold" : "bg-white text-wedly-t2 border-wedly-bd"}`}>{AREA_LABEL[a]}</button>
            ))}
          </div>
        </div>

        {/* 차수 칸 */}
        <div>
          <label className="block text-[12px] text-wedly-muted mb-1">차수 칸{usingBase && <span className="ml-1 text-wedly-gold">(경정청구 기본 틀)</span>}</label>
          {fieldOptions.length > 0 ? (
            <CustomSelect value={fieldKey} onChange={setFieldKey} options={fieldOptions} size="sm" />
          ) : (
            <p className="text-[12px] text-wedly-muted">이 섹션·영역에 연결 가능한 칸이 없습니다.</p>
          )}
        </div>

        {/* 종류 */}
        <div>
          <label className="block text-[12px] text-wedly-muted mb-1">연결 종류</label>
          {tierFieldIsFormula ? (
            // 자동계산 칸: 사람이 못 고치는 칸 → 최신차수 읽기전용 고정(선택 불가)
            <div className="inline-flex items-center px-3 py-2 rounded-lg text-[13px] border bg-wedly-bg-blue text-wedly-accent border-wedly-bd-blue font-semibold">
              최신차수(읽기전용)
              <span className="ml-2 text-[11px] font-normal text-wedly-muted">자동계산 칸은 표에서 편집할 수 없습니다.</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setMode("sum")} disabled={isLatestOnlyLinkType(selectedColType)} title={isLatestOnlyLinkType(selectedColType) ? "드롭다운·비율(%) 칸은 최신차수(편집)로만 연결됩니다." : undefined} className={`px-3 py-2 rounded-lg text-[13px] border disabled:opacity-40 disabled:cursor-not-allowed ${mode === "sum" ? "bg-wedly-bg-blue text-wedly-accent border-wedly-bd-blue font-semibold" : "bg-white text-wedly-t2 border-wedly-bd"}`}>합계(읽기전용)</button>
              <button onClick={() => setMode("latest")} className={`px-3 py-2 rounded-lg text-[13px] border ${mode === "latest" ? "bg-wedly-bg-blue text-wedly-accent border-wedly-bd-blue font-semibold" : "bg-white text-wedly-t2 border-wedly-bd"}`}>최신차수(편집)</button>
            </div>
          )}
        </div>

        <button onClick={addLink} disabled={saving} className="mt-2 px-4 py-2 text-[13px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition-colors">연결 추가</button>
      </div>

      {notice && <div className="mt-3 text-[12px] text-wedly-t2">{notice}</div>}
    </div>
  );
}
