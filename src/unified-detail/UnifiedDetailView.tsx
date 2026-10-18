"use client";

import { basicRecoveryIdentity, matchesBasicRecoveryIdentity, beginRecoveryLifetime, endRecoveryLifetime, flushBasicRefresh, acknowledgeBasicRecovery } from "./lib/basic-recovery";

import { useEffect, useState, useCallback, useRef, useMemo, type DragEvent } from "react";
import { type RowData, type UnifiedComment, SectionAdminMenu, DEFAULT_COLUMN_TYPE_OPTIONS, EditableTitle, DraggableFieldsSection, fetchCommonFieldsOverride, refreshCommonFieldsOverride, getCachedCommonOverride, resolveCommonFieldId, type CommonFieldOverride, fetchHiddenBasicColumns, isBasicColumnHidden, subscribeHiddenBasicColumns } from "../index";
import { type ColumnDef } from "../types/columns";
import {
  customerKeyFromTaxRow,
  type CustomerDetailLite,
  type DomainRowLite,
} from "./lib/customer-detail";
import { checkApiResult, makePersistError, failureReason, saveFailureMessage } from "../lib/persist-failure";
import { DetailLoadStateProvider } from "./detail-load-state";
import { DOMAIN_GROUPS, type DomainGroup } from "./lib/domain-config";
import { getStatusDotClass } from "./lib/status-dot";
import { normalizeBizno } from "./lib/secstore";
import HistoryPanel, { type HistoryPanelApi } from "./HistoryPanel";
import { FieldOptionsProvider } from "./field-options-context";
import SectionHistoryPanel from "./SectionHistoryPanel";
import { EditableFieldRow, BasicScopeBadge } from "./editors";
import BasicFilesField from "./BasicFilesField";
import NewEntryReportUpload, { type DraftFile } from "./NewEntryReportUpload";
import { CommonFieldsLauncher } from "./CommonFieldsLauncher";
import { UNIFIED_TYPE_OPTIONS } from "./lib/column-type-options";
import { useFieldOrder } from "./lib/use-field-order";
import {
  BASIC_FIELD_SPECS,
  ERP_APP_BASIC_FIELDS,
  buildBasicSection,
  ensureBasicTeamFields,
  type ColumnLite,
} from "./lib/unified-sections";
import { collapseMirrorBasicFields, isCommonBasicLabel } from "../unified/sections";
import { applyTabConfig } from "./lib/unified-tab-config";
import type { BasicRecord, BasicRecovery, BasicRestoreOriginal, UnifiedDetailApi } from "./adapter-types";
import { saveFailureKindOf } from "./adapter-types";
import type { UnifiedDetailAdapter } from "./adapter-types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TopTab = "__basic__" | string; // "__basic__" = 기본정보, else = DomainGroup.key
type SubTab = "history" | "contract" | "settlement" | "refund" | "meetings" | "files"; // 경정청구 분야 하위 탭
/** 상세창 공용 하위 탭 키인지. 커스텀 패널이 돌려주는 값을 그대로 믿지 않으려고 쓴다. */
function isSubTabKey(v: string): v is SubTab {
  return v === "history" || v === "contract" || v === "settlement" || v === "refund" || v === "meetings" || v === "files";
}

// saveOwnField 콜백 타입 — 내부 컴포넌트들이 공유
type SaveOwnFieldFn = UnifiedDetailApi["saveOwnField"];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: 그룹에 속한 영역 행 목록 (데이터 있는 것만)
// ─────────────────────────────────────────────────────────────────────────────
function rowsOfGroup(detail: CustomerDetailLite | null, group: DomainGroup): DomainRowLite[] {
  if (!detail || !Array.isArray(detail.domainRows)) return [];
  return group.domains
    .map((d) => detail.domainRows.find((r) => r.domain === d))
    .filter((r): r is DomainRowLite => Boolean(r));
}

// 합친 그룹의 대표 값 — 데이터 있는 첫 영역 기준
function firstNonEmpty(rows: DomainRowLite[], pick: (r: DomainRowLite) => string | null | undefined): string | null {
  for (const r of rows) {
    const v = pick(r);
    if (v && String(v).trim()) return String(v).trim();
  }
  return null;
}

// 핵심 날짜(최선) — 행 값 중 날짜로 보이는 칸 하나를 고른다(없으면 등록일시, 그것도 없으면 null)
const KEY_DATE_HINT = /(날짜|일자|일시|계약일|접수일|완료일|신청일|등록일|date)/i;
function pickKeyDate(row: Record<string, unknown> | undefined | null): string | null {
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string" && v.trim() && KEY_DATE_HINT.test(k)) return v;
  }
  const ct = row["_createdTime"];
  return typeof ct === "string" && ct ? ct : null;
}

