"use client";

// 기본정보 "파일" 칸 — 회사 전체 파일을 2개까지 인라인으로 보여주고, "더 보기"로 팝업을 열어
// 전체 목록 + 업로드/삭제(앱별 파일 패널 재사용)를 처리한다. ERP·하이브·일루아 공용.
//
// ⚠️ 반응형 필수: 파일 목록은 매 렌더에서 adapter.getAllFiles(row) 로 다시 계산한다.
//    (useState 로 한 번만 읽어 굳히면 데이터가 늦게 와도 빈 채로 남는다 — 실제 사건의 원인 패턴.)

import { useState } from "react";
import { createPortal } from "react-dom";
import type { UnifiedDetailAdapter } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";

export default function BasicFilesField({
  row,
  detail,
  adapter,
  entryId,
  saveOwnField,
  onSaved,
}: {
  row: Record<string, unknown>;
  // 분야행 전체(있을 때) — 파일이 분야별 행에 흩어진 앱(일루아)이 전 분야 _files 를 합산하는 데 사용.
  detail?: CustomerDetailLite | null;
  adapter: UnifiedDetailAdapter;
  entryId: string;
  saveOwnField: (entryId: string, key: string, value: string | number | boolean | null) => Promise<void>;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const files = adapter.getAllFiles(row, detail ?? null); // 매 렌더 재계산 (캐시 금지)
  const ErpFilesPanel = adapter.components.ErpFilesPanel;
  const inline = files.slice(0, 2);

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
          <div className="flex w-fit items-center gap-2 px-1 text-[12px]">
            <button type="button" onClick={() => setOpen(true)} className="text-wedly-accent font-medium hover:underline">파일 추가</button>
            {files.length >= 3 && (
              <>
                <span className="text-wedly-muted">|</span>
                <button type="button" onClick={() => setOpen(true)} className="text-wedly-accent font-medium hover:underline">모든 파일 보기</button>
              </>
            )}
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
                  첨부파일 (전체 {files.length}개)
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
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
