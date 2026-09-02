# 상세창(ERP 넓은 배치) — 기본정보를 분야 탭줄에 합치고 2분할(40:60)로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ERP 넓은 배치(`layout="wide"` + 업무 현황 레일)에서 왼쪽 기본정보 칸을 없애고, 가운데 탭줄 맨 앞에 「기본정보」 탭을 넣어 기본정보 ↔ 분야를 오가게 한다. 폭은 왼쪽 40% : 오른쪽(업무 현황) 60%, 레일을 접으면 상세창 자체가 왼쪽 40% 폭(+손잡이 44px)으로 줄어든다.

**Architecture:** 새 스위치 `mergeBasic`(= ERP 넓은 화면 + 레일 있음 + 좁은 화면 아님). `three-pane-layout.ts` 순수 함수에 선택 인자로 붙여 하이브·일루아(레일 없음)·좁은 화면(포커스 모드)·`compact` 는 **한 글자도 안 바뀐다**(기존 시험이 그것을 지킨다). `UnifiedDetailView` 는 mergeBasic 일 때 왼쪽 칸을 안 그리고, 탭줄에 기본정보 탭 + 「분야」 구분 표식을 넣고, 기본정보 탭이면 가운데 본문에 `BasicInfoPanel`(stacked)을 그린다.

