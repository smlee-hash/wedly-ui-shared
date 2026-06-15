// 상태 문자열 → 색 클래스 반환 — 순수 함수(서버·클라이언트 공용).
//
// 하이브 UnifiedView.tsx 의 StatusDot 색 결정 규칙을 그대로 이식.
// 컴포넌트(StatusDot)는 Phase 1에서 별도로 만들되, 색 판단 로직은 이 함수를 참조.

/**
 * 상태 문자열을 받아 Tailwind 색 클래스를 반환한다.
 *
 * - 초록(완료·확정·승인·성공·done·complete)
 * - 파랑(진행·처리·검토·신청·progress·review) → wedly-accent 계열
 * - 빨강(취소·반려·실패·fail)
 * - 노랑(그 외 값 있음)
 * - 회색(없음·null·빈 문자열)
 *
 * 판정은 소문자 변환 후 포함(includes) 매칭.
 */
export function getStatusDotClass(status: string | null | undefined): string {
  if (!status || !status.trim()) return "bg-wedly-bd"; // 회색

  const s = status.toLowerCase();

  if (
    s.includes("완료") ||
    s.includes("확정") ||
    s.includes("승인") ||
    s.includes("성공") ||
    s.includes("done") ||
    s.includes("complete")
  ) {
    return "bg-wedly-green"; // 초록
  }

  if (
    s.includes("진행") ||
    s.includes("처리") ||
    s.includes("검토") ||
    s.includes("신청") ||
    s.includes("progress") ||
    s.includes("review")
  ) {
    return "bg-wedly-accent"; // 파랑
  }

  if (
    s.includes("취소") ||
    s.includes("반려") ||
    s.includes("실패") ||
    s.includes("fail")
  ) {
    return "bg-wedly-red"; // 빨강
  }

  return "bg-wedly-gold"; // 노랑 (그 외 값 있음)
}
