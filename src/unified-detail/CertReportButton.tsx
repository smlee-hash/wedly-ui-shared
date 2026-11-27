"use client";

// 기본정보 「리포트」 칸 아래의 「기업인증 리포트 생성」 단추 (노션 NO.818 2차 수정).
// PDF 를 브라우저로 내려받지 않고 서버가 생성해 해당 고객 DB 상세창 첨부 파일에 바로 올린다.
// 끝나면 onSaved() 를 불러 상세창 파일 목록을 새로 읽어 방금 올라간 리포트가 즉시 보이게 한다.

import { useEffect, useRef, useState } from "react";
import type { UnifiedDetailAdapter } from "./adapter-types";

type CertReportAdapter = NonNullable<UnifiedDetailAdapter["certReport"]>;

const FAILED_MESSAGE = "기업인증 리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";

export default function CertReportButton({
  row,
  adapter,
  onSaved,
}: {
  row: Record<string, unknown>;
  adapter: CertReportAdapter;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [doneFileName, setDoneFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 겹쳐 누르기 막기 — state 는 다음 렌더에야 바뀌므로 같은 틱의 두 번째 클릭은 ref 로 거른다.
  const busyRef = useRef(false);
  // 상세창이 닫히거나 다른 업체로 바뀐 뒤(부모가 key 로 다시 그림) 늦게 도착한 응답은 버린다.
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
    setDoneFileName(null);
    setError(null);
    try {
      const res = await adapter.generate(row);
      if (!aliveRef.current) return;
      if (res.ok) {
        setDoneFileName(res.fileName);
        try {
          onSaved?.();
        } catch {
          // 목록 새로고침 오류가 이미 끝난 업로드 성공 안내를 덮지 않게 한다.
        }
      } else {
        setError(res.message);
      }
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
        {busy ? "기업인증 리포트 만드는 중…" : "기업인증 리포트 생성"}
      </button>
      {busy && (
        <span role="status" aria-live="polite" className="text-[12px] text-wedly-muted">
          최대 2분 정도 걸릴 수 있습니다 · 끝나면 위 첨부 파일에 바로 올라갑니다
        </span>
      )}
      {doneFileName && (
        <span role="status" aria-live="polite" className="text-[12px] text-wedly-green font-medium">
          첨부 파일에 업로드했습니다 ({doneFileName})
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
