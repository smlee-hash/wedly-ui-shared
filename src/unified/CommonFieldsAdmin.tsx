"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_COMMON_BASIC_LABELS,
  isCommonBasicLabel,
  PROTECTED_FROM_HIDE,
  type CommonFieldOverride,
} from "./sections";
import { fetchCommonFieldsOverride, saveCommonFieldsOverride } from "../lib/common-fields-store";
import { fetchHiddenBasicColumns, saveHiddenBasicColumns } from "../lib/column-visibility-store";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const isProtected = (label: string) => PROTECTED_FROM_HIDE.some((p) => norm(p) === norm(label));

function Row({ label, common, hidden, busy, hideLocked, onToggleCommon, onToggleHidden }: {
  label: string;
  common: boolean;
  hidden: boolean;
  busy: boolean;
  hideLocked: boolean;
  onToggleCommon: (makeCommon: boolean) => void;
  onToggleHidden: (makeHidden: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-wedly-bd/60 px-3 py-2.5">
      <span className="text-[14px] text-wedly-t1">{label}</span>
      <div className="flex items-center gap-4">
        {/* 공통/앱별 (3앱 공통) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-wedly-muted">3앱 공통</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onToggleCommon(!common)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${common ? "bg-wedly-accent" : "bg-wedly-bg-gray"}`}
            aria-pressed={common}
            title={common ? "공통 (3앱 값 공유)" : "앱별 (각 앱 따로)"}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${common ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {/* 이 앱에서 숨김 (이 앱만) */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-wedly-muted">이 앱만 숨김</span>
          <button
            type="button"
            disabled={busy || hideLocked}
            onClick={() => onToggleHidden(!hidden)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${hidden ? "bg-wedly-red" : "bg-wedly-bg-gray"}`}
            aria-pressed={hidden}
            title={hideLocked ? "이 칸은 숨길 수 없습니다" : hidden ? "이 앱에서 숨김" : "이 앱에서 보임"}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${hidden ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CommonFieldsAdmin({ appSpecificLabels = [] }: { appSpecificLabels?: string[] }) {
  const [override, setOverride] = useState<CommonFieldOverride>({ extra: [], excluded: [] });
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchCommonFieldsOverride(), fetchHiddenBasicColumns()]).then(([o, h]) => {
      setOverride(o); setHidden(h); setLoading(false);
    });
  }, []);

  const toggleCommon = async (label: string, makeCommon: boolean) => {
    const isDefault = DEFAULT_COMMON_BASIC_LABELS.some((d) => norm(d) === norm(label));
    const extra = (override.extra || []).filter((x) => norm(x) !== norm(label));
    const excluded = (override.excluded || []).filter((x) => norm(x) !== norm(label));
    if (isDefault) { if (!makeCommon) excluded.push(label); }
    else { if (makeCommon) extra.push(label); }
    setSaving(true);
    const saved = await saveCommonFieldsOverride({ extra, excluded });
    setOverride(saved);
    setSaving(false);
  };

  const toggleHidden = async (label: string, makeHidden: boolean) => {
    if (isProtected(label)) return;
    const next = hidden.filter((x) => norm(x) !== norm(label));
    if (makeHidden) next.push(label);
    setSaving(true);
    const saved = await saveHiddenBasicColumns(next);
    setHidden(saved);
    setSaving(false);
  };

  const isHidden = (label: string) => hidden.some((h) => norm(h) === norm(label));

  if (loading) return <div className="text-[14px] text-wedly-muted">불러오는 중…</div>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-wedly-t1">기본 공통 칸</h3>
        <p className="text-[12px] text-wedly-muted">
          <b>3앱 공통</b>을 끄면 이 칸은 앱별(각 앱 따로)이 됩니다. <b>이 앱만 숨김</b>을 켜면 이 앱의 표·상세창에서만 사라집니다(다른 앱·데이터엔 영향 없음).
        </p>
        <div className="space-y-2">
          {DEFAULT_COMMON_BASIC_LABELS.map((label) => (
            <Row
              key={label}
              label={label}
              common={isCommonBasicLabel(label, override)}
              hidden={isHidden(label)}
              busy={saving}
              hideLocked={isProtected(label)}
              onToggleCommon={(mk) => toggleCommon(label, mk)}
              onToggleHidden={(mk) => toggleHidden(label, mk)}
            />
          ))}
        </div>
      </section>

      {appSpecificLabels.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[14px] font-semibold text-wedly-t1">이 앱 전용 칸</h3>
          <p className="text-[12px] text-wedly-muted">3앱 공통을 켜면 공통이 됩니다(다른 앱에도 있어야 값이 함께 맞춰짐). 이 앱만 숨김으로 이 앱에서 감출 수 있습니다.</p>
          <div className="space-y-2">
            {appSpecificLabels.map((label) => (
              <Row
                key={label}
                label={label}
                common={isCommonBasicLabel(label, override)}
                hidden={isHidden(label)}
                busy={saving}
                hideLocked={isProtected(label)}
                onToggleCommon={(mk) => toggleCommon(label, mk)}
                onToggleHidden={(mk) => toggleHidden(label, mk)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
