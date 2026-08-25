"use client";
import React, { useMemo, useRef, useState } from "react";
import {
  computeHeaderSignature, autoMatchMapping, validateRequiredMapping, validateRequiredValues, applyMapping,
  applyFixedValues, availableFixedFields, mappingTargetsExcludingFixed,
  type TargetField, type ColumnMapping, type FixedValues,
} from "../excel-import";
import { isCsvFile, decodeCsvText } from "../lib/csv-encoding";

export type MappingPreset = { id?: string; name: string; signature: string; mapping: ColumnMapping; headerAsFirstRow: boolean };
export type ImportResult = { created: number; updated: number; skipped: number };

export type ExcelImportWizardProps = {
  title?: string;
  description?: string;
  targetFields: TargetField[];              // 매핑 대상 칸 (엑셀 열 → 앱 칸)
  fixedFields?: TargetField[];              // 고정값 대상 칸 카탈로그 (없으면 targetFields 사용)
  onClose: () => void;
  onImport: (args: { file: File; mapping: ColumnMapping; headerAsFirstRow: boolean; fixedValues: FixedValues }) => Promise<ImportResult>;
  loadPresets: (signature: string) => Promise<{ matched: MappingPreset | null; all: MappingPreset[] }>;
  savePreset: (preset: MappingPreset) => Promise<void>;
  onToast?: (t: { message: string; type: "success" | "error" }) => void;
};

type Parsed = { headers: string[]; rows: Record<string, unknown>[] };

