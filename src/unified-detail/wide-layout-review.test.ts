import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  OWN_DOMAIN_SUB_TABS,
  SECTION_SUB_TABS,
  rightRailSubTabs,
  subTabsOfGroup,
} from "./section-sub-tabs";

const DIR = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");

// 2026-09-03 적대적 리뷰 6건. 화면 렌더 시험이 없는 저장소라, 배선은 이 저장소가 이미 쓰는
// 방식(원본 글자 검사 — custom-section-subtab.test.ts 와 동일)으로, 계산은 순수 함수로 못 박는다.

describe("[P0] wide 반환도 DetailLoadStateProvider 안에서 그린다", () => {
  it("wide 블록의 return 이 Provider 로 시작하고 같은 값(rowsLoadFailed)을 넘긴다", () => {
    const i = src.indexOf('if (wideActive || narrowSwitch) {');
    expect(i).toBeGreaterThan(-1);
    // compact 렌더 블록("// ── 렌더 ──") 앞까지가 wide 블록.
    const block = src.slice(i, src.indexOf("// ── 렌더 ──", i));
    expect(block).toContain("<DetailLoadStateProvider rowsLoadFailed={rowsLoadFailed}>");
    expect(block).toContain("</DetailLoadStateProvider>");
    // Provider 가 FieldOptionsProvider 보다 바깥이어야 분야 패널까지 값이 닿는다.
    expect(block.indexOf("<DetailLoadStateProvider")).toBeLessThan(
      block.indexOf("<FieldOptionsProvider"),
    );
  });

  it("상세창 전체에서 Provider 열림/닫힘 개수가 같다(wide·compact 두 벌)", () => {
    expect(src.split("<DetailLoadStateProvider").length - 1).toBe(2);
    expect(src.split("</DetailLoadStateProvider>").length - 1).toBe(2);
  });
});

