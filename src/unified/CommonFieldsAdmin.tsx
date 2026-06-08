"use client";
import { useEffect, useState } from "react";
import {
  DEFAULT_COMMON_BASIC_LABELS,
  isCommonBasicLabel,
  type CommonFieldOverride,
} from "./sections";
import { fetchCommonFieldsOverride, saveCommonFieldsOverride } from "../lib/common-fields-store";

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function Row({ label, common, disabled, onToggle }: {
  label: string; common: boolean; disabled: boolean; onToggle: (makeCommon: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-wedly-bd/60 px-3 py-2.5">
      <span className="text-[14px] text-wedly-t1">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(!common)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          common ? "bg-wedly-accent" : "bg-wedly-bg-gray"
        }`}
        aria-pressed={common}
        title={common ? "공통 (3앱 공유)" : "앱별 (각 앱 따로)"}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${common ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

export function CommonFieldsAdmin({ appSpecificLabels = [] }: { appSpecificLabels?: string[] }) {
  const [override, setOverride] = useState<CommonFieldOverride>({ extra: [], excluded: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCommonFieldsOverride().then((o) => { setOverride(o); setLoading(false); });
  }, []);

  const toggle = async (label: string, makeCommon: boolean) => {
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

  if (loading) return <div className="text-[14px] text-wedly-muted">불러오는 중…</div>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-wedly-t1">기본 공통 칸</h3>
        <p className="text-[12px] text-wedly-muted">끄면 이 칸은 앱별(각 앱 따로)이 됩니다. 이미 쌓인 공유값은 지워지지 않습니다.</p>
        <div className="space-y-2">
          {DEFAULT_COMMON_BASIC_LABELS.map((label) => (
            <Row key={label} label={label} common={isCommonBasicLabel(label, override)} disabled={saving} onToggle={(mk) => toggle(label, mk)} />
          ))}
        </div>
      </section>

      {appSpecificLabels.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[14px] font-semibold text-wedly-t1">이 앱 전용 칸</h3>
          <p className="text-[12px] text-wedly-muted">켜면 공통이 됩니다. 단, 이 칸이 다른 앱에도 있어야 값이 함께 맞춰집니다. 없으면 색만 바뀝니다.</p>
          <div className="space-y-2">
            {appSpecificLabels.map((label) => (
              <Row key={label} label={label} common={isCommonBasicLabel(label, override)} disabled={saving} onToggle={(mk) => toggle(label, mk)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