export function ExcelImportWizard(props: ExcelImportWizardProps) {
  const { title = "엑셀 업로드 (대량등록)", description, targetFields, onClose, onImport, loadPresets, savePreset, onToast } = props;
  const fixedFields = props.fixedFields ?? targetFields;
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headerAsFirstRow, setHeaderAsFirstRow] = useState(true);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fixedValues, setFixedValues] = useState<FixedValues>({});
  const [presetName, setPresetName] = useState("");
  const [savePresetChecked, setSavePresetChecked] = useState(false);
  const [autoMatchedName, setAutoMatchedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const signature = useMemo(() => (parsed ? computeHeaderSignature(parsed.headers) : ""), [parsed]);
  const missingRequired = useMemo(() => validateRequiredMapping(mapping, targetFields, fixedValues), [mapping, targetFields, fixedValues]);
  // 필수 칸인데 값이 빈 줄 — 매핑돼 있어도 셀이 비면 다음 단계로 못 가게 막는다.
  const requiredValueIssues = useMemo(
    () => (parsed ? validateRequiredValues(parsed.rows, mapping, fixedValues, targetFields) : []),
    [parsed, mapping, fixedValues, targetFields],
  );
  const requiredBlocked = missingRequired.length > 0 || requiredValueIssues.length > 0;
  const previewRows = useMemo(
    () => (parsed ? applyFixedValues(applyMapping(parsed.rows.slice(0, 5), mapping), fixedValues) : []),
    [parsed, mapping, fixedValues],
  );
  // 매핑 드롭다운이 보여줄 칸 (고정값 지정 칸 제외 — 상호배타)
  const mappingOptions = useMemo(
    () => mappingTargetsExcludingFixed(targetFields, fixedValues),
    [targetFields, fixedValues],
  );
  // 미리보기 표 컬럼 = 매핑된 칸 + 고정값 칸 (중복 제거)
  const usedTargets = useMemo(() => {
    const mapped = targetFields.filter((f) => Object.values(mapping).includes(f.key));
    const fixed = fixedFields.filter((f) => f.key in fixedValues);
    const seen = new Set<string>();
    return [...mapped, ...fixed].filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  }, [mapping, fixedValues, targetFields, fixedFields]);

  // group이 지정된 칸은 묶음 머리글(optgroup)로, 없으면 단일 목록(앞호환).
  function renderFieldOptions(fields: TargetField[]) {
    const hasGroup = fields.some((f) => f.group);
    const opt = (f: TargetField) => (
      <option key={f.key} value={f.key}>
        {f.label}{f.required ? " (필수)" : ""}{f.role === "dedupKey" ? " · 중복 기준" : ""}
      </option>
    );
    if (!hasGroup) return fields.map(opt);
    const groups: string[] = [];
    for (const f of fields) { const g = f.group || "기타"; if (!groups.includes(g)) groups.push(g); }
    return groups.map((g) => (
      <optgroup key={g} label={g}>
        {fields.filter((f) => (f.group || "기타") === g).map(opt)}
      </optgroup>
    ));
  }

  async function handleFile(f: File) {
    setFile(f);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      // CSV는 한글 인코딩(UTF-8/CP949)을 자동 판별해 문자열로 읽는다. 엑셀은 기존대로 바이너리.
      const wb = isCsvFile(f.name, f.type)
        ? XLSX.read(decodeCsvText(new Uint8Array(buf)), { type: "string" })
        : XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const headers = json.length ? Object.keys(json[0]) : [];
      const p: Parsed = { headers, rows: json };
      setParsed(p);
      const sig = computeHeaderSignature(headers);
      let nextMapping = autoMatchMapping(headers, targetFields);
      try {
        const { matched } = await loadPresets(sig);
        if (matched) { nextMapping = { ...nextMapping, ...matched.mapping }; setAutoMatchedName(matched.name); setHeaderAsFirstRow(matched.headerAsFirstRow); }
        else setAutoMatchedName(null);
      } catch { /* 프리셋 조회 실패는 자동매칭으로 진행 */ }
      setMapping(nextMapping);
      setStep(2);
    } catch {
      onToast?.({ message: "엑셀을 읽지 못했습니다. 파일을 확인해 주세요.", type: "error" });
    }
  }

  async function handleImport() {
    if (!file || requiredBlocked) return; // 버튼 disabled와 같은 기준(필수 미매핑·빈 값 모두 차단)
    setBusy(true);
    try {
      const res = await onImport({ file, mapping, headerAsFirstRow, fixedValues });
      if (savePresetChecked && presetName.trim()) {
        await savePreset({ name: presetName.trim(), signature, mapping, headerAsFirstRow });
      }
      setResult(res);
      onToast?.({ message: `새로 등록 ${res.created} · 기존 갱신 ${res.updated} · 건너뜀 ${res.skipped}`, type: "success" });
    } catch {
      onToast?.({ message: "등록에 실패했습니다. 잠시 후 다시 시도해 주세요.", type: "error" });
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-3xl rounded-2xl border border-wedly-bd bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-wedly-section font-semibold text-wedly-t1">{title}</h2>
          <button onClick={onClose} aria-label="닫기" className="text-wedly-muted hover:text-wedly-t1">✕</button>
        </div>

        <ol className="mb-5 flex gap-2 text-sm">
          {["파일 올리기", "열 매핑", "미리보기·등록"].map((label, i) => {
            const s = i + 1;
            const cls = s === step ? "bg-wedly-navy text-white" : s < step ? "bg-wedly-bg-blue text-wedly-accent-ink" : "bg-wedly-bg-gray text-wedly-muted";
            return <li key={s} className={`flex-1 rounded-lg py-2 text-center font-medium ${cls}`}>{s} · {label}</li>;
          })}
        </ol>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <button onClick={() => inputRef.current?.click()} className="w-full rounded-xl border border-dashed border-wedly-bd px-4 py-8 text-center hover:bg-wedly-bg-gray">
                <div className="text-wedly-accent">⬆️</div>
                <div className="mt-2 text-sm text-wedly-t2">엑셀·CSV 파일 선택 (xlsx · xls · csv)</div>
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <label className="mt-4 flex items-center gap-2 text-sm text-wedly-t1">
                <input type="checkbox" checked={headerAsFirstRow} onChange={(e) => setHeaderAsFirstRow(e.target.checked)} />
                첫 줄을 제목(헤더)으로 사용
              </label>
              {description && <p className="mt-3 text-xs leading-relaxed text-wedly-muted">{description}</p>}
            </div>
            <div className="rounded-xl border border-wedly-bd/60 p-3 text-xs text-wedly-muted">파일을 선택하면 미리보기가 표시됩니다.</div>
          </div>
        )}

        {step === 2 && parsed && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              {autoMatchedName && <div className="mb-2 rounded-md bg-wedly-bg-blue px-3 py-2 text-xs text-wedly-accent-ink">저장된 매핑 &apos;{autoMatchedName}&apos;을 자동 적용했어요. 확인만 하세요.</div>}
              <p className="mb-2 text-xs text-wedly-muted">체크를 끄면 그 열은 올리지 않습니다.</p>
              <div className="max-h-72 overflow-auto">
                {parsed.headers.map((h) => {
                  const included = (mapping[h] ?? "") !== "";
                  return (
                    <div key={h} className={`grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2 border-b border-wedly-bd/60 py-2 text-sm ${included ? "" : "opacity-40"}`}>
                      <input
                        type="checkbox"
                        aria-label={`${h} 포함`}
                        checked={included}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const auto = autoMatchMapping([h], mappingOptions)[h] || mappingOptions[0]?.key || "";
                            setMapping({ ...mapping, [h]: auto });
                          } else {
                            setMapping({ ...mapping, [h]: "" });
                          }
                        }}
                      />
                      <span className="truncate text-wedly-t2">{h}</span>
                      <span className="text-wedly-muted">→</span>
                      <select
                        className="rounded-md border border-wedly-bd px-2 py-1 text-sm disabled:bg-wedly-bg-gray"
                        value={mapping[h] ?? ""}
                        disabled={!included}
                        onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                      >
                        <option value="">선택…</option>
                        {renderFieldOptions(mappingOptions)}
                      </select>
                    </div>
                  );
                })}
              </div>
              {missingRequired.length
                ? <div className="mt-2 text-xs text-wedly-red">필수 항목 미지정: {missingRequired.join(", ")}</div>
                : requiredValueIssues.length
                  ? (
                    <div className="mt-2 text-xs text-wedly-red">
                      필수 칸에 빈 값이 있어 진행할 수 없습니다 —{" "}
                      {requiredValueIssues.map((it) => `${it.label} ${it.count}건(${it.exampleRows.join("·")}행${it.count > it.exampleRows.length ? " 등" : ""})`).join(", ")}
                      . 엑셀에서 채우거나 고정값으로 지정해 주세요.
                    </div>
                  )
                  : <div className="mt-2 text-xs text-wedly-green">필수 항목 모두 지정됨</div>}

              {/* 고정값 지정 — 모든 줄에 같은 값 (매핑된 칸과 상호배타) */}
              <div className="mt-4 rounded-xl border border-wedly-bd/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-wedly-t1">고정값 지정 (모든 줄에 같은 값)</span>
                </div>
                {Object.keys(fixedValues).length === 0 && (
                  <p className="mb-2 text-xs text-wedly-muted">특정 칸을 항상 같은 값으로 채우려면 추가하세요.</p>
                )}
                <div className="space-y-2">
                  {Object.entries(fixedValues).map(([k, v]) => {
                    const field = fixedFields.find((f) => f.key === k);
                    if (!field) return null;
                    return (
                      <div key={k} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                        <span className="truncate text-sm text-wedly-t2">{field.label}</span>
                        <FixedValueInput field={field} value={v} onChange={(nv) => setFixedValues({ ...fixedValues, [k]: nv })} />
                        <button
                          type="button"
                          aria-label={`${field.label} 고정값 삭제`}
                          className="text-wedly-muted hover:text-wedly-red"
                          onClick={() => { const next = { ...fixedValues }; delete next[k]; setFixedValues(next); }}
                        >✕</button>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const addable = availableFixedFields(fixedFields, mapping, fixedValues);
                  if (addable.length === 0) return null;
                  return (
                    <select
                      className="mt-2 rounded-md border border-wedly-bd px-2 py-1 text-sm"
                      value=""
                      onChange={(e) => { if (e.target.value) setFixedValues({ ...fixedValues, [e.target.value]: "" }); }}
                    >
                      <option value="">+ 고정값 추가할 칸 선택…</option>
                      {renderFieldOptions(addable)}
                    </select>
                  );
                })()}
              </div>
            </div>
            <PreviewTable fields={usedTargets} rows={previewRows} />
          </div>
        )}

        {step === 3 && parsed && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-3 text-sm text-wedly-t2">올라갈 줄: 약 {parsed.rows.length}건. 연락처가 같은 업체는 새로 만들지 않고 기존 정보에 합쳐집니다.</p>
              <label className="mb-2 flex items-center gap-2 text-sm text-wedly-t1">
                <input type="checkbox" checked={savePresetChecked} onChange={(e) => setSavePresetChecked(e.target.checked)} />
                이 매핑을 저장해 두기
              </label>
              {savePresetChecked && <input type="text" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="매핑 이름 (예: 경정청구 통합DB)" className="w-full rounded-md border border-wedly-bd px-2 py-1 text-sm" />}
              <p className="mt-2 text-xs text-wedly-muted">다음에 같은 형식 파일을 올리면 2단계(열 매핑)를 자동으로 건너뜁니다.</p>
              {result && <div className="mt-3 rounded-md bg-wedly-bg-green px-3 py-2 text-sm text-wedly-green-ink">새로 등록 {result.created} · 기존 갱신 {result.updated} · 건너뜀 {result.skipped}</div>}
            </div>
            <PreviewTable fields={usedTargets} rows={previewRows} />
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-wedly-bd pt-4">
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="rounded-md px-3 py-2 text-sm text-wedly-t2 disabled:invisible">← 이전</button>
          {step < 3
            ? <button onClick={() => setStep((s) => s + 1)} disabled={step === 1 ? !parsed : requiredBlocked} className="rounded-md bg-wedly-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">다음 →</button>
            : <button onClick={handleImport} disabled={busy || !!result || requiredBlocked} className="rounded-md bg-wedly-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "등록 중…" : result ? "완료" : "등록하기"}</button>}
        </div>
      </div>
    </div>
  );
}