// 날짜 문자열 보기 좋게
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  return s.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusDot — 상태별 색점 (하이브 UnifiedView.tsx StatusDot 과 동일)
// ─────────────────────────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string | null | undefined }) {
  const cls = getStatusDotClass(status ?? null);
  return <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${cls}`} title={status ?? undefined} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading spinner
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16 gap-2 text-[13px] text-wedly-muted">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      불러오는 중...
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaxAmendmentPanel — 경정청구 편집 패널 (하이브 순서: 히스토리·정산정보·미팅정보·파일 + 기본정보편집)
// ─────────────────────────────────────────────────────────────────────────────
function TaxAmendmentPanel({
  domainRow,
  subTab,
  onSubTabChange,
  onSaved,
  isAdmin = false,
  saveOwnField,
  loadColumnConfig,
  saveColumnConfig,
  loadTabConfig,
  saveTabConfig,
  historyApi,
  ownTieredFieldsPath,
  adapter,
}: {
  domainRow: DomainRowLite;
  subTab: SubTab;
  onSubTabChange: (t: SubTab) => void;
  onSaved?: () => void;
  isAdmin?: boolean;
  saveOwnField: SaveOwnFieldFn;
  loadColumnConfig: () => Promise<unknown>;
  saveColumnConfig: (cfg: unknown) => Promise<void>;
  loadTabConfig: () => Promise<unknown>;
  saveTabConfig: (cfg: unknown) => Promise<void>;
  historyApi: HistoryPanelApi;
  ownTieredFieldsPath: (kind: "contract" | "refund") => string;
  adapter: UnifiedDetailAdapter;
}) {
  const { SettlementInfoTab, MeetingsTab } = adapter.components;
  const [localRow, setLocalRow] = useState<Record<string, unknown>>(() => ({ ...domainRow.row }));
  const entryId = domainRow.entryId;

  // 세부 섹션(차수 나눠 관리) 목록 — 어댑터 loadColumnConfig 경유로 불러온다.
  const [subSections, setSubSections] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  useEffect(() => {
    let cancelled = false;
    loadColumnConfig()
      .then((j) => {
        if (cancelled) return;
        const ds = (j as { data?: { detailSubSections?: unknown } })?.data?.detailSubSections;
        if (ds && typeof ds === "object" && !Array.isArray(ds)) {
          setSubSections(ds as Record<string, Array<{ id: string; label: string }>>);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loadColumnConfig]);

  const handleUpdateSubSections = useCallback(
    async (prefix: string, list: Array<{ id: string; label: string }>) => {
      const next = { ...subSections, [prefix]: list };
      setSubSections(next);
      try {
        await saveColumnConfig({ detailSubSections: next });
      } catch {
        // 저장 실패해도 화면은 유지 — 다음 열람 때 서버 값으로 정렬됨
      }
    },
    [subSections, saveColumnConfig],
  );

  const handleUpdate = useCallback(
    async (key: string, newVal: string | number | boolean | null) => {
      const prev = localRow[key];
      setLocalRow((r) => ({ ...r, [key]: newVal }));
      try {
        await saveOwnField(entryId, key, newVal);
        adapter.unsaved?.resolve(adapter.unsaved.makeId(adapter.unsaved.scope, entryId, key));
        onSaved?.();
      } catch (e) {
        // 서버가 준 사유를 그대로 보여준다 — 일반 문구로 뭉개지 않는다.
        const m = e instanceof Error ? e.message : "";
        const kind = saveFailureKindOf(e);
        const bridge = adapter.unsaved;
        // 잠깐 실패(배포 교체·통신 끊김)·로그인 만료면 ★값을 지우지 않는다★ — 앱의 저장 실패 막대에 담는다.
        if (bridge && kind !== "permanent") {
          const id = bridge.makeId(bridge.scope, entryId, key);
          bridge.report({
            id, scope: bridge.scope, rowId: entryId, fieldKey: key,
            rowLabel: String((localRow as Record<string, unknown>)["02상호명"] ?? "") || "이 항목",
            fieldLabel: key, value: newVal,
            error: m || `'${key}' 저장에 실패했습니다.`, kind,
            retry: async () => { try { await saveOwnField(entryId, key, newVal); return true; } catch { return false; } },
            revert: () => setLocalRow((r) => ({ ...r, [key]: prev })),
          });
          return;
        }
        // 규칙상 저장할 수 없는 값은 다시 시도해도 소용없다 → 되돌리고 사유를 알린다.
        setLocalRow((r) => ({ ...r, [key]: prev }));
        alert(m || `'${key}' 저장에 실패했습니다. 다시 시도해 주세요.`);
      }
    },
    [entryId, localRow, onSaved, saveOwnField, adapter],
  );

  // 하이브 순서와 동일: 히스토리·계약정보·환불정보·미팅정보·파일
  // NO.150 — 정산정보 탭은 계약정보로 합쳐져 사라졌다(값·칸 모두 계약정보 탭 한 곳).
  // ※ SubTab 유니온의 "settlement" 는 아래 SectionDetailPanel(정부지원금·노무·기업인증·특허)이
  //   계속 쓰므로 그대로 둔다 — 경정청구 탭 목록에서만 뺀다.
  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: "history",    label: "히스토리" },
    { key: "contract",   label: "계약정보" },
    { key: "refund",     label: "환불정보" },
    { key: "meetings",   label: "미팅정보" },
  ];

  // ── "탭 편집" — 하위 탭 순서·이름 변경(관리자만, 모두에게 반영). 탭의 실제 기능·저장 위치는 그대로, 표시(순서·이름)만 바뀐다. ──
  const [subOrder, setSubOrder] = useState<string[]>([]);
  const [subLabels, setSubLabels] = useState<Record<string, string>>({});
  const [tabEditMode, setTabEditMode] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadTabConfig()
      .then((j) => {
        const d = (j as { data?: unknown })?.data;
        if (cancelled || !d || typeof d !== "object") return;
        const data = d as Record<string, unknown>;
        if (Array.isArray(data.subOrder)) {
          setSubOrder(data.subOrder.filter((k: unknown): k is string => typeof k === "string"));
        }
        if (data.subLabels && typeof data.subLabels === "object" && !Array.isArray(data.subLabels)) {
          setSubLabels(data.subLabels as Record<string, string>);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loadTabConfig]);
  const handleSaveTabConfig = useCallback((bodyObj: Record<string, unknown>) => {
    saveTabConfig(bodyObj).catch(() => { /* 저장 실패해도 화면 유지 — 다음 열람 때 서버값으로 정렬됨 */ });
  }, [saveTabConfig]);
  // 저장된 순서·이름을 적용한 표시용 하위 탭 목록
  const orderedSubTabs = applyTabConfig(SUB_TABS, subOrder, subLabels);
  const moveSubTab = (idx: number, dir: -1 | 1) => {
    const keys = orderedSubTabs.map((t) => t.key);
    const j = idx + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[idx], keys[j]] = [keys[j], keys[idx]];
    setSubOrder(keys);
    handleSaveTabConfig({ op: "order", which: "sub", order: keys });
  };
  const resetTabs = () => {
    setSubOrder([]);
    setSubLabels({});
    setTabEditMode(false);
    // 하위 탭만 초기화 — 상단 분야 탭 설정은 보존(같은 row 공유).
    handleSaveTabConfig({ op: "reset", which: "sub" });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 하위 탭 바 */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-wedly-bd/60 bg-wedly-bg-gray/50 flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {orderedSubTabs.map(({ key, label }, i) => (
            tabEditMode && isAdmin ? (
              <div key={key} className="flex items-center gap-0.5 bg-white border border-wedly-bd rounded-full pl-1 pr-1.5 py-0.5 flex-shrink-0">
                <button type="button" onClick={() => moveSubTab(i, -1)} disabled={i === 0} title="왼쪽으로" className="px-1 text-[12px] text-wedly-muted disabled:opacity-30 hover:text-wedly-accent">◀</button>
                <input
                  value={subLabels[key] ?? label}
                  onChange={(e) => setSubLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    setSubLabels((prev) => { const nx = { ...prev }; if (v) nx[key] = v; else delete nx[key]; return nx; });
                    handleSaveTabConfig({ op: "label", which: "sub", id: key, label: v });
                  }}
                  title="이름 변경"
                  className="w-[72px] text-[13px] font-semibold text-wedly-t1 bg-transparent outline-none text-center"
                />
                <button type="button" onClick={() => moveSubTab(i, 1)} disabled={i === orderedSubTabs.length - 1} title="오른쪽으로" className="px-1 text-[12px] text-wedly-muted disabled:opacity-30 hover:text-wedly-accent-ink">▶</button>
              </div>
            ) : (
              <button
                key={key}
                onClick={() => onSubTabChange(key)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  subTab === key
                    ? "bg-wedly-bg-blue text-wedly-accent-ink"
                    : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
                }`}
              >
                {label}
              </button>
            )
          ))}
        </div>
        {/* 탭 편집 — 관리자만. 순서(◀▶)·이름 변경 + 초기화. 하이브 '탭 편집'과 동일 개념. */}
        {isAdmin && (
          <div className="flex-shrink-0 flex items-center gap-1 ml-2">
            {tabEditMode && (
              <button type="button" onClick={resetTabs} className="px-2 py-1 text-[11px] rounded-md border border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1 transition-colors whitespace-nowrap">초기화</button>
            )}
            <button
              type="button"
              onClick={() => setTabEditMode((v) => !v)}
              title="탭 편집 — 순서·이름 변경"
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap ${
                tabEditMode
                  ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40"
                  : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              {tabEditMode ? "완료" : "탭 편집"}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 히스토리 */}
        {subTab === "history" && (
          <HistoryPanel pageId={entryId} rowData={localRow} api={historyApi} ownSource={(adapter.appName || "ERP").toLowerCase()} isAdmin={isAdmin} />
        )}

        {/* 계약정보 차수 */}
        {subTab === "contract" && (
          <div className="p-4">
            <SettlementInfoTab
              rawValue={localRow["계약정보_차수"] ?? null}
              row={localRow as Record<string, string | number | boolean | null>}
              onSave={(json: string) => handleUpdate("계약정보_차수", json)}
              isAdmin={isAdmin}
              storagePrefix="contract"
              fieldsApiPath={ownTieredFieldsPath("contract")}
              sectionTitle="계약정보"
              subSections={subSections.contract}
              onUpdateSubSections={isAdmin ? (list: Array<{ id: string; label: string }>) => handleUpdateSubSections("contract", list) : undefined}
            />
          </div>
        )}

        {/* 정산정보 차수 — NO.150 으로 계약정보 탭에 합쳐져 제거됨 */}

        {/* 환불정보 차수 */}
        {subTab === "refund" && (
          <div className="p-4">
            <SettlementInfoTab
              rawValue={localRow["환불정보_차수"] ?? null}
              row={localRow as Record<string, string | number | boolean | null>}
              onSave={(json: string) => handleUpdate("환불정보_차수", json)}
              isAdmin={isAdmin}
              storagePrefix="refund"
              fieldsApiPath={ownTieredFieldsPath("refund")}
              sectionTitle="환불정보"
              subSections={subSections.refund}
              onUpdateSubSections={isAdmin ? (list: Array<{ id: string; label: string }>) => handleUpdateSubSections("refund", list) : undefined}
            />
          </div>
        )}

        {/* 미팅정보 */}
        {subTab === "meetings" && (
          <div className="p-4">
            <MeetingsTab
              rawValue={localRow["_meetings"] ?? null}
              onSave={(json: string) => handleUpdate("_meetings", json)}
            />
          </div>
        )}

        {/* 파일 탭 제거 — 첨부파일은 기본정보 "파일" 칸(전체 모아보기 + 더보기 팝업)에서 통합 관리 */}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 분야(섹션)별 상세 패널 — 비-경정청구 분야가 경정청구와 같은 6칸 구조를 "분야별 독립" 데이터로 편집·저장.
// 저장은 모두 고객(경정청구) 기록에 분야 이름표(uc:{분야}:{항목}) 칸으로 — 기존 분야 페이지와 안 섞이고,
// 잘못된 표로 새지 않는다. 정산=독립 표(편집), 미팅·파일·히스토리=분야별 독립, 계약·환불=준비 중(3b).
// ─────────────────────────────────────────────────────────────────────────────
function SectionDetailPanel({
  sectionKey,
  primaryId,
  primaryRow,
  subTab,
  onSubTabChange,
  onSaved,
  isAdmin = false,
  saveOwnField,
  sectionSettlementBase,
  adapter,
}: {
  sectionKey: string;
  primaryId: string;
  primaryRow: Record<string, unknown>;
  subTab: SubTab;
  onSubTabChange: (t: SubTab) => void;
  onSaved?: () => void;
  isAdmin?: boolean;
  saveOwnField: SaveOwnFieldFn;
  sectionSettlementBase: string;
  adapter: UnifiedDetailAdapter;
}) {
  const { MeetingsTab, SectionSettlementTab } = adapter.components;
  const [localRow, setLocalRow] = useState<Record<string, unknown>>(() => ({ ...primaryRow }));
  // 최신 행 값 참조(롤백용) — handleUpdate 가 localRow 에 의존하지 않게 해 자식(히스토리 등) 재초기화를 막는다.
  const localRowRef = useRef(localRow);
  useEffect(() => {
    localRowRef.current = localRow;
  }, [localRow]);
  const nk = useCallback((k: string) => `uc:${sectionKey}:${k}`, [sectionKey]);

  // 사업자번호 — 있으면 3앱 공용 보관함, 없으면 기존 행 저장(레거시) 사용.
  const bizno = useMemo(() => normalizeBizno(primaryRow["15사업자번호"]), [primaryRow]);
  const shared = bizno.length > 0;
  // 공용 보관함 값: undefined=로딩중, 그 외=로딩완료(값 또는 폴백).
  const [secSettlement, setSecSettlement] = useState<unknown>(shared ? undefined : null);
  const [secHistory, setSecHistory] = useState<UnifiedComment[] | undefined>(
    shared ? undefined : [],
  );
  // ★불러오기 실패를 "행에 있던 옛 값"으로 덮지 않는다(2026-08-26). 값이 없는 것과 못 불러온 것은 다르다.
  const [secHistoryError, setSecHistoryError] = useState<string | null>(null);
  const [secContract, setSecContract] = useState<unknown>(shared ? undefined : null);
  const [secRefund, setSecRefund] = useState<unknown>(shared ? undefined : null);

  const handleUpdate = useCallback(
    async (key: string, newVal: string | number | boolean | null) => {
      if (!primaryId) return;
      const prev = localRowRef.current[key];
      setLocalRow((r) => ({ ...r, [key]: newVal }));
      try {
        await saveOwnField(primaryId, key, newVal);
        onSaved?.();
      } catch {
        setLocalRow((r) => ({ ...r, [key]: prev }));
        alert(`'${key.replace(/^uc:[^:]+:/, "")}' 저장에 실패했습니다. 다시 시도해 주세요.`);
      }
    },
    [primaryId, onSaved, saveOwnField],
  );

  // ★저장 실패를 **다시 던진다** — 전에는 handleUpdate 가 삼키고 자기가 알림창을 띄워,
  //  히스토리 부품은 실패를 몰랐고(친 글이 사라짐) 알림창이 두 번 뜰 수도 있었다.
  const onPersistHistory = useCallback(
    async (next: UnifiedComment[]) => {
      if (!primaryId) throw makePersistError("server", "저장 대상을 찾지 못했습니다.");
      const key = nk("_history");
      const prev = localRowRef.current[key];
      const val = JSON.stringify(next);
      setLocalRow((r) => ({ ...r, [key]: val }));
      try {
        await saveOwnField(primaryId, key, val);
        onSaved?.();
      } catch (e) {
        setLocalRow((r) => ({ ...r, [key]: prev }));
        throw e;
      }
    },
    [primaryId, nk, onSaved, saveOwnField],
  );

  const historyInitial = useMemo<UnifiedComment[]>(() => {
    const raw = localRow[nk("_history")];
    if (Array.isArray(raw)) return raw as UnifiedComment[];
    if (typeof raw === "string" && raw.trim()) {
      try {
        const a = JSON.parse(raw);
        return Array.isArray(a) ? (a as UnifiedComment[]) : [];
      } catch {
        return [];
      }
    }
    return [];
    // 섹션 전환은 key 로 재마운트되어 새로 읽힘 — primaryRow 최초값 기준.
  }, [sectionKey]);

  // 사업자번호 있으면 공용 보관함에서 정산/히스토리를 불러온다. 비어 있으면 기존 행 값으로 폴백.
  useEffect(() => {
    if (!shared) {
      setSecSettlement(null);
      setSecHistory([]);
      setSecHistoryError(null);
      setSecContract(null);
      setSecRefund(null);
      return;
    }
    let alive = true;
    setSecSettlement(undefined);
    setSecHistory(undefined);
    setSecHistoryError(null);
    setSecContract(undefined);
    setSecRefund(undefined);
    const base = `/api/section-store/${encodeURIComponent(bizno)}/${encodeURIComponent(sectionKey)}`;
    fetch(`${base}?kind=settlement`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const v = j?.success ? j.data : null;
        setSecSettlement(v ?? localRowRef.current[nk("정산정보")] ?? null);
      })
      .catch(() => {
        if (alive) setSecSettlement(localRowRef.current[nk("정산정보")] ?? null);
      });
    fetch(`${base}?kind=contract`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const v = j?.success ? j.data : null;
        setSecContract(v ?? localRowRef.current[nk("계약정보_차수")] ?? null);
      })
      .catch(() => {
        if (alive) setSecContract(localRowRef.current[nk("계약정보_차수")] ?? null);
      });
    fetch(`${base}?kind=refund`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const v = j?.success ? j.data : null;
        setSecRefund(v ?? localRowRef.current[nk("환불정보_차수")] ?? null);
      })
      .catch(() => {
        if (alive) setSecRefund(localRowRef.current[nk("환불정보_차수")] ?? null);
      });
    fetch(`${base}?kind=history`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        const kind = checkApiResult(r, j);
        if (kind !== "none") {
          // 못 불러왔다 — 옛 값으로 위장하지 않는다. 부품이 입력을 잠그고 다시 시도를 띄운다.
          setSecHistoryError(failureReason(kind));
          setSecHistory([]);
          return;
        }
        setSecHistoryError(null);
        const v = j?.data ?? null;
        // ★값이 없는 것(아직 공용 보관함에 저장 안 함)은 실패가 아니다 — 기존 이사 통로 유지.
        setSecHistory(Array.isArray(v) ? (v as UnifiedComment[]) : historyInitial);
      })
      .catch(() => {
        if (!alive) return;
        setSecHistoryError(failureReason("network"));
        setSecHistory([]);
      });
    return () => {
      alive = false;
    };
    // historyInitial은 sectionKey 기준 안정값. bizno/sectionKey 바뀔 때만 재로드.
  }, [shared, bizno, sectionKey]);

  const saveSecstore = useCallback(
    async (kind: "settlement" | "history" | "contract" | "refund", value: unknown) => {
      const base = `/api/section-store/${encodeURIComponent(bizno)}/${encodeURIComponent(sectionKey)}`;
      let res: Response;
      try {
        res = await fetch(`${base}?kind=${kind}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
      } catch {
        // 통신 자체가 끊긴 경우 — 브라우저가 던지는 영어 문구가 그대로 안내에 새지 않게 감싼다.
        throw makePersistError("network", failureReason("network"));
      }
      const j = await res.json().catch(() => null);
      const bad = checkApiResult(res, j);
      // ★로그인 만료는 405 로도 온다(로그인 화면으로 넘겨져서) — 상태코드 한 곳에서 판정한다.
      if (bad !== "none") throw makePersistError(bad, failureReason(bad));
      onSaved?.();
    },
    [bizno, sectionKey, onSaved],
  );

  const onSaveSettlement = useCallback(
    (json: string) => {
      if (!shared) {
        handleUpdate(nk("정산정보"), json);
        return;
      }
      const prev = secSettlement;
      setSecSettlement(json);
      saveSecstore("settlement", json).catch((e: unknown) => {
        setSecSettlement(prev);
        alert(saveFailureMessage(e, "정산정보"));
      });
    },
    [shared, handleUpdate, nk, secSettlement, saveSecstore],
  );

  const onSaveContract = useCallback(
    (json: string) => {
      if (!shared) {
        handleUpdate(nk("계약정보_차수"), json);
        return;
      }
      const prev = secContract;
      setSecContract(json);
      saveSecstore("contract", json).catch((e: unknown) => {
        setSecContract(prev);
        alert(saveFailureMessage(e, "계약정보"));
      });
    },
    [shared, handleUpdate, nk, secContract, saveSecstore],
  );

  const onSaveRefund = useCallback(
    (json: string) => {
      if (!shared) {
        handleUpdate(nk("환불정보_차수"), json);
        return;
      }
      const prev = secRefund;
      setSecRefund(json);
      saveSecstore("refund", json).catch((e: unknown) => {
        setSecRefund(prev);
        alert(saveFailureMessage(e, "환불정보"));
      });
    },
    [shared, handleUpdate, nk, secRefund, saveSecstore],
  );

  // ★되돌리기만 하고 **다시 던진다** — 안내는 히스토리 부품 한 곳에서만(알림창 두 번 방지).
  const onPersistHistoryRouted = useCallback(
    async (next: UnifiedComment[]) => {
      if (!shared) {
        await onPersistHistory(next);
        return;
      }
      const prev = secHistory;
      setSecHistory(next);
      try {
        await saveSecstore("history", next);
      } catch (e) {
        setSecHistory(prev);
        throw e;
      }
    },
    [shared, onPersistHistory, secHistory, saveSecstore],
  );

  // "다시 불러오기"가 진짜 서버를 보게 한다(전에는 부품이 자기 목록을 돌려줬다).
  const reloadHistory = useCallback(async (): Promise<UnifiedComment[]> => {
    const base = `/api/section-store/${encodeURIComponent(bizno)}/${encodeURIComponent(sectionKey)}`;
    let res: Response;
    try {
      res = await fetch(`${base}?kind=history`, { cache: "no-store" });
    } catch {
      throw makePersistError("network", failureReason("network"));
    }
    const j = await res.json().catch(() => null);
    const bad = checkApiResult(res, j);
    if (bad !== "none") throw makePersistError(bad, failureReason(bad));
    const v = j?.data ?? null;
    // 값이 없으면 처음 불러올 때와 같은 규칙(옛 값 폴백)을 쓴다 — 다시 시도가 목록을 비우면 안 된다.
    const list = Array.isArray(v) ? (v as UnifiedComment[]) : historyInitial;
    setSecHistory(list);
    setSecHistoryError(null);
    return list;
  }, [bizno, sectionKey, historyInitial]);

  // 화면을 떠날 때 치던 글을 살려 보낸다(keepalive). 성공 여부는 알 수 없어 "보냈다"를 믿지 않는다 —
  // 다시 열 때 담아 둔 글을 서버 목록과 대조해 판정한다.
  // ★글은 부품이 만들어 완성된 목록으로 넘겨 준다 — 작성자 이름·출처(erp/hive/illua)를
  //  아는 곳이 부품이기 때문이다. 여기서 만들면 이름이 "나"로, 출처가 항상 erp 로 굳어
  //  하이브·일루아에서 남의 앱 글로 표시되고 본인이 고치지도 못한다(2026-08-26 점검에서 잡음).
  const sendHistoryOnLeave = useCallback(
    (next: UnifiedComment[]) => {
      if (!shared) return;
      const base = `/api/section-store/${encodeURIComponent(bizno)}/${encodeURIComponent(sectionKey)}`;
      const body = JSON.stringify({ value: next });
      // 떠나면서 보내는 요청은 64KB 상한이 있다 — 넘으면 브라우저가 조용히 거부한다.
      // 그럴 땐 오류를 던져 위쪽 부품이 "떠나도 괜찮냐" 경고를 띄우게 한다(글은 담아 둔 것으로 지킨다).
      if (new Blob([body]).size > 60_000) throw makePersistError("network", failureReason("network"));
      void fetch(`${base}?kind=history`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* 떠나는 중이라 결과를 알 수 없다 — 담아 둔 글로 다시 열 때 판정한다 */
      });
    },
    [shared, bizno, sectionKey],
  );

  const SUB_TABS: { key: SubTab; label: string }[] = [
    { key: "history", label: "히스토리" },
    { key: "contract", label: "계약정보" },
    { key: "settlement", label: "정산정보" },
    { key: "refund", label: "환불정보" },
    { key: "meetings", label: "미팅정보" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 하위 탭 바 — 경정청구와 동일 6칸·동일 순서 */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-wedly-bd/60 bg-wedly-bg-gray/50 flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
          {SUB_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onSubTabChange(key)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
                subTab === key
                  ? "bg-wedly-bg-blue text-wedly-accent-ink"
                  : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 히스토리 — 분야별 독립(고객 기록 분야칸 저장) */}
        {subTab === "history" && (
          <div className="p-4">
            {shared && secHistory === undefined ? (
              <Spinner />
            ) : (
              <>
                {!shared && <NoBiznoNotice />}
                <SectionHistoryPanel
                  key={shared ? "shared" : "legacy"}
                  storageId={`${bizno || primaryId}:${sectionKey}`}
                  initial={shared ? (secHistory ?? []) : historyInitial}
                  onPersist={onPersistHistoryRouted}
                  loadError={shared ? secHistoryError : null}
                  onRetryLoad={shared ? () => { void reloadHistory().catch(() => {}); } : undefined}
                  sendOnLeave={shared ? sendHistoryOnLeave : undefined}
                />
              </>
            )}
          </div>
        )}

        {/* 계약정보 — 분야별 독립 차수카드 */}
        {subTab === "contract" && (
          <div className="p-4">
            {shared && secContract === undefined ? (
              <Spinner />
            ) : (
              <>
                {!shared && <NoBiznoNotice />}
                <SectionSettlementTab
                  section={sectionKey}
                  kind="contract"
                  rawValue={shared ? secContract : (localRow[nk("계약정보_차수")] ?? null)}
                  onSave={onSaveContract}
                  isAdmin={isAdmin}
                  sectionSettlementBase={sectionSettlementBase}
                />
              </>
            )}
          </div>
        )}

        {/* 정산정보 — 분야별 독립 표(편집) */}
        {subTab === "settlement" && (
          <div className="p-4">
            {shared && secSettlement === undefined ? (
              <Spinner />
            ) : (
              <>
                {!shared && <NoBiznoNotice />}
                <SectionSettlementTab
                  section={sectionKey}
                  rawValue={shared ? secSettlement : (localRow[nk("정산정보")] ?? null)}
                  onSave={onSaveSettlement}
                  isAdmin={isAdmin}
                  sectionSettlementBase={sectionSettlementBase}
                />
              </>
            )}
          </div>
        )}

        {/* 환불정보 — 분야별 독립 차수카드 */}
        {subTab === "refund" && (
          <div className="p-4">
            {shared && secRefund === undefined ? (
              <Spinner />
            ) : (
              <>
                {!shared && <NoBiznoNotice />}
                <SectionSettlementTab
                  section={sectionKey}
                  kind="refund"
                  rawValue={shared ? secRefund : (localRow[nk("환불정보_차수")] ?? null)}
                  onSave={onSaveRefund}
                  isAdmin={isAdmin}
                  sectionSettlementBase={sectionSettlementBase}
                />
              </>
            )}
          </div>
        )}

        {/* 미팅정보 — 분야별 독립 */}
        {subTab === "meetings" && (
          <div className="p-4">
            <MeetingsTab
              rawValue={localRow[nk("_meetings")] ?? null}
              onSave={(json: string) => handleUpdate(nk("_meetings"), json)}
            />
          </div>
        )}

        {/* 파일 탭 제거 — 첨부파일은 기본정보 "파일" 칸에서 통합 관리 */}
      </div>
    </div>
  );
}

// 사업자번호 없는 행 안내 — 공용 보관함을 쓸 수 없어 이 화면(ERP)에만 저장됨을 알린다.
function NoBiznoNotice() {
  return (
    <div className="mb-3 rounded-xl border border-[var(--wedly-gold)]/30 bg-wedly-bg-yellow px-3 py-2 text-[12px] text-wedly-t1">
      이 회사는 사업자번호가 없어 지금은 이 화면에만 저장됩니다. 사업자번호를 입력하면 하이브·일루아에서도 함께 보고 편집할 수 있어요.
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 기본정보 칸 편집 보조 — 추가 모달 / 편집·삭제 행
// ─────────────────────────────────────────────────────────────────────────────
function AddBasicColumnModal({ title = "기본정보에 칸 추가", onClose, onConfirm }: { title?: string; onClose: () => void; onConfirm: (label: string, type: string) => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [typeOpen, setTypeOpen] = useState(false);
  const typeRef = useRef<HTMLDivElement>(null);
  const submit = () => { if (label.trim()) onConfirm(label.trim(), type); };
  const selectedTypeLabel = UNIFIED_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "글자";
  useEffect(() => {
    if (!typeOpen) return;
    const h = (e: MouseEvent) => { if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [typeOpen]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xs p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-wedly-sub font-bold text-wedly-navy mb-3">{title}</h3>
        <label className="block text-[11px] text-wedly-muted mb-1">칸 이름</label>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="예: 비고"
          className="w-full text-[13px] border border-wedly-bd rounded-lg px-2.5 py-1.5 mb-3 outline-none focus:border-wedly-accent"
        />
        <label className="block text-[11px] text-wedly-muted mb-1">형식</label>
        <div ref={typeRef} className="relative mb-4">
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-[13px] border border-wedly-bd rounded-lg px-2.5 py-1.5 bg-white outline-none hover:border-wedly-accent focus:border-wedly-accent transition-colors"
          >
            <span className="text-wedly-t1">{selectedTypeLabel}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className={`text-wedly-muted transition-transform ${typeOpen ? "rotate-180" : ""}`}>
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {typeOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-[240px] overflow-y-auto rounded-lg border border-wedly-bd bg-white shadow-lg py-1">
              {UNIFIED_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { setType(o.value); setTypeOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-[13px] flex items-center justify-between gap-2 hover:bg-wedly-bg-gray transition-colors ${o.value === type ? "bg-wedly-bg-blue text-wedly-accent-ink font-medium" : "text-wedly-t1"}`}
                >
                  <span>{o.label}</span>
                  {o.value === type && <span className="text-wedly-accent-ink text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-[12px] text-wedly-muted hover:text-wedly-t2">취소</button>
          <button
            onClick={submit}
            disabled={!label.trim()}
            className="px-3 py-1.5 text-[12px] font-bold text-white bg-wedly-accent rounded-lg hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

function BasicEditRow({ field, editMode, isCustom, onRename, onChangeType, onHide, onDelete }: {
  field: ColumnLite;
  editMode: boolean;
  isCustom: boolean;
  onRename: (key: string, label: string) => void;
  onChangeType: (key: string, type: string) => void;
  onHide?: (key: string) => void; // 없으면 '숨기기' 버튼 미표시(새 분야 칸은 삭제만)
  onDelete: (key: string) => void;
}) {
  const [label, setLabel] = useState(field.label);
  useEffect(() => { setLabel(field.label); }, [field.label]);
  if (editMode) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { const v = label.trim(); if (v && v !== field.label) onRename(field.key, v); else setLabel(field.label); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="flex-1 min-w-0 text-[13px] border-b border-wedly-bd focus:border-wedly-accent outline-none bg-transparent px-1 py-0.5"
        />
        <select
          value={field.type ?? "text"}
          onChange={(e) => onChangeType(field.key, e.target.value)}
          className="text-[12px] border border-wedly-bd rounded px-1.5 py-0.5 text-wedly-t2 bg-white outline-none focus:border-wedly-accent flex-shrink-0"
          title="데이터 형식"
        >
          {DEFAULT_COLUMN_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }
  // 삭제 모드
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <span className="flex-1 min-w-0 text-[13px] text-wedly-t1 truncate">{field.label}</span>
      {onHide && (
        <button
          onClick={() => onHide(field.key)}
          className="text-[11px] text-wedly-muted hover:text-wedly-t1 px-1.5 py-0.5 rounded border border-wedly-bd flex-shrink-0"
        >
          숨기기
        </button>
      )}
      {isCustom && (
        <button
          onClick={() => onDelete(field.key)}
          className="text-[11px] text-wedly-red-ink hover:bg-wedly-bg-red/40 px-1.5 py-0.5 rounded border border-wedly-red/40 flex-shrink-0"
        >
          삭제
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BasicInfoPanel — 기본 필드 (BASIC_FIELD_SPECS 기반 전체) + 하이브식 분야 현황 요약표
// ─────────────────────────────────────────────────────────────────────────────
// 신규 등록 폼에서 제외할 자동 생성·읽기전용 타입(등록일시·최종편집자 등) — 삭제된 CreateEntryModal 과 동일 정책.
const NEW_FORM_EXCLUDED_TYPES = new Set(["last_edited_time", "last_edited_by", "auto_increment_id", "formula"]);

// ── 기본정보 칸 저장 순서·입력 창구(owner) ──
// 같은 항목(_id)의 같은 칸을 연달아 저장하면 요청이 동시에 나가 서버에 마지막으로 '도착한' 값이 남는다
// (마지막으로 '친' 값과 어긋남). 항목+칸 단위로 '행 저장 → 공용 보관소 저장'을 한 줄로 잇고, 다른 칸끼리는 기다리지 않는다.
// 모듈 단위라 상세창을 닫거나 회사가 바뀌어도 이미 받은 저장은 끝까지 간다.
const basicFieldTails = new Map<string, Promise<void>>();

const basicFieldQueueKey = (entryId: string, key: string) => `${entryId}\u0000${key}`;
const hasOwnKey = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
// 화면 owner와 별개인 최신 입력. 닫힌 창의 앱 막대는 이어 쓰고, 다른 owner의 새 입력은 옛 입력을 영구 무효화한다.
type BasicIntentLease = { queueKey: string; valid: boolean; identity: string; field?: BasicFieldIntent; cancel?: () => void };
type BasicWriteControl = { isCurrent: () => boolean; hasNewerInput: () => boolean; finish: () => void };
function basicOriginal(value: unknown, present: boolean): BasicRestoreOriginal | undefined {
  if (!present) return { value: null, present: false };
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return { value, present: true };
  return undefined;
}
const basicIntentLeases = new Map<string, BasicIntentLease>();
function beginBasicIntent(queueKey: string, identity: string): BasicIntentLease {
  const previous = basicIntentLeases.get(queueKey);
  if (previous) previous.valid = false;
  const lease: BasicIntentLease = { queueKey, valid: true, identity };
  basicIntentLeases.set(queueKey, lease);
  return lease;
}
const isCurrentBasicIntent = (lease: BasicIntentLease) => lease.valid && basicIntentLeases.get(lease.queueKey) === lease;
function finishBasicIntent(lease: BasicIntentLease) {
  lease.valid = false;
  if (basicIntentLeases.get(lease.queueKey) === lease) basicIntentLeases.delete(lease.queueKey);
}

/** rowDone: 행 저장 결과(실패하면 거부). done: 행 저장 + 보관소 기록이 모두 끝났을 때(실패해도 거부하지 않음). */
function enqueueBasicFieldWrite(
  queueKey: string,
  saveRow: () => Promise<void>,
  afterRow: () => Promise<void>,
  runHost?: (task: () => Promise<void>) => Promise<void>,
): { rowDone: Promise<void>; done: Promise<void> } {
  if (runHost) {
    let resolveRow!: () => void;
    let rejectRow!: (error: unknown) => void;
    const rowDone = new Promise<void>((resolve, reject) => { resolveRow = resolve; rejectRow = reject; });
    const stored = runHost(async () => {
      try { await saveRow(); resolveRow(); await afterRow(); }
      catch (error) { rejectRow(error); throw error; }
    });
    const done = stored.then(() => undefined, (error) => { rejectRow(error); });
    return { rowDone, done };
  }
  const prev = basicFieldTails.get(queueKey);
  const rowDone = prev ? prev.then(saveRow) : saveRow();
  // 뒤따르는 저장은 보관소 기록까지 끝난 뒤에 시작한다. 행 저장이 실패해도 줄은 끊지 않는다.
  const tail = rowDone.then(afterRow).catch(() => {});
  basicFieldTails.set(queueKey, tail);
  void tail.then(() => { if (basicFieldTails.get(queueKey) === tail) basicFieldTails.delete(queueKey); });
  return { rowDone, done: tail };
}

type BasicFieldIntent = {
  /** 같은 칸에 입력이 들어올 때마다 올리는 번호(창구에 남는다) — 가장 최근 번호만 실패 안내·재시도·되돌리기를 할 수 있다. */
  gen: number;
  /** 행 저장과 보관소 기록이 모두 끝나지 않은 저장 수. */
  inflight: number;
  /** 잠깐 실패로 입력값을 남겨 둔 상태 — 앱의 저장 실패 막대가 다시 저장·되돌리기를 쥐고 있다. */
  retained: boolean;
  /** 표·상세가 같은 객체의 original만 확정값으로 읽고 쓴다(unknown도 그대로 보존). */
  recovery: BasicRecovery;
  /** 실제 새 행·보관소를 적용했으면 다음 입력이 옛 호스트 객체를 다시 가져오지 않는다. */
  refreshed: boolean;
  protected: boolean;
};
function basicFieldIntent(recovery: BasicRecovery = {}): BasicFieldIntent {
  return { gen: 0, inflight: 0, retained: false, recovery, refreshed: false, protected: false };
}
function applyBasicOriginal(field: BasicFieldIntent | undefined, value: unknown, present: boolean) {
  if (!field) return;
  field.recovery.original = basicOriginal(value, present);
  field.refreshed = true;
}
type BasicOwner = {
  entryId: string;
  identity: string;
  /** 이 창구가 화면에 붙어 있는 동안만 true — 닫히면 화면 상태·알림창은 건드리지 않는다(저장은 계속). */
  active: boolean;
  /** 같은 화면에 다른 창구가 들어섰다 — 옛 창구의 부모 콜백(목록 새로고침 등)은 더 부르지 않는다. */
  superseded: boolean;
  /** 이 창구에서 사용자가 만진 칸. */
  fields: Map<string, BasicFieldIntent>;
  /** 재열기 때 진행 중이던 확정값 — 이 창구에서 실제 새 행·보관소 값을 적용할 때까지 이어 쓴다. */
  inherited: Set<string>;
};

/** 화면에 붙어 있는 현재 창구만 true — 닫혔거나 다른 창구로 바뀐 옛 창구의 화면 콜백·알림·실패 안내는 모두 막는다. */
const isOwnerLive = (owner: BasicOwner) => owner.active && !owner.superseded;

function sameFieldValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

/**
 * 같은 창구에서 새 행 객체가 들어올 때: 서버 값이 그대로인 칸은 화면(입력) 값을 지키고, 바뀐 칸만 반영한다.
 * null·false·0·키 삭제도 실제 값이다. 저장 중·실패 보관 중인 칸은 화면 값과 원래 확정 기준을 지킨다(새 행에 미저장 overlay가 섞일 수 있다).
 */
function applyIncomingBasicRow(
  owner: BasicOwner,
  local: Record<string, unknown>,
  prevIncoming: Record<string, unknown>,
  prevObserved: Record<string, unknown>,
  nextIncoming: Record<string, unknown>,
): { merged: Record<string, unknown>; baseline: Record<string, unknown> } {
  const merged = { ...local };
  const baseline = { ...prevIncoming };
  // 재열기 전 owner가 확인한 값도 공유된다. ACK 전에 이미 관측한 값과 일치할 때만 비교 기준을 따라잡는다.
  for (const [k, field] of owner.fields) {
    const confirmed = field.recovery.original;
    if (!confirmed || confirmed.present !== hasOwnKey(prevObserved, k)
      || (confirmed.present && !sameFieldValue(confirmed.value, prevObserved[k]))) continue;
    if (confirmed.present) baseline[k] = confirmed.value;
    else delete baseline[k];
  }
  const keys = new Set([...Object.keys(baseline), ...Object.keys(nextIncoming)]);
  for (const k of keys) {
    const hadPrev = hasOwnKey(baseline, k);
    const hasNext = hasOwnKey(nextIncoming, k);
    if (hadPrev === hasNext && sameFieldValue(baseline[k], nextIncoming[k])) continue;
    const field = owner.fields.get(k);
    if (field?.protected && (field.inflight > 0 || field.retained)) {
      // 서버가 받아들인 값이 새 행에도 확인되면 비교 기준만 갱신한다. 입력 보호는 유지한다.
      const confirmed = field.recovery.original;
      if (confirmed && confirmed.present === hasNext && (!hasNext || sameFieldValue(confirmed.value, nextIncoming[k]))) {
        if (hasNext) baseline[k] = nextIncoming[k];
        else delete baseline[k];
      }
      continue;
    }
    if (hasNext) merged[k] = nextIncoming[k];
    else delete merged[k];
    applyBasicOriginal(field, nextIncoming[k], hasNext);
    owner.inherited.delete(k);
    if (hasNext) baseline[k] = nextIncoming[k];
    else delete baseline[k];
  }
  return { merged, baseline };
}

function BasicInfoPanel({
  row,
  detail,
  loading,
  onOpenTab,
  onSaved,
  isAdmin = false,
  orderedGroups,
  isNew = false,
  draft,
  onDraftChange,
  saveOwnField,
  ownDomain,
  loadColumnConfig,
  saveColumnConfig,
  loadManagers,
  adapter,
}: {
  row: RowData;
  detail: CustomerDetailLite | null;
  loading: boolean;
  onOpenTab: (groupKey: string) => void;
  onSaved?: () => void;
  isAdmin?: boolean;
  orderedGroups: DomainGroup[];
  // 신규 등록 모드: 값은 서버 저장 대신 부모의 임시 보관(draft)으로
  isNew?: boolean;
  /** 표 "컬럼 표시 설정"에서 켠 칸 정의 — 기본정보에도 union 노출(NO.46 ②). */
  extraBasicColumns?: { key: string; label: string; type: ColumnLite["type"]; format?: ColumnLite["format"] }[];
  /** 표 컬럼 표시 설정 OFF 칸 키(표준 포함) — visibleBasicFields 균일 제외(NO.56). */
  hiddenColumnKeys?: string[];
  draft?: Record<string, unknown>;
  onDraftChange?: (key: string, val: unknown) => void;
  saveOwnField: SaveOwnFieldFn;
  ownDomain: string;
  loadColumnConfig: () => Promise<unknown>;
  saveColumnConfig: (cfg: unknown) => Promise<void>;
  loadManagers: () => Promise<{ id: string; name: string }[]>;
  adapter: UnifiedDetailAdapter;
}) {
  // 자기 주력 분야 칸 정의 — 어댑터 주입(ERP=COLUMNS). 앱별로 다른 자기분야 칸을 외부에서 받는다.
  const { ownColumns } = adapter;
  // ── 기본정보 기본 칸 목록 (사양 기반) ──
  const colsLite = useMemo<ColumnLite[]>(
    () => ownColumns.map((c) => ({ key: c.key, label: c.label, type: c.type, format: c.format })),
    [ownColumns],
  );
  // 상호명은 별도 헤더로 표시하므로 BASIC_FIELD_SPECS에서는 제외 (진행상태는 표시)
  const baseSection = useMemo(() => {
    const withTeam = ensureBasicTeamFields(
      // 신규 등록 폼(isNew)에선 빈 행이라도 사양 칸을 모두 띄운다(환급금·영업담당 등 누락 복구 — NO.46).
      buildBasicSection(BASIC_FIELD_SPECS, colsLite, row as Record<string, unknown>, isNew),
      colsLite,
    );
    // 표 컬럼에 file타입 칸이 없는 앱(일루아)은 기본정보에 파일칸이 안 떠 회사 파일이 안 보인다.
    // 어댑터가 basicReportField 를 선언하고(일루아만) 아직 file타입 필드가 없으면 합성 "리포트" 파일칸을 보충.
    // ERP·하이브는 실제 file타입 칸 보유 → 미선언이라 이 가지를 타지 않음(무변화).
    const rf = adapter.basicReportField;
    if (rf && !withTeam.fields.some((f) => f.type === "file")) {
      return { ...withTeam, fields: [...withTeam.fields, { key: rf.key, label: rf.label ?? "리포트", type: "file" as const }] };
    }
    return withTeam;
  }, [colsLite, row, adapter, isNew]);

  // ── 공용 기본정보 보관함 연결: 사업자번호 + 칸 키 → 공통 식별자(= 공통 스펙 라벨, 앱 중립) ──
  const bizno = useMemo(() => {
    let raw = "";
    for (const f of baseSection.fields) {
      if (f.label === "사업자번호") { raw = String((row as Record<string, unknown>)[f.key] ?? ""); break; }
    }
    if (!raw) raw = String(
      (row as Record<string, unknown>)["15사업자번호"] ??
      (row as Record<string, unknown>)["04사업자번호"] ??
      (row as Record<string, unknown>)["사업자번호"] ?? "",
    );
    return raw.replace(/\D/g, "");
  }, [baseSection, row]);
  // 공통/앱별 전역 설정(관리자 토글) — 색·공유 판정에 함께 반영. 상세창 열릴 때 1회 불러옴.
  const [commonOverride, setCommonOverride] = useState<CommonFieldOverride>(getCachedCommonOverride());
  useEffect(() => { fetchCommonFieldsOverride().then(setCommonOverride); }, []);
  // 공통 칸 추가/변경(공통 컬럼 관리) 후 다시 불러오기 위한 새로고침 신호.
  const [defsReloadKey, setDefsReloadKey] = useState(0);
  // 3앱 공용 기본정보 추가 칸(공통). ERP에서 추가한 공통 칸을 같은 공용 보관함에서 읽어 함께 표시·값연동.
  const [commonBasicFields, setCommonBasicFields] = useState<Array<{ key: string; label: string; type: string; options?: string[] }>>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(adapter.api.loadCommonBasicFields?.(ownDomain) ?? [])
      .then((list) => { if (!cancelled) setCommonBasicFields(Array.isArray(list) ? list : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adapter, ownDomain, defsReloadKey]);
  // 이 앱에서 관리자가 숨긴 기본정보 칸(라벨). 상세창 열릴 때 1회 불러옴.
  const [hiddenBasicCols, setHiddenBasicCols] = useState<string[]>([]);
  useEffect(() => {
    fetchHiddenBasicColumns().then(setHiddenBasicCols);
    return subscribeHiddenBasicColumns(setHiddenBasicCols);
  }, []);

  // ── 관리자 칸 편집 설정 — 공용 config 저장소 재사용 (표·경정청구와 같은 구조 본부) ──
  // basicAddedColumns: 기본정보에 추가한 사용자 칸 키 / basicHiddenColumns: 기본정보에서 숨긴 칸 키
  const [customColumns, setCustomColumns] = useState<Array<{ key: string; label: string; type: string }>>([]);
  const [colLabelOverrides, setColLabelOverrides] = useState<Record<string, string>>({});
  const [colTypeOverrides, setColTypeOverrides] = useState<Record<string, string>>({});
  const [basicAddedColumns, setBasicAddedColumns] = useState<string[]>([]);
  const [basicHiddenColumns, setBasicHiddenColumns] = useState<string[]>([]);
  const [deletedColumns, setDeletedColumns] = useState<string[]>([]);
  // 구조 설정 읽기 — 어댑터 loadColumnConfig 경유. 모든 사용자 대상(라벨·형식·숨김·추가 칸은 본부가 정한 구조라 비관리자도 같게 봐야 함). 쓰기는 ADMIN만(서버 검증).
  useEffect(() => {
    let cancelled = false;
    loadColumnConfig()
      .then((j) => {
        if (cancelled) return;
        const d = (j as { data?: unknown })?.data;
        if (!d || typeof d !== "object") return;
        const data = d as Record<string, unknown>;
        if (Array.isArray(data.customColumns)) {
          setCustomColumns(
            data.customColumns.filter(
              (c: unknown): c is { key: string; label: string; type: string } =>
                !!c && typeof (c as { key?: unknown }).key === "string",
            ),
          );
        }
        if (data.colLabelOverrides && typeof data.colLabelOverrides === "object") setColLabelOverrides(data.colLabelOverrides as Record<string, string>);
        if (data.colTypeOverrides && typeof data.colTypeOverrides === "object") setColTypeOverrides(data.colTypeOverrides as Record<string, string>);
        if (Array.isArray(data.basicAddedColumns)) setBasicAddedColumns(data.basicAddedColumns.filter((k: unknown): k is string => typeof k === "string"));
        if (Array.isArray(data.basicHiddenColumns)) setBasicHiddenColumns(data.basicHiddenColumns.filter((k: unknown): k is string => typeof k === "string"));
        if (Array.isArray(data.deletedColumns)) setDeletedColumns(data.deletedColumns.filter((k: unknown): k is string => typeof k === "string"));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loadColumnConfig]);
  const saveConfig = useCallback((partial: Record<string, unknown>) => {
    saveColumnConfig(partial).catch(() => { /* 저장 실패해도 화면 유지 — 다음 열람 때 서버값으로 정렬됨 */ });
  }, [saveColumnConfig]);
  const isCustomKey = useCallback((k: string) => customColumns.some((c) => c.key === k), [customColumns]);

  // 기본 칸 + 추가 칸 → 라벨/형식 덮어쓰기 적용 (전체 목록)
  const allBasicFields = useMemo<ColumnLite[]>(() => {
    // 승격 키를 찾을 전체 명단: 사용자 생성 칸 + 정식 컬럼.
    // (기존엔 customColumns 에서만 찾아, 원래 있던 일반 칸을 공통으로 옮기면 누락됐다.)
    const lookup = new Map<string, { key: string; label: string; type: string }>();
    for (const c of [...customColumns, ...ownColumns]) {
      if (!lookup.has(c.key)) lookup.set(c.key, { key: c.key, label: c.label, type: c.type as string });
    }
    const baseKeys = new Set(baseSection.fields.map((f) => f.key));
    const added: ColumnLite[] = basicAddedColumns
      .map((k) => lookup.get(k))
      .filter((c): c is { key: string; label: string; type: string } => !!c && !baseKeys.has(c.key))
      .map((c) => ({ key: c.key, label: c.label, type: c.type as ColumnDef["type"] }));
    const base = [...baseSection.fields, ...added];
    // ★표 "컬럼 표시 설정"에서 켠 칸은 기본정보에 더하지 않는다 — 기본정보 노출은 '공통·앱별 칸 설정'(패널)
    //   기준(공통 + 앱전용/커스텀)만. 표에서 켠 그외 칸은 기본정보에서 제외. (사장님 결정 2026-06-19, NO.56 정정)
    // 3앱 공용 칸: 표준·추가 칸에 없는 것만 뒤에 합친다(키 기준 중복 제거). ERP에서 추가한 공통 칸이
    // 같은 모양으로 여기에도 뜬다(값연동은 keyToFieldId/commonFieldIdForKey 가 처리).
    const presentForShared = new Set(base.map((f) => f.key));
    const shared: ColumnLite[] = commonBasicFields
      .filter((c) => c && typeof c.key === "string" && !presentForShared.has(c.key))
      .map((c) => ({ key: c.key, label: c.label, type: c.type as ColumnDef["type"], options: Array.isArray(c.options) ? c.options : undefined }));
    // 신규 등록 폼: 통일쌍(예: custom_…_b1wc ↔ 59DB담당)이 둘 다 떠 'DB 분류'가 두 번 보이던 중복을
    // 정식키 하나로 합친다. isNew 한정 — 빈 폼이라 값 손실이 없고, 기존 행 상세는 한쪽 미러키에만 값이
    // 남아 있을 수 있어 손대지 않는다.
    const merged: ColumnLite[] = isNew
      ? collapseMirrorBasicFields([...base, ...shared])
      : [...base, ...shared];
    return merged.map((f) => ({
      ...f,
      label: colLabelOverrides[f.key] ?? f.label,
      type: (colTypeOverrides[f.key] as ColumnDef["type"]) ?? f.type,
    }));
  }, [baseSection, basicAddedColumns, customColumns, colLabelOverrides, colTypeOverrides, ownColumns, commonBasicFields, isNew]);
  // 값 연동 식별자 지도 — 표준 칸뿐 아니라 추가 공통 칸까지 라벨을 찾도록 전체 칸 기준(2A 다리).
  const keyToFieldId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of allBasicFields) m.set(f.key, f.label);
    return m;
  }, [allBasicFields]);
  // "표에서 불러오기" 후보로 넘길 칸 목록 — 표가 지금 쓰는 살아있는 목록과 일치시킨다.
  // (원래 칸 + 사람이 추가한 커스텀 칸) − 삭제된 칸, 표와 동일하게 라벨/형식 덮어쓰기 반영.
  // 이전엔 고정 ownColumns 만 넘겨, 커스텀 칸이 안 보이고 삭제된 칸이 그대로 남았다(표 컬럼설정과 불일치).
  // ownColumns 원본은 그대로 둬 기본정보 경로(colsLite·allBasicFields)에는 영향 없음.
  const pickerOwnColumns = useMemo(() => {
    const deletedSet = new Set(deletedColumns);
    const seen = new Set<string>();
    const merged: { key: string; label: string; type?: ColumnDef["type"]; options?: string[] }[] = [];
    for (const c of [...ownColumns, ...customColumns]) {
      if (!c || !c.key || seen.has(c.key) || deletedSet.has(c.key)) continue;
      seen.add(c.key);
      merged.push({
        key: c.key,
        label: colLabelOverrides[c.key] ?? c.label,
        type: (colTypeOverrides[c.key] as ColumnDef["type"]) ?? (c.type as ColumnDef["type"]),
        options: (c as { options?: string[] }).options,
      });
    }
    return merged;
  }, [ownColumns, customColumns, deletedColumns, colLabelOverrides, colTypeOverrides]);
  const commonFieldIdForKey = useCallback(
    (k: string) => resolveCommonFieldId(k, keyToFieldId.get(k) ?? "", commonOverride),
    [keyToFieldId, commonOverride],
  );
  const visibleBasicFields = useMemo(
    () => allBasicFields.filter((f) => {
      // 표시 설정(공통·앱별 칸 설정, 라벨 기준)에서 숨긴 칸은 공통·앱별 모두 제외.
      if (isBasicColumnHidden(f.label, hiddenBasicCols)) return false;
      // 공통 칸: 표시 설정만으로 노출 결정 — 키 기반 '이 앱만 숨김'(basicHidden/deleted)은 무시.
      //  같은 공통칸이 빈행(등록)·값있는행(상세)에서 서로 다른 키로 잡혀 한쪽만 사라지던 불일치 차단 → 등록=상세.
      //  (공통 칸 표시설정은 ERP 전용·3앱 공유 — NO.56. 표 '컬럼 표시 설정'은 기본정보 미영향 — 사장님 2026-06-19.)
      if (isCommonBasicLabel(f.label, commonOverride)) return true;
      // 앱 전용 칸: 기존대로 키 기반 '이 앱만 숨김'도 적용.
      return !basicHiddenColumns.includes(f.key) && !deletedColumns.includes(f.key);
    }),
    [allBasicFields, basicHiddenColumns, deletedColumns, hiddenBasicCols, commonOverride],
  );
  // 표에서 기본정보로 끌어온 칸(조회 담당자·진행상태 등 basicAddedColumns)의 라벨 —
  // '공통 컬럼 관리' 창에도 보여 공통/숨김 토글로 관리할 수 있게 한다(NO.73). 앱 전용칸·중복은 제외.
  const addedBasicLabels = useMemo(() => {
    const appLabels = new Set(ERP_APP_BASIC_FIELDS.map((f) => f.label));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of allBasicFields) {
      if (!basicAddedColumns.includes(f.key)) continue;
      if (appLabels.has(f.label) || seen.has(f.label)) continue;
      seen.add(f.label);
      out.push(f.label);
    }
    return out;
  }, [allBasicFields, basicAddedColumns]);
  const hiddenBasicFields = useMemo(
    () => allBasicFields.filter((f) => basicHiddenColumns.includes(f.key)),
    [allBasicFields, basicHiddenColumns],
  );

  // 편집 상태 (관리자) — 한 모드 켜면 다른 모드는 끔
  const [editMode, setEditMode] = useState(false);    // 순서·이름·형식
  const [deleteMode, setDeleteMode] = useState(false); // 숨김·삭제
  const [showHidden, setShowHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const toggleEditMode = useCallback(() => { setEditMode((v) => !v); setDeleteMode(false); setShowHidden(false); }, []);
  const toggleDeleteMode = useCallback(() => { setDeleteMode((v) => !v); setEditMode(false); setShowHidden(false); }, []);

  // 순서·드래그 — 같은 데이터원(경정청구)과 동일 scope/tab. 권한=관리자(서버도 ADMIN 재검증).
  // 드래그는 "수정 모드에서만 드래그 목록을 렌더"해 제한 → 순서 초기화는 모드와 무관하게 동작.
  const basicOrder = useFieldOrder<ColumnLite>("tax-amendment", "basic", visibleBasicFields, isAdmin);

  // ── 공통 칸 표시 순서(3앱 공유) — 본부(ERP)에서 바꾸면 하이브·일루아도 같은 순서로 보인다(NO.56). ──
  //   공유 보관함(common-basic-order)이 비어 있으면 아래 내장 표준 순서로 표시 = 기존 동작(무회귀).
  const canManageCommon = adapter.appName === "ERP";
  const [commonOrder, setCommonOrder] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/common-field-order", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && Array.isArray(j.data?.order)) {
          setCommonOrder((j.data.order as unknown[]).filter((s): s is string => typeof s === "string"));
        }
      })
      .catch(() => { /* 실패 → 표준 순서 사용 */ });
    return () => { cancelled = true; };
  }, []);
  // 공통 칸 순서 저장 — ERP만. 낙관적 반영 후 공유 보관함에 기록(3앱 적용). 파트너 앱은 서버가 403.
  const persistCommonOrder = useCallback((labels: string[]) => {
    setCommonOrder(labels);
    fetch("/api/common-field-order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: labels }),
    }).catch((err) => console.warn("[common-field-order PUT]", err));
  }, []);

  // 공통 칸은 항상 위, 커스텀 칸은 아래로 묶는다(NO.73). 공통 칸의 순서는 3앱이 항상 같도록
  // 공유 순서(ERP가 정함) → 없으면 내장 표준 순서로 정렬한다(NO.56). 앱별로 내부 칸 키·저장 순서가 달라도
  // 상세창 공통 칸 순서가 흐트러지지 않게 한다(표준 목록에 없는 공통 칸은 기존 순서대로 뒤에 붙임).
  // 커스텀 칸은 기존대로 저장 순서/드래그를 따른다.
  const groupedFields = useMemo<ColumnLite[]>(() => {
    const DEFAULT_COMMON_ORDER = [
      "대표자명", "연락처", "사업자번호", "사업장주소지", "사업자유형", "환급금여부",
      "리포트", "DB 분류", "영업 담당", "조회 담당자", "등록일시", "진행상태",
      "팀장", "팀원", "이메일", "내부 DB 분류",
    ];
    // 본부(ERP)가 정한 공유 순서가 있으면 그걸로, 없으면 내장 표준 순서로(무회귀).
    const order = commonOrder.length > 0 ? commonOrder : DEFAULT_COMMON_ORDER;
    const norm = (s?: string) => (s || "").replace(/\s+/g, "").toLowerCase();
    const ord = (label: string) => {
      const i = order.findIndex((c) => norm(c) === norm(label));
      return i < 0 ? order.length : i;
    };
    const common: ColumnLite[] = [];
    const custom: ColumnLite[] = [];
    for (const f of basicOrder.orderedFields) {
      (isCommonBasicLabel(f.label, commonOverride) ? common : custom).push(f);
    }
    const commonSorted = common
      .map((f, i) => ({ f, i }))
      .sort((a, b) => ord(a.f.label) - ord(b.f.label) || a.i - b.i)
      .map((x) => x.f);
    return [...commonSorted, ...custom];
  }, [basicOrder.orderedFields, commonOverride, commonOrder]);

  // 드래그 드롭 — ERP에서 "공통 칸끼리" 옮기면 공유 순서를 갱신(3앱 적용). 그 외(커스텀/파트너/교차)는 기존 동작 그대로.
  const handleBasicFieldDrop = useCallback(
    (targetKey: string) => (e: DragEvent) => {
      if (canManageCommon) {
        const fromKey = basicOrder.draggingKey;
        const fromField = groupedFields.find((f) => f.key === fromKey);
        const toField = groupedFields.find((f) => f.key === targetKey);
        const fromCommon = !!fromField && isCommonBasicLabel(fromField.label, commonOverride);
        const toCommon = !!toField && isCommonBasicLabel(toField.label, commonOverride);
        if (fromField && toField && fromCommon && toCommon && fromField.key !== toField.key) {
          e.preventDefault();
          const labels = groupedFields
            .filter((f) => isCommonBasicLabel(f.label, commonOverride))
            .map((f) => f.label);
          const fi = labels.indexOf(fromField.label);
          const ti = labels.indexOf(toField.label);
          if (fi >= 0 && ti >= 0 && fi !== ti) {
            const next = [...labels];
            next.splice(fi, 1);
            next.splice(ti, 0, fromField.label);
            persistCommonOrder(next);
          }
          basicOrder.handleDragEnd();
          return;
        }
      }
      // 그 외 모든 경우 — 기존 per-app 드래그 그대로.
      basicOrder.handleDrop(targetKey)(e);
    },
    [basicOrder, groupedFields, commonOverride, canManageCommon, persistCommonOrder],
  );

  // ── 칸 편집 핸들러 ──
  const handleAddColumn = useCallback((label: string, type: string) => {
    // custom_<시각> 키 — 혹시 같은 키가 이미 있으면 접미사로 충돌 회피
    const taken = new Set([...ownColumns.map((c) => c.key), ...customColumns.map((c) => c.key)]);
    let key = `custom_${Date.now()}`;
    if (taken.has(key)) key = `custom_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const nextCustom = [...customColumns, { key, label, type }];
    const nextAdded = [...basicAddedColumns, key];
    setCustomColumns(nextCustom);
    setBasicAddedColumns(nextAdded);
    saveConfig({ customColumns: nextCustom, basicAddedColumns: nextAdded });
    setAddOpen(false);
  }, [customColumns, basicAddedColumns, saveConfig, ownColumns]);
  const handleRename = useCallback((key: string, label: string) => {
    const next = label.trim();
    if (!next) return;
    if (isCustomKey(key)) {
      const nextCustom = customColumns.map((c) => (c.key === key ? { ...c, label: next } : c));
      setCustomColumns(nextCustom);
      saveConfig({ customColumns: nextCustom });
    } else {
      const nextLabels = { ...colLabelOverrides, [key]: next };
      setColLabelOverrides(nextLabels);
      saveConfig({ colLabelOverrides: nextLabels });
    }
  }, [customColumns, colLabelOverrides, isCustomKey, saveConfig]);
  const handleChangeType = useCallback((key: string, type: string) => {
    if (isCustomKey(key)) {
      const nextCustom = customColumns.map((c) => (c.key === key ? { ...c, type } : c));
      setCustomColumns(nextCustom);
      saveConfig({ customColumns: nextCustom });
    } else {
      const nextTypes = { ...colTypeOverrides, [key]: type };
      setColTypeOverrides(nextTypes);
      saveConfig({ colTypeOverrides: nextTypes });
    }
  }, [customColumns, colTypeOverrides, isCustomKey, saveConfig]);
  const handleHide = useCallback((key: string) => {
    if (basicHiddenColumns.includes(key)) return;
    const next = [...basicHiddenColumns, key];
    setBasicHiddenColumns(next);
    saveConfig({ basicHiddenColumns: next });
  }, [basicHiddenColumns, saveConfig]);
  const handleUnhide = useCallback((key: string) => {
    const next = basicHiddenColumns.filter((k) => k !== key);
    setBasicHiddenColumns(next);
    saveConfig({ basicHiddenColumns: next });
  }, [basicHiddenColumns, saveConfig]);
  const handleDelete = useCallback((key: string) => {
    if (!isCustomKey(key)) return; // 기본 칸은 삭제 불가(숨김만)
    if (!confirm("이 칸을 삭제하시겠습니까? (모든 사용자에게 적용됩니다)")) return;
    const nextCustom = customColumns.filter((c) => c.key !== key);
    const nextAdded = basicAddedColumns.filter((k) => k !== key);
    const nextLabels = { ...colLabelOverrides }; delete nextLabels[key];
    const nextTypes = { ...colTypeOverrides }; delete nextTypes[key];
    const nextHidden = basicHiddenColumns.filter((k) => k !== key);
    setCustomColumns(nextCustom);
    setBasicAddedColumns(nextAdded);
    setColLabelOverrides(nextLabels);
    setColTypeOverrides(nextTypes);
    setBasicHiddenColumns(nextHidden);
    saveConfig({ customColumns: nextCustom, basicAddedColumns: nextAdded, colLabelOverrides: nextLabels, colTypeOverrides: nextTypes, basicHiddenColumns: nextHidden });
  }, [customColumns, basicAddedColumns, colLabelOverrides, colTypeOverrides, basicHiddenColumns, isCustomKey, saveConfig]);

  // 기본정보 값 입력·저장 — 칸을 클릭해 바로 입력/수정. 저장은 경정청구 항목(_id)에 반영(표시 출처와 동일).
  const entryId = String((row as Record<string, unknown>)["_id"] ?? "");
  // 입력 창구(owner) — 항목·사업자번호·어댑터·저장 함수가 같은 동안 하나. 바뀌면 옛 창구는 비활성이 되어
  // 진행 중인 저장은 계속 가되 새 창구의 화면 상태·알림창은 건드리지 못한다.
  const basicIdentity = basicRecoveryIdentity(row, ownDomain);
  const currentIdentityRef = useRef({ entryId, identity: basicIdentity });
  currentIdentityRef.current = { entryId, identity: basicIdentity };
  const owner = useMemo<BasicOwner>(() => {
    const fields = new Map<string, BasicFieldIntent>();
    const prefix = `${entryId}\u0000`;
    // 새 입력 전에 인계한다. 이전 저장이 완료돼 전역 lease가 없어져도 이 화면의 확정값은 남긴다.
    for (const [queueKey, lease] of basicIntentLeases) {
      if (queueKey.startsWith(prefix) && lease.valid && lease.field && matchesBasicRecoveryIdentity(lease.field.recovery, basicIdentity)) fields.set(queueKey.slice(prefix.length), lease.field);
    }
    return { entryId, identity: basicIdentity, active: true, superseded: false, fields, inherited: new Set(fields.keys()) };
  }, [entryId, bizno, basicIdentity, adapter, saveOwnField]);
  // 표 저장이 첫 입력 전에 끝나도 열었을 때 받은 공유 객체를 보유한다.
  // 늦게 도착한 정의·행에 없는 키도 찾고, 새 행/보관소 적용으로 해제한 상속은 다시 받지 않는다.
  const bridge = adapter.unsaved;
  if (entryId && bridge?.getBasicRecovery) {
    const keys = new Set([...Object.keys(row), ...ownColumns.map((f) => f.key), ...allBasicFields.map((f) => f.key)]);
    for (const key of keys) {
      if (owner.fields.has(key)) continue;
      const recovery = bridge.getBasicRecovery(bridge.makeId(bridge.scope, entryId, key));
      if (recovery && matchesBasicRecoveryIdentity(recovery, basicIdentity)) {
        recovery.identity ??= basicIdentity;
        owner.fields.set(key, basicFieldIntent(recovery));
        owner.inherited.add(key);
      }
    }
  }
  const lastOwnerRef = useRef<BasicOwner | null>(null);
  useEffect(() => {
    const prevOwner = lastOwnerRef.current;
    if (prevOwner && prevOwner !== owner) prevOwner.superseded = true;
    lastOwnerRef.current = owner;
    for (const [key, lease] of basicIntentLeases) {
      if (key.startsWith(`${owner.entryId}\u0000`) && (lease.field ? !matchesBasicRecoveryIdentity(lease.field.recovery, owner.identity) : lease.identity !== owner.identity)) lease.cancel?.();
    }
    owner.active = true;
    return () => { owner.active = false; };
  }, [owner]);
  const [basicRow, setBasicRow] = useState<Record<string, unknown>>(() => ({ ...(row as Record<string, unknown>) }));
  // 복원 동작은 닫힌 창의 setState 대신 현재 열린 창에 연결한다. 정리할 때도 자신의 연결만 지운다.
  useEffect(() => {
    const bridge = adapter.unsaved;
    for (const key of new Set([...Object.keys(row), ...allBasicFields.map(field => field.key)])) {
      const id = bridge?.makeId(bridge.scope, entryId, key);
      const recovery = id ? bridge?.getBasicRecovery?.(id) : undefined;
      if (id && recovery?.identity && !matchesBasicRecoveryIdentity(recovery, owner.identity)) bridge?.resolve(id);
    }
    const bindings = ([...owner.fields].map(([key, field]) => [key, field.recovery] as const)).map(([key, recovery]) => {
      const apply: NonNullable<BasicRecovery["applyToDetail"]> = original => {
        if (!(isOwnerLive(owner)) || (recovery.identity && !matchesBasicRecoveryIdentity(recovery, owner.identity))) return;
        const field = owner.fields.get(key);
        if (field) { field.retained = false; field.protected = false; }
        setBasicRow(current => { const next = { ...current }; if (original.present) next[key] = original.value; else delete next[key]; return next; });
      };
      recovery.applyToDetail = apply;
      return { recovery, apply };
    });
    return () => { for (const { recovery, apply } of bindings) if (recovery.applyToDetail === apply) delete recovery.applyToDetail; };
  });

  // row 객체가 새로 들어오면(저장 후 갱신 등): 다른 창구면 새 행으로 처음부터, 같은 창구면 서버 값이 바뀐 칸만 반영하고
  // 바뀌지 않은 칸의 입력·저장 중인 칸은 그대로 둔다(예전엔 새 객체마다 통째로 덮어써 입력이 사라졌다).
  const [syncedFrom, setSyncedFrom] = useState({ owner, event: row, incoming: row as Record<string, unknown> });
  if (syncedFrom.owner !== owner) {
    setSyncedFrom({ owner, event: row, incoming: row as Record<string, unknown> });
    setBasicRow({ ...(row as Record<string, unknown>) });
  } else if (syncedFrom.event !== row) {
    const { merged, baseline } = applyIncomingBasicRow(owner, basicRow, syncedFrom.incoming, syncedFrom.event as Record<string, unknown>, row as Record<string, unknown>);
    setSyncedFrom({ owner, event: row, incoming: baseline });
    setBasicRow(merged);
  }

  useEffect(() => {
    setBasicRow(current => {
      const next = { ...current };
      for (const [key, field] of owner.fields) if (field.recovery.draft && matchesBasicRecoveryIdentity(field.recovery, owner.identity)) {
        if (field.recovery.draft.present) next[key] = field.recovery.draft.value; else delete next[key];
      }
      return next;
    });
  }, [owner]);

  // ── 공용 보관함 읽기 — 변경 내역 표시 + 비어 있는 칸만 보관함 값으로 채움(기존 행 값은 보호) ──
  const [basicRecord, setBasicRecord] = useState<BasicRecord | null>(null);
  const [showBasicLog, setShowBasicLog] = useState(false);
  // 창구가 바뀌면(다른 회사) 옛 회사의 변경 내역을 비운다 — 새 회사 보관소가 비어 있어도 옛 기록이 남지 않게.
  useEffect(() => () => { setBasicRecord(null); }, [owner]);
  const appLabel = useCallback((a: string) => (a === "erp" ? "ERP" : a === "hive" ? "하이브" : a === "illua" ? "일루아" : a), []);
  const fmtVal = useCallback((v: unknown) => (v == null || v === "" ? "(빈값)" : typeof v === "object" ? JSON.stringify(v) : String(v)), []);
  const fmtAt = useCallback((iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);
  useEffect(() => {
    if (!bizno) { setBasicRecord(null); return; }
    let cancelled = false;
    // 읽기를 시작한 순간 칸별 입력 번호 — 읽는 동안 새 입력(비움 포함)이 들어간 칸은 늦게 온 보관소 값으로 채우지 않는다.
    const startGen = new Map<string, number>();
    const startProtected = new Set<string>();
    for (const [k, f] of owner.fields) {
      startGen.set(k, f.gen);
      if (f.protected && (f.inflight > 0 || f.retained)) startProtected.add(k);
    }
    adapter.api.loadBasicStore(bizno).then((rec) => {
      if (cancelled || !rec) return;
      setBasicRecord(rec);
      // 읽는 동안 입력이 들어갔거나(끝난 비움 포함) 아직 저장·실패 보관 중인 칸은 보관소 값으로 채우거나 덮지 않는다.
      const touched = new Set<string>(startProtected);
      for (const [k, f] of owner.fields) {
        if (f.gen !== (startGen.get(k) ?? 0) || (f.protected && (f.inflight > 0 || f.retained))) touched.add(k);
      }
      setBasicRow((r) => {
        const next = { ...r };
        // 표준칸뿐 아니라 공통추가·커스텀 칸까지(allBasicFields) 회사 보관소 값으로 빈칸을 채운다.
        // → 모든 기본정보가 회사 단위로 보관·표시(분야 기록 1순위, 보관소는 빈칸만).
        for (const f of allBasicFields) {
          if (touched.has(f.key)) continue;
          const entry = rec.fields[f.label];
          if (entry && entry.value != null && entry.value !== "") {
            const cur = next[f.key];
            // 진행상태는 3앱 완전 동기화(NO.56 사장님 결정 2026-06-21): 값이 있어도 공용 보관함 최신값으로 덮어쓴다.
            // 그 외 칸은 기존대로 '빈 칸만' 채워 기존 값을 보호.
            if (f.label === "진행상태" || cur == null || cur === "") {
              next[f.key] = entry.value;
              applyBasicOriginal(owner.fields.get(f.key), entry.value, true);
              owner.inherited.delete(f.key);
            }
          }
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [bizno, allBasicFields, adapter, owner]);

  // 한 칸을 '행 저장 → 공용 보관소 저장' 순서로 보낸다. 처음 보내는 저장과 '다시 저장'이 같은 길을 쓴다.
  // 행 저장이 성공하면 곧바로 완료 처리(onSaved)하고, 보관소 기록은 줄 안에서 이어서 끝낸다(실패해도 행 저장은 유지).
  // 공통·커스텀 칸 모두 회사 보관소(basic-store)에 기록(누가·앱·이전→새값).
  // 커스텀칸은 그 칸의 라벨(keyToFieldId)을 보관소 키로 사용 → 읽기 빈칸채움(allBasicFields 루프)이 같은 라벨로 되읽음.
  // 이미 받은 처음 저장은 창이 닫히거나 회사가 바뀌어도 행→보관소 순서로 끝까지 간다(화면 콜백만 막는다).
  // 다시 저장은 보내기 시작하는 순간에도 유효한 같은 입력일 때만 나간다 — 옛 입력을 되살리지 않는다.
  const sendBasicField = useCallback(
    (key: string, value: string | number | boolean | null, gen: number, isRetry: boolean, control: BasicWriteControl, acceptedSave: SaveOwnFieldFn, acceptedIdentity: string) => {
      const queueKey = basicFieldQueueKey(entryId, key);
      const isLatest = () => owner.fields.get(key)?.gen === gen;
      const fieldId = commonFieldIdForKey(key) || keyToFieldId.get(key) || "";
      return enqueueBasicFieldWrite(
        queueKey,
        async () => {
          // 줄을 기다리는 사이 같은 칸에 새 입력이 들어오거나 실패 항목이 폐기됐으면 옛 값을 다시 보내지 않는다.
          if (isRetry && !control.isCurrent()) throw new Error("obsolete");
          if (isRetry) await acceptedSave(entryId, key, value, undefined, { shouldContinue: control.isCurrent });
          else await acceptedSave(entryId, key, value);
          try {
            const field = owner.fields.get(key);
            if (field) {
              field.recovery.original = { value, present: true };
              acknowledgeBasicRecovery(field.recovery, acceptedIdentity);
            }
            if (isOwnerLive(owner)) setSyncedFrom((seen) => seen.owner === owner && hasOwnKey(seen.event as Record<string, unknown>, key)
              && sameFieldValue((seen.event as Record<string, unknown>)[key], value)
              ? { ...seen, incoming: { ...seen.incoming, [key]: value } } : seen);
            const bridge = adapter.unsaved;
            const currentRecovery = bridge?.getBasicRecovery?.(bridge.makeId(bridge.scope, entryId, key));
            const currentIdentity = currentRecovery ? currentRecovery.identity : undefined;
            if (!currentIdentity || currentIdentity === owner.identity) {
              bridge?.noteBasicServerValue?.(bridge.makeId(bridge.scope, entryId, key), { value, present: true });
            }
            if (isRetry && !control.isCurrent()) return;
            if (isLatest() && control.isCurrent()) {
              if (field) field.retained = false;
            }
            if (!isRetry) {
              if (!control.hasNewerInput()) { if (field) delete field.recovery.pendingRefresh; onSaved?.(); }
              else if (field) field.recovery.pendingRefresh = onSaved;
            }
          } catch (err) {
            console.error("[기본정보 저장 후처리]", err);
          }
        },
        async () => {
          if (isRetry && !control.isCurrent()) return;
          if (fieldId && bizno) {
            try {
              const rec = await adapter.api.saveBasicField(bizno, "erp", fieldId, value);
              if (rec && isOwnerLive(owner) && control.isCurrent()) setBasicRecord(rec);
            } catch { /* 보관소 기록 실패는 이미 저장된 행을 되돌리지 않는다 */ }
          }
          if (isRetry) {
            if (control.isCurrent()) { const field = owner.fields.get(key); if (field) delete field.recovery.pendingRefresh; onSaved?.(); }
          } else control.finish();
        },
        adapter.unsaved?.runBasicWrite
          ? (task) => adapter.unsaved!.runBasicWrite!(adapter.unsaved!.makeId(adapter.unsaved!.scope, entryId, key), task)
          : undefined,
      );
    },
    [entryId, owner, bizno, onSaved, commonFieldIdForKey, keyToFieldId, adapter],
  );

  const handleBasicUpdate = useCallback(
    async (key: string, newVal: string | number | boolean | null) => {
      if (isNew) { onDraftChange?.(key, newVal); return; } // 신규 등록: 서버 저장 대신 임시 보관
      if (!entryId) return;
      if (!isOwnerLive(owner)) return;
      const acceptedSave = adapter.api.captureOwnFieldSave?.(row) ?? saveOwnField;
      const bridge = adapter.unsaved;
      const unsavedId = bridge?.makeId(bridge.scope, entryId, key);
      const hostRecovery = unsavedId ? bridge?.getBasicRecovery?.(unsavedId) : undefined;
      const recovery = hostRecovery && matchesBasicRecoveryIdentity(hostRecovery, owner.identity) ? hostRecovery : undefined;
      const previous = basicIntentLeases.get(basicFieldQueueKey(entryId, key));
      let field = owner.fields.get(key) ?? (previous?.valid && previous.field && matchesBasicRecoveryIdentity(previous.field.recovery, owner.identity) ? previous.field : undefined);
      if (field) owner.fields.set(key, field);
      if (!field) {
        field = basicFieldIntent();
        owner.fields.set(key, field);
      }
      const intent = field;
      // 이 칸에 저장 중·보관 중인 입력이 없으면 지금 화면 값이 서버가 확인한 값 — 영구 실패 때 되돌릴 기준.
      if (!owner.inherited.has(key) && (!intent.protected || (intent.inflight === 0 && !intent.retained))) {
        if (!intent.refreshed) intent.recovery = recovery ?? { original: basicOriginal(basicRow[key], hasOwnKey(basicRow, key)), sourceIdentity: intent.recovery.sourceIdentity };
        intent.refreshed = false;
      }
      // 지금 Provider가 가진 표 반영 통로가 우선이며, remount로 통로가 없어진 경우 기존 통로를 유지한다.
      const hostApplyToTable = bridge?.applyToTable;
      const applyToTable = hostApplyToTable ? (original: BasicRestoreOriginal) => hostApplyToTable(entryId, key, original) : recovery?.applyToTable;
      if (applyToTable) intent.recovery.applyToTable = applyToTable;
      intent.inflight += 1;
      intent.gen += 1;
      const gen = intent.gen;
      const isLatest = () => intent.gen === gen;
      const acceptedIdentity = basicRecoveryIdentity({ ...row, ...basicRow, [key]: newVal }, ownDomain);
      const recoveryLifetime = beginRecoveryLifetime(intent.recovery, owner.identity);
      intent.recovery.draft = { value: newVal, present: true };
      intent.recovery.sourceIdentity ??= owner.identity;
      intent.recovery.identity = acceptedIdentity;
      const lease = beginBasicIntent(basicFieldQueueKey(entryId, key), acceptedIdentity);
      lease.field = intent;
      let hostLease: { isCurrent: () => boolean; release: () => void } | undefined;
      const hasNewerInput = () => intent.recovery.lifetime !== recoveryLifetime && !!intent.recovery.lifetime?.active;
      const isCurrent = () => (currentIdentityRef.current.entryId !== owner.entryId || matchesBasicRecoveryIdentity(intent.recovery, currentIdentityRef.current.identity))
        && isCurrentBasicIntent(lease) && (hostLease?.isCurrent() ?? true);
      const finish = () => {
        if (intent.recovery.lifetime === recoveryLifetime) owner.inherited.delete(key);
        endRecoveryLifetime(intent.recovery, recoveryLifetime);
        finishBasicIntent(lease);
        hostLease?.release();
        if (isLatest()) { intent.retained = false; intent.protected = false; }
      };
      lease.cancel = () => {
        const currentRecovery = unsavedId ? bridge?.getBasicRecovery?.(unsavedId) : undefined;
        finish();
        if (unsavedId && currentRecovery === intent.recovery) bridge?.resolve(unsavedId);
      };
      intent.protected = true;
      if (unsavedId) hostLease = bridge?.beginBasicEdit?.(unsavedId, finish, intent.recovery);
      if (unsavedId) bridge?.resolve(unsavedId); // 새 입력 수락 즉시 이전 bar/revert를 대체한다. confirmed 기준은 그대로다.
      const restore = (original?: BasicRestoreOriginal) => {
        if (!isCurrent()) return false;
        if (original) { intent.recovery.applyToTable?.(original); intent.recovery.applyToDetail?.(original); }
        finish();
        if (!original || !isOwnerLive(owner) || !isLatest()) return original !== undefined;
        setBasicRow((r) => {
          const next = { ...r };
          if (original.present) next[key] = original.value;
          else delete next[key];
          return next;
        });
        return true;
      };
      const restoreConfirmed = () => restore(intent.recovery.original);
      setBasicRow((r) => ({ ...r, [key]: newVal }));
      const sent = sendBasicField(key, newVal, gen, false, { isCurrent, hasNewerInput, finish }, acceptedSave, acceptedIdentity);
      try {
        await sent.rowDone;
      } catch (e) {
        intent.inflight -= 1;
        // 창구가 닫혔거나 바뀌었다, 또는 그 사이 같은 칸에 새 입력이 들어왔다 —
        // 늦게 도착한 옛 실패는 화면·실패 막대·경고창·지금 값에 아무 영향도 주지 않는다.
        if (!isCurrent()) return;
        flushBasicRefresh(intent.recovery);
        // 서버가 준 사유(예: 'DB 분류' 위들리 잠금 안내)를 그대로 보여준다 — 일반 문구로 뭉개지 않는다.
        const m = e instanceof Error ? e.message : "";
        const kind = saveFailureKindOf(e);
        // 잠깐 실패(배포 교체·통신 끊김)·로그인 만료면 ★값을 지우지 않는다★ — 앱의 저장 실패 막대에 담아
        // 사용자가 '다시 저장'할 수 있게 한다. 지우면 배포 순간에 친 글자가 통째로 사라진다.
        // 다시 저장·되돌리기는 앱에 남은 같은 유효 입력일 때만 한다.
        if (bridge && kind !== "permanent") {
          intent.retained = true;
          const id = bridge.makeId(bridge.scope, entryId, key);
          let retryInFlight = false;
          bridge.report({
            id, scope: bridge.scope, rowId: entryId, fieldKey: key,
            rowLabel: String(row["02상호명"] ?? "") || "이 항목",
            fieldLabel: key, value: newVal,
            error: m || `'${key}' 저장에 실패했습니다.`, kind,
            onDiscard: finish,
            basicRestore: Object.assign(intent.recovery, { apply: restore }),
            retry: async () => {
              if (!isCurrent() || retryInFlight) return false;
              retryInFlight = true;
              // 다시 저장도 행·보관소 기록이 모두 끝날 때까지 이 칸을 보호한다.
              intent.inflight += 1;
              const resent = sendBasicField(key, newVal, gen, true, { isCurrent, hasNewerInput, finish }, acceptedSave, acceptedIdentity);
              try {
                await resent.rowDone;
                await resent.done;
                if (!isCurrent()) return false;
                bridge.resolve(id);
                finish();
                return true;
              } catch (error) {
                if (isCurrent() && saveFailureKindOf(error) === "permanent") {
                  restoreConfirmed();
                  bridge.resolve(id);
                  if (isOwnerLive(owner)) alert(error instanceof Error ? error.message : "저장에 실패했습니다.");
                }
                return false;
              } finally { intent.inflight -= 1; retryInFlight = false; }
            },
            revert: () => { if (restoreConfirmed()) bridge.resolve(id); },
          });
          return;
        }
        // 규칙상 저장할 수 없는 값(권한·잠긴 칸·값 오류)은 다시 시도해도 소용없다 → 되돌리고 사유를 알린다.
        restoreConfirmed();
        if (unsavedId) bridge?.resolve(unsavedId);
        if (isOwnerLive(owner)) alert(m || `'${key}' 저장에 실패했습니다. 다시 시도해 주세요.`);
        return;
      }
      // 행 저장이 끝났다 — 화면은 바로 풀어 주되, 새 행·보관소 읽기로부터의 보호는 보관소 기록까지 끝난 뒤에 푼다.
      void sent.done.then(() => { intent.inflight -= 1; });
    },
    [basicRow, entryId, owner, ownDomain, row, isNew, onDraftChange, sendBasicField, saveOwnField, adapter],
  );

  return (
    <div className="p-4 space-y-4">
      {/* 기본 식별 정보 — 칸을 클릭해 값 입력·수정. 관리자는 우측 "탭 편집"으로 칸 추가·순서·이름·형식·숨김·삭제. */}
      <div className="rounded-xl border border-wedly-bd bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-wedly-bg-gray/50 border-b border-wedly-bd/60 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-wedly-t2">{baseSection.label || "기본정보"}</span>
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <CommonFieldsLauncher
                appSpecificLabels={[...ERP_APP_BASIC_FIELDS.map((f) => f.label), ...addedBasicLabels]}
                ownColumns={pickerOwnColumns}
                reservedLabels={allBasicFields.map((f) => f.label)}
                loadDefs={adapter.api.loadBasicFieldDefs ? () => adapter.api.loadBasicFieldDefs!(ownDomain) : undefined}
                saveDefs={adapter.api.saveBasicFieldDefs ? (fields) => adapter.api.saveBasicFieldDefs!(ownDomain, fields as Array<Record<string, unknown>>) : undefined}
                canManageCommon={adapter.appName === "ERP"}
                onChanged={() => { setDefsReloadKey((k) => k + 1); refreshCommonFieldsOverride().then(setCommonOverride); }}
              />
              <SectionAdminMenu
                sectionId="basic"
                sectionLabel={baseSection.label || "기본정보"}
                onAddColumn={() => setAddOpen(true)}
                onToggleEditMode={toggleEditMode}
                editMode={editMode}
                onShowHiddenColumns={() => { setShowHidden((v) => !v); setEditMode(false); setDeleteMode(false); }}
                hiddenCount={hiddenBasicFields.length}
                onToggleDeleteMode={toggleDeleteMode}
                deleteMode={deleteMode}
                onResetOrder={basicOrder.resetOrder}
                hasCustomOrder={basicOrder.hasCustomOrder}
              />
            </div>
          )}
        </div>

        {/* 숨긴 칸 복원 — 눌러서 다시 표시 */}
        {isAdmin && showHidden && (
          <div className="px-4 py-2.5 bg-wedly-bg-blue/15 border-b border-wedly-bd/60">
            <div className="text-[11px] font-semibold text-wedly-t2 mb-1.5">
              숨긴 칸{hiddenBasicFields.length > 0 ? " — 눌러서 복원" : ""}
            </div>
            {hiddenBasicFields.length === 0 ? (
              <div className="text-[11px] text-wedly-muted">숨긴 칸이 없습니다.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {hiddenBasicFields.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => handleUnhide(f.key)}
                    className="px-2 py-0.5 text-[12px] rounded-md border border-wedly-accent/40 text-wedly-accent-ink hover:bg-wedly-bg-blue/40 transition"
                  >
                    + {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-3 py-1">
          {isAdmin && editMode ? (
            // 수정 모드 — 드래그로 순서 + 이름·형식 변경
            <DraggableFieldsSection<ColumnLite>
              sectionId="basic"
              isAdmin={isAdmin}
              editMode
              orderedFields={groupedFields}
              isOrderLoaded
              draggingKey={basicOrder.draggingKey}
              dragOverKey={basicOrder.dragOverKey}
              handleDragStart={basicOrder.handleDragStart}
              handleDragOver={basicOrder.handleDragOver}
              handleDragLeave={basicOrder.handleDragLeave}
              handleDrop={handleBasicFieldDrop}
              handleDragEnd={basicOrder.handleDragEnd}
              renderRow={(f) => (
                <BasicEditRow
                  field={f}
                  editMode
                  isCustom={isCustomKey(f.key)}
                  onRename={handleRename}
                  onChangeType={handleChangeType}
                  onHide={handleHide}
                  onDelete={handleDelete}
                />
              )}
            />
          ) : isAdmin && deleteMode ? (
            // 삭제 모드 — 숨기기 / (추가 칸)삭제 (드래그 없음)
            <div className="divide-y divide-wedly-bd/60">
              {groupedFields.map((f) => (
                <BasicEditRow
                  key={f.key}
                  field={f}
                  editMode={false}
                  isCustom={isCustomKey(f.key)}
                  onRename={handleRename}
                  onChangeType={handleChangeType}
                  onHide={handleHide}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            // 일반 모드 — 값 입력 (저장된 순서 반영)
            <div>
            <div className="divide-y divide-wedly-bd/60">
              {groupedFields.length === 0 && (
                <div className="py-4 text-center text-[12px] text-wedly-muted">표시할 칸이 없습니다.</div>
              )}
              {groupedFields.filter((f) => !isNew || !NEW_FORM_EXCLUDED_TYPES.has(f.type ?? "")).map((f) => {
                const col: ColumnDef = {
                  key: f.key,
                  label: f.label,
                  type: (f.type ?? "text") as ColumnDef["type"],
                  defaultVisible: true,
                  format: f.format,
                  options: f.options, // 공용 추가 칸의 드롭다운 선택지(셀 편집기 폴백)
                };
                // 파일 칸: 회사 전체 파일을 한곳에 모아 2개 미리보기 + "더 보기" 팝업으로 표시(공용 BasicFilesField).
                // 신규 등록 모드는 아직 항목(저장 대상)이 없어 생략한다.
                if (col.type === "file") {
                  // 신규 등록: 기존 파일 칸은 생략(중복 방지). 첨부는 아래 전용 "리포트" 칸이 담당(NO.56 #2).
                  if (isNew) return null;
                  const r = row as Record<string, unknown>;
                  return (
                    <div key={f.key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 px-1 py-2 sm:py-1.5">
                      <div className="w-full sm:w-[160px] sm:flex-shrink-0 flex items-center gap-1">
                        <BasicScopeBadge label={col.label} override={commonOverride} />
                        <span className={`text-[13px] font-medium sm:font-normal ${isCommonBasicLabel(col.label, commonOverride) ? "text-wedly-accent" : "text-wedly-muted"}`}>{col.label}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <BasicFilesField
                          row={r}
                          detail={detail}
                          adapter={adapter}
                          entryId={String(r["_id"] ?? "")}
                          saveOwnField={saveOwnField}
                          onSaved={onSaved}
                        />
                      </div>
                    </div>
                  );
                }
                return (
                  <EditableFieldRow
                    key={f.key}
                    col={col}
                    value={isNew ? (draft?.[f.key] ?? null) : (basicRow[f.key] ?? null)}
                    onUpdate={handleBasicUpdate}
                    isAdmin={isAdmin}
                    colorCommon
                    commonOverride={commonOverride}
                    loadManagers={loadManagers}
                    isNew={isNew}
                  />
                );
              })}
              {/* 신규 등록 전용 "리포트" 첨부 칸 — 등록 단계에서 바로 파일 첨부(저장 시 함께 등록). NO.56 #2. */}
              {isNew && (
                <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 px-1 py-2 sm:py-1.5">
                  <div className="w-full sm:w-[160px] sm:flex-shrink-0 flex items-center gap-1">
                    <BasicScopeBadge label="리포트" override={commonOverride} />
                    <span className={`text-[13px] font-medium sm:font-normal ${isCommonBasicLabel("리포트", commonOverride) ? "text-wedly-accent" : "text-wedly-muted"}`}>리포트</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <NewEntryReportUpload
                      files={Array.isArray(draft?.["_files"]) ? (draft!["_files"] as DraftFile[]) : []}
                      onChange={(f) => onDraftChange?.("_files", f)}
                    />
                  </div>
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* 기본정보 변경 내역 — 공용 보관함에 기록된 칸 변경(누가·어느 앱·이전→새값) */}
      <div className="rounded-xl border border-wedly-bd/60 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBasicLog((v) => !v)}
          className="w-full px-4 py-2.5 bg-wedly-bg-gray/50 border-b border-wedly-bd/60 flex items-center justify-between gap-2 text-left"
        >
          <span className="text-[12px] font-semibold text-wedly-t2">기본정보 변경 내역</span>
          <span className="text-[11px] text-wedly-muted">{showBasicLog ? "접기" : `펼치기${basicRecord?.log?.length ? ` (${basicRecord.log.length})` : ""}`}</span>
        </button>
        {showBasicLog && (
          <div className="px-3 py-2">
            {!basicRecord?.log?.length ? (
              <div className="py-3 text-center text-[12px] text-wedly-muted">변경 내역이 없습니다.</div>
            ) : (
              <div className="divide-y divide-wedly-bd/40">
                {basicRecord.log.map((e, i) => (
                  <div key={i} className="py-2 flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-wedly-muted">
                      <span>{fmtAt(e.at)}</span>
                      <span className="text-wedly-t2 font-medium">{e.fieldId}</span>
                      <span className="ml-auto">{e.user || "알수없음"} | <span className="text-wedly-accent font-medium">{appLabel(e.app)}</span></span>
                    </div>
                    <div className="text-[12px] text-wedly-t1">
                      <span className="text-wedly-muted line-through">{fmtVal(e.from)}</span>
                      <span className="mx-1.5 text-wedly-muted">→</span>
                      <span className="font-medium">{fmtVal(e.to)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 전체 영역 현황 요약표 — 하이브 UnifiedView 현황표 구조 이식 */}
      <div className="rounded-xl border border-wedly-bd bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-wedly-bg-gray/50 border-b border-wedly-bd/60">
          <span className="text-[12px] font-semibold text-wedly-t2">전체 영역 현황</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-wedly-muted">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            영역 현황 불러오는 중...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[480px]">
              <thead className="text-wedly-tablehead">
                <tr className="border-b border-wedly-bd/60">
                  <th className="px-3 py-2 text-left font-semibold text-wedly-muted">영역</th>
                  <th className="px-3 py-2 text-left font-semibold text-wedly-muted">담당 파트너</th>
                  <th className="px-3 py-2 text-left font-semibold text-wedly-muted">진행상태</th>
                  <th className="px-3 py-2 text-left font-semibold text-wedly-muted">핵심 날짜</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-wedly-bd/50">
                {orderedGroups.map((group) => {
                  const rows = rowsOfGroup(detail, group);
                  const status = firstNonEmpty(rows, (r) => r.status ?? null);
                  const partner = firstNonEmpty(rows, (r) => r.partner ?? null);
                  let keyDate: string | null = null;
                  for (const r of rows) {
                    const d = pickKeyDate(r.row as Record<string, unknown>);
                    if (d) { keyDate = d; break; }
                  }
                  const hasData = rows.length > 0;
                  const isOwn = group.key === ownDomain;

                  return (
                    <tr key={group.key} className="hover:bg-wedly-bg-gray/30">
                      <td className="px-3 py-2.5 font-medium text-wedly-navy">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot status={status} />
                          {group.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-wedly-t1">
                        {partner ?? <span className="text-wedly-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {status ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-wedly-bg-blue text-wedly-accent-ink">
                            {status}
                          </span>
                        ) : (
                          <span className="text-wedly-muted text-[12px]">{hasData ? "—" : "진행 없음"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-wedly-t2 text-[12px] whitespace-nowrap">
                        {fmtDate(keyDate)}
                      </td>
                      <td className="px-3 py-2.5">
                        {hasData ? (
                          <button
                            onClick={() => onOpenTab(group.key)}
                            className="text-[11px] text-wedly-accent hover:underline whitespace-nowrap"
                          >
                            탭 열기
                          </button>
                        ) : isOwn ? (
                          <button
                            onClick={() => onOpenTab(group.key)}
                            className="text-[11px] text-wedly-accent hover:underline whitespace-nowrap"
                          >
                            + 추가
                          </button>
                        ) : (
                          <span className="text-[11px] text-wedly-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 기본정보 칸 추가 모달 */}
      {isAdmin && addOpen && (
        <AddBasicColumnModal onClose={() => setAddOpen(false)} onConfirm={handleAddColumn} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GroupDomainPanel — 분야 그룹 탭 내용 렌더
// 경정청구 그룹: TaxAmendmentPanel(자체 저장소·편집). 그 외 분야: SectionDetailPanel — 분야별 독립
// 정산/미팅/파일/히스토리(고객 기록에 분야 이름표 칸으로 저장). 계약·환불은 준비 중(3b).
// ─────────────────────────────────────────────────────────────────────────────
function GroupDomainPanel({
  group,
  rows,
  primaryRow,
  subTab,
  onSubTabChange,
  onSaved,
  isAdmin = false,
  saveOwnField,
  ownDomain,
  loadColumnConfig,
  saveColumnConfig,
  loadTabConfig,
  saveTabConfig,
  historyApi,
  ownTieredFieldsPath,
  sectionSettlementBase,
  adapter,
}: {
  group: DomainGroup;
  rows: DomainRowLite[];
  primaryRow: RowData;
  subTab: SubTab;
  onSubTabChange: (t: SubTab) => void;
  onSaved?: () => void;
  isAdmin?: boolean;
  saveOwnField: SaveOwnFieldFn;
  ownDomain: string;
  loadColumnConfig: () => Promise<unknown>;
  saveColumnConfig: (cfg: unknown) => Promise<void>;
  loadTabConfig: () => Promise<unknown>;
  saveTabConfig: (cfg: unknown) => Promise<void>;
  historyApi: HistoryPanelApi;
  ownTieredFieldsPath: (kind: "contract" | "refund") => string;
  sectionSettlementBase: string;
  adapter: UnifiedDetailAdapter;
}) {
  // 자기 분야 그룹은 기존 편집 패널(자체 저장소) — 그대로 유지
  if (group.key === ownDomain) {
    if (rows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-1 text-[13px] text-wedly-muted">
          <span>경정청구 데이터가 없습니다.</span>
        </div>
      );
    }
    return (
      <TaxAmendmentPanel
        key={group.key}
        domainRow={rows[0]}
        subTab={subTab}
        onSubTabChange={onSubTabChange}
        onSaved={onSaved}
        isAdmin={isAdmin}
        saveOwnField={saveOwnField}
        loadColumnConfig={loadColumnConfig}
        saveColumnConfig={saveColumnConfig}
        loadTabConfig={loadTabConfig}
        saveTabConfig={saveTabConfig}
        historyApi={historyApi}
        ownTieredFieldsPath={ownTieredFieldsPath}
        adapter={adapter}
      />
    );
  }

  // 어댑터가 이 분야 그룹용 커스텀 패널을 제공하면 그것을 렌더(미제공이면 아래 기본 SectionDetailPanel).
  // 미주입 앱은 기존 동작 그대로(불변).
  const CustomSectionPanel = adapter.components.sectionPanels?.[group.key];
  if (CustomSectionPanel) {
    return (
      <CustomSectionPanel
        key={group.key}
        rows={rows}
        primaryRow={primaryRow as Record<string, unknown>}
        isAdmin={isAdmin}
        onSaved={onSaved}
        adapter={adapter}
        // 어댑터 주입 패널에도 지금 하위 탭을 넘긴다 — 바깥이 탭 줄을 그리는 배치에서 이 둘이 없으면
        // 패널이 클릭을 못 받아 한 탭에 고정된다(ERP NO.190: 정산·환불·미팅 탭이 죽어 있었다).
        // 되돌아오는 값은 캐스트하지 않고 거른다 — 패널이 자기만의 탭 키를 쓰면 공용 상태가 어긋난다.
        subTab={subTab}
        onSubTabChange={(t: string) => { if (isSubTabKey(t)) onSubTabChange(t); }}
      />
    );
  }

  // 그 외 분야: 분야별 독립 상세 패널. 저장은 고객(경정청구) 기록에 분야 이름표 칸으로.
  // 데이터 없는 분야(기업인증·특허)도 동일하게 동작(고객 기록에만 저장).
  const primaryId = String((primaryRow as Record<string, unknown>)["_id"] ?? "");
  return (
    <SectionDetailPanel
      key={group.key}
      sectionKey={group.key}
      primaryId={primaryId}
      primaryRow={primaryRow as Record<string, unknown>}
      subTab={subTab}
      onSubTabChange={onSubTabChange}
      onSaved={onSaved}
      isAdmin={isAdmin}
      saveOwnField={saveOwnField}
      sectionSettlementBase={sectionSettlementBase}
      adapter={adapter}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomDomainPanel — 관리자가 만든 "새 분야" 탭의 내용.
//  · 이 분야의 칸 정의(이름·형식)는 공용 설정의 domainColumns[domainId] 에 보관 → 표에는 나타나지 않는다.
//  · 값은 경정청구 항목(_id)에 칸 키로 저장 — 기본정보 사용자 칸과 동일한 방식(adapter.api.saveOwnField).
//  · 칸 추가·이름변경·형식변경·삭제는 관리자만(공용 config 쓰기는 서버에서 ADMIN 재검증).
// ─────────────────────────────────────────────────────────────────────────────
type DomainField = { key: string; label: string; type: string };

function CustomDomainPanel({
  domainId,
  label,
  row,
  isAdmin = false,
  onSaved,
  saveOwnField,
  loadColumnConfig,
  saveColumnConfig,
  loadManagers,
  adapter,
}: {
  domainId: string;
  label: string;
  row: RowData;
  isAdmin?: boolean;
  onSaved?: () => void;
  saveOwnField: SaveOwnFieldFn;
  loadColumnConfig: () => Promise<unknown>;
  saveColumnConfig: (cfg: unknown) => Promise<void>;
  loadManagers: () => Promise<{ id: string; name: string }[]>;
  adapter: UnifiedDetailAdapter;
}) {
  const entryId = String((row as Record<string, unknown>)["_id"] ?? "");

  // 모든 분야의 칸 정의 묶음 — 어댑터 loadColumnConfig 경유. 저장할 때 다른 분야 칸을 덮어쓰지 않도록 전체를 들고 있다가 통째로 보낸다.
  const [allDomainColumns, setAllDomainColumns] = useState<Record<string, DomainField[]>>({});
  useEffect(() => {
    let cancelled = false;
    loadColumnConfig()
      .then((j) => {
        if (cancelled) return;
        const dc = (j as { data?: { domainColumns?: unknown } })?.data?.domainColumns;
        if (dc && typeof dc === "object" && !Array.isArray(dc)) {
          setAllDomainColumns(dc as Record<string, DomainField[]>);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loadColumnConfig]);

  const fields = useMemo<DomainField[]>(() => {
    const list = allDomainColumns[domainId];
    return Array.isArray(list)
      ? list.filter((f): f is DomainField => !!f && typeof f.key === "string" && typeof f.label === "string")
      : [];
  }, [allDomainColumns, domainId]);

  const saveFields = useCallback((nextFields: DomainField[]) => {
    const nextMap = { ...allDomainColumns, [domainId]: nextFields };
    setAllDomainColumns(nextMap);
    saveColumnConfig({ domainColumns: nextMap }).catch(() => { /* 저장 실패해도 화면 유지 — 다음 열람 때 서버값으로 정렬됨 */ });
  }, [allDomainColumns, domainId, saveColumnConfig]);

  // 값 입력·저장 — 경정청구 항목(_id)에 칸 키로 반영. 같은 row 객체면 입력 중 값 보존.
  const [localRow, setLocalRow] = useState<Record<string, unknown>>(() => ({ ...(row as Record<string, unknown>) }));
  const rowRef = useRef(row);
  useEffect(() => {
    if (rowRef.current !== row) {
      rowRef.current = row;
      setLocalRow({ ...(row as Record<string, unknown>) });
    }
  }, [row]);
  const handleUpdate = useCallback(
    async (key: string, newVal: string | number | boolean | null) => {
      if (!entryId) return;
      const prev = localRow[key];
      setLocalRow((r) => ({ ...r, [key]: newVal }));
      try {
        await saveOwnField(entryId, key, newVal);
        adapter.unsaved?.resolve(adapter.unsaved.makeId(adapter.unsaved.scope, entryId, key));
        onSaved?.();
      } catch (e) {
        // 서버가 준 사유를 그대로 보여준다 — 일반 문구로 뭉개지 않는다.
        const m = e instanceof Error ? e.message : "";
        const kind = saveFailureKindOf(e);
        const bridge = adapter.unsaved;
        // 잠깐 실패(배포 교체·통신 끊김)·로그인 만료면 ★값을 지우지 않는다★ — 앱의 저장 실패 막대에 담는다.
        if (bridge && kind !== "permanent") {
          const id = bridge.makeId(bridge.scope, entryId, key);
          bridge.report({
            id, scope: bridge.scope, rowId: entryId, fieldKey: key,
            rowLabel: String((localRow as Record<string, unknown>)["02상호명"] ?? "") || "이 항목",
            fieldLabel: key, value: newVal,
            error: m || `'${key}' 저장에 실패했습니다.`, kind,
            retry: async () => { try { await saveOwnField(entryId, key, newVal); return true; } catch { return false; } },
            revert: () => setLocalRow((r) => ({ ...r, [key]: prev })),
          });
          return;
        }
        // 규칙상 저장할 수 없는 값은 다시 시도해도 소용없다 → 되돌리고 사유를 알린다.
        setLocalRow((r) => ({ ...r, [key]: prev }));
        alert(m || `'${key}' 저장에 실패했습니다. 다시 시도해 주세요.`);
      }
    },
    [entryId, localRow, onSaved, saveOwnField, adapter],
  );

  // 칸 편집(관리자) — 이름·형식 모드 / 삭제 모드
  const [editMode, setEditMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const handleAddColumn = useCallback((lbl: string, type: string) => {
    // 같은 순간에 두 번 추가해도 겹치지 않도록 항상 임의 꼬리표를 붙여 고유 키를 만든다.
    const key = `dcol_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    saveFields([...fields, { key, label: lbl, type }]);
    setAddOpen(false);
  }, [fields, saveFields]);
  const handleRename = useCallback((key: string, lbl: string) => {
    const next = lbl.trim();
    if (!next) return;
    saveFields(fields.map((f) => (f.key === key ? { ...f, label: next } : f)));
  }, [fields, saveFields]);
  const handleChangeType = useCallback((key: string, type: string) => {
    saveFields(fields.map((f) => (f.key === key ? { ...f, type } : f)));
  }, [fields, saveFields]);
  const handleDelete = useCallback((key: string) => {
    if (!confirm("이 칸을 삭제하시겠습니까? (모든 사용자에게 적용됩니다)")) return;
    saveFields(fields.filter((f) => f.key !== key));
  }, [fields, saveFields]);

  const btnBase = "px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap";
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-wedly-bd bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-wedly-bg-gray/50 border-b border-wedly-bd/60 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-wedly-t2 truncate">{label}</span>
          {isAdmin && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => setAddOpen(true)} className={`${btnBase} border-wedly-accent/50 text-wedly-accent-ink hover:bg-wedly-bg-blue/40`}>＋ 칸 추가</button>
              <button type="button" onClick={() => { setEditMode((v) => !v); setDeleteMode(false); }} className={`${btnBase} ${editMode ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40" : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"}`}>{editMode ? "완료" : "이름·형식"}</button>
              <button type="button" onClick={() => { setDeleteMode((v) => !v); setEditMode(false); }} className={`${btnBase} ${deleteMode ? "border-wedly-red text-wedly-red-ink bg-wedly-bg-red/30" : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"}`}>{deleteMode ? "완료" : "삭제"}</button>
            </div>
          )}
        </div>
        <div className="px-3 py-1">
          {fields.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-wedly-muted">
              {isAdmin ? "‘＋ 칸 추가’로 이 분야의 입력 칸을 만들어 주세요." : "표시할 정보가 없습니다."}
            </div>
          ) : isAdmin && (editMode || deleteMode) ? (
            <div className="divide-y divide-wedly-bd/60">
              {fields.map((f) => (
                <BasicEditRow
                  key={f.key}
                  field={{ key: f.key, label: f.label, type: f.type as ColumnLite["type"] }}
                  editMode={editMode}
                  isCustom
                  onRename={handleRename}
                  onChangeType={handleChangeType}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-wedly-bd/60">
              {fields.map((f) => {
                const col: ColumnDef = {
                  key: f.key,
                  label: f.label,
                  type: (f.type ?? "text") as ColumnDef["type"],
                  defaultVisible: true,
                };
                return (
                  <EditableFieldRow
                    key={f.key}
                    col={col}
                    value={localRow[f.key] ?? null}
                    onUpdate={handleUpdate}
                    isAdmin={isAdmin}
                    loadManagers={loadManagers}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
      {isAdmin && addOpen && (
        <AddBasicColumnModal title={`${label}에 칸 추가`} onClose={() => setAddOpen(false)} onConfirm={handleAddColumn} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function UnifiedDetailView({
  row,
  onClose,
  onSaved,
  onCreated,
  isNew = false,
  adapter,
  initialView,
  extraBasicColumns,
  hiddenColumnKeys,
}: {
  row: RowData;
  onClose: () => void;
  onSaved?: () => void;
  // 신규 등록(isNew) 성공 시 호출 — 전달하면 창을 닫지 않고 부모가 방금 만든 회사의 상세로 이어간다(도메인 탭 항상 활성화).
  // 미전달 시 기존대로 onClose() — 다른 앱 동작 불변(앞호환).
  onCreated?: (newRow: RowData) => void;
  isNew?: boolean;
  adapter: UnifiedDetailAdapter;
  /** "history" 면 열 때 곧장 메인 분야(경정청구 등) 히스토리로 연다(목록 말풍선 클릭). 없으면 기본정보. */
  initialView?: "history";
  /** 표 "컬럼 표시 설정"에서 켠 칸 정의 — 기본정보에도 함께 노출(앱이 주입, 미전달 시 무변화). 하이브 NO.46 ②. */
  extraBasicColumns?: { key: string; label: string; type: ColumnLite["type"]; format?: ColumnLite["format"] }[];
  /** 표 "컬럼 표시 설정"에서 OFF(숨김)한 칸 키 — 기본정보에서 표준 칸 포함 균일 제외(NO.56). */
  hiddenColumnKeys?: string[];
}) {
  const [detail, setDetail] = useState<CustomerDetailLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ★"행이 0건"과 "못 불러왔다"는 다르다 — 못 불러온 상태에서 첫 메모 입력칸이 열리면
  //  거기 저장할 때 새 계약 줄이 생긴다(자료 어긋남). 아래 부품이 이 값을 보고 그 통로를 닫는다.
  const [rowsLoadFailed, setRowsLoadFailed] = useState(false);
  // 말풍선으로 열면(initialView==="history") 메인 분야 탭으로 시작 → 그 안 히스토리 하위탭(기본값)이 바로 보인다.
  const [activeTab, setActiveTab] = useState<TopTab>(
    initialView === "history" ? (adapter.ownDomain as TopTab) : "__basic__",
  );
  const [subTab, setSubTab] = useState<SubTab>("history");
  const [isAdmin, setIsAdmin] = useState(false);
  // 상단 분야 탭 편집(관리자) — 순서·이름 변경. 하위 탭과 같은 설정 row(detail-tab-config:unified-collab) 공유.
  const [topOrder, setTopOrder] = useState<string[]>([]);
  const [topLabels, setTopLabels] = useState<Record<string, string>>({});
  const [topHidden, setTopHidden] = useState<string[]>([]);
  // 관리자가 만든 "새 분야" 탭 목록(id + 처음 이름). 기존 분야와 합쳐 상단 탭으로 표시.
  const [topCustom, setTopCustom] = useState<Array<{ id: string; label: string }>>([]);
  const [topTabEditMode, setTopTabEditMode] = useState(false);

  // 상호명(회사 이름) 인라인 수정 — 사용자가 헤더 제목을 눌러 바로 고친다(보이면 수정 가능). 저장은 상세 항목(_id)에 반영.
  const entryId = String((row as Record<string, unknown>)["_id"] ?? "");
  // 부모 목록 통지는 저장 당시 콜백으로 보낸다. 상세 내부 조회·상태는 현재 회사 소유권에서만 적용한다.
  const detailKey = customerKeyFromTaxRow(row, adapter.ownDomain);
  const detailOwner = useMemo(() => ({ entryId, key: detailKey, adapter }), [entryId, detailKey, adapter]);
  const detailOwnerRef = useRef(detailOwner);
  detailOwnerRef.current = detailOwner;
  const [detailStateOwner, setDetailStateOwner] = useState(detailOwner);
  if (detailStateOwner !== detailOwner) {
    // 회사가 바뀐 첫 렌더부터 옛 자료와 편집 대상을 내보내지 않는다(effect까지 기다리지 않는다).
    setDetailStateOwner(detailOwner);
    setDetail(null);
    setLoading(!isNew);
    setError(null);
    setRowsLoadFailed(false);
  }
  const detailRequestRef = useRef(0);
  const [nameValue, setNameValue] = useState(() => String(row["02상호명"] ?? ""));
  // ── 신규 등록 모드 상태 (isNew 일 때만 사용) ──
  // NO.56: 신규 등록은 어떤 칸도 자동 선택값을 넣지 않는다(영업담당 "하이브" 하드코딩 제거 — 안 골라도 저장되던 버그).
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ "02상호명": String(row["02상호명"] ?? "") }));
  const [pendingComments, setPendingComments] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; detailRequestRef.current += 1; };
  }, []);
  const company = nameValue.trim() || "통합 보기";
  const saveName = useCallback(async (v: string) => {
    const orig = String(row["02상호명"] ?? "");
    const next = v.trim();
    if (!next || next === orig) { setNameValue(orig); return; }
    setNameValue(next);
    try {
      await adapter.api.saveOwnField(entryId, "02상호명", next);
      adapter.unsaved?.resolve(adapter.unsaved.makeId(adapter.unsaved.scope, entryId, "02상호명"));
      onSaved?.();
    } catch (e) {
      const kind = saveFailureKindOf(e);
      const bridge = adapter.unsaved;
      const m = e instanceof Error ? e.message : "";
      // 잠깐 실패·로그인 만료면 친 이름을 지우지 않고 앱의 저장 실패 막대에 담는다.
      if (bridge && kind !== "permanent") {
        const id = bridge.makeId(bridge.scope, entryId, "02상호명");
        bridge.report({
          id, scope: bridge.scope, rowId: entryId, fieldKey: "02상호명",
          rowLabel: orig || "이 항목", fieldLabel: "상호명", value: next,
          error: m || "상호명을 저장하지 못했습니다.", kind,
          retry: async () => {
            try { await adapter.api.saveOwnField(entryId, "02상호명", next); return true; } catch { return false; }
          },
          revert: () => { if (mountedRef.current) setNameValue(orig); },
        });
        return;
      }
      // 창이 이미 닫혔으면 안내·상태변경 생략 — 닫힌 뒤 경고창이 뜨는 문제 방지.
      if (mountedRef.current) {
        setNameValue(orig);
        alert(m || "상호명 저장에 실패했습니다. 다시 시도해 주세요.");
      }
    }
  }, [entryId, onSaved, row, adapter]);

  // 운영자 여부 — 운영자면 차수 카드·세부섹션 편집 UI 노출 (일반 사용자는 읽기/값 입력만)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.role === "ADMIN") setIsAdmin(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // HistoryPanel에 주입할 API 객체 — adapter.api.loadComments/addComment/uploadImage 위임.
  const historyApi = useMemo<HistoryPanelApi>(() => ({
    loadComments: (id) => adapter.api.loadComments(id),
    addComment: (id, body) => adapter.api.addComment(id, body),
    uploadImage: (file) => adapter.api.uploadImage(file),
    // ★어댑터가 실었을 때만 넘긴다. 여기서 빠뜨리면 「카톡 보고」가 늘 기계글만 낸다 —
    //  배선이 네 자리(앱 어댑터 → 여기 → HistoryPanel 래퍼 → 공용 패널)라 한 곳만 새도 조용히 죽는다.
    ...(adapter.api.buildKakaoReport
      ? { buildKakaoReport: (id: string, commentId: string) => adapter.api.buildKakaoReport!(id, commentId) }
      : {}),
  }), [adapter]);

  // 데이터 패치 — 처음 1회는 스피너와 함께, 저장 후 새로고침은 조용히(silent: 스피너 없이)
  // 비동기 로드는 adapter.api.loadDomainRows 경유(ERP 전용 경로 캡슐화).
  // 동기 캐시 읽기는 adapter.api.getCachedDomainRows 경유 — ERP 전용 캐시 모듈 직접 의존 제거.
  const loadDetail = useCallback((silent = false) => {
    if (!mountedRef.current || detailOwnerRef.current !== detailOwner) return;
    const key = detailOwner.key;
    const request = ++detailRequestRef.current;
    const isCurrent = () => mountedRef.current && detailOwnerRef.current === detailOwner && detailRequestRef.current === request;
    if (!silent) {
      // 표에서 미리 받아둔 분야 현황이 있으면 즉시 표시(불러오는 중 없이), 없으면 로딩 표시.
      const cached = adapter.api.getCachedDomainRows(key);
      if (cached) {
        setDetail(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
    }
    adapter.api.loadDomainRows(key)
      .then((data) => {
        if (!isCurrent()) return;
        setDetail(data);
        setRowsLoadFailed(false);
        setError(null);
        setLoading(false);
      })
      .catch(() => {
        if (!isCurrent()) return;
        // 조용한 새로고침이어도 "못 불러왔다"는 기억한다 — 이후 판정이 이 값을 본다.
        setRowsLoadFailed(true);
        setLoading(false);
        if (!silent) {
          setError("정보를 불러오지 못했습니다. 다시 시도해 주세요.");
        }
      });
  }, [adapter, detailOwner]);

  const loadDetailRef = useRef(loadDetail);
  loadDetailRef.current = loadDetail;
  useEffect(() => {
    if (isNew) { setLoading(false); return; } // 신규 등록은 불러올 기존 데이터가 없음
    loadDetailRef.current(false);
    // 행 객체만 바뀐 조회는 반복하지 않고, 실제 조회키(연락처 fallback 포함)·항목·어댑터가 바뀔 때 다시 읽는다.
  }, [detailOwner, isNew]);

  // 어떤 칸이든 저장되면: 모달의 분야 데이터(detail)를 조용히 새로고침
  //  → '전체 영역 현황' 요약표·상단 상태점·분야 탭 값이 그 자리에서 바로 반영된다.
  //  + 뒤에 있는 목록 표도 새로고침(onSaved)하여 표↔상세창이 어긋나지 않게 한다.
  const handleSaved = useCallback(() => {
    if (mountedRef.current && detailOwnerRef.current === detailOwner) loadDetail(true);
    onSaved?.();
  }, [detailOwner, loadDetail, onSaved]);

  // ── 신규 등록: 입력값(draft) 전체를 한 번에 POST. adapter.api.createEntry 경유(ERP 전용 경로 캡슐화). ──
  // 성공 후 히스토리 임시 메모 등록은 adapter.api.addComment + auth/me(공용) 경유.
  const handleCreate = useCallback(async () => {
    if (creating) return;
    const name = String(draft["02상호명"] ?? "").trim();
    if (!name) { setCreateErr("상호명을 입력해 주세요."); return; }
    setCreating(true);
    setCreateErr(null);
    try {
      const { id: newId } = await adapter.api.createEntry({ ...draft, "02상호명": name });
      if (newId && pendingComments.length > 0) {
        const me = await adapter.api.currentUser();
        const userName = String(me?.name ?? me?.email ?? "사용자");
        for (const text of pendingComments) {
          if (!text.trim()) continue;
          await adapter.api.addComment(newId, { action: "append", comment: { text, name: userName } }).catch(() => {});
        }
      }
      onSaved?.();
      const newRow = { ...draft, "02상호명": name, _id: newId } as RowData;
      // onCreated 부모가 이 등록 화면을 언마운트하지 않는 경우에도 "등록 중…"으로 잠기지 않게 해제.
      setCreating(false);
      if (onCreated) onCreated(newRow);
      else onClose();
    } catch {
      setCreating(false);
      setCreateErr("등록에 실패했습니다. 다시 시도해 주세요.");
    }
  }, [creating, draft, pendingComments, onSaved, onClose, onCreated, adapter]);

  // 상단 분야 탭 — 저장된 순서·이름 불러오기(adapter.api.loadTabConfig 경유)
  useEffect(() => {
    let cancelled = false;
    adapter.api.loadTabConfig()
      .then((j) => {
        const d = (j as { data?: unknown })?.data;
        if (cancelled || !d || typeof d !== "object") return;
        const data = d as Record<string, unknown>;
        if (Array.isArray(data.topOrder)) {
          setTopOrder(data.topOrder.filter((k: unknown): k is string => typeof k === "string"));
        }
        if (data.topLabels && typeof data.topLabels === "object" && !Array.isArray(data.topLabels)) {
          setTopLabels(data.topLabels as Record<string, string>);
        }
        if (Array.isArray(data.topHidden)) {
          setTopHidden(data.topHidden.filter((k: unknown): k is string => typeof k === "string"));
        }
        if (Array.isArray(data.topCustom)) {
          setTopCustom(
            data.topCustom.filter(
              (c: unknown): c is { id: string; label: string } =>
                !!c && typeof (c as { id?: unknown }).id === "string" && typeof (c as { label?: unknown }).label === "string",
            ),
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [adapter]);

  const saveTopTabConfig = useCallback((bodyObj: Record<string, unknown>) => {
    adapter.api.saveTabConfig(bodyObj).catch(() => { /* 저장 실패해도 화면 유지 — 다음 열람 때 서버값으로 정렬 */ });
  }, [adapter]);

  // 관리자가 만든 새 분야 → 기존 분야와 같은 모양(DomainGroup)으로 변환(데이터 영역은 없음).
  const customGroups = useMemo<DomainGroup[]>(
    () => topCustom.map((c) => ({ key: c.id, label: c.label, domains: [] }) as DomainGroup),
    [topCustom],
  );
  const customIdSet = useMemo(() => new Set(topCustom.map((c) => c.id)), [topCustom]);
  const allGroups = useMemo(() => [...DOMAIN_GROUPS, ...customGroups], [customGroups]);
  // 저장된 순서·이름을 적용한 표시용 분야 탭 목록(기본정보는 별도 고정이라 제외)
  const orderedGroups = useMemo(() => applyTabConfig(allGroups, topOrder, topLabels), [allGroups, topOrder, topLabels]);
  // 숨긴 분야를 뺀 실제 노출 목록(편집 모드에서는 숨긴 것도 보여줘 다시 켤 수 있게 함)
  const visibleGroups = useMemo(() => orderedGroups.filter((g) => !topHidden.includes(g.key)), [orderedGroups, topHidden]);

  const moveTopTab = useCallback((idx: number, dir: -1 | 1) => {
    const keys = orderedGroups.map((g) => g.key);
    const j = idx + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[idx], keys[j]] = [keys[j], keys[idx]];
    setTopOrder(keys);
    saveTopTabConfig({ op: "order", which: "top", order: keys });
  }, [orderedGroups, saveTopTabConfig]);

  // 분야 탭 숨김/보임 토글
  const toggleHideTopTab = useCallback((key: string) => {
    setTopHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveTopTabConfig({ op: "hidden", which: "top", hidden: next });
      return next;
    });
  }, [saveTopTabConfig]);

  // 상단 탭 초기화 — 상단 순서·이름·숨김만 되돌린다(하위 탭 설정은 보존). 서버에서 한 번에 처리(원자적).
  const resetTopTabs = useCallback(() => {
    setTopOrder([]);
    setTopLabels({});
    setTopHidden([]);
    setTopTabEditMode(false);
    saveTopTabConfig({ op: "reset", which: "top" });
  }, [saveTopTabConfig]);

  // 새 분야 탭 추가(관리자) — 빈 분야를 만든다. 이름은 편집 모드에서 인라인으로 바꾼다(기존 분야 이름변경과 동일).
  const addCustomDomain = useCallback(() => {
    // 같은 순간에 두 번 눌러도 겹치지 않도록 임의 꼬리표를 붙여 고유 id 를 만든다.
    const id = `dgrp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const label = "새 분야";
    setTopCustom((prev) => [...prev, { id, label }]);
    saveTopTabConfig({ op: "addTop", id, label });
  }, [saveTopTabConfig]);

  // 새 분야 탭 삭제(관리자) — 관리자가 만든 분야만 삭제 가능. 순서·이름·숨김에서도 정리하고, 보던 탭이면 기본정보로 이동.
  const removeCustomDomain = useCallback((id: string) => {
    if (!confirm("이 분야 탭을 삭제하시겠습니까? (모든 사용자에게 적용됩니다)")) return;
    setTopCustom((prev) => prev.filter((c) => c.id !== id));
    setTopOrder((prev) => prev.filter((k) => k !== id));
    setTopLabels((prev) => { const nx = { ...prev }; delete nx[id]; return nx; });
    setTopHidden((prev) => prev.filter((k) => k !== id));
    setActiveTab((cur) => (cur === id ? "__basic__" : cur));
    saveTopTabConfig({ op: "removeTop", id });
  }, [saveTopTabConfig]);

  // 탭 이동 핸들러 (현황표 "탭 열기" 버튼에서 호출)
  const openGroupTab = useCallback((groupKey: string) => {
    setActiveTab(groupKey);
  }, []);

  // 현재 그룹 탭에 해당하는 도메인 행들
  const currentGroup = orderedGroups.find((g) => g.key === activeTab) ?? null;
  const currentRows = currentGroup ? rowsOfGroup(detail, currentGroup) : [];

  // 창을 닫기 직전, 입력 중이던 칸의 포커스를 풀어 그 칸의 자동 저장(포커스가 빠질 때 실행)이
  // 먼저 일어나게 한다. 바깥 어두운 영역이나 ✕ 클릭은 칸의 포커스를 자동으로 풀어주지 않는
  // 브라우저가 있어, 이 처리가 없으면 방금 입력한 값이 저장되지 못한 채 창이 닫혀 값이 사라진다.
  const handleClose = async () => {
    const active = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    if (active && typeof active.blur === "function" && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      active.blur();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    onClose();
  };

  // ── 신규 등록 모드 — 별도 렌더(기존 상세창 경로는 건드리지 않아 회귀 없음) ──
  if (isNew) {
    const newName = String(draft["02상호명"] ?? "");
    const onHistoryTab = activeTab === "__history__";
    return (
      <FieldOptionsProvider value={adapter.fieldOptions}>
      <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div
          className="relative bg-white shadow-2xl w-full h-full sm:w-[90vw] sm:h-auto sm:max-w-[800px] sm:max-h-[92vh] flex flex-col rounded-none sm:rounded-2xl overflow-hidden animate-modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="border-b border-wedly-bd/60 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-wedly-navy flex items-center justify-center text-white text-base font-bold flex-shrink-0">＋</div>
              <span className="text-[15px] font-bold text-wedly-navy">새 업체 등록</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-wedly-navy px-4 py-2 text-sm font-semibold text-white hover:bg-wedly-navy/90 disabled:opacity-40"
              >
                {creating ? "등록 중…" : "등록"}
              </button>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-wedly-bg-gray text-wedly-t2 hover:text-wedly-t2 transition-colors flex-shrink-0"
                aria-label="닫기"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* 상호명(필수) */}
          <div className="px-3 sm:px-6 py-3 border-b border-wedly-bd/60 flex-shrink-0">
            <label className="mb-1 block text-[12px] font-medium text-wedly-t2">
              상호명 <span className="text-wedly-red">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setDraft((d) => ({ ...d, "02상호명": e.target.value }))}
              placeholder="상호명을 입력하세요"
              autoFocus
              className="w-full rounded-lg border border-wedly-bd px-3 py-2 text-sm focus:border-wedly-accent focus:outline-none"
            />
            {createErr && <p className="mt-2 text-[13px] font-medium text-wedly-red">{createErr}</p>}
          </div>

          {/* 탭바 — 기본정보 / 히스토리 */}
          <div className="flex items-center gap-1 bg-wedly-bg-gray/50 border-b border-wedly-bd/60 flex-shrink-0 px-3 sm:px-6 py-2">
            <button
              onClick={() => setActiveTab("__basic__")}
              className={`px-3 py-1.5 rounded-full text-[14px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors ${
                !onHistoryTab ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
              }`}
            >
              기본정보
            </button>
            <button
              onClick={() => setActiveTab("__history__")}
              className={`px-3 py-1.5 rounded-full text-[14px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors ${
                onHistoryTab ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
              }`}
            >
              히스토리
            </button>
          </div>

          {/* 본문 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!onHistoryTab ? (
              <BasicInfoPanel
                row={row}
                detail={null}
                loading={false}
                onOpenTab={() => {}}
                onSaved={() => {}}
                isAdmin={isAdmin}
                orderedGroups={[]}
                isNew
                draft={draft}
                extraBasicColumns={extraBasicColumns}
                hiddenColumnKeys={hiddenColumnKeys}
                onDraftChange={(key, val) => setDraft((d) => ({ ...d, [key]: val }))}
                saveOwnField={adapter.api.saveOwnField}
                ownDomain={adapter.ownDomain}
                loadColumnConfig={adapter.api.loadColumnConfig}
                saveColumnConfig={adapter.api.saveColumnConfig}
                loadManagers={adapter.api.loadManagers}
                adapter={adapter}
              />
            ) : (
              <div className="p-4 space-y-2">
                <textarea
                  placeholder="등록과 함께 남길 히스토리 메모 (선택) — Enter 로 추가"
                  rows={3}
                  className="w-full rounded-lg border border-wedly-bd px-3 py-2 text-sm focus:border-wedly-accent focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const t = e.currentTarget;
                      const v = t.value.trim();
                      if (v) { setPendingComments((p) => [...p, v]); t.value = ""; }
                    }
                  }}
                />
                <div className="text-[11px] text-wedly-muted">저장 시 함께 등록됩니다</div>
                {pendingComments.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-wedly-bd/60 px-3 py-2 text-sm text-wedly-t1">
                    <span className="flex-1 whitespace-pre-wrap">{c}</span>
                    <button
                      onClick={() => setPendingComments((p) => p.filter((_, j) => j !== i))}
                      className="text-[12px] text-wedly-muted hover:text-wedly-red flex-shrink-0"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </FieldOptionsProvider>
    );
  }

  // ── 렌더 ──
  return (
    <DetailLoadStateProvider rowsLoadFailed={rowsLoadFailed}>
    <FieldOptionsProvider value={adapter.fieldOptions}>
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center"
      onClick={handleClose}
    >
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      <div
        className="relative bg-white shadow-2xl w-full h-full sm:w-[90vw] sm:h-auto sm:max-w-[800px] sm:max-h-[92vh] flex flex-col rounded-none sm:rounded-2xl overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="border-b border-wedly-bd/60 px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-wedly-navy flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {company.charAt(0) || "G"}
            </div>
            <EditableTitle
              value={nameValue}
              placeholder="통합 보기"
              onSave={(v) => saveName(v)}
            />
            {loading && (
              <span className="text-[11px] text-wedly-accent animate-pulse flex-shrink-0">불러오는 중...</span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-wedly-bg-gray text-wedly-t2 hover:text-wedly-t2 transition-colors flex-shrink-0"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── 윗줄 탭 바 (기본정보 고정 + 분야 그룹) + 관리자 '탭 편집'(사용자 요청대로 이 줄에 위치) ── */}
        <div className="flex items-center gap-1 bg-wedly-bg-gray/50 border-b border-wedly-bd/60 flex-shrink-0 px-3 sm:px-6 py-2">
          <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">
            {/* 기본정보 탭 — 맨 앞 고정(편집 대상 아님) */}
            <button
              onClick={() => setActiveTab("__basic__")}
              className={`px-3 py-1.5 rounded-full text-[14px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors flex-shrink-0 ${
                activeTab === "__basic__"
                  ? "bg-wedly-bg-blue text-wedly-accent-ink"
                  : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
              }`}
            >
              기본정보
            </button>

            {/* 분야 그룹 탭 — 저장된 순서·이름 반영. 관리자 편집 모드면 순서(◀▶)·이름 변경. */}
            {(isAdmin && topTabEditMode ? orderedGroups : visibleGroups).map((group, gi) => {
              const rows = rowsOfGroup(detail, group);
              const status = firstNonEmpty(rows, (r) => r.status ?? null);
              const hasData = rows.length > 0;
              const active = activeTab === group.key;
              if (isAdmin && topTabEditMode) {
                const hidden = topHidden.includes(group.key);
                return (
                  <div key={group.key} className={`flex items-center gap-0.5 bg-white border rounded-full pl-1 pr-1.5 py-0.5 flex-shrink-0 ${hidden ? "border-wedly-bd/40 opacity-50" : "border-wedly-bd"}`}>
                    <button type="button" onClick={() => moveTopTab(gi, -1)} disabled={gi === 0} title="왼쪽으로" className="px-1 text-[12px] text-wedly-muted disabled:opacity-30 hover:text-wedly-accent">◀</button>
                    <input
                      value={topLabels[group.key] ?? group.label}
                      onChange={(e) => setTopLabels((prev) => ({ ...prev, [group.key]: e.target.value }))}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        setTopLabels((prev) => { const nx = { ...prev }; if (v) nx[group.key] = v; else delete nx[group.key]; return nx; });
                        saveTopTabConfig({ op: "label", which: "top", id: group.key, label: v });
                      }}
                      title="이름 변경"
                      className="w-[72px] text-[13px] font-semibold text-wedly-t1 bg-transparent outline-none text-center"
                    />
                    <button type="button" onClick={() => moveTopTab(gi, 1)} disabled={gi === orderedGroups.length - 1} title="오른쪽으로" className="px-1 text-[12px] text-wedly-muted disabled:opacity-30 hover:text-wedly-accent">▶</button>
                    <button type="button" onClick={() => toggleHideTopTab(group.key)} title={hidden ? "다시 보이기" : "이 탭 숨기기"} className="ml-0.5 pl-1 text-[11px] text-wedly-muted hover:text-wedly-accent border-l border-wedly-bd/60 whitespace-nowrap">{hidden ? "보임" : "숨김"}</button>
                    {customIdSet.has(group.key) && (
                      <button type="button" onClick={() => removeCustomDomain(group.key)} title="이 분야 삭제" className="ml-0.5 pl-1 text-[11px] text-wedly-red hover:text-wedly-red/80 border-l border-wedly-bd/60 whitespace-nowrap">삭제</button>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={group.key}
                  onClick={() => setActiveTab(group.key)}
                  className={`px-3 py-1.5 rounded-full text-[14px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5 flex-shrink-0 ${
                    active
                      ? "bg-wedly-bg-blue text-wedly-accent-ink"
                      : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
                  }`}
                >
                  <StatusDot status={hasData ? status : undefined} />
                  {group.label}
                </button>
              );
            })}

            {/* 새 분야 추가 — 편집 모드에서만. 누르면 빈 분야가 생기고, 이름은 바로 옆 입력칸에서 바꾼다. */}
            {isAdmin && topTabEditMode && (
              <button
                type="button"
                onClick={addCustomDomain}
                title="새 분야 탭 추가"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold whitespace-nowrap border border-dashed border-wedly-accent/50 text-wedly-accent-ink hover:bg-wedly-bg-blue/40 transition-colors flex-shrink-0"
              >
                ＋ 새 분야
              </button>
            )}
          </div>

          {/* 관리자 — '탭 편집'(분야 탭 순서·이름). 탭 줄 오른쪽에 위치. */}
          {isAdmin && (
            <div className="flex-shrink-0 flex items-center gap-1 ml-2">
              {topTabEditMode && (
                <button type="button" onClick={resetTopTabs} className="px-2 py-1 text-[11px] rounded-md border border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1 transition-colors whitespace-nowrap">초기화</button>
              )}
              <button
                type="button"
                onClick={() => setTopTabEditMode((v) => !v)}
                title="탭 편집 — 분야 탭 순서·이름 변경"
                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap ${
                  topTabEditMode
                    ? "border-wedly-accent text-wedly-accent-ink bg-wedly-bg-blue/40"
                    : "border-wedly-bd text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 2L14 4.5L5.5 13L2 14L3 10.5L11.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                {topTabEditMode ? "완료" : "탭 편집"}
              </button>
            </div>
          )}
        </div>

        {/* ── 본문 ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* 오류 */}
          {error && (
            <div className="p-6">
              <div className="rounded-xl border border-wedly-bd-red bg-wedly-bg-red px-4 py-3 text-[13px] text-wedly-red-ink">
                {error}
                <div className="mt-3 border-t border-wedly-bd-red/60 pt-3 text-wedly-t2">
                  <span className="font-medium">경정청구 기본 정보:</span> {company}
                </div>
              </div>
            </div>
          )}

          {/* 기본정보 탭 */}
          {!error && activeTab === "__basic__" && (
            <BasicInfoPanel
              row={row}
              detail={detail}
              loading={loading}
              onOpenTab={openGroupTab}
              onSaved={handleSaved}
              isAdmin={isAdmin}
              orderedGroups={orderedGroups}
              extraBasicColumns={extraBasicColumns}
              hiddenColumnKeys={hiddenColumnKeys}
              saveOwnField={adapter.api.saveOwnField}
              ownDomain={adapter.ownDomain}
              loadColumnConfig={adapter.api.loadColumnConfig}
              saveColumnConfig={adapter.api.saveColumnConfig}
              loadManagers={adapter.api.loadManagers}
              adapter={adapter}
            />
          )}

          {/* 새 분야 탭(관리자가 만든 분야) — 칸 추가·값 입력 패널. 분야 데이터 로딩과 무관하게 바로 표시. */}
          {!error && activeTab !== "__basic__" && customIdSet.has(activeTab) && currentGroup && (
            <div className="flex flex-col h-full">
              <CustomDomainPanel
                key={activeTab}
                domainId={activeTab}
                label={currentGroup.label}
                row={row}
                isAdmin={isAdmin}
                onSaved={handleSaved}
                saveOwnField={adapter.api.saveOwnField}
                loadColumnConfig={adapter.api.loadColumnConfig}
                saveColumnConfig={adapter.api.saveColumnConfig}
                loadManagers={adapter.api.loadManagers}
                adapter={adapter}
              />
            </div>
          )}

          {/* 기존 분야 그룹 탭 */}
          {!error && activeTab !== "__basic__" && !customIdSet.has(activeTab) && (
            <>
              {loading && <Spinner />}
              {!loading && currentGroup && (
                <div className="flex flex-col h-full">
                  <GroupDomainPanel
                    group={currentGroup}
                    rows={currentRows}
                    primaryRow={row}
                    subTab={subTab}
                    onSubTabChange={setSubTab}
                    onSaved={handleSaved}
                    isAdmin={isAdmin}
                    saveOwnField={adapter.api.saveOwnField}
                    ownDomain={adapter.ownDomain}
                    loadColumnConfig={adapter.api.loadColumnConfig}
                    saveColumnConfig={adapter.api.saveColumnConfig}
                    loadTabConfig={adapter.api.loadTabConfig}
                    saveTabConfig={adapter.api.saveTabConfig}
                    historyApi={historyApi}
                    ownTieredFieldsPath={adapter.ownTieredFieldsPath}
                    sectionSettlementBase={adapter.sectionSettlementBase}
                    adapter={adapter}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </FieldOptionsProvider>
    </DetailLoadStateProvider>
  );
}
