"use client";

// 신규 업체 등록 폼 전용 "리포트" 첨부 칸 (NO.56 #2).
// 항목이 아직 만들어지기 전이라, 파일 바이트만 먼저 /api/upload 로 올려 URL을 받고
// 그 파일 정보를 부모의 임시 보관(draft)의 _files 배열에 담아 둔다.
// 등록(createEntry) 시 draft 가 통째로 저장되므로 _files 도 함께 저장되고,
// 저장 후 상세창의 파일 영역(어댑터 getAllFiles=_files)에서 그대로 보인다.
// ★ 3앱(ERP·하이브·일루아) 모두 _files 를 공유하므로 공용 부품 하나로 동일하게 동작한다.

import { useRef, useState } from "react";

export type DraftFile = {
  id?: string;
  fileName: string;
  url: string;
  contentType?: string;
  size?: number;
  category?: string;
};

export default function NewEntryReportUpload({
  files,
  onChange,
  uploadApiPath = "/api/upload",
}: {
  files: DraftFile[];
  onChange: (files: DraftFile[]) => void;
  uploadApiPath?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    const next: DraftFile[] = [...files];
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(uploadApiPath, { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || `${file.name} 업로드 실패`);
        // 단일 응답(data) 또는 ZIP 자동해제 다건(files) 모두 수용 (공용 FilesTab 과 동일 규칙).
        const uploaded: Array<{ id: string; fileName: string; url: string; mimeType?: string; size?: number }> =
          Array.isArray(json.files) ? json.files : json.data ? [json.data] : [];
        for (const u of uploaded) {
          next.push({
            id: u.id,
            fileName: u.fileName,
            url: u.url,
            contentType: u.mimeType,
            size: u.size,
            category: "리포트",
          });
        }
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => onChange(files.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f, i) => (
        <div
          key={`${f.url}-${i}`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-wedly-bd bg-wedly-bg-gray/30 text-[13px] text-wedly-t1 min-w-0"
        >
          <span className="flex-shrink-0">📎</span>
          <span className="truncate flex-1" title={f.fileName}>{f.fileName}</span>
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="flex-shrink-0 text-[12px] text-wedly-muted hover:text-wedly-red"
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-lg border border-wedly-accent/40 hover:border-wedly-accent hover:bg-wedly-bg-blue/30 transition-colors text-[13px] text-wedly-accent-ink font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {uploading ? "업로드 중…" : "파일 추가"}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleSelect(e.target.files)}
      />
      {error && <div className="text-[12px] text-wedly-red">{error}</div>}
    </div>
  );
}