function FixedValueInput({ field, value, onChange }: { field: TargetField; value: string; onChange: (v: string) => void }) {
  const t = field.type ?? "text";
  const base = "w-full rounded-md border border-wedly-bd px-2 py-1 text-sm";
  if ((t === "select" || t === "person") && field.options && field.options.length > 0) {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">선택…</option>
        {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === "date" || t === "datetime") return <input type="date" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (t === "number") return <input type="number" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (t === "email") return <input type="email" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
  return <input type="text" className={base} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function PreviewTable({ fields, rows }: { fields: TargetField[]; rows: Record<string, unknown>[] }) {
  const cols = fields; // 고른 칸 전부 — 많으면 가로 스크롤
  return (
    <div className="overflow-hidden rounded-xl border border-wedly-bd/60">
      <div className="bg-wedly-bg-gray px-3 py-2 text-xs font-medium text-wedly-t2">바뀐 항목으로 미리보기</div>
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ minWidth: "max-content" }}>
          <thead className="text-wedly-tablehead"><tr>{cols.map((c) => <th key={c.key} className="whitespace-nowrap border-b border-wedly-bd/60 px-2 py-1.5 text-left font-medium text-wedly-accent">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key} className="whitespace-nowrap border-b border-wedly-bd/60 px-2 py-1.5 text-wedly-t2">{String(r[c.key] ?? "")}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
