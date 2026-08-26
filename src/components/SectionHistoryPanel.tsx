"use client";

// 분야(섹션)별 히스토리 — 공용 HistoryPanel을 "분야 전용 보관함" 저장으로 감싼 얇은 래퍼.
// 앱별 값(작성 출처 ownSource·작성자 이름 currentUserName·이미지 업로드 경로)은 props로 주입
// (ERP·하이브·일루아 공용). 추가/수정/삭제 모두 배열 전체를 onPersist로 부모에 넘겨 통째로 저장한다.
//
// ★2026-08-26 (히스토리 유실 2단계): 저장을 **끝까지 기다린다**.
//   전에는 부모에게 저장을 부탁하고 기다리지 않고 곧바로 "됐다"고 답해서,
//   저장이 실패해도 화면엔 글이 남고 입력칸이 비워졌다(= 사용자는 저장된 줄 안다).
//   이제 실패하면 ① 목록을 이전 값으로 되돌리고 ② 오류를 **다시 던진다**.
//   안내는 위쪽 부품(HistoryPanel) 한 곳에서만 한다 — 알림창이 두 번 뜨지 않게.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HistoryPanel as SharedHistoryPanel, type HistoryAdapter } from "./HistoryPanel";
import type { UnifiedComment } from "../unified/history-core";
import { timeAgo } from "../lib/utils";

/** 목록이 "실제로 달라졌는지" 판정할 지문. 부모가 새 배열을 만들어 넘겨도 내용이 같으면 안 흔든다. */
function signatureOf(list: readonly UnifiedComment[]): string {
  return list.map((c) => `${c.id}:${c.text.length}:${c.text}`).join("|");
}

export default function SectionHistoryPanel({
  storageId,
  initial,
  onPersist,
  ownSource,
  currentUserName,
  uploadPath = "/api/upload",
  loadError = null,
  onRetryLoad,
  sendOnLeave,
}: {
  storageId: string; // 공용 패널 식별자 (사업자번호:분야)
  initial: UnifiedComment[];
  /** 부모가 공용 보관함에 저장. **기다릴 수 있는 모양**이어야 실패를 알 수 있다.
   *  실패하면 반드시 오류를 던져야 한다(부모가 삼키면 이 부품은 실패를 영영 모른다). */
  onPersist: (next: UnifiedComment[]) => void | Promise<void>;
  ownSource: string; // 작성 출처 ("erp" | "hive" | "illua")
  currentUserName: string; // 작성자 표시 이름 (앱이 해석해 주입)
  uploadPath?: string;
  /** 부모가 첫 불러오기에 실패했으면 그 안내 문구. 주면 입력이 잠기고 다시 시도 단추가 뜬다. */
  loadError?: string | null;
  /** 다시 시도 단추를 눌렀을 때 부모가 할 일(선택). 없으면 부품이 스스로 다시 불러온다. */
  onRetryLoad?: () => void;
  /** 화면을 떠날 때 치던 글을 살려 보내는 통로(선택). 성공 여부는 알 수 없다. */
  sendOnLeave?: (text: string) => void;
}) {
  const [list, setList] = useState<UnifiedComment[]>(() => initial);
  const lastSigRef = useRef<string>(signatureOf(initial));

  // 부모가 준 목록이 실제로 바뀌면 따라간다(부모가 다시 불러왔거나, 저장 실패로 되돌린 경우).
  const initialSig = useMemo(() => signatureOf(initial), [initial]);
  useEffect(() => {
    if (lastSigRef.current === initialSig) return;
    lastSigRef.current = initialSig;
    setList(initial);
  }, [initialSig, initial]);

  /** 목록을 바꾸고 저장을 **기다린다**. 실패하면 되돌리고 오류를 다시 던진다. */
  const commit = useCallback(
    async (next: UnifiedComment[], prev: UnifiedComment[]): Promise<UnifiedComment[]> => {
      setList(next);
      lastSigRef.current = signatureOf(next);
      try {
        await onPersist(next);
      } catch (e) {
        setList(prev);
        lastSigRef.current = signatureOf(prev);
        throw e; // 안내는 위쪽 부품 한 곳에서만
      }
      return next;
    },
    [onPersist],
  );

  const adapter = useMemo<HistoryAdapter>(
    () => ({
      // ★자동 다시읽기는 **서버를 부르지 않는다**(2026-08-26 적대적 검토에서 잡음).
      //  여기서 서버를 부르면: 새 목록 → 부모 상태 새로 만듦 → 저장 함수 새로 만듦 →
      //  이 도구 새로 만듦 → 위 부품이 "다시 읽어라"를 또 실행 → 끝없는 되풀이가 된다.
      //  진짜 서버 다시 읽기는 사용자가 "다시 시도"를 누를 때 부모(onRetryLoad)가 한다.
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
        return commit([...list, c], list);
      },
      edit: async ({ commentId, text }) =>
        commit(
          list.map((c) => (c.id === commentId ? { ...c, text } : c)),
          list,
        ),
      remove: async ({ commentId }) => commit(list.filter((c) => c.id !== commentId), list),
      uploadImage: async (file: File) => {
        const fd = new FormData();
        const ext = file.name.split(".").pop() || "png";
        fd.append("file", file, `paste_${Date.now()}.${ext}`);
        const res = await fetch(uploadPath, { method: "POST", body: fd });
        const json = await res.json().catch(() => null);
        if (!json?.success || !json?.data?.url) throw new Error("이미지 업로드에 실패했습니다.");
        return json.data.url as string;
      },
    }),
    [list, currentUserName, ownSource, uploadPath, commit],
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
      loadError={loadError}
      onRetryLoad={onRetryLoad}
      draftId={storageId}
      sendOnLeave={sendOnLeave}
    />
  );
}
