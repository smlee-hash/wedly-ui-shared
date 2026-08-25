"use client";

// 기본정보 "파일" 칸 — 회사 전체 파일을 2개까지 인라인으로 보여주고, "더 보기"로 팝업을 열어
// 전체 목록 + 업로드/삭제(앱별 파일 패널 재사용)를 처리한다. ERP·하이브·일루아 공용.
//
// ⚠️ 반응형 필수: 파일 목록은 매 렌더에서 adapter.getAllFiles(row) 로 다시 계산한다.
//    (useState 로 한 번만 읽어 굳히면 데이터가 늦게 와도 빈 채로 남는다 — 실제 사건의 원인 패턴.)

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { UnifiedDetailAdapter } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import { selfHostedFileUrl } from "../lib/self-hosted-file-url";

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
  // 미리보기 앞 2개는 "가장 최근 첨부"가 항상 바로 보이도록 첨부 시각(at) 최신순으로 고른다.
  // (새 업로드는 파일 배열 맨 뒤에 붙어, 순서 그대로면 방금 올린 파일이 "외 N개 더 보기" 뒤로 숨어
  //  첨부가 안 된 것처럼 보였다.) 정렬은 표시용 사본에서만 — 저장·팝업 전체목록·외부연동 순서는 불변.
  //  at 없는 옛 파일은 뒤로(그들끼리 기존 순서 유지 — Array.sort 안정성).
  const inline = [...files]
    .sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
    .slice(0, 2);

  // NO.104 재작업: 인라인 다운로드 — 팝업에 들어가지 않아도 카드에서 바로 받도록.
  const dl = adapter.fileDownload;
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const dlHref = (f: { name: string; url: string }) => {
    if (!dl) return "";
    const p = new URLSearchParams();
    p.set("name", f.name || "파일");
    if (f.url) p.set("url", f.url);
    if (entryId) p.set("entryId", entryId);
    if (f.name) p.set("fileName", f.name);
    return `${dl.apiPath}?${p.toString()}`;
  };
  // 전체 다운로드 — 카드의 전체 파일 목록을 서버로 보내 ZIP 하나로 저장(팝업 FilesTab 과 동일 형태).
  const downloadAll = async () => {
    if (!dl || downloadingAll || files.length === 0) return;
    setDownloadingAll(true);
    setDlError(null);
    try {
      const label = dl.zipLabel?.(row)?.trim() || "첨부파일";
      const res = await fetch(dl.allApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          files: files.map((f) => ({ fileName: f.name || "파일", url: f.url, entryId })),
        }),
      });
      if (!res.ok) throw new Error("전체 다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${label}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "전체 다운로드에 실패했어요.");
    } finally {
      setDownloadingAll(false);
    }
  };

  // 팝업에서 막 업로드/삭제한 결과를 헤더 "전체 N개" 카운트에 즉시 반영(행 갱신 전까지의 시차 제거).
  // 패널이 현재 표시 중인 파일 수를 올려주고, 행(row)이 새 데이터로 바뀌면 리셋해 행 기준으로 돌아간다.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  useEffect(() => { setLiveCount(null); }, [row, detail]);
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
          className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[13px] text-wedly-accent-ink font-medium"
        >
          파일 추가
        </button>
      ) : (
        <>
          {inline.map((f, i) => {
            const cls = "flex flex-1 items-center gap-2 px-3 py-1.5 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 text-[13px] text-wedly-t1 hover:text-wedly-accent-ink min-w-0 text-left cursor-pointer";
            const body = (
              <>
                <span className="flex-shrink-0">📎</span>
                <span className="truncate">{f.name}</span>
              </>
            );
            const dlBtn = dl && f.url ? (
              <a href={dlHref(f)} download={f.name || "파일"} onClick={(e) => e.stopPropagation()} className="w-7 h-7 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 text-wedly-t2 hover:bg-wedly-bg-blue/40 hover:text-wedly-accent-ink inline-flex items-center justify-center flex-shrink-0 transition" title="다운로드" aria-label={`${f.name} 다운로드`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>
            ) : null;
            // 앱이 onOpenFile 을 주입하면(하이브) 그걸로 연다 — 만료된 노션 링크 자동 갱신. 없으면 주소 직접 열기.
            return (
              <div key={i} className="flex items-center gap-1 min-w-0">
                {adapter.onOpenFile ? (
                  <button type="button" onClick={() => adapter.onOpenFile!(f, entryId)} className={cls} title={f.name}>{body}</button>
                ) : (
                  <a href={selfHostedFileUrl(f.url)} target="_blank" rel="noopener noreferrer" className={cls} title={f.name}>{body}</a>
                )}
                {dlBtn}
              </div>
            );
          })}
          {files.length > inline.length && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 bg-wedly-bg-blue/30 text-[13px] text-wedly-accent-ink font-medium hover:border-wedly-accent hover:bg-wedly-bg-blue/50 transition-colors"
              title={`첨부파일 전체 ${files.length}개 보기`}
            >
              <span aria-hidden className="flex-shrink-0">📎</span>
              <span>외 {files.length - inline.length}개 더 보기</span>
            </button>
          )}
          <div className="flex w-fit items-center gap-2 px-1 text-[12px]">
            <button type="button" onClick={() => setOpen(true)} className="text-wedly-accent-ink font-medium hover:underline">파일 추가</button>
            {dl && files.length >= 2 && (
              <>
                <span className="text-wedly-muted">|</span>
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={downloadingAll}
                  className="text-wedly-accent font-medium hover:underline disabled:opacity-50"
                >
                  {downloadingAll ? "압축 중…" : "전체 다운로드"}
                </button>
              </>
            )}
          </div>
          {dlError && <span className="px-1 text-[12px] text-wedly-red">{dlError}</span>}
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
                  className="w-7 h-7 flex items-center justify-center rounded text-wedly-t2 hover:text-wedly-t1 hover:bg-wedly-bg-gray text-lg leading-none"
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
                  allFiles={files}
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
