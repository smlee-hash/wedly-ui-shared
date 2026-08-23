"use client";

import { useState, useEffect, type RefObject } from "react";
import { computeAnchoredPosition, type AnchoredPosition } from "./anchoredPosition";

/**
 * 드롭다운이 열렸을 때 버튼(trigger)의 화면 좌표를 측정해
 * 목록을 띄울 고정 위치를 돌려준다. 스크롤·창 크기 변경 시 다시 계산한다.
 * 스크롤은 capture 단계로 들어 모달 내부 스크롤 상자의 움직임도 따라간다.
 */
export function useAnchoredPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
): AnchoredPosition | null {
  const [pos, setPos] = useState<AnchoredPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos(
        computeAnchoredPosition(
          { top: r.top, bottom: r.bottom, left: r.left, width: r.width },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, triggerRef]);

  return pos;
}
