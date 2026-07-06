"use client";

// 기본정보 "파일" 칸 — 회사 전체 파일을 2개까지 인라인으로 보여주고, "더 보기"로 팝업을 열어
// 전체 목록 + 업로드/삭제(앱별 파일 패널 재사용)를 처리한다. ERP·하이브·일루아 공용.
//
// ⚠️ 반응형 필수: 파일 목록은 매 렌더에서 adapter.getAllFiles(row) 로 다시 계산한다.
//    (useState 로 한 번만 읽어 굳히면 데이터가 늦게 와도 빈 채로 남는다 — 실제 사건의 원인 패턴.)

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { UnifiedDetailAdapter } from "./adapter-types";

export default function BasicFilesField({
  row,
  adapter,
  entryId,
  saveOwnField,
  onSaved,
}: {
  row: Record<string, unknown>;
  adapter: UnifiedDetailAdapter;
  entryId: string;
  saveOwnField: (entryId: string, key: string, value: string | number | boolean | null) => Promise<void>;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const files = adapter.getAllFiles(row); // 매 렌더 재계산 (캐시 금지)
  const ErpFilesPanel = adapter.components.ErpFilesPanel;
  // 미리보기 앞 2개는 "가장 최근 첨부"가 항상 바로 보이도록 첨부 시각(at) 최신순으로 고른다.
  // (새 업로드는 파일 배열 맨 뒤에 붙어, 순서 그대로면 방금 올린 파일이 "외 N개 더 보기" 뒤로 숨어
  //  첨부가 안 된 것처럼 보였다.) 정렬은 표시용 사본에서만 — 저장·팝업 전체목록·외부연동 순서는 불변.
  //  at 없는 옛 파일은 뒤로(그들끼리 기존 순서 유지 — Array.sort 안정성).
  const inline = [...files]
    .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
    .slice(0, 2);

  // 팝업에서 막 업로드/삭제한 결과를 헤더 "전체 N개" 카운트에 즉시 반영(행 갱신 전까지의 시차 제거).
  // 패널이 현재 표시 중인 파일 수를 올려주고, 행(row)이 새 데이터로 바뀌면(저장 후 행 갱신) 리셋해 행 기준으로 돌아간다.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  useEffect(() => { setLiveCount(null); }, [row]);
  const shownCount = liveCount ?? files.length;

  const closePopup = () => {
    setOpen(false);
    onSaved?.(); // 팝업에서 업로드/삭제했을 수 있으니 분야 데이터 새로고침
  };

  return (
    <div className="flex flex-col gap-1.5">
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[13px] text-wedly-accent font-medium"
        >
          파일 추가
        </button>
      ) : (
        <>
          {inline.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 text-[13px] text-wedly-t1 hover:text-wedly-accent min-w-0"
              title={f.name}
            >
              <span className="flex-shrink-0">📎</span>
              <span className="truncate">{f.name}</span>
            </a>
          ))}
          {files.length > inline.length && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 bg-wedly-bg-blue/30 text-[13px] text-wedly-accent font-medium hover:border-wedly-accent hover:bg-wedly-bg-blue/50 transition-colors"
              title={`첨부파일 전체 ${files.length}개 보기`}
            >
              <span aria-hidden className="flex-shrink-0">📎</span>
              <span>외 {files.length - inline.length}개 더 보기</span>
            </button>
          )}
          <div className="flex w-fit items-center gap-2 px-1 text-[12px]">
            <button type="button" onClick={() => setOpen(true)} className="text-wedly-accent font-medium hover:underline">파일 추가</button>
          </div>
        </>
      )}

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={closePopup}
          >
            <div
              className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-wedly-bd bg-white shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-wedly-bd/60 flex items-center justify-between sticky top-0 bg-white">
                <span className="text-[13px] font-semibold text-wedly-t2">
                  첨부파일 (전체 {shownCount}개)
                </span>
                <button
                  type="button"
                  onClick={closePopup}
                  className="w-7 h-7 flex items-center justify-center rounded text-wedly-muted hover:text-wedly-t1 hover:bg-wedly-bg-gray text-lg leading-none"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div className="p-4">
                <ErpFilesPanel
                  row={row}
                  fields={adapter.ownFileFields}
                  pageId={entryId}
                  onPatchField={(key: string, jsonValue: string) => saveOwnField(entryId, key, jsonValue)}
                  defaultCategoryKey={adapter.ownFileFields[0]?.key ?? "첨부파일"}
                  readOnly={false}
                  onFilesCountChange={setLiveCount}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
