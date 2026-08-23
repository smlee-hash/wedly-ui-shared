// 드롭다운 목록을 화면 최상위 레이어(고정 위치)에 띄울 때 좌표를 계산한다.
// 버튼(trigger) 위치와 화면 크기를 받아, 아래 공간이 좁으면 위로 펼치도록 결정한다.

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface AnchoredPosition {
  left: number;
  width: number;
  placement: "down" | "up";
  /** placement === "down" 일 때 화면 위에서의 거리 */
  top?: number;
  /** placement === "up" 일 때 화면 아래에서의 거리 */
  bottom?: number;
  maxHeight: number;
}

/**
 * @param rect 버튼의 화면 기준 사각형(getBoundingClientRect)
 * @param viewport 화면 크기(window.innerWidth/innerHeight)
 * @param menuMaxHeight 목록 최대 높이 상한(px)
 * @param gap 버튼과 목록 사이 간격(px)
 * @param margin 화면 가장자리 여백(px)
 * @param minHeight 항상 보장할 최소 높이(px) — 공간이 거의 없어도 0으로 접히지 않게
 */
export function computeAnchoredPosition(
  rect: AnchorRect,
  viewport: ViewportSize,
  menuMaxHeight = 240,
  gap = 4,
  margin = 8,
  minHeight = 96,
): AnchoredPosition {
  const spaceBelow = viewport.height - rect.bottom;
  const spaceAbove = rect.top;
  const needed = menuMaxHeight + gap + margin;

  // 상한을 채울 수 있는 쪽 우선, 둘 다 부족하면 더 넓은 쪽으로
  let openDown: boolean;
  if (spaceBelow >= needed) openDown = true;
  else if (spaceAbove >= needed) openDown = false;
  else openDown = spaceBelow >= spaceAbove;

  // 화면 가로 밖으로 나가지 않게 left 보정(트리거가 오른쪽 끝에 붙어도 안전)
  const left = Math.max(margin, Math.min(rect.left, viewport.width - rect.width - margin));

  // 선택한 쪽의 가용 높이에 맞추되, 최소 높이를 보장해 절대 0이 되지 않게
  const fit = (space: number) =>
    Math.max(minHeight, Math.min(menuMaxHeight, space - gap - margin));

  if (openDown) {
    return {
      left,
      width: rect.width,
      placement: "down",
      top: rect.bottom + gap,
      maxHeight: fit(spaceBelow),
    };
  }

  return {
    left,
    width: rect.width,
    placement: "up",
    bottom: viewport.height - rect.top + gap,
    maxHeight: fit(spaceAbove),
  };
}
