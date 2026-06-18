import { describe, it, expect } from "vitest";
import { parseUploadSuccess } from "./upload-response";

// /api/upload 의 success 응답을 첨부 목록 항목으로 변환하는 순수 로직.
// 하이브는 ZIP 을 자동 해제해 { files:[...], skipped } 로, 단일 파일은 { data:{...} } 로 응답한다.
describe("parseUploadSuccess", () => {
  it("ZIP 다중 응답: files 배열의 각 파일을 모두 첨부 목록으로 변환한다", () => {
    const json = {
      success: true,
      files: [
        { id: "a", fileName: "계약서.pdf", url: "https://h/api/upload/a", mimeType: "application/pdf", size: 10 },
        { id: "b", fileName: "사진.png", url: "https://h/api/upload/b", mimeType: "image/png", size: 20 },
      ],
      skipped: 1,
    };
    const r = parseUploadSuccess(json);
    expect(r.files).toEqual([
      { name: "계약서.pdf", url: "https://h/api/upload/a" },
      { name: "사진.png", url: "https://h/api/upload/b" },
    ]);
    expect(r.skipped).toBe(1);
  });

  it("단일 파일 응답: data 하나를 첨부 목록으로 변환한다 (ERP·일루아·하이브 비ZIP)", () => {
    const json = { success: true, data: { id: "x", fileName: "문서.hwp", url: "https://h/api/upload/x" } };
    const r = parseUploadSuccess(json);
    expect(r.files).toEqual([{ name: "문서.hwp", url: "https://h/api/upload/x" }]);
    expect(r.skipped).toBe(0);
  });

  it("files 가 빈 배열이면 빈 목록을 반환한다 (skipped 는 보존)", () => {
    expect(parseUploadSuccess({ success: true, files: [], skipped: 3 })).toEqual({ files: [], skipped: 3 });
  });

  it("files 도 data 도 없으면 빈 목록을 반환한다 (방어)", () => {
    expect(parseUploadSuccess({ success: true })).toEqual({ files: [], skipped: 0 });
  });

  it("파일명/주소가 없는 형식 불명 항목은 건너뛴다", () => {
    const json = {
      success: true,
      files: [{ fileName: "정상.pdf", url: "u1" }, { fileName: 123 }, { url: "u2" }, null],
    };
    expect(parseUploadSuccess(json).files).toEqual([{ name: "정상.pdf", url: "u1" }]);
  });
});
