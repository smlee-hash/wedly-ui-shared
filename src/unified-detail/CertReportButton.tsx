"use client";

// 기본정보 「리포트」 칸 아래의 「기업인증 리포트」 PDF 내려받기 단추 (노션 NO.818).
// PDF 를 받아 오는 일은 앱이 준 adapter.certReport.download 로만 한다 — 이 부품은 잠금·안내·저장 동작만 맡는다.
// ERP·하이브 공용: 호출 경로는 모른다. 리포트는 저장해 두지 않고, 받는 즉시 내려받는다.

import { useEffect, useRef, useState } from "react";
import type { UnifiedDetailAdapter } from "./adapter-types";

type CertReportAdapter = NonNullable<UnifiedDetailAdapter["certReport"]>;

const FAILED_MESSAGE = "기업인증 리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 받은 PDF 를 브라우저 저장으로 내려받는다(BasicFilesField 전체 다운로드와 같은 방식). */
function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function CertReportButton({
  row,
  adapter,
}: {
  row: Record<string, unknown>;
  adapter: CertReportAdapter;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 겹쳐 누르기 막기 — state 는 다음 렌더에야 바뀌므로 같은 틱의 두 번째 클릭은 ref 로 거른다.
  const busyRef = useRef(false);
  // 상세창이 닫히거나 다른 업체로 바뀐 뒤(부모가 key 로 다시 그림) 늦게 도착한 PDF 는 버린다.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const handleClick = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await adapter.download(row);
      if (!aliveRef.current) return;
      if (res.ok) saveBlob(res.blob, res.filename);
      else setError(res.message);
    } catch {
      if (aliveRef.current) setError(FAILED_MESSAGE);
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[13px] text-wedly-accent-ink font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-wedly-accent/40 disabled:hover:bg-transparent"
      >
        {busy ? "기업인증 리포트 만드는 중…" : "기업인증 리포트"}
      </button>
      {busy && (
        <span role="status" aria-live="polite" className="text-[12px] text-wedly-muted">
          최대 2분 정도 걸릴 수 있습니다
        </span>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-wedly-red-ink">
          {error}
        </span>
      )}
    </div>
  );
}