**승인:** 2026-09-02 사장님(미리보기 https://claude.ai/code/artifact/b12e2e63-3165-4679-b322-dff30187f63a, 「40:60 · 접어도 왼쪽은 40% 크기 유지」).

---

### Task 1: 배치 함수에 mergeBasic 추가 (TDD)

**Files:** `src/unified-detail/three-pane-layout.ts`, `src/unified-detail/three-pane-layout.test.ts`

- [ ] **Step 1: 시험 추가** (파일 끝):
```ts
describe("mergeBasic — ERP 넓은 화면에서 기본정보를 탭줄에 합친 2분할", () => {
  it("왼쪽 칸은 hidden, 좁은 화면·기본값은 지금과 같다", () => {
    expect(basicPaneClass(false, "basic", true)).toBe("hidden");
    expect(basicPaneClass(false, "basic")).toBe(basicPaneClass(false, "basic", false));
    expect(basicPaneClass(true, "basic", true)).toBe(basicPaneClass(true, "basic"));
  });
  it("펼침이면 가운데 40% 고정·레일이 나머지, 접힘이면 가운데 flex-1", () => {
    expect(centerPaneClass(false, "center", true, true, true)).toBe("w-[40%] flex-shrink-0 flex flex-col min-h-0");
    expect(centerPaneClass(false, "center", true, false, true)).toBe("flex-1 min-w-0 flex flex-col min-h-0");
    expect(sidePaneClass(false, "side", { rail: true, railOpen: true, mergeBasic: true })).toBe(
      "relative flex-1 min-w-0 border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out",
    );
    expect(sidePaneClass(false, "side", { rail: true, railOpen: false, mergeBasic: true })).toBe(
      sidePaneClass(false, "side", { rail: true, railOpen: false }),
    );
  });
  it("mergeBasic 을 안 주면 네 함수 모두 옛 문자열 그대로", () => {
    expect(centerPaneClass(false, "center", true, true)).toBe("w-[380px] 2xl:w-[520px] min-w-[260px] flex flex-col min-h-0");
    expect(sidePaneClass(false, "side", { rail: true, railOpen: true })).toContain("min-w-[380px]");
  });
  it("모달 상자 — 접힘이면 왼쪽 40% 폭(38.4vw)+손잡이 44px 로 줄고, 그 외엔 지금 문자열", () => {
    const now = "sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] sm:rounded-2xl";
    expect(modalBoxClass(false, false, false)).toBe(now);
    expect(modalBoxClass(false, true, true)).toBe(now);
    expect(modalBoxClass(true, true, false)).toBe("");
    expect(modalBoxClass(false, true, false)).toBe(
      "sm:w-[calc(38.4vw_+_44px)] sm:h-[94vh] sm:max-w-[716px] sm:max-h-[94vh] sm:rounded-2xl transition-[width] duration-200 ease-out",
    );
  });
});
```
(`modalBoxClass` 를 import 목록에 추가.)

- [ ] **Step 2: 실패 확인** `npx vitest run src/unified-detail/three-pane-layout.test.ts`

- [ ] **Step 3: 구현**
```ts
export function basicPaneClass(narrowSwitch: boolean, narrowPane: PaneName, mergeBasic: boolean = false): string {
  if (narrowSwitch) { ...기존... }
  // ERP 2분할(2026-09-02 사장님 승인): 기본정보는 가운데 탭줄로 들어가므로 왼쪽 칸을 안 그린다.
  if (mergeBasic) return "hidden";
  return "w-[320px] 2xl:w-[400px] flex-shrink-0 border-r border-wedly-bd/60 overflow-y-auto";
}
export function centerPaneClass(narrowSwitch, narrowPane, hasTrackRail, railOpen = false, mergeBasic = false) {
  if (narrowSwitch && narrowPane !== "center") return "hidden";
  if (!narrowSwitch && hasTrackRail) {
    if (mergeBasic) {
      // 2분할: 펼침이면 왼쪽 40% 고정(사장님 「너무 넓으면 불편」), 접힘이면 모달 자체가 줄어 가운데가 전부.
      return railOpen ? "w-[40%] flex-shrink-0 flex flex-col min-h-0" : "flex-1 min-w-0 flex flex-col min-h-0";
    }
    ...기존...
  }
  ...기존...
}
export function sidePaneClass(narrowSwitch, narrowPane, opts: { rail: boolean; railOpen: boolean; mergeBasic?: boolean }) {
  ...기존 분기 그대로... 단 마지막(펼침) 직전에:
  if (opts.mergeBasic) {
    return "relative flex-1 min-w-0 border-l border-wedly-bd/60 flex flex-col min-h-0 transition-[width] duration-200 ease-out";
  }
  return "relative flex-1 min-w-[380px] ...기존...";
}
/** 모달 상자 폭 클래스 — 2분할에서 레일을 접으면 왼쪽 40% 폭만 남기고 상자를 줄인다(넓게 퍼지지 않게). */
export function modalBoxClass(narrowSwitch: boolean, mergeBasic: boolean, railOpen: boolean): string {
  if (narrowSwitch) return "";
  if (mergeBasic && !railOpen) {
    // 38.4vw = 96vw × 0.4, 716 = 1680 × 0.4 + 44(손잡이)
    return "sm:w-[calc(38.4vw_+_44px)] sm:h-[94vh] sm:max-w-[716px] sm:max-h-[94vh] sm:rounded-2xl transition-[width] duration-200 ease-out";
  }
  return "sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] sm:rounded-2xl";
}
```
- [ ] **Step 4: 통과 확인** — 기존 시험 전부 + 새 시험.

### Task 2: ThreePaneShell 에 mergeBasic 전달

**Files:** `src/unified-detail/ThreePaneShell.tsx`
- [ ] props 에 `mergeBasic?: boolean` 추가(주석: ERP 2분할 — 기본정보를 탭줄로). `basicPaneClass(narrowSwitch, narrowPane, mergeBasic)`, `centerPaneClass(..., railOpen, mergeBasic)`, `sidePaneClass(..., { rail: hasTrackRail, railOpen, mergeBasic })`. `mergeBasic` 이면 `<aside>` 안에 `basicPane` 을 **그리지 않는다**(`{mergeBasic ? null : basicPane}`) — 기본정보 패널이 두 번 마운트돼 헛통신하지 않게.
- [ ] three-pane-layout.test.ts 의 ThreePaneShell 렌더 시험 옆에 추가: `renderToStaticMarkup(<ThreePaneShell mergeBasic ... basicPane={<i data-t="basic"/>} .../>)` 결과에 `data-t="basic"` 이 없고, mergeBasic 없이 부르면 있다. (기존 시험이 쓰는 렌더 방식을 그대로 따른다.)

### Task 3: UnifiedDetailView — 탭줄·본문·모달 상자

**Files:** `src/unified-detail/UnifiedDetailView.tsx`
- [ ] **Step 1: 스위치 계산** — `narrowSwitch` 선언(2646줄 부근) 바로 아래:
```ts
  // ERP 2분할(2026-09-02 사장님 승인): 넓은 화면 + 업무 현황 레일이 있으면 기본정보를 가운데 탭줄에 합친다.
  // 레일 없는 앱(하이브·일루아)·좁은 화면(포커스 모드)·compact 는 그대로.
  const mergeBasic = threePane && !narrowSwitch && Boolean(adapter.components.wideCenterPanel);
```
- [ ] **Step 2: 자동 이동 끄기** — 「wide 에서는 기본정보가 왼쪽 고정이라 가운데 탭이 __basic__ 이면 첫 분야로 옮긴다」 effect 를 `if (!threePane || mergeBasic) return;` 로. (2분할에서는 기본정보 탭이 첫 화면이다.) 의존성 배열에 `mergeBasic` 추가.
- [ ] **Step 3: 탭줄** — `sideContent` 의 분야 탭 map 바로 **앞**(`<div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0">` 첫 자식으로), `mergeBasic` 일 때만:
```tsx
{mergeBasic && (
  <>
    <button
      type="button"
      onClick={() => setActiveTab("__basic__")}
      className={`px-3 py-1.5 rounded-full text-[14px] sm:text-[13px] font-semibold whitespace-nowrap transition-colors inline-flex items-center gap-1.5 flex-shrink-0 ${
        activeTab === "__basic__" ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray hover:text-wedly-t2"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M6 17c.6-1.6 1.8-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 14h4" />
      </svg>
      기본정보
    </button>
    {/* 기본정보와 분야 탭이 다른 묶음임을 보이는 구분 표식(사장님 2026-09-02) */}
    <span aria-hidden="true" className="inline-flex items-center gap-1 ml-1 mr-1 pl-3 h-6 border-l border-wedly-bd-blue text-[11px] font-semibold text-wedly-muted flex-shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-wedly-accent-ink"><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /></svg>
      분야
    </span>
  </>
)}
```
- [ ] **Step 4: 본문** — `sideContent` 에서 「오른쪽 한 줄 — 히스토리 · 세부 탭 · 파일」 줄(`sideBtn("history", ...)` 이 있는 `<div className="p-2 border-b ...">`)부터 그 아래 본문 분기 전체를 `mergeBasic && activeTab === "__basic__"` 이면 **대신** 아래를 그린다(나머지 경우는 지금 그대로):
```tsx
<div className="flex-1 min-h-0 overflow-y-auto">
  <BasicInfoPanel
    row={row} detail={detail} loading={loading} onOpenTab={openGroupTab} onSaved={handleSaved}
    isAdmin={isAdmin} orderedGroups={orderedGroups} saveOwnField={adapter.api.saveOwnField}
    ownDomain={adapter.ownDomain} loadColumnConfig={adapter.api.loadColumnConfig}
    saveColumnConfig={adapter.api.saveColumnConfig} loadManagers={adapter.api.loadManagers}
    adapter={adapter} hiddenColumnKeys={hiddenColumnKeys} stacked
  />
