// 히스토리 목록의 「맨 아래로 따라가기」 판정 — 순수 함수(화면 부품 HistoryPanel 이 쓴다).
//
// 전에는 목록(comments)이 바뀔 때마다 무조건 맨 아래로 내렸다. 5초 주기 갱신·부모 씨앗·수정·삭제도
// 새 배열을 만들기 때문에, 사용자가 위로 올려 이전 내역을 읽는 중에도 5초 안에 맨 아래로 끌려갔다.
// 이제는 「사용자가 맨 아래에 붙어 있을 때」와 「화면이 맨 아래로 가야 한다고 정해 둔 때」만 내린다.

/** 맨 아래에서 이 값(px) 안쪽이면 「붙어 있다」고 본다 — 손가락·휠이 살짝 비껴도 따라가게 하는 여유. */
export const STICK_THRESHOLD_PX = 48;

export type ScrollMetrics = { scrollTop: number; scrollHeight: number; clientHeight: number };

/** 목록이 맨 아래(여유 threshold 이내)에 있나. 스크롤이 필요 없는 짧은 목록은 늘 맨 아래다. */
export function isNearBottom(m: ScrollMetrics, threshold: number = STICK_THRESHOLD_PX): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold;
}

/**
 * 목록이 바뀐 뒤 맨 아래로 내려야 하나.
 * - force: 처음 열기·내가 새 히스토리를 저장함·분류 탭을 직접 바꿈 — 위치와 상관없이 내린다.
 * - stuck: 사용자가 맨 아래에 붙어 있었다 — 새 내역이 와도 계속 따라간다.
 * 둘 다 아니면(위로 올려 읽는 중) 위치를 그대로 둔다.
 */
export function shouldScrollToBottom(state: { force: boolean; stuck: boolean }): boolean {
  return state.force || state.stuck;
}
