"use client";

// 분야(섹션)별 히스토리 — 공용 HistoryPanel을 "분야 전용 보관함" 저장으로 감싼 얇은 래퍼.
// 앱별 값(작성 출처 ownSource·작성자 이름 currentUserName·이미지 업로드 경로)은 props로 주입
// (ERP·하이브·일루아 공용). 추가/수정/삭제 모두 배열 전체를 onPersist로 부모에 넘겨 통째로 저장한다.
import { useMemo, useState } from "react";
import { HistoryPanel as SharedHistoryPanel, type HistoryAdapter } from "./HistoryPanel";
import type { UnifiedComment } from "../unified/history-core";
import { timeAgo } from "../lib/utils";

export default function SectionHistoryPanel({
  storageId,
  initial,
  onPersist,
  ownSource,
  currentUserName,
  uploadPath = "/api/upload",
}: {
  storageId: string; // 공용 패널 식별자 (사업자번호:분야)
  initial: UnifiedComment[];
  onPersist: (next: UnifiedComment[]) => void; // 부모가 공용 보관함에 저장
  ownSource: string; // 작성 출처 ("erp" | "hive" | "illua")
  currentUserName: string; // 작성자 표시 이름 (앱이 해석해 주입)
  uploadPath?: string;
}) {
  const [list, setList] = useState<UnifiedComment[]>(() => initial);

  const adapter = useMemo<HistoryAdapter>(
    () => ({
      fetch: async () => ({ comments: list }),
      create: async ({ text, category }) => {
        const c: UnifiedComment = {
          id: `c_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          name: currentUserName || "나",
          text,
          createdAt: new Date().toISOString(),
          source: ownSource,
          category,
        };
        const next = [...list, c];
        setList(next);
        onPersist(next);
        return next;
      },
      edit: async ({ commentId, text }) => {
        const next = list.map((c) => (c.id === commentId ? { ...c, text } : c));
        setList(next);
        onPersist(next);
        return next;
      },
      remove: async ({ commentId }) => {
        const next = list.filter((c) => c.id !== commentId);
        setList(next);
        onPersist(next);
        return next;
      },
      uploadImage: async (file: File) => {
        const fd = new FormData();
        const ext = file.name.split(".").pop() || "png";
        fd.append("file", file, `paste_${Date.now()}.${ext}`);
        const res = await fetch(uploadPath, { method: "POST", body: fd });
        const json = await res.json();
        if (!json?.success || !json?.data?.url) throw new Error("이미지 업로드에 실패했습니다.");
        return json.data.url as string;
      },
    }),
    [list, currentUserName, ownSource, onPersist, uploadPath],
  );

  return (
    <SharedHistoryPanel
      pageId={storageId}
      adapter={adapter}
      currentUserName={currentUserName || "나"}
      ownSource={ownSource}
      enableImagePaste
      timeFormatter={timeAgo}
      seedComments={list}
      shareEnabled={false}
      hideCategories
    />
  );
}
