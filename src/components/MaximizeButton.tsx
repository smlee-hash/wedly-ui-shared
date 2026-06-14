"use client";

/**
 * "표 최대화 / 최대화 해제" 토글 버튼 — 공용 부품(2026-06-14, 2단계).
 *
 * 최대화 상태는 바깥(CollabTable 또는 MaximizableSection)이 소유하고, 이 버튼은 그 상태를
 * 보여주고 토글만 한다. ERP·하이브·일루아가 같은 버튼을 써서 100% 동일.
 */
type Props = {
  maximized: boolean;
  onToggle: () => void;
};

export function MaximizeButton({ maximized, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={maximized ? "최대화 해제 (Esc)" : "표를 화면 전체로 넓게 보기"}
      className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2.5 py-1.5 text-[12px] font-medium text-wedly-t2 transition-colors hover:bg-wedly-bg-gray"
    >
      {maximized ? "↙ 최대화 해제" : "⛶ 표 최대화"}
    </button>
  );
}
