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
    expect(panel).toContain("await buildKakaoReport(c)");
  });
  it("★서버가 안 되면 기계글로 떨어진다 — 단추가 먹통이 되면 안 된다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    const 블록 = panel.slice(panel.indexOf("const copyKakao"), panel.indexOf("const copyKakao") + 1400);
    expect(블록).toContain("kakaoReportFor(c)");
    expect(블록).toMatch(/catch\s*\{/);
  });
  it("★기다리는 동안 표시가 있다 — AI 는 몇 초 걸린다", () => {
    const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
    expect(panel).toContain("만드는 중");
  });
});

describe("★배선 자체를 지킨다 — 글자만 보면 배선을 끊어도 초록불이었다 (2026-08-29 적대적 리뷰)", () => {
  const panel = readFileSync(new URL("./HistoryPanel.tsx", import.meta.url), "utf8");
  const seedPanel = readFileSync(new URL("../unified-detail/HistoryPanel.tsx", import.meta.url), "utf8");

  it("★단추가 실제로 copyKakao 에 물려 있다 — onClick 을 빈 함수로 바꾸면 잡는다", () => {
    expect(panel).toMatch(/onClick=\{\(\)\s*=>\s*copyKakao\(c\)\}/);
  });

  it("★씨앗이 실제로 패널에 넘어간다 — seedComments 를 지우면 깜빡임이 부활한다", () => {
    expect(seedPanel).toMatch(/seedComments=\{seed\}/);
  });

  it("★복사 실패를 성공으로 표시하지 않는다 — execCommand 결과를 본다", () => {
    expect(panel).toMatch(/const ok = document\.execCommand\("copy"\)/);
    expect(panel).toContain("실패안내");
  });

  it("★기다림 표시가 실제 상태에 물려 있다", () => {
    expect(panel).toMatch(/kakaoBusyId === c\.id \? "만드는 중/);
  });
});
