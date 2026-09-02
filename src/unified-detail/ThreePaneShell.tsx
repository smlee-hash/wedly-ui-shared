import type { ReactElement, ReactNode } from "react";
import {
  basicPaneClass,
  centerPaneClass,
  sidePaneClass,
  threePaneSlots,
  type PaneName,
} from "./three-pane-layout";

export type { PaneName };
export {
  basicPaneClass,
  centerPaneClass,
  narrowPaneTabs,
  sidePaneClass,
  threePaneSlots,
} from "./three-pane-layout";

export type ThreePaneShellProps = {
  narrowSwitch: boolean;
  narrowPane: PaneName;
  hasTrackRail: boolean;
  railOpen: boolean;
  /** ERP 2분할 — 기본정보를 탭줄로 */
  mergeBasic?: boolean;
  /** 기본정보 */
  basicPane: ReactNode;
  /** 분야 탭 + 히스토리·정보·파일 */
  detailPane: ReactNode;
  /** 레일 없는 앱의 가운데(분야 패널) */
  plainCenterPane: ReactNode;
  /** 업무 현황(레일 안쪽) — 이미 hidden 처리된 노드를 그대로 받는다 */
  trackPane: ReactNode;
  /** 손잡이 버튼(없으면 null) */
  railHandle: ReactNode;
};

/**
 * 3칸 배치를 이 부품이 정한다.
 * 레일이 있으면 [기본정보 | 정보·기록 | 업무 현황],
 * 없으면 지금처럼 [기본정보 | 분야 | 정보·기록] — 슬롯 미주입 앱은 화면이 달라지면 안 된다.
 */
export function ThreePaneShell(props: ThreePaneShellProps): ReactElement {
  const {
    narrowSwitch,
    narrowPane,
    hasTrackRail,
    railOpen,
    mergeBasic = false,
    basicPane,
    detailPane,
    plainCenterPane,
    trackPane,
    railHandle,
  } = props;

  const slots = threePaneSlots(hasTrackRail);
  // 좁은 화면(포커스 모드)에서는 합치기를 무시한다 — 기본정보 전환 단추가 빈 칸을 보이면 안 된다(코덱스 지적).
  const merge = mergeBasic && !narrowSwitch;

  return (
    <div className="flex flex-1 min-h-0">
      <aside className={basicPaneClass(narrowSwitch, narrowPane, merge)}>{merge ? null : basicPane}</aside>
      <main className={merge ? centerPaneClass(narrowSwitch, narrowPane, hasTrackRail, railOpen, merge) : centerPaneClass(narrowSwitch, narrowPane, hasTrackRail, railOpen)}>
        {slots.center === "detail" ? detailPane : plainCenterPane}
      </main>
      <aside className={sidePaneClass(narrowSwitch, narrowPane, { rail: hasTrackRail, railOpen, mergeBasic: merge })}>
        {slots.side === "track" ? (
          <>
            {railHandle}
            {trackPane}
          </>
        ) : (
          detailPane
        )}
      </aside>
    </div>
  );
}
