"use client";
// 상세창 기본정보 "공통 컬럼 관리" 본문 (관리자 전용).
// 섹션은 딱 2개 — [공통 컬럼](3앱 공유) / [커스텀 컬럼](이 앱 전용).
// 한 칸을 반대 섹션으로 "옮기기" 버튼 한 번으로 이동하고, "이 앱만 숨김"은 작은 눈 아이콘으로,
// 새 컬럼은 커스텀 컬럼 아래에서 추가(표에서 불러오기 포함). 직접 추가한 컬럼만 삭제 가능.
//
// 공통/커스텀 판정은 상세창 배지와 "똑같은 기준"(isCommonBasicLabel)을 써서 항상 일치한다.
// - 직접 추가 컬럼(def): scope 를 바꿔 저장 → 서버가 공통 인식(override)에 동기화 → override 다시 불러옴.
// - 표준·앱기본 컬럼: override(extra/excluded)를 직접 바꿔 저장.
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_COMMON_BASIC_LABELS,
  isCommonBasicLabel,
  PROTECTED_FROM_HIDE,
  type CommonFieldOverride,
} from "./sections";
import { fetchCommonFieldsOverride, refreshCommonFieldsOverride, saveCommonFieldsOverride } from "../lib/common-fields-store";
import { fetchHiddenBasicColumns, saveHiddenBasicColumns } from "../lib/column-visibility-store";
import {
  BASIC_COL_TYPE_CHOICES,
  isChoiceType,
  uniqueColKey,
  upsertDef,
  removeDef,
  setDefScope,
  colDefFromOwnColumn,
  buildDefFromForm,
  ensureIndependentPersonKey,
  type BasicColDef,
} from "../lib/basic-col-manager";

const norm = (s: string) => (s || "").replace(/\s+/g, "").toLowerCase();
const isProtected = (label: string) => PROTECTED_FROM_HIDE.some((p) => norm(p) === norm(label));
const typeLabel = (t: string) => BASIC_COL_TYPE_CHOICES.find((c) => c.value === t)?.label ?? t;

type ManagedItem = {
  label: string;
  isCommon: boolean;
  hidden: boolean;
  hideLocked: boolean;
  def?: BasicColDef; // 있으면 = 직접 추가 컬럼(삭제 가능, scope 로 이동)
  typeText?: string;
};

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <line x1="4" y1="20" x2="20" y2="4" />}
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function ManagedRow({ item, busy, canManageCommon, onMove, onToggleHidden, onEdit, onDelete }: {
  item: ManagedItem;
  busy: boolean;
  canManageCommon: boolean;
  onMove: (makeCommon: boolean) => void;
  onToggleHidden: (makeHidden: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const common = item.isCommon;
  // 공통 칸 제어(공통↔커스텀 이동·노출 숨김·삭제)는 본부(ERP)에서만. 파트너 앱(하이브·일루아)에서는
  // 공통 칸을 읽기 전용으로 둔다(canManageCommon=false). 앱 전용(커스텀) 칸은 그 앱이 계속 조절한다.
  const showMove = canManageCommon;                                   // 이동 = 공통 설정 변경 → ERP만
  const showEye = canManageCommon || !common;                        // 공통 칸 노출은 ERP만 / 앱 전용 칸은 그 앱이
  const showDelete = !!item.def && !!onDelete && (canManageCommon || !common);
  const showEdit = !!item.def && !!onEdit && (canManageCommon || !common);
  const readOnlyCommon = common && !canManageCommon;                 // 파트너 앱의 공통 칸 = 버튼 없이 표시만
  return (
    <div className="flex items-center gap-2 rounded-xl border border-wedly-bd/60 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className={`text-[14px] truncate ${common ? "text-wedly-accent" : "text-wedly-t1"}`}>
          {item.label}
          {item.def && <span className="ml-1 text-[11px] text-wedly-muted">· 직접 추가</span>}
        </div>
        {item.typeText && <div className="text-[11px] text-wedly-muted">{item.typeText}</div>}
      </div>
      {showMove && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onMove(!common)}
          className={`flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-wedly-bd px-2 py-1 text-[11px] hover:bg-wedly-bg-gray transition-colors disabled:opacity-50 ${common ? "text-wedly-muted" : "text-wedly-accent"}`}
          title={common ? "커스텀으로 옮기기 — 이 앱에서만 보이게" : "공통으로 옮기기 — 3개 앱이 값을 함께 쓰게"}
        >
          <span aria-hidden>{common ? "↓" : "↑"}</span>
          {common ? "커스텀으로" : "공통으로"}
        </button>
      )}
      {showEye && (
        <button
          type="button"
          disabled={item.hideLocked || busy}
          onClick={() => onToggleHidden(!item.hidden)}
          className={`flex-shrink-0 rounded-md p-1 hover:bg-wedly-bg-gray transition-colors disabled:opacity-30 ${item.hidden ? "text-wedly-red" : "text-wedly-muted"}`}
          title={item.hideLocked ? "이 칸은 숨길 수 없습니다" : item.hidden ? "이 앱에서 숨김 (눌러서 다시 보임)" : "이 앱에서 숨기기"}
          aria-label="이 앱에서 숨김"
          aria-pressed={item.hidden}
        >
          <EyeIcon off={item.hidden} />
        </button>
      )}
      {showEdit && (
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="flex-shrink-0 rounded-md p-1 text-wedly-muted hover:bg-wedly-bg-gray hover:text-wedly-accent transition-colors disabled:opacity-50"
          title="컬럼 수정"
          aria-label="컬럼 수정"
        >
          <PencilIcon />
        </button>
      )}
      {showDelete && (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="flex-shrink-0 rounded border border-wedly-bd-red/60 px-1.5 py-0.5 text-[11px] text-wedly-red hover:bg-wedly-bg-red/40 transition-colors disabled:opacity-50"
        >
          삭제
        </button>
      )}
      {readOnlyCommon && (
        <span className="flex-shrink-0 text-[11px] text-wedly-muted" title="공통 칸은 ERP에서만 관리됩니다">ERP에서 관리</span>
      )}
    </div>
  );
}

