# 과제: UnifiedDetailView 에 3분할(wide) 레이아웃 스위치 추가 — add-only

## 절대 금지 (하나라도 어기면 작업 전체 무효)
- git commit · push · reset · 브랜치 조작 · stash 금지. 절대경로 git 우회도 금지.
- 이 폴더(.worktrees/three-pane) 밖 파일 접근·수정 금지. 파일 삭제 금지.
- **기존(compact) 렌더 경로의 JSX·클래스 문자열·동작 변경 금지** — 새 분기 추가만 한다.
- 이 부품은 ERP·하이브·일루아 3앱 공용. 새 prop을 안 넘기는 앱은 어떤 변화도 없어야 한다.

## 파일
- 수정: `src/unified-detail/UnifiedDetailView.tsx` (2,768줄)
- 수정: `src/unified-detail/adapter-types.ts`
- 필요 시 수정: TaxAmendmentPanel·SectionDetailPanel 이 같은 파일 안에 있으므로 그 함수들의 props 확장 포함

## 배경 지도 (실측 줄번호)
- 메인 렌더(비 isNew): 2542~. 모달 껍데기 2551-2554, 헤더 2556-2579, 윗줄 탭바 2582-2678,
  본문 2681-2763 (`__basic__` → BasicInfoPanel / 커스텀 분야 / 그룹 → GroupDomainPanel).
- GroupDomainPanel: 1764~. 세 분기 — 경정청구 → TaxAmendmentPanel(110~, 하위 탭: 히스토리/정산정보/미팅정보/파일),
  커스텀 패널(adapter.components.sectionPanels — 1820~), 그 외 → SectionDetailPanel(384~, SectionHistoryPanel 695).
- 히스토리는 분야(그룹)별 기록이다: TaxAmendmentPanel 은 `<HistoryPanel pageId={entryId} rowData={localRow} api={historyApi}/>`(326),
  SectionDetailPanel 은 `<SectionHistoryPanel …>`(695).
- 파일: TaxAmendmentPanel 의 "파일" 하위 탭이 `adapter.components.ErpFilesPanel` 을 렌더한다(사용처를 찾아 props 를 그대로 따라 쓸 것).

## 할 일

### 1) props 추가 (UnifiedDetailView)
- `layout?: "compact" | "wide"` — 기본 `"compact"`.
- `headerChipKeys?: string[]` — wide 헤더에 값 칩으로 보여줄 행(row) 칸 키 목록.

### 2) adapter-types.ts — 주입점 추가
`components.sectionPanels` 선언 바로 아래에:
```ts
/** 분야 그룹별 "패널 위에 얹는 머리 조각" — 제공 시 그 그룹 패널(기본·커스텀 모두) 위에 렌더.
 *  미제공이면 기존 동작(하이브·일루아 불변). props 는 sectionPanels 와 동일(SectionPanelProps). */
sectionPanelHeaders?: Record<string, React.ComponentType<SectionPanelProps>>;
```

### 3) GroupDomainPanel — 머리 조각 렌더
세 분기(TaxAmendmentPanel / CustomSectionPanel / SectionDetailPanel) **모두**에서, 패널 위에:
```tsx
const HeaderPanel = adapter.components.sectionPanelHeaders?.[group.key];
```
있으면 `<HeaderPanel rows={allRows && allRows.length > 0 ? allRows : rows} primaryRow={primaryRow} isAdmin={isAdmin} onSaved={onSaved} adapter={adapter} />` 를 패널 위에 렌더.
구현은 세 return 을 공통 래퍼로 감싸되, HeaderPanel 미제공 시 렌더 트리가 지금과 동일해야 한다
(불필요한 래퍼 div 를 추가하지 말 것 — Fragment 사용).

