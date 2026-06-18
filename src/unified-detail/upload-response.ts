// /api/upload 응답 → 첨부 목록 항목 변환 (공용 순수 로직)
//
// 하이브 업로드 라우트는 ZIP 을 자동 해제해 여러 파일을 한 번에 돌려준다:
//   { success: true, files: [{ fileName, url, ... }], skipped: n }
// 단일 파일(및 ERP·일루아처럼 ZIP 자동해제가 없는 앱)은:
//   { success: true, data: { fileName, url, ... } }
// 두 모양을 모두 같은 방식으로 첨부 목록에 반영한다. (detail-modal-shared FilesTab 과 동일 패턴)

export interface UploadedAttachment {
  name: string;
  url: string;
}

export interface ParsedUploadSuccess {
  /** 첨부 목록에 추가할 파일들 ({ name, url }) */
  files: UploadedAttachment[];
  /** ZIP 자동해제 시 위험/크기/개수 초과로 제외된 파일 수 (없으면 0) */
  skipped: number;
}

/**
 * 업로드 success 응답에서 첨부할 파일 목록과 (ZIP) 제외 건수를 뽑는다.
 * - `files` 배열이 있으면 ZIP 다중 응답으로 보고 각 항목을, 없으면 `data` 단일 항목을 사용한다.
 * - 파일명(fileName)과 주소(url)가 모두 문자열인 항목만 채택한다(형식 불명 항목은 건너뜀).
 */
export function parseUploadSuccess(json: unknown): ParsedUploadSuccess {
  const obj = (json ?? {}) as { files?: unknown; data?: unknown; skipped?: unknown };
  const rawItems: unknown[] = Array.isArray(obj.files)
    ? obj.files
    : obj.data
      ? [obj.data]
      : [];
  const files: UploadedAttachment[] = [];
  for (const item of rawItems) {
    const it = item as { fileName?: unknown; url?: unknown } | null;
    if (it && typeof it.fileName === "string" && typeof it.url === "string") {
      files.push({ name: it.fileName, url: it.url });
    }
  }
  const skipped = typeof obj.skipped === "number" ? obj.skipped : 0;
  return { files, skipped };
}
