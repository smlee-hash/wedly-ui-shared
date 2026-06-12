"use client";

// ERP 통합협업 히스토리 — 공용 부품(@wedly/ui-shared HistoryPanel)을 ERP 저장방식에 맞춰 감싸는 얇은 연결막.
//
// 하이브와 같은 공용 부품을 쓰되 ERP만의 차이를 설정/어댑터로 주입:
//   - 저장 주소: adapter.api.loadComments / addComment (어댑터 경유 — ERP 전용 경로 캡슐화)
//   - 이미지: adapter.api.uploadImage (공용 /api/upload 이지만 어댑터 경유로 일관)
//   - 출처 표시: 다른 앱(하이브) 글에 "HIVE" 배지
//   - 이미지 붙여넣기 사용, "3분 전" 상대시간, 5초 자동 새로고침
//   - 분류 탭: 공용 기본(통합/정책자금/무상지원금/인증제도) 노출. 분류값은 코멘트에 저장됨(저장 도구가 이미 지원).

import { useEffect, useMemo, useState } from "react";
import {
  HistoryPanel as SharedHistoryPanel,
  timeAgo,
  type HistoryAdapter,
  type UnifiedComment,
} from "../index";

// 로그인 사용자 이름 — auth/me는 공용 경로라 직접 fetch 유지(어댑터 currentUser 경유도 무방하나 모듈캐시 최적화 위해 유지).
let _cachedAuthUser: { name: string } | null = null;
async function getAuthUserName(): Promise<string> {
  if (_cachedAuthUser) return _cachedAuthUser.name;
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    if (data?.name) {
      _cachedAuthUser = { name: data.name };
      return data.name;
    }
  } catch {
    /* ignore */
  }
  return "나";
}

type DbComment = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
  source?: string;
  category?: string;
};

function toUnified(list: DbComment[]): UnifiedComment[] {
  return (list ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    text: c.text,
    createdAt: c.createdAt,
    category: c.category,
    source: c.source ?? "erp",
  }));
}

// HistoryPanel이 외부에서 주입받는 API — ERP 전용 경로를 숨기고 어댑터 경유로만 접근한다.
export type HistoryPanelApi = {
  loadComments: (entryId: string) => Promise<UnifiedComment[]>;
  addComment: (entryId: string, body: unknown) => Promise<UnifiedComment[]>;
  uploadImage: (file: File) => Promise<{ url: string }>;
};

function makeAdapter(
  pageId: string,
  userName: string,
  api: HistoryPanelApi,
): HistoryAdapter {
  // 원본과 동일: POST 응답이 곧 최신 목록(서버가 listComments 재호출해 반환) — 별도 GET 없이 1요청.
  const postJson = (payload: unknown) => api.addComment(pageId, payload);
  return {
    fetch: async () => {
      const comments = await api.loadComments(pageId);
      return { comments };
    },
    create: ({ text, category }) =>
      postJson({ action: "append", comment: { name: userName, text, source: "erp", category } }),
    edit: ({ commentId, text }) =>
      postJson({ action: "edit", commentId, text }),
    remove: ({ commentId }) =>
      postJson({ action: "delete", commentId }),
    uploadImage: async (file: File) => {
      const { url } = await api.uploadImage(file);
      return url;
    },
  };
}

export default function HistoryPanel({
  pageId,
  rowData,
  api,
}: {
  pageId: string;
  rowData?: Record<string, unknown> | null;
  api: HistoryPanelApi;
}) {
  const [userName, setUserName] = useState("");
  useEffect(() => {
    getAuthUserName().then(setUserName);
  }, []);

  const seed = useMemo<UnifiedComment[]>(() => {
    const arr = rowData?._comments;
    return Array.isArray(arr) ? toUnified(arr as DbComment[]) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowData?._comments]);

  const name = userName || "나";
  const adapter = useMemo(() => makeAdapter(pageId, name, api), [pageId, name, api]);

  return (
    <SharedHistoryPanel
      pageId={pageId}
      adapter={adapter}
      currentUserName={name}
      ownSource="erp"
      enableImagePaste
      timeFormatter={timeAgo}
      pollingIntervalMs={5000}
      sourceBadge={{ label: "HIVE", isForeign: (s) => s === "hive" }}
      seedComments={seed}
      shareEnabled={false}
      hideCategories
    />
  );
}