</div>
```
(왼쪽 칸에 넘기던 props 와 **완전히 같게** — 한 곳에 `const basicInfoPanel = <BasicInfoPanel .../>` 로 만들어 두 자리에서 쓴다.) `stacked` 머리 밴드(「기본정보」 글자 + 공통 칸 관리·탭 편집)는 그대로 둔다 — 분야 탭의 둘째 줄(히스토리·계약정보…)과 같은 자리의 도구줄 역할.
- [ ] **Step 5: ThreePaneShell 호출** — `mergeBasic={mergeBasic}` 추가, `basicPane={basicInfoPanel}` (shell 이 mergeBasic 이면 안 그린다).
- [ ] **Step 6: 모달 상자** — 3512줄 `className={\`relative bg-white ... ${narrowSwitch ? "" : "sm:w-[96vw] ..."}\`}` 의 삼항을 `modalBoxClass(narrowSwitch, mergeBasic, trackRailOpen)` 으로 교체(import 추가). 문자열 결과는 기존과 같아야 한다(시험 Task 1).
- [ ] **Step 7: 검증** — `npm test`, `npm run typecheck` 둘 다 0 오류. `grep -n "mergeBasic" src/unified-detail/*.ts*` 로 6곳 이상 연결 확인.

### 범위 밖 / 금지
- `compact`·좁은 화면(narrowSwitch)·레일 없는 앱 경로의 문자열·동작 변경 금지(기존 시험이 지킨다).
- ERP 저장소는 손대지 않는다(핀 갱신은 메인이 한다).