### 4) wide 레이아웃 분기
- `const [wideViewport, setWideViewport] = useState(...)` — `matchMedia("(min-width:1024px)")` 구독.
- `const wideActive = layout === "wide" && !isNew && wideViewport;`
- `wideActive` 면 기존 return 대신 **새 JSX** 반환(기존 isNew 분기처럼 별도 블록 — JSX 일부 중복 허용):
  - 모달 껍데기: 기존 클래스에서 크기만 교체 →
    `relative bg-white shadow-2xl w-full h-full sm:w-[96vw] sm:h-[94vh] sm:max-w-[1680px] sm:max-h-[94vh] flex flex-col rounded-none sm:rounded-2xl overflow-hidden animate-modal-in`
  - 헤더: 기존 헤더(아바타·EditableTitle·닫기)와 동일 + 회사명 오른쪽에 칩 줄:
    `headerChipKeys` 의 각 키에 대해 `row[key]` 값이 비어있지 않으면(문자열화) 칩
    `<span className="rounded-full bg-wedly-bg-gray border border-wedly-bd px-2.5 py-0.5 text-[11px] text-wedly-t2 whitespace-nowrap">값</span>`
    최대 5개. 배열 값은 쉼표로 합친다.
  - 본문 `<div className="flex flex-1 min-h-0">`:
    - 왼쪽 `<aside className="w-[340px] flex-shrink-0 border-r border-wedly-bd/60 overflow-y-auto">`
      → 기존 `__basic__` 분기와 동일한 `<BasicInfoPanel …>` 호출 + `stacked` (아래 6번).
    - 중앙 `<main className="flex-1 min-w-0 flex flex-col">`
      - 탭바: 기존 윗줄 탭바(2582-2678)와 동일하되 **"기본정보" 고정 버튼만 뺀다**(분야 그룹 탭 + 편집 모드 + 탭 편집 버튼 유지).
      - 본문 `<div className="flex-1 min-h-0 overflow-y-auto">`: 기존 커스텀/그룹 분기(2714-2762)와 동일.
      - wide 에서 `activeTab === "__basic__"` 이면 첫 번째 visibleGroups 로 자동 이동하는 useEffect
        (wideActive 일 때만 동작 — compact 에는 영향 0).
    - 오른쪽 `<aside className="w-[340px] flex-shrink-0 border-l border-wedly-bd/60 flex flex-col min-h-0">`
      - 상단 전환 줄(패딩 p-2, 아래 구분선): 버튼 2개 [히스토리]/[파일] —
        활성: `bg-wedly-bg-blue text-wedly-accent font-semibold rounded-lg px-3 py-1.5 text-[12px]`,
        비활성: `text-wedly-muted hover:bg-wedly-bg-gray rounded-lg px-3 py-1.5 text-[12px]`.
      - 히스토리 모드: **지금 활성 그룹의 히스토리 패널을 그대로** 렌더 —
        활성 그룹이 경정청구(TaxAmendmentPanel을 쓰는 그룹)면 그 그룹 행의
        `<HistoryPanel pageId={entryId} rowData={행} api={historyApi}/>` (326줄 사용법과 동일한 props 산출),
        그 외 그룹이면 SectionDetailPanel 이 쓰는 `<SectionHistoryPanel …>` 을 동일 props 로.
        행이 없거나 그룹 미선택이면 가운데 안내문(`text-[12px] text-wedly-muted`) "이 영역의 기록이 아직 없어요".
        구현 시 기존 컴포넌트에서 히스토리 렌더 부분을 **작은 함수/컴포넌트로 추출해 재사용해도 좋다** —
        단 추출 후 기존 경로의 렌더 결과가 완전히 동일해야 한다.
      - 파일 모드: `adapter.components.ErpFilesPanel` 이 있으면 TaxAmendmentPanel "파일" 하위 탭과
        동일한 props 로 렌더. 없으면(하이브·일루아) 안내문 "파일 패널이 없는 앱입니다".
- 배경 클릭 닫기·포커스 저장(handleClose)은 기존과 동일하게.

### 5) 중앙 하위 탭 중복 제거 (wide 전용, add-only)
TaxAmendmentPanel 과 SectionDetailPanel 에 선택 prop `hiddenSubTabs?: string[]` 추가(기본 undefined = 불변).
wide 의 중앙 GroupDomainPanel 호출에만 `hiddenSubTabs={["history","files"]}` 에 해당하는 값을 넘겨
하위 탭 목록에서 히스토리·파일 탭 버튼을 감춘다(내용 분기는 그대로 두되 버튼만 제외 — 기본 하위 탭이
history 인 경우 첫 보이는 탭으로 대체). 실제 하위 탭 키 이름은 코드에서 확인해 그대로 쓸 것.
GroupDomainPanel 에 이 값을 통과시키는 props 연결 포함. compact 경로 호출부는 수정하지 않는다.

### 6) BasicInfoPanel `stacked?: boolean` (기본 undefined = 불변)
행 렌더러(EditableFieldRow 및 기본정보 행 렌더 부분)의 래퍼가 현재 라벨 고정폭
(`w-full sm:w-[160px] sm:flex-shrink-0` 류) 가로 배치인데, `stacked` 면 세로 배치:
라벨 `text-[10.5px] text-wedly-muted mb-0.5` 위, 값 아래(폭 100%). 편집 동작·저장 로직은 손대지 않는다.
공통/커스텀 뱃지는 stacked 에서 라벨 줄 왼쪽에 그대로 둔다.

### 7) 검사
- `npx tsc --noEmit` (tsconfig.json 있음) — 오류 0
- `npx vitest run` — 전부 통과. **기존 시험의 기대값을 바꾸지 말 것.**

## 완료 보고 형식 (짧게)
- 바꾼 파일 목록 + 파일별 무엇을 추가했는지 한 줄씩 + 새 분기 시작 줄번호
- tsc/vitest 결과 요약
