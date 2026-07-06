import { useLayoutEffect, type RefObject } from "react";

/**
 * 히스토리 입력칸 자동 확장 훅.
 * value 가 바뀔 때마다 textarea 높이를 (내용 높이, maxHeight) 중 작은 값으로 맞춘다.
 * value 가 비면 자동으로 기본(min-height)으로 복귀 — 전송 후 칸이 커진 채 남는 문제 방지.
 * 최소 높이는 CSS min-h-[..] 가 담당(빈 칸도 기본 높이 유지), 확장 상한은 maxHeight.
 */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 320,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [ref, value, maxHeight]);
}
