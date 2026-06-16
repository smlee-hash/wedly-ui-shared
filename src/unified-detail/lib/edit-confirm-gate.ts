// ─────────────────────────────────────────────────────────────────────────────
// 저장 전 '수정 확인' 팝업 게이트 — 통합 상세창 기본정보·일반 칸(EditableFieldRow) 공용.
//
// NO.44(재작업): 기존에 등록된 행의 상세창에서 "비어 있던 칸"에 처음 값을 입력할 때는
// 확인 팝업을 띄우지 않고 바로 저장한다. 이미 값이 있던 칸을 고칠 때만 팝업을 띄운다.
// (표 셀·신규 등록 폼에는 이 규칙이 이미 있었으나, 3앱 공용 상세창 부품에는 빠져 있어
//  기존 행 상세창에서만 빈칸 첫 입력에도 팝업이 뜨던 문제가 있었다.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "빈 칸"(이전 값 없음) 판정.
 * null·undefined·빈 문자열뿐 아니라 "공백만 있는 문자열"도 빈 값으로 본다
 * (기존 행엔 눈엔 빈칸이지만 공백 등 잔여값이 남은 칸이 있다).
 * 0·false 는 실제 값이므로 빈 값으로 보지 않는다.
 */
export function isBlankFieldValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

/**
 * 저장 직전 '수정 확인' 팝업을 띄울지 결정.
 * 띄우는 조건(모두 충족): 신규 등록 폼이 아님 + multi_select 아님 +
 * 이전 값이 있었음(빈칸 아님) + 값이 실제로 바뀜.
 */
export function shouldConfirmFieldEdit(args: {
  oldVal: unknown;
  newVal: string | number | boolean | null;
  type: string;
  isNew: boolean;
}): boolean {
  const { oldVal, newVal, type, isNew } = args;
  if (isNew) return false; // 신규 등록 폼은 칸마다 팝업 미표시(입력 중 반복 팝업 방지)
  if (type === "multi_select") return false; // 태그 토글은 매번 묻기 불편 — 즉시 반영
  if (isBlankFieldValue(oldVal)) return false; // 빈 칸 최초 입력 → 바로 저장(NO.44)
  return String(newVal ?? "") !== String(oldVal ?? ""); // 값이 실제로 바뀐 경우만
}