describe("[P1] wide 파일 칸 — 합산 목록과 갱신 통로", () => {
  const i = src.indexOf("function WideFilesPane(");
  const block = src.slice(i, src.indexOf("\nexport default function UnifiedDetailView", i));

  it("compact(BasicFilesField)와 같은 합산으로 allFiles 를 넘긴다", () => {
    expect(i).toBeGreaterThan(-1);
    expect(block).toContain("adapter.getAllFiles(row as Record<string, unknown>, detail)");
    expect(block).toContain("allFiles={allFiles}");
  });

  it("일루아 어댑터 시그니처(row, detail) 를 그대로 쓴다 — 인자 하나로 줄이지 않는다", () => {
    expect(block).not.toMatch(/getAllFiles\(\s*row\s*\)/);
  });

  it("패널이 자체 저장을 해도 부모가 다시 읽는다(갱신 콜백 + 탭 전환 시 재조회)", () => {
    expect(block).toContain("onSaved={notifySaved}");
    expect(block).toContain("onChanged={notifySaved}");
    // 마운트(=파일 탭 전환) 때 한 번 최신 행을 다시 읽는다.
    expect(block).toMatch(/useEffect\(\(\) => \{\s*refresh\?\.\(\);/);
  });

  it("훅이 조기 반환보다 위에 있다 — 아래로 내리면 훅 개수가 갈려 화면이 죽는다", () => {
    expect(block.indexOf("useEffect(")).toBeLessThan(block.indexOf("if (!ErpFilesPanel)"));
  });

  it("호출부가 detail 을 넘긴다", () => {
    expect(src).toContain("<WideFilesPane row={row} detail={detail}");
  });
});

describe("[P1] 머리 조각(sectionPanelHeaders)은 wide 에서만", () => {
  it("GroupDomainPanel 이 wideLayout 검사를 거친다", () => {
    expect(src).toContain(
      "const HeaderPanel = wideLayout && !omitHeader ? adapter.components.sectionPanelHeaders?.[group.key] : undefined;",
    );
  });

  it("compact 호출부는 wideLayout 을 안 넘긴다 → 머리 조각이 안 그려진다", () => {
    // 파일 안 GroupDomainPanel 호출 3곳: wide 2곳만 wideLayout.
    const calls = src.split("<GroupDomainPanel").slice(1);
    expect(calls).toHaveLength(3);
    const withWide = calls.filter((c) => c.slice(0, c.indexOf("/>")).includes("wideLayout"));
    expect(withWide).toHaveLength(2);
    // 마지막(= compact 렌더 블록) 호출은 없어야 한다.
    const last = calls[2].slice(0, calls[2].indexOf("/>"));
    expect(last).not.toContain("wideLayout");
    expect(last).not.toContain("omitHeader");
  });
});

describe("[P1] 세부 탭은 단정하지 않고 패널의 실제 목록을 따른다", () => {
  it("자기분야 패널에도 정산정보가 있다(일루아 정부지원금)", () => {
    expect(OWN_DOMAIN_SUB_TABS.map((t) => t.key)).toContain("settlement");
  });

  it("정본 배열이 옮기기 전 패널 안 배열과 한 글자도 같다(순서·이름 포함)", () => {
    const 원래 = [
      { key: "history", label: "히스토리" },
      { key: "contract", label: "계약정보" },
      { key: "settlement", label: "정산정보" },
      { key: "refund", label: "환불정보" },
      { key: "meetings", label: "미팅정보" },
    ];
    expect(OWN_DOMAIN_SUB_TABS).toEqual(원래);
    expect(SECTION_SUB_TABS).toEqual(원래);
  });

  it("subTabsOfGroup — 자기분야/그 외 모두 목록을 준다", () => {
    expect(subTabsOfGroup("government-subsidy", "government-subsidy", false)).toBe(OWN_DOMAIN_SUB_TABS);
    expect(subTabsOfGroup("cert", "government-subsidy", false)).toBe(SECTION_SUB_TABS);
  });

  it("어댑터 자기 패널이 있으면 「모름」(null) — 단정하지 않는다", () => {
    expect(subTabsOfGroup("government-subsidy", "government-subsidy", true)).toBeNull();
  });

  it("오른쪽 줄은 목록에서 히스토리·파일만 뺀다", () => {
    expect(rightRailSubTabs(OWN_DOMAIN_SUB_TABS).map((t) => t.key)).toEqual([
      "contract",
      "settlement",
      "refund",
      "meetings",
    ]);
  });

  it("모르면 빈 배열 — 부르는 쪽이 패널 안 탭 줄을 살린다", () => {
    expect(rightRailSubTabs(null)).toEqual([]);
    expect(src).toContain('hiddenSubTabs={knownSubTabs ? ["history", "files"] : undefined}');
    expect(src).toContain("hideSubTabBar={Boolean(knownSubTabs)}");
  });

  it("패널 SUB_TABS 가 정본 배열을 그대로 쓴다(두 벌이 갈라지지 않게)", () => {
    expect(src).toContain("const SUB_TABS: { key: SubTab; label: string }[] = OWN_DOMAIN_SUB_TABS;");
    expect(src).toContain("const SUB_TABS: { key: SubTab; label: string }[] = SECTION_SUB_TABS;");
    // 「자기분야면 정산 없음」 단정이 되살아나면 잡는다.
    expect(src).not.toContain("currentGroup?.key === adapter.ownDomain");
  });
});

describe("[P2] 분야 탭을 누르면 narrowPane 도 그 칸으로", () => {
  it("탭 클릭이 activeTab 과 narrowPane 을 함께 바꾼다", () => {
    expect(src).toContain(
      'onClick={() => { setActiveTab(group.key); setNarrowPane(hasTrackRail ? "center" : "side"); }}',
    );
  });

  it("현황표 「탭 열기」도 레일 유무에 맞는 칸으로 간다", () => {
    expect(src).toContain('setNarrowPane(adapter.components.wideCenterPanel ? "center" : "side");');
  });
});
