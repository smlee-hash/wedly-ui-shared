import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));

// NO.190 — 어댑터가 주입한 커스텀 분야 패널(ERP 정부지원금)에 지금 하위 탭을 안 넘겨,
// 3분할에서 「정산정보」·「환불정보」·「미팅정보」를 눌러도 계약 카드만 나오던 결함.
// 배포본까지 새어 나가 사용자 신고로 발견됐다. 이 두 줄이 다시 빠지면 같은 증상이 그대로 재발하는데,
// 화면 렌더 시험이 없는 저장소라 이 저장소가 이미 쓰는 방식(원본 글자 검사)으로 배선을 못 박는다.
describe("커스텀 분야 패널 하위 탭 배선 (NO.190)", () => {
  const src = readFileSync(join(DIR, "UnifiedDetailView.tsx"), "utf8");

  it("CustomSectionPanel 에 subTab 과 onSubTabChange 를 넘긴다", () => {
    const i = src.indexOf("const CustomSectionPanel = adapter.components.sectionPanels?.[group.key];");
    expect(i).toBeGreaterThan(-1);
    // 그 블록 안(다음 `);` 까지)에 두 prop 이 있어야 한다 — 다른 패널의 것과 헷갈리지 않게 범위를 좁힌다.
    const block = src.slice(i, src.indexOf("\n  }\n", i));
    expect(block).toContain("subTab={subTab}");
    expect(block).toContain("onSubTabChange={(t: string) =>");
    expect(block).toContain("isSubTabKey(t)");
  });

  it("바깥으로 되돌아오는 탭 키를 그냥 캐스트하지 않고 거른다", () => {
    expect(src).toContain("function isSubTabKey(v: string): v is SubTab");
    // 무검증 캐스트가 되살아나면 잡는다.
    expect(src).not.toContain("onSubTabChange(t as SubTab)");
  });
});
