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
export function basicPaneClass(narrowSwitch: boolean, narrowPane: PaneName, mergeBasic: boolean = false): string {
  if (narrowSwitch) {
    return narrowPane === "basic" ? "flex-1 min-w-0 overflow-y-auto" : "hidden";
  }
  // ERP 2분할(2026-09-02 사장님 승인): 기본정보는 가운데 탭줄로 들어가므로 왼쪽 칸을 안 그린다.
  if (mergeBasic) return "hidden";
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

/**
 * 가운데 칸 className — 레일이 있으면 여기에 「정보·기록」이 들어온다.
 * railOpen 은 밖에서 세 개만 넘겨 부르던 코드가 안 깨지게 기본값 false.
 * 레일이 없는 경로에서는 이 값을 아예 안 쓰므로 기본값이 옛 동작과 같다.
 */
export function centerPaneClass(
  narrowSwitch: boolean,
  narrowPane: PaneName,
  hasTrackRail: boolean,
  railOpen: boolean = false,
  mergeBasic: boolean = false,
): string {
  if (narrowSwitch && narrowPane !== "center") return "hidden";
  if (!narrowSwitch && hasTrackRail) {
    if (mergeBasic) {
      // 2분할: 펼침이면 왼쪽 40% 고정(사장님 「너무 넓으면 불편」), 접힘이면 모달 자체가 줄어 가운데가 전부.
      return railOpen ? "w-[40%] flex-shrink-0 flex flex-col min-h-0" : "flex-1 min-w-0 flex flex-col min-h-0";
    }
    // 펼침: 가운데를 옛 오른쪽 칸 폭으로 고정해, 남는 자리를 업무 현황이 가져가게 한다.
    // 하한 260: 좌 320 + 가운데 260 + 레일 380 = 960 ≤ 983(1024px 화면의 모달 96vw) → 더 이상 안 잘린다.
    // 레일이 가운데보다 항상 넓다: 남는 자리 A = 모달폭 − 좌단. A < 760 이면 레일이 하한 380 을 잡고
    // 가운데가 A−380(<380) 으로 줄어 레일이 넓다. A ≥ 760 이면 가운데가 380 을 유지하고
    // 레일이 A−380 ≥ 380 이라 역시 레일이 넓다. 2xl(좌 400·가운데 520)에서도
    // 가장 좁은 1536px 화면이 모달 1475 → 레일 555 > 520 이라 레일이 넓다.
    if (railOpen) {
      return "w-[380px] 2xl:w-[520px] min-w-[260px] flex flex-col min-h-0";
    }
    // 접힘: 손잡이만 남으므로 가운데가 남는 자리를 다 쓴다.
    return "flex-1 min-w-0 flex flex-col min-h-0";
  }
  return "flex-1 min-w-0 flex flex-col";
}

/** 오른쪽 칸 className — 레일이 없으면 기존 고정폭, 있으면 접힘/펼침 폭. */
export function sidePaneClass(
  narrowSwitch: boolean,
  narrowPane: PaneName,
  opts: { rail: boolean; railOpen: boolean; mergeBasic?: boolean },
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
  if (opts.mergeBasic) {
    return "relative flex-1 min-w-0 border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
  }
  // 펼침: 고정폭을 버리고 남는 자리를 전부 가져간다. 가운데가 옛 오른쪽 칸 폭으로 고정돼 있기 때문이다.
  // 하한 380: 좌 320 + 가운데 260 + 레일 380 = 960 ≤ 983(1024px 화면의 모달 96vw) → 더 이상 안 잘린다.
  // 레일이 가운데보다 항상 넓다: 남는 자리 A = 모달폭 − 좌단. A < 760 이면 레일이 하한 380 을 잡고
  // 가운데가 A−380(<380) 으로 줄어 레일이 넓다. A ≥ 760 이면 가운데가 380 을 유지하고
  // 레일이 A−380 ≥ 380 이라 역시 레일이 넓다. 2xl(좌 400·가운데 520)에서도
  // 가장 좁은 1536px 화면이 모달 1475 → 레일 555 > 520 이라 레일이 넓다.
  // relative: 접기 단추를 칸 왼쪽 위 모서리에 겹쳐 놓기 위한 기준(2026-08-30 사장님 「세 칸 상단 줄을
  // 똑같이 맞춰라」 — 접기 줄이 한 칸을 통째로 먹어 오른쪽만 머리가 한 줄 아래였다).
  return "relative flex-1 min-w-[380px] border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
}

/** 모달 상자 폭 클래스 — 2분할에서 레일을 접으면 왼쪽 40% 폭만 남기고 상자를 줄인다(넓게 퍼지지 않게). */
export function modalBoxClass(narrowSwitch: boolean, mergeBasic: boolean, railOpen: boolean): string {
  if (narrowSwitch) return "";
  if (mergeBasic && !railOpen) {
    // 38.4vw = 96vw × 0.4, 716 = 1680 × 0.4 + 44(손잡이)
    // 폭 전환 애니메이션은 일부러 안 건다 — 가운데 칸이 flex-1 로 바뀌는 동시에 상자가 줄면 칸이 순간 커졌다 줄어 튄다(코덱스 지적).
    return "sm:w-[calc(38.4vw_+_44px)] sm:h-[94vh] sm:max-w-[716px] sm:max-h-[94vh] sm:rounded-2xl";
  }
  return "sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] sm:rounded-2xl";
}
