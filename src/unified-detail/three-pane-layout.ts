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
      // min-w-[672px]: 탭줄에 도구 아이콘 2개가 들어가도 둘째 줄로 내려가지 않게(2026-09-02 사장님).
      return railOpen ? "w-[40%] min-w-[672px] flex-shrink-0 flex flex-col min-h-0" : "flex-1 min-w-0 flex flex-col min-h-0";
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
    // 2분할 펼침: 레일 안을 가로(row)로 — [본문 flex-1 | 접기 손잡이 44px 열]. 손잡이를 절대배치로 겹치면
    // 본문 스크롤 막대를 덮어 못 끈다(코덱스 2026-09-02).
    return "relative flex-1 min-w-0 border-l border-wedly-bd/60 flex flex-row min-h-0 transition-[width] duration-200 ease-out";
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
    // 38.4vw = 96vw × 0.4, 716 = 672(가운데 하한) + 44(손잡이), 760 = 접힘 상자 상한.
    // 폭 전환 애니메이션은 일부러 안 건다 — 가운데 칸이 flex-1 로 바뀌는 동시에 상자가 줄면 칸이 순간 커졌다 줄어 튄다(코덱스 지적).
    return "sm:w-[max(calc(38.4vw_+_44px),716px)] sm:h-[94vh] sm:max-w-[716px] sm:max-h-[94vh] sm:rounded-2xl";
  }
  return "sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] sm:rounded-2xl";
}

// ── 상세창 큰 탭 (2026-11-09 사장님 승인 시안 「상세창 큰 탭」) ──
// 헤더 바로 아래 한 줄: DB 정보 · 컨설팅 업무 현황 · (앱이 선언하면) 추천 정책.

export type BigTabKey = "db" | "track" | "recommend";

const BIG_TAB_LABELS: Record<BigTabKey, string> = {
  db: "DB 정보",
  track: "컨설팅 업무 현황",
  recommend: "추천 정책",
};

/** 큰 탭 목록 — 항상 DB 정보가 먼저, 그 뒤에 views 순서(중복·모르는 값은 버림, 남는 것이 없으면 ["track"]). */
export function bigTabList(views?: ReadonlyArray<string>): Array<[BigTabKey, string]> {
  const work: BigTabKey[] = [];
  for (const v of views ?? []) {
    if ((v === "track" || v === "recommend") && !work.includes(v)) work.push(v);
  }
  if (work.length === 0) work.push("track");
  return [["db", BIG_TAB_LABELS.db], ...work.map((k): [BigTabKey, string] => [k, BIG_TAB_LABELS[k]])];
}

/** 큰 탭 줄 className — 좁은 화면은 한 줄을 꽉 채우는 칸 나누기. */
export function bigTabBarClass(narrowSwitch: boolean): string {
  return narrowSwitch
    ? "flex gap-1 p-2 border-b border-wedly-bd/60 bg-white flex-shrink-0"
    : "flex gap-1.5 px-5 py-2 border-b border-wedly-bd/60 bg-white flex-shrink-0";
}

const BIG_TAB_SELECTED = "bg-wedly-accent text-white";
const BIG_TAB_UNSELECTED = "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t1";

/** 큰 탭 하나의 className — 좁은 화면은 줄바꿈 허용(break-keep), 넓은 화면은 한 줄 고정(whitespace-nowrap). */
export function bigTabClass(narrowSwitch: boolean, selected: boolean): string {
  const tone = selected ? BIG_TAB_SELECTED : BIG_TAB_UNSELECTED;
  return narrowSwitch
    ? `flex-1 inline-flex items-center justify-center gap-[5px] rounded-xl px-1 py-2 text-[13px] font-bold whitespace-normal break-keep text-center transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ${tone}`
    : `inline-flex items-center gap-[7px] rounded-[10px] px-3.5 py-2 text-[14px] font-bold whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedly-accent focus-visible:ring-offset-2 ${tone}`;
}

/** 큰 탭을 오갈 때 되돌릴 스크롤 위치 하나. atBottom 은 맨 아래(2px 안)에 붙어 있었는지 — 기록 목록처럼 새 글이 아래에 쌓이는 곳. */
export type ScrollMemo = { top: number; atBottom: boolean };

/** 스크롤이 일어날 때마다 그 칸의 위치를 적어 둔다. 맨 위(0)로 돌아온 칸은 지운다. */
export function noteScroll(memos: Map<Element, ScrollMemo>, el: Element): void {
  if (el.scrollTop > 0) memos.set(el, { top: el.scrollTop, atBottom: el.scrollHeight - el.scrollTop - el.clientHeight <= 2 });
  else memos.delete(el);
}

/** 다시 보이는 탭의 칸들을 적어 둔 자리로 돌린다. 맨 아래였던 칸은 폭이 바뀌어도 맨 아래로. 화면에서 빠진 칸은 지운다. */
export function restoreScrolls(memos: Map<Element, ScrollMemo>): void {
  for (const [el, m] of memos) {
    if (!el.isConnected) { memos.delete(el); continue; }
    el.scrollTop = m.atBottom ? el.scrollHeight : m.top;
  }
}
