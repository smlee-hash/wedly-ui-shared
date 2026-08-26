"use client";

// 통합화면 분야(섹션)별 히스토리 — 공용 SectionHistoryPanel(@wedly/ui-shared)에 ERP 설정
// (작성 출처 "erp"·작성자 이름)을 주입하는 얇은 래퍼. (Stage 2b: 로직 단일 원본화)
import { useEffect, useState } from "react";
import Shared from "../components/SectionHistoryPanel";
import type { UnifiedComment } from "../unified/history-core";

let _cachedName: string | null = null;
async function getAuthUserName(): Promise<string> {
  if (_cachedName) return _cachedName;
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (data?.name) {
      _cachedName = data.name;
      return data.name;
    }
  } catch {
    /* ignore */
  }
  return "나";
}

export default function SectionHistoryPanel(props: {
  storageId: string;
  initial: UnifiedComment[];
  /** ★기다릴 수 있는 모양으로 넓혔다(2026-08-26) — 여기가 좁으면 실패가 위로 못 올라간다. */
  onPersist: (next: UnifiedComment[]) => void | Promise<void>;
  loadError?: string | null;
  onRetryLoad?: () => void;
  sendOnLeave?: (next: UnifiedComment[]) => void;
}) {
  const [userName, setUserName] = useState("나");
  useEffect(() => {
    getAuthUserName().then(setUserName);
  }, []);
  return <Shared {...props} ownSource="erp" currentUserName={userName} />;
}