export function CommonFieldsAdmin({
  appSpecificLabels = [],
  ownColumns = [],
  reservedLabels = [],
  loadDefs,
  saveDefs,
  canManageCommon = false,
  onChanged,
}: {
  appSpecificLabels?: string[];
  // 직접 추가 컬럼 관리(이 둘이 있을 때만 추가/삭제 노출 — 미배선 앱은 표준·앱기본 이동만)
  ownColumns?: Array<{ key: string; label: string; type?: string; options?: string[] }>;
  reservedLabels?: string[];
  loadDefs?: () => Promise<BasicColDef[]>;
  saveDefs?: (fields: BasicColDef[]) => Promise<{ ok: boolean; error?: string }>;
  // 공통 칸 제어 권한 — 본부(ERP)만 true. 파트너 앱(하이브·일루아)은 false(기본) → 공통 칸 읽기 전용.
  // 신호: 호출부가 명시(ERP 상세창=adapter.appName==="ERP", ERP 관리자 페이지=명시 true). 미지정 시 안전하게 false.
  canManageCommon?: boolean;
  onChanged?: () => void;
}) {
  const canManageDefs = !!(loadDefs && saveDefs);
  const [defs, setDefs] = useState<BasicColDef[]>([]);
  const [override, setOverride] = useState<CommonFieldOverride>({ extra: [], excluded: [] });
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 커스텀 컬럼 추가 폼 (항상 커스텀으로 추가 — 필요하면 추가 후 '공통으로' 이동)
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [choicesText, setChoicesText] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  // 커스텀 컬럼 수정 폼 — 한 번에 한 줄만 (editingKey = 수정 중인 컬럼 key, 그 줄을 인라인 폼으로 펼침)
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editChoicesText, setEditChoicesText] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCommonFieldsOverride(),
      fetchHiddenBasicColumns(),
      canManageDefs ? Promise.resolve(loadDefs!()).catch(() => [] as BasicColDef[]) : Promise.resolve([] as BasicColDef[]),
    ]).then(([o, h, d]) => {
      if (cancelled) return;
      setOverride(o);
      setHidden(h);
      setDefs(Array.isArray(d) ? d : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [canManageDefs, loadDefs]);

  const isHidden = (lbl: string) => hidden.some((h) => norm(h) === norm(lbl));

  // 표준 11칸 + 앱기본 칸 + 직접 추가 칸을 라벨 기준 중복 제거로 합치고, 공통/커스텀으로 가른다.
  // 직접 추가 칸(def)을 먼저 넣어, 같은 라벨이 다른 곳에도 있어도 한 줄(삭제 가능)로만 보이게 한다.
  const { commonItems, customItems } = useMemo(() => {
    const seen = new Set<string>();
    const items: ManagedItem[] = [];
    const push = (lbl: string, def?: BasicColDef) => {
      const n = norm(lbl);
      if (!n || seen.has(n)) return;
      seen.add(n);
      items.push({
        label: lbl,
        isCommon: isCommonBasicLabel(lbl, override),
        hidden: isHidden(lbl),
        hideLocked: isProtected(lbl),
        def,
        typeText: def
          ? typeLabel(def.type) + (isChoiceType(def.type) && def.options?.length ? ` · 선택지 ${def.options.length}개` : "")
          : undefined,
      });
    };
    for (const d of defs) push(d.label, d);
    for (const l of DEFAULT_COMMON_BASIC_LABELS) push(l);
    for (const l of appSpecificLabels) push(l);
    // 하이브·일루아(파트너 앱) 빌드: ERP가 공통에서 내린(excluded) 기본 칸은 ERP 전용이므로
    // 이 앱의 커스텀 섹션에도 띄우지 않는다(내부 DB 분류·이메일 등). 직접 추가한 칸(def)은 유지.
    // (ERP 본부 빌드에는 이 필터가 없어 그대로 커스텀으로 관리한다.)
    const isErpOnlyExcludedDefault = (it: ManagedItem) =>
      !it.def &&
      DEFAULT_COMMON_BASIC_LABELS.some((d) => norm(d) === norm(it.label)) &&
      (override.excluded || []).some((e) => norm(e) === norm(it.label));
    return {
      commonItems: items.filter((i) => i.isCommon),
      customItems: items.filter((i) => !i.isCommon && !isErpOnlyExcludedDefault(i)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, override, hidden, appSpecificLabels]);

  // 직접 추가 칸 저장 — 성공 시 서버가 scope→공통 인식 동기화하므로 override 를 다시 불러와 배지·섹션을 맞춘다.
  const persistDefs = async (next: BasicColDef[]): Promise<boolean> => {
    if (!saveDefs) return false;
    setBusy(true);
    setError(null);
    const res = await saveDefs(next).catch(() => ({ ok: false, error: "저장 중 오류가 발생했습니다." }));
    if (res?.ok) {
      setDefs(next);
      // 서버가 scope→공통 인식(override)을 막 동기화했으므로, 캐시를 비우고 새로 읽어야 한다.
      // (fetch 는 캐시가 있으면 옛값을 돌려줘 def 칸 이동이 모달 안에서 즉시 반영 안 됨 — refresh 로 강제 재조회)
      const o = await refreshCommonFieldsOverride().catch(() => null);
      if (o) setOverride(o);
      onChanged?.();
    } else {
      setError(res?.error || "저장에 실패했습니다. 다시 시도해 주세요.");
    }
    setBusy(false);
    return !!res?.ok;
  };

  // 한 칸을 공통↔커스텀으로 이동.
  const move = async (item: ManagedItem, makeCommon: boolean) => {
    if (busy) return;
    if (item.def) {
      await persistDefs(setDefScope(defs, item.def.key, makeCommon ? "common" : "custom"));
      return;
    }
    setBusy(true);
    setError(null);
    const isDefault = DEFAULT_COMMON_BASIC_LABELS.some((d) => norm(d) === norm(item.label));
    const extra = (override.extra || []).filter((x) => norm(x) !== norm(item.label));
    const excluded = (override.excluded || []).filter((x) => norm(x) !== norm(item.label));
    if (isDefault) { if (!makeCommon) excluded.push(item.label); }
    else { if (makeCommon) extra.push(item.label); }
    const saved = await saveCommonFieldsOverride({ extra, excluded }).catch(() => null);
    if (saved) setOverride(saved);
    else setError("저장에 실패했습니다. 다시 시도해 주세요.");
    setBusy(false);
    onChanged?.();
  };

  const toggleHidden = async (item: ManagedItem, makeHidden: boolean) => {
    if (item.hideLocked) return;
    const next = hidden.filter((x) => norm(x) !== norm(item.label));
    if (makeHidden) next.push(item.label);
    setHidden(next); // 즉시 반영 — 표·상세창도 같은 순간 바뀜
    const saved = await saveHiddenBasicColumns(next).catch(() => next);
    setHidden(saved);
    onChanged?.();
  };

  const handleDelete = async (item: ManagedItem) => {
    if (!item.def || busy) return;
    if (!confirm("이 컬럼을 삭제하시겠습니까? (모든 사용자에게 적용됩니다)")) return;
    await persistDefs(removeDef(defs, item.def.key));
  };

  // 커스텀 컬럼 수정 시작 — 현재 값으로 폼을 채운다.
  const startEdit = (item: ManagedItem) => {
    if (!item.def || busy) return;
    setEditingKey(item.def.key);
    setEditLabel(item.def.label);
    setEditType(item.def.type);
    setEditChoicesText((item.def.options || []).join("\n"));
  };

  // 수정 저장 — key 는 유지(값 연결 보존), label/type/options 만 바꾼다.
  // 종류(type)가 실제로 바뀐 경우에만 확인창 1회. 행 데이터는 건드리지 않는다(값 유지).
  const handleSaveEdit = async () => {
    if (!editingKey || !editLabel.trim() || busy || !saveDefs) return;
    const cur = defs.find((d) => d.key === editingKey);
    if (!cur) { setEditingKey(null); return; }
    // 표·하이브 유래 칸(custom_ 아님)을 '사람'으로 바꾸면 독립 키를 줘 별도 빈 칸으로 분리한다.
    const becomingIndependentPerson = editType === "person" && !editingKey.startsWith("custom_");
    if (editType !== cur.type) {
      const msg = becomingIndependentPerson
        ? "이 칸을 '사람' 칸으로 바꾸면 기존 표 칸과 분리된 '새 빈 칸'이 됩니다.\n기존에 입력된 값은 원래 칸에 그대로 남고, 이 칸은 비어서 시작합니다. 계속하시겠습니까?"
        : "컬럼 종류를 바꾸면 이미 입력된 값이 새 형식과 맞지 않을 수 있습니다. 계속하시겠습니까?\n(이미 입력된 값 자체는 지워지지 않습니다.)";
      if (!confirm(msg)) return;
    }
    const built = buildDefFromForm({
      key: editingKey,
      label: editLabel,
      type: editType,
      scope: cur.scope ?? "custom",
      choicesText: editChoicesText,
    });
    // person + 비custom_ 키면 새 독립 키 부여 → 옛 키 def 제거 후 새 키로 추가(빈 칸으로 시작).
    const def = ensureIndependentPersonKey(built, takenKeys);
    const base = def.key !== editingKey ? removeDef(defs, editingKey) : defs;
    const ok = await persistDefs(upsertDef(base, def));
    if (ok) setEditingKey(null);
  };

  const takenKeys = useMemo(() => new Set(defs.map((d) => d.key)), [defs]);
  const handleAddFromForm = async () => {
    if (!label.trim() || busy || !saveDefs) return;
    const key = uniqueColKey(`custom_${Date.now()}`, takenKeys);
    const def = buildDefFromForm({ key, label, type, scope: "custom", choicesText });
    const ok = await persistDefs(upsertDef(defs, def));
    if (ok) { setLabel(""); setType("text"); setChoicesText(""); }
  };
  const handlePull = async (col: { key: string; label: string; type?: string; options?: string[] }) => {
    if (busy || !saveDefs) return;
    // 표에서 끌어온 칸이 '사람'이면 독립 키를 줘 원본 칸과 값이 얽히지(별칭) 않게 한다.
    const def = ensureIndependentPersonKey(colDefFromOwnColumn(col, "custom"), takenKeys);
    if (takenKeys.has(def.key)) { setError("이미 추가된 컬럼입니다."); return; }
    const ok = await persistDefs(upsertDef(defs, def));
    if (ok) setPickOpen(false);
  };

  // "표에서 불러오기" 후보 = 이미 추가된 칸 + 표준·앱기본 칸 라벨을 뺀 표 칸(중복·값분리 방지).
  const pullCandidates = useMemo(() => {
    const usedKeys = new Set(defs.map((d) => d.key));
    const usedLabels = new Set([
      ...defs.map((d) => norm(d.label)),
      ...reservedLabels.map(norm),
      ...DEFAULT_COMMON_BASIC_LABELS.map(norm),
      ...appSpecificLabels.map(norm),
    ]);
    return ownColumns.filter((c) => c && c.key && !usedKeys.has(c.key) && !usedLabels.has(norm(c.label)));
  }, [ownColumns, defs, reservedLabels, appSpecificLabels]);

  if (loading) return <div className="text-[14px] text-wedly-muted">불러오는 중…</div>;

  const inputCls = "w-full text-[13px] border border-wedly-bd rounded-lg px-2.5 py-1.5 outline-none focus:border-wedly-accent";
  // 종류 선택 드롭다운 — 좁은 폭에선 한 줄 가득, 넓으면 고정폭(추가/수정 폼 공용).
  const typeSelectCls = `${inputCls} bg-white w-full sm:w-[130px] sm:flex-shrink-0`;

  const renderRows = (items: ManagedItem[], emptyText: string) =>
    items.length === 0 ? (
      <div className="rounded-xl border border-wedly-bd/60 px-3 py-3 text-[12px] text-wedly-muted">{emptyText}</div>
    ) : (
      <div className="space-y-2">
        {items.map((it) =>
          it.def && editingKey === it.def.key ? (
            <div key={norm(it.label)} className="rounded-xl border border-wedly-accent/50 bg-wedly-bg-gray/30 p-3 space-y-3">
              <div className="text-[12px] font-semibold text-wedly-t2">✎ 컬럼 수정</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); }}
                  placeholder="컬럼 이름 (예: 비고)"
                  className={inputCls}
                />
                <select value={editType} onChange={(e) => setEditType(e.target.value)} className={typeSelectCls}>
                  {BASIC_COL_TYPE_CHOICES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!editLabel.trim() || busy}
                    className="flex-1 sm:flex-none px-3 py-1.5 text-[12px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingKey(null)}
                    disabled={busy}
                    className="flex-1 sm:flex-none px-3 py-1.5 text-[12px] font-medium text-wedly-t2 border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              </div>
              {isChoiceType(editType) && (
                <div>
                  <label className="block text-[11px] text-wedly-muted mb-1">선택지 (줄바꿈 또는 쉼표로 구분)</label>
                  <textarea
                    value={editChoicesText}
                    onChange={(e) => setEditChoicesText(e.target.value)}
                    placeholder={"예: 상\n중\n하"}
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              )}
            </div>
          ) : (
            <ManagedRow
              key={norm(it.label)}
              item={it}
              busy={busy}
              canManageCommon={canManageCommon}
              onMove={(mk) => move(it, mk)}
              onToggleHidden={(mk) => toggleHidden(it, mk)}
              onEdit={it.def ? () => startEdit(it) : undefined}
              onDelete={it.def ? () => handleDelete(it) : undefined}
            />
          )
        )}
      </div>
    );

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-3 py-2 text-[12px] text-wedly-red" role="alert">
          {error}
        </div>
      )}

      {/* ── 공통 컬럼 ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-wedly-sub font-semibold text-wedly-accent">공통 컬럼</h3>
          <span className="text-[12px] text-wedly-muted">3개 앱이 값을 함께 씁니다</span>
        </div>
        {renderRows(commonItems, "공통 컬럼이 없습니다.")}
      </section>

      {/* ── 커스텀 컬럼 ── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-wedly-sub font-semibold text-wedly-t1">커스텀 컬럼</h3>
          <span className="text-[12px] text-wedly-muted">이 앱에서만 보입니다</span>
        </div>
        {renderRows(customItems, "커스텀 컬럼이 없습니다.")}

        {canManageDefs && (
          <div className="rounded-xl border border-wedly-bd/60 bg-wedly-bg-gray/30 p-3 space-y-3">
            <div className="text-[12px] font-semibold text-wedly-t2">＋ 커스텀 컬럼 추가</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddFromForm(); }}
                placeholder="컬럼 이름 (예: 비고)"
                className={inputCls}
              />
              <select value={type} onChange={(e) => setType(e.target.value)} className={typeSelectCls}>
                {BASIC_COL_TYPE_CHOICES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddFromForm}
                disabled={!label.trim() || busy}
                className="w-full sm:w-auto flex-shrink-0 px-3 py-1.5 text-[12px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                추가
              </button>
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
            <button type="button" onClick={() => setPickOpen((v) => !v)} className="text-[12px] text-wedly-accent hover:underline">
              {pickOpen ? "표에서 불러오기 닫기" : "＋ 표에서 칸 불러오기"}
            </button>
            {pickOpen && (
              <div className="rounded-lg border border-wedly-bd/60 bg-white p-2 space-y-1 max-h-[200px] overflow-y-auto">
                <p className="text-[11px] text-wedly-muted px-1 pb-1">커스텀 컬럼으로 추가됩니다. 누르면 바로 추가돼요.</p>
                {pullCandidates.length === 0 ? (
                  <div className="text-[12px] text-wedly-muted px-1 py-2">불러올 표 칸이 없습니다.</div>
                ) : (
                  pullCandidates.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      disabled={busy}
                      onClick={() => handlePull(c)}
                      className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-wedly-bg-gray text-[13px] text-wedly-t1 disabled:opacity-50"
                    >
                      <span className="truncate">{c.label}</span>
                      <span className="text-[11px] text-wedly-muted flex-shrink-0">{typeLabel(c.type || "text")}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
