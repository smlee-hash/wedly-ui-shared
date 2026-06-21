// CSV 파일 여부 판별 — 확장자 또는 MIME 타입으로.
export function isCsvFile(name: string, type?: string): boolean {
  return /\.csv$/i.test(name) || type === "text/csv" || type === "application/csv";
}

// CSV 바이트를 문자열로 디코딩한다.
// 우선순위: UTF-8(BOM 포함) → 실패 시 CP949/EUC-KR(한국 엑셀이 CSV 저장 시 쓰는 기본 인코딩).
// UTF-8은 자기검증적이라, 한글 CP949 바이트열은 거의 항상 "잘못된 UTF-8"로 걸려 폴백이 정확히 발동한다.
export function decodeCsvText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}
