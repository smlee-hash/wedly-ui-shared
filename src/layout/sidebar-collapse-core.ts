// 사이드바 접힘 상태 복원 판단 (순수 함수 — 브라우저 비의존, 단위 시험 가능).
// 브라우저에 저장된 값(stored)과 현재 상태(current)를 비교해:
//   - 저장값이 없거나(null) 현재와 같으면 → null (변경 불필요)
//   - 다르면 → 저장값(true/false) (이 값으로 복원해야 함)
export function resolveStoredCollapsed(
  stored: string | null,
  current: boolean
): boolean | null {
  if (stored === null) return null;
  const storedBool = stored === "true";
  if (storedBool === current) return null;
  return storedBool;
}
