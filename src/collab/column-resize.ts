// 표 칸 폭 조절(리사이즈) 공용 부품 — 3앱·모든 표 동일 동작.
//
// ★왜 "가이드선 방식"인가 (하이브에서 검증된 패턴):
//   드래그하는 동안 실제 칸 너비를 바꾸면(매 움직임마다 화면을 다시 그리면) 포인터를
//   붙잡고 있던 손잡이 요소가 교체되어 "손 뗌(pointerup)"을 놓칠 수 있다 → 손을 떼도
//   계속 늘어나는 버그(ERP·일루아에서 발생). 그래서 드래그 중에는 화면을 다시 그리지 않고
//   떠 있는 안내선(가이드선)만 움직이고, 손을 뗄 때 딱 한 번 너비를 확정한다.
//   포인터 이벤트(pointerdown/move/up/cancel)로 통일해 마우스·터치 모두 동작한다(NO.76).

// ── 순수 계산 (시험 가능) ──────────────────────────────────────────────

/** 손을 뗀 위치로 확정될 최종 너비. 최소 너비 아래로는 내려가지 않는다. */
export function computeResizedWidth(
  startWidth: number,
  startX: number,
  currentX: number,
  minWidth: number = 40,
): number {
  return Math.max(minWidth, startWidth + (currentX - startX));
}

/** 안내선(가이드선)의 화면 가로 위치. 최소 너비에 해당하는 위치보다 왼쪽으로는 안 간다. */
export function computeGuideX(
  startX: number,
  startWidth: number,
  currentX: number,
  minWidth: number = 40,
): number {
  const minX = startX - startWidth + minWidth;
  return Math.max(currentX, minX);
}

// ── 드래그 동작 (DOM 부작용) ───────────────────────────────────────────

export interface StartColumnResizeOptions {
  /** 손잡이에서 받은 포인터다운 이벤트 */
  event: { preventDefault: () => void; stopPropagation: () => void; clientX: number; pointerId: number; currentTarget: EventTarget | null; target: EventTarget | null };
  /** 드래그 시작 시점의 현재 칸 너비 */
  startWidth: number;
  /** 손을 뗐을 때 확정 너비를 받아 저장하는 콜백 (여기서만 setState/저장) */
  onCommit: (finalWidth: number) => void;
  /** 최소 너비 (기본 40) */
  minWidth?: number;
  /** 안내선 높이를 잴 바깥 컨테이너 선택자 (미지정 시 스크롤 컨테이너→표 순으로 자동 탐색) */
  boundsSelector?: string;
}

/**
 * 칸 폭 조절 시작. 드래그 중에는 화면을 다시 그리지 않고 안내선만 움직이며,
 * 손을 뗄 때 onCommit(최종너비)을 딱 한 번 호출한다.
 */
export function startColumnResize(opts: StartColumnResizeOptions): void {
  const { event, startWidth, onCommit, minWidth = 40, boundsSelector } = opts;
  event.preventDefault();
  event.stopPropagation();

  const startX = event.clientX;

  // 포인터 캡처 — 터치 중 손가락이 손잡이를 벗어나도 이벤트가 끊기지 않게 (NO.76 모바일)
  try {
    (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
  } catch {
    /* ignore */
  }

  // 표 높이만큼 떠 있는 파란 안내선 — document.body에 직접 붙임(표 재렌더와 무관).
  // 바깥 컨테이너는 앱·표마다 클래스가 달라(overflow-x-scroll / overflow-x-auto 등)
  // 지정 선택자 → 스크롤 컨테이너 → 표(table) 순으로 자동 탐색한다.
  const targetEl = event.target as Element | null;
  const wrap = (
    (boundsSelector ? targetEl?.closest?.(boundsSelector) : null) ??
    targetEl?.closest?.('[class*="overflow"]') ??
    targetEl?.closest?.("table")
  ) as HTMLElement | null;
  const rect = wrap?.getBoundingClientRect();
  const guide = document.createElement("div");
  guide.style.cssText = `position:fixed;top:${rect?.top ?? 0}px;height:${
    rect?.height ?? 400
  }px;width:2px;background:var(--wedly-accent,#4F8EF7);z-index:9999;pointer-events:none;will-change:transform;`;
  guide.style.left = `${computeGuideX(startX, startWidth, startX, minWidth)}px`;
  document.body.appendChild(guide);

  const onMove = (ev: PointerEvent) => {
    guide.style.left = `${computeGuideX(startX, startWidth, ev.clientX, minWidth)}px`;
  };
  const cleanup = () => {
    guide.remove();
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.removeEventListener("pointercancel", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  const onUp = (ev: PointerEvent) => {
    const finalW = computeResizedWidth(startWidth, startX, ev.clientX, minWidth);
    cleanup();
    onCommit(finalW);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}
