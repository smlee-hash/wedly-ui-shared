// 3분할 상세창의 칸 className 과 좁은 화면 단추 순서.
// 브라우저 비의존 순수 함수 — 슬롯 미주입 앱(하이브·일루아)은 레일 없음 경로의
// 문자열이 지금과 한 글자도 같아야 해서, 여기서 고정값으로 만든다.

export type PaneName = "basic" | "center" | "side";

/** 좁은 화면 3버튼 — 레일이 있으면 업무 현황을 맨 뒤로 보낸다. */
export function narrowPaneTabs(hasTrackRail: boolean): Array<[PaneName, string]> {
  if (hasTrackRail) {
    return [
      ["basic", "기본정보"],
      ["center", "정보 · 기록"],
      ["side", "업무 현황"],
    ];
  }
  return [
    ["basic", "기본정보"],
    ["center", "업무 현황"],
    ["side", "정보 · 기록"],
  ];
}

/** 좌단(기본정보) className */
export function basicPaneClass(narrowSwitch: boolean, narrowPane: PaneName): string {
  if (narrowSwitch) {
    return narrowPane === "basic" ? "flex-1 min-w-0 overflow-y-auto" : "hidden";
  }
  return "w-[320px] 2xl:w-[400px] flex-shrink-0 border-r border-wedly-bd/60 overflow-y-auto";
}

/**
 * 레일 유무에 따른 가운데/오른쪽 슬롯.
 * ThreePaneShell 이 이 값으로 노드를 넣는다 — 배치 규칙을 문자열 시험으로도 못 박기 위해.
 */
export function threePaneSlots(hasTrackRail: boolean): {
  center: "detail" | "plain";
  side: "track" | "detail";
} {
  return hasTrackRail
    ? { center: "detail", side: "track" }
    : { center: "plain", side: "detail" };
}

/** 가운데 칸 className — 레일이 있으면 여기에 「정보·기록」이 들어온다. */
export function centerPaneClass(
  narrowSwitch: boolean,
  narrowPane: PaneName,
  hasTrackRail: boolean,
): string {
  if (narrowSwitch && narrowPane !== "center") return "hidden";
  // 레일이 있는 넓은 화면만 가운데 360px 하한 — 자리가 모자라면 레일이 줄어들고 가운데가 남는다.
  if (!narrowSwitch && hasTrackRail) return "flex-1 min-w-[360px] flex flex-col min-h-0";
  return "flex-1 min-w-0 flex flex-col";
}

/** 오른쪽 칸 className — 레일이 없으면 기존 고정폭, 있으면 접힘/펼침 폭. */
export function sidePaneClass(
  narrowSwitch: boolean,
  narrowPane: PaneName,
  opts: { rail: boolean; railOpen: boolean },
): string {
  // 좁은 화면은 전환식이라 접이식 폭을 붙이지 않는다.
  if (narrowSwitch) {
    return narrowPane === "side" ? "flex-1 min-w-0 flex flex-col min-h-0" : "hidden";
  }
  if (!opts.rail) {
    return "w-[380px] 2xl:w-[520px] flex-shrink-0 border-l border-wedly-bd/60 flex flex-col min-h-0";
  }
  if (!opts.railOpen) {
    return "w-[44px] flex-shrink-0 border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
  }
  // 펼침은 선호 폭이지 고정폭이 아니다. flex-shrink-0 을 빼야 가운데(360px 하한)가 남을 자리가 생긴다.
  return "w-[600px] 2xl:w-[760px] min-w-[320px] border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
}
