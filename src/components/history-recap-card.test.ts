import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const src = readFileSync(new URL("./HistoryRecapCard.tsx", import.meta.url), "utf8");

describe("★정리 카드 디자인 계약", () => {
  it("굵기 600 인 줄은 headline 하나뿐이다 — 단추에 굵은 글씨를 넣지 않는다", () => {
    expect((src.match(/font-semibold|font-bold/g) ?? [])).toHaveLength(1);
  });
  it("원시 색을 쓰지 않는다 — WEDLY 토큰만", () => {
    expect(src).not.toMatch(/(bg|text|border)-(red|green|blue|gray|slate|amber|yellow|sky|indigo)-\d{2,3}/);
  });
  it("카톡 보고 단추가 있다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("kakaoReportFor");
    expect(panel).toContain("카톡 보고");
  });
  it("★clipboard 가 없어도 죽지 않는다 — 대비 경로가 있다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("fallbackCopy");
  });
  it("★단추가 줄 머리에 있어 모든 기록에서 보인다 — 카드 안에만 두면 37% 만 쓸 수 있다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("카톡 보고");
    expect(panel).toContain("kakaoReportFor");
    // 수정·삭제처럼 권한으로 감싸면 안 된다 — 단추가 canEditOrDelete 조각 안에 있으면 안 된다.
    // (공유 단추 바로 앞은 권한 조각 밖이므로, 조각의 </> 까지만 자른다.)
    const 권한시작 = panel.indexOf("canEditOrDelete(c) && editingCommentId");
    const 권한블록 = panel.slice(권한시작, panel.indexOf("</>", 권한시작));
    expect(권한블록).not.toContain("카톡 보고");
  });
  it("★서버가 만든 글이 있으면 그것을 쓴다 — 대표자께 보내는 말투는 AI 가 다시 쓴다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("buildKakaoReport?");
    expect(panel).toMatch(/buildKakaoReport\(c\)/);
  });
  it("★서버가 안 되면 기계글로 떨어진다 — 단추가 먹통이 되면 안 된다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    const 블록 = panel.slice(panel.indexOf("const openKakao"), panel.indexOf("const openKakao") + 1800);
    expect(블록).toContain("kakaoReportFor(c)");
    expect(블록).toMatch(/catch\s*\{/);
  });
  it("★기다리는 동안 표시가 있다 — AI 는 몇 초 걸린다", () => {
    const dialog = readFileSync(new URL("./KakaoReportDialog.tsx", import.meta.url), "utf8");
    expect(dialog).toContain("다시 쓰는 중");
  });
});

describe("★배선 자체를 지킨다 — 글자만 보면 배선을 끊어도 초록불이었다 (2026-08-29 적대적 리뷰)", () => {
  const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
  const seedPanel = readFileSync(new URL("../unified-detail/HistoryPanel.tsx", import.meta.url), "utf8");

  it("★단추가 실제로 openKakao 에 물려 있다 — onClick 을 빈 함수로 바꾸면 잡는다", () => {
    expect(panel).toMatch(/onClick=\{\(\)\s*=>\s*openKakao\(c\)\}/);
  });

  it("★씨앗이 실제로 패널에 넘어간다 — seedComments 를 지우면 깜빡임이 부활한다", () => {
    expect(seedPanel).toMatch(/seedComments=\{seed\}/);
  });

  it("★복사 실패를 성공으로 표시하지 않는다 — execCommand 결과를 본다", () => {
    expect(panel).toMatch(/const ok = document\.execCommand\("copy"\)/);
    expect(panel).toContain("실패안내");
  });

  it("★기다림 표시가 실제 상태에 물려 있다", () => {
    expect(panel).toMatch(/loading=\{kakaoDialog\?\.loading \?\? false\}/);
  });
});

describe("★카톡 보고 알약 + 대화상자", () => {
  const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("./KakaoReportDialog.tsx", import.meta.url), "utf8");
  const RAW_TW = /(bg|text|border)-(red|green|blue|gray|slate|amber|yellow|sky|indigo)-\d{2,3}/;

  it("카톡 보고 단추는 hover 숨김 그룹 밖에 있다", () => {
    const hoverOpen = panel.indexOf('focus-within:opacity-100 transition">');
    expect(hoverOpen).toBeGreaterThan(-1);
    const hoverClose = panel.indexOf("</div>", hoverOpen);
    const kakaoSpan = panel.indexOf("<span>카톡 보고</span>");
    expect(kakaoSpan).toBeGreaterThan(hoverClose);

    const btnStart = panel.lastIndexOf("<button", kakaoSpan);
    const btnEnd = panel.indexOf("</button>", kakaoSpan);
    const btn = panel.slice(btnStart, btnEnd);
    expect(btn).toContain("카톡 보고");
    expect(btn).not.toContain("group-hover/comment:opacity-100");
  });

  it("KakaoReportDialog 에 raw Tailwind 색이 없다", () => {
    expect(dialog).not.toMatch(RAW_TW);
  });

  it("HistoryPanel 이 KakaoReportDialog 를 import 한다", () => {
    expect(panel).toMatch(/import\s*\{\s*KakaoReportDialog\s*\}\s*from\s*["']\.\/KakaoReportDialog["']/);
  });
});

describe("★AI 보고문 통로가 끝까지 이어져 있다 — 중간에서 끊기면 늘 기계글만 나간다", () => {
  const mid = readFileSync(new URL("../unified-detail/HistoryPanel.tsx", import.meta.url), "utf8");

  it("중간 부품이 앱에서 통로를 받는다", () => {
    expect(mid).toContain("buildKakaoReport?:");
  });

  it("★받은 통로를 공용 패널로 실제로 넘긴다 — 여기가 끊겨 있었다(2026-08-29)", () => {
    expect(mid).toMatch(/buildKakaoReport=\{보고문만들기\}/);
  });

  it("★앱이 통로를 안 실으면 넘기지 않는다 — 하이브·일루아는 기계글로 떨어져야 한다", () => {
    expect(mid).toContain("api.buildKakaoReport ?");
    expect(mid).toContain(": undefined");
  });
});

describe("★배선은 네 자리다 — 한 곳만 새도 카톡 보고가 조용히 기계글로 떨어진다", () => {
  // 앱 어댑터 → UnifiedDetailView(historyApi) → unified-detail/HistoryPanel → 공용 HistoryPanel
  // 2026-08-29: 셋만 잇고 UnifiedDetailView 를 빠뜨려, 배포하고 눌러 보고서야 알았다.
  const view = readFileSync(new URL("../unified-detail/UnifiedDetailView.tsx", import.meta.url), "utf8");
  const types = readFileSync(new URL("../unified-detail/adapter-types.ts", import.meta.url), "utf8");

  it("어댑터 자료형에 통로가 있다", () => {
    expect(types).toContain("buildKakaoReport?(");
  });

  it("★UnifiedDetailView 가 historyApi 에 통로를 실어 넘긴다 — 여기가 새고 있었다", () => {
    const memo = view.slice(view.indexOf("const historyApi"), view.indexOf("const historyApi") + 700);
    expect(memo).toContain("adapter.api.buildKakaoReport");
  });

  it("★어댑터에 통로가 없으면 안 넘긴다 — 하이브·일루아는 기계글로 떨어져야 한다", () => {
    const memo = view.slice(view.indexOf("const historyApi"), view.indexOf("const historyApi") + 700);
    expect(memo).toMatch(/adapter\.api\.buildKakaoReport\s*\n?\s*\?/);
  });
});
