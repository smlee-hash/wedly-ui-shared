// 히스토리 패널의 「맨 아래로 따라가기」가 실제로 스크롤되는 칸을 찾고, 그 칸에서의 위치를 판정한다(HistoryPanel 내부용).
//
// 패널이 높이가 정해진 부모 안에 있으면 목록 상자(`flex-1 overflow-y-auto min-h-0`)가 스스로 스크롤된다.
// 높이가 정해지지 않은 부모 안에 있으면 목록 상자는 내용 높이만큼 늘어나 스스로 스크롤되지 않고, 바깥 조상 칸이 스크롤된다
// (노션 3fe7b6a9 — 운영 측정: 목록 h=scrollHeight=clientHeight=6348). 이때는 목록 상자의 scrollTop 을 바꿔도 아무 일이 없다.
// 이 파일은 패키지 내보내기(`./history-scroll`)에 넣지 않는다 — 앱이 쓰는 공개 판정은 history-scroll.ts 의 세 가지뿐이다.

import { STICK_THRESHOLD_PX } from "./history-scroll";

/** 스크롤할 거리가 이 값(px)을 넘어야 「스크롤되는 칸」으로 본다 — 서브픽셀 반올림 오차를 거른다. */
const SCROLLABLE_EPSILON_PX = 1;

const SCROLLING_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * 목록 상자 대신 맨 아래로 내릴 칸을 찾는다.
 * - 목록 상자가 스스로 스크롤되면 목록 상자.
 * - 아니면 위로 올라가며 overflow-y 가 auto·scroll·overlay 이고 실제로 스크롤할 거리가 있는 첫 조상.
 *   (body·html 은 제외 — 문서 전체 스크롤은 건드리지 않는다.)
 * - 없으면 null.
 */
export function findScrollContainer(list: HTMLElement): HTMLElement | null {
  if (list.scrollHeight - list.clientHeight > SCROLLABLE_EPSILON_PX) return list;
  const doc = list.ownerDocument;
  const view = doc.defaultView;
  if (!view) return null;
  let node = list.parentElement;
  while (node && node !== doc.body && node !== doc.documentElement) {
    if (SCROLLING_OVERFLOW.has(view.getComputedStyle(node).overflowY) && node.scrollHeight - node.clientHeight > SCROLLABLE_EPSILON_PX) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 바깥 칸을 얼마나 내리면 패널 끝(입력 칸 포함)이 칸 아래 끝에 닿는가. 이미 보이면 0.
 * 두 값은 getBoundingClientRect().bottom — 같은 화면 좌표계라 칸의 스크롤 위치와 상관없이 뺄 수 있다.
 */
export function outerScrollDelta(panelBottom: number, scrollerBottom: number): number {
  const delta = panelBottom - scrollerBottom;
  return delta > 0 ? delta : 0;
}

/** 바깥 칸이 스크롤될 때, 목록 끝이 칸 아래 끝에서 여유(threshold) 안이면 「맨 아래에 붙어 있다」. */
export function isListNearScrollerBottom(listBottom: number, scrollerBottom: number, threshold: number = STICK_THRESHOLD_PX): boolean {
  return listBottom - scrollerBottom <= threshold;
}
