"use client";

import { useEffect, useState } from "react";
import { buildDevRequestUrl } from "./dev-request-url";

const DEFAULT_BASE = "https://wedly-dev-request-production.up.railway.app";

export interface DevRequestPanelProps {
  /** 별도 앱에 전달되는 앱 식별자 (예: "wedly-erp", "wedly-hive-collab") */
  app: string;
  /** 세부 페이지명 — 요청에 "어느 화면인지" 로 기록됨 */
  page: string;
  /** 별도 앱 주소 override (기본: 환경변수 또는 운영 주소) */
  baseUrl?: string;
  /** 사용자명 조회 주소 (기본: /api/auth/me) */
  meEndpoint?: string;
}

/**
 * 기능요청·제안 패널 (별도 앱 wedly-dev-request 를 iframe 으로 임베드).
 * "요청 페이지" 링크(sourceUrl)는 고정 주소가 아니라 살아있는 현재 주소(window.location.href)로 만든다
 * → 죽은 옛 주소로 인한 로그인 창 문제를 원천 차단. ERP·하이브·일루아 공용.
 */
export function DevRequestPanel({ app, page, baseUrl, meEndpoint = "/api/auth/me" }: DevRequestPanelProps) {
  const [userName, setUserName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") setSourceUrl(window.location.href);
    fetch(meEndpoint)
      .then((r) => r.json())
      .then((d) => {
        const name = d.name || d.email?.split("@")[0] || "";
        if (name) setUserName(name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [meEndpoint]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-wedly-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const base = baseUrl || process.env.NEXT_PUBLIC_DEV_REQUEST_URL || DEFAULT_BASE;
  const iframeSrc = buildDevRequestUrl({ base, app, requester: userName, page, sourceUrl });

  return (
    <iframe
      src={iframeSrc}
      className="w-full border-0 rounded-2xl"
      style={{ height: "calc(100vh - 200px)", minHeight: "500px" }}
      allow="clipboard-write"
    />
  );
}
