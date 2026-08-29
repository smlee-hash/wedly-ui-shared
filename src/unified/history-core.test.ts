import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseCommentBody,
  appendImageLines,
  historyThumbnailUrl,
  canEditOrDelete,
  sortCommentsAsc,
  buildEffectiveTabs,
  knownCategoryIds,
  computeCategoryCounts,
  filterByCategory,
  hasRenderableRecap,
  safeRecapKind,
  safeRecapLines,
  buildKakaoReport,
  ALL_TAB_ID,
  GENERAL_TAB_ID,
  type UnifiedComment,
  type HistoryCategoryDef,
  type CommentRecap, kakaoReportDate } from "./history-core";

const FALLBACKS: HistoryCategoryDef[] = [
  { id: "policy", label: "정책자금" },
  { id: "free", label: "무상지원금" },
  { id: "cert", label: "인증제도" },
];

function c(partial: Partial<UnifiedComment> & { id: string }): UnifiedComment {
  return { name: "홍길동", text: "", createdAt: "2026-01-01T00:00:00Z", ...partial };
}

describe("parseCommentBody — 본문 줄 파싱(이미지/텍스트)", () => {
  it("빈 본문 → 빈 배열", () => {
    expect(parseCommentBody("")).toEqual([]);
  });
  it("일반 텍스트만", () => {
    expect(parseCommentBody("안녕하세요")).toEqual([{ type: "text", value: "안녕하세요" }]);
  });
  it("이미지 줄만", () => {
    expect(parseCommentBody("[이미지] https://x/a.png")).toEqual([
      { type: "image", url: "https://x/a.png" },
    ]);
  });
  it("텍스트 + 이미지 혼합(줄 순서 유지)", () => {
    expect(parseCommentBody("메모\n[이미지] https://x/a.png\n끝")).toEqual([
      { type: "text", value: "메모" },
      { type: "image", url: "https://x/a.png" },
      { type: "text", value: "끝" },
    ]);
  });
  it("이미지 줄 앞뒤 공백 허용", () => {
    expect(parseCommentBody("[이미지]   https://x/b.jpg  ")).toEqual([
      { type: "image", url: "https://x/b.jpg" },
    ]);
  });
});

describe("appendImageLines — 본문+이미지 합치기", () => {
  it("텍스트 + 이미지 url 들", () => {
    expect(appendImageLines("메모", ["https://x/a", "https://x/b"])).toBe(
      "메모\n[이미지] https://x/a\n[이미지] https://x/b",
    );
  });
  it("이미지만(본문 비어도 앞 빈 줄 없이)", () => {
    expect(appendImageLines("", ["https://x/a"])).toBe("[이미지] https://x/a");
  });
  it("본문만(이미지 없음)", () => {
    expect(appendImageLines("메모", [])).toBe("메모");
  });
  it("빈 url 은 무시", () => {
    expect(appendImageLines("메모", ["", "https://x/a"])).toBe("메모\n[이미지] https://x/a");
  });
});

describe("canEditOrDelete — 편집·삭제 권한", () => {
  const base = { currentUserName: "홍길동", ownSource: "hive" };
  it("내 앱 + 본인 글 → 가능", () => {
    expect(canEditOrDelete(c({ id: "1", name: "홍길동", source: "hive" }), base)).toBe(true);
  });
  it("내 앱 + 남의 글 + 비관리자 → 불가", () => {
    expect(canEditOrDelete(c({ id: "1", name: "김철수", source: "hive" }), base)).toBe(false);
  });
  it("내 앱 + 남의 글 + 관리자 → 가능", () => {
    expect(canEditOrDelete(c({ id: "1", name: "김철수", source: "hive" }), { ...base, isAdmin: true })).toBe(true);
  });
  it("다른 앱 글 + 비관리자 → 불가(읽기전용)", () => {
    expect(canEditOrDelete(c({ id: "1", name: "홍길동", source: "erp" }), base)).toBe(false);
  });
  it("다른 앱 글 + 관리자 → 가능", () => {
    expect(canEditOrDelete(c({ id: "1", name: "홍길동", source: "erp" }), { ...base, isAdmin: true })).toBe(true);
  });
  it("source 없음(자기 앱 글로 간주) + 본인 → 가능", () => {
    expect(canEditOrDelete(c({ id: "1", name: "홍길동" }), base)).toBe(true);
  });
});

describe("sortCommentsAsc — 오래된 글이 위로", () => {
  it("createdAt 오름차순 정렬, 원본 불변", () => {
    const input = [
      c({ id: "b", createdAt: "2026-03-01T00:00:00Z" }),
      c({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      c({ id: "c", createdAt: "2026-05-01T00:00:00Z" }),
    ];
    const out = sortCommentsAsc(input);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(input.map((x) => x.id)).toEqual(["b", "a", "c"]); // 원본 그대로
  });
});

describe("buildEffectiveTabs — 분류 탭 구성", () => {
  it("통합 탭이 항상 첫 번째(삭제 불가)", () => {
    const tabs = buildEffectiveTabs({ fallbacks: FALLBACKS });
    expect(tabs[0]).toEqual({ id: ALL_TAB_ID, label: "통합", removable: false, isFallback: false });
    expect(tabs.map((t) => t.id)).toEqual(["all", "policy", "free", "cert"]);
  });
  it("숨긴 내장 분류는 제외", () => {
    const tabs = buildEffectiveTabs({ fallbacks: FALLBACKS, hiddenFallbackIds: ["free"] });
    expect(tabs.map((t) => t.id)).toEqual(["all", "policy", "cert"]);
  });
  it("사용자 분류와 id 가 겹치는 내장 분류는 제외하고, 사용자 분류를 뒤에 추가", () => {
    const tabs = buildEffectiveTabs({
      fallbacks: FALLBACKS,
      categories: [{ id: "cert", label: "인증(맞춤)" }, { id: "vc", label: "벤처" }],
    });
    expect(tabs.map((t) => t.id)).toEqual(["all", "policy", "free", "cert", "vc"]);
    // cert 는 사용자 정의가 우선(뒤쪽), 내장 cert 는 빠짐
    expect(tabs.find((t) => t.id === "cert")).toEqual({ id: "cert", label: "인증(맞춤)", removable: true, isFallback: false });
  });
});

describe("knownCategoryIds / computeCategoryCounts / filterByCategory", () => {
  const tabs = buildEffectiveTabs({ fallbacks: FALLBACKS });
  const known = knownCategoryIds(tabs);
  const comments = [
    c({ id: "1", category: "policy" }),
    c({ id: "2", category: "policy" }),
    c({ id: "3", category: "cert" }),
    c({ id: "4" }), // 분류 없음 → 미분류
    c({ id: "5", category: "벤처" }), // 알 수 없는 분류 → 미분류
  ];

  it("knownCategoryIds 는 통합/미분류 제외", () => {
    expect(known.has(ALL_TAB_ID)).toBe(false);
    expect(known.has(GENERAL_TAB_ID)).toBe(false);
    expect([...known].sort()).toEqual(["cert", "free", "policy"]);
  });
  it("computeCategoryCounts: 전체·분류별·미분류 집계", () => {
    const counts = computeCategoryCounts(comments, known);
    expect(counts[ALL_TAB_ID]).toBe(5);
    expect(counts.policy).toBe(2);
    expect(counts.cert).toBe(1);
    expect(counts[GENERAL_TAB_ID]).toBe(2); // id 4(없음) + id 5(알 수 없음)
  });
  it("filterByCategory: 통합 → 전체", () => {
    expect(filterByCategory(comments, ALL_TAB_ID, known).map((x) => x.id)).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("filterByCategory: 미분류 → 없음/알 수 없음", () => {
    expect(filterByCategory(comments, GENERAL_TAB_ID, known).map((x) => x.id)).toEqual(["4", "5"]);
  });
  it("filterByCategory: 특정 분류 → 일치만", () => {
    expect(filterByCategory(comments, "policy", known).map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("historyThumbnailUrl — 우리 서빙 URL 에만 ?w 부착", () => {
  it("/api/upload/{id} 절대주소에 ?w=480 부착", () => {
    expect(historyThumbnailUrl("https://erp.wedly.kr/api/upload/abc123")).toBe(
      "https://erp.wedly.kr/api/upload/abc123?w=480",
    );
  });
  it("너비 인자 지정 가능", () => {
    expect(historyThumbnailUrl("https://h.wedly.kr/api/upload/x", 960)).toBe(
      "https://h.wedly.kr/api/upload/x?w=960",
    );
  });
  it("이미 w= 가 있으면 중복 부착 안 함", () => {
    const u = "https://erp.wedly.kr/api/upload/abc?w=480";
    expect(historyThumbnailUrl(u)).toBe(u);
  });
  it("우리 서빙 URL 이 아니면(외부 이미지 등) 원본 그대로", () => {
    const ext = "https://example.com/photo.png";
    expect(historyThumbnailUrl(ext)).toBe(ext);
  });
  it("빈 문자열은 그대로", () => {
    expect(historyThumbnailUrl("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 정리본(recap) — 카드로 그릴 자격이 있는지
// ─────────────────────────────────────────────────────────────────────────────
describe("hasRenderableRecap — 반쯤 만들어진 정리본은 카드로 안 그린다", () => {
  const base = { id: "c1", name: "배보라", text: "원문", createdAt: "2026-08-27T01:00:00.000Z" };

  it("정리본이 아예 없으면 false", () => {
    expect(hasRenderableRecap(base)).toBe(false);
  });

  it("핵심 한 줄이 있으면 true", () => {
    expect(
      hasRenderableRecap({
        ...base,
        recap: { v: 1, kind: "call", headline: "농특세 납부 불필요", facts: [], nextSteps: [] },
      }),
    ).toBe(true);
  });

  it("핵심 한 줄이 빈 글자면 false — 빈 껍데기 카드를 막는다", () => {
    expect(
      hasRenderableRecap({
        ...base,
        recap: { v: 1, kind: "call", headline: "   ", facts: [], nextSteps: [] },
      }),
    ).toBe(false);
  });

  it("핵심 한 줄이 글자가 아니면 false — 저장이 깨진 자료에도 안 죽는다", () => {
    expect(
      hasRenderableRecap({
        ...base,
        recap: { v: 1, kind: "call", headline: 42, facts: [], nextSteps: [] } as never,
      }),
    ).toBe(false);
  });
});

function recap(partial: Partial<CommentRecap> = {}): CommentRecap {
  return { v: 1, kind: "note", headline: "제목", facts: [], nextSteps: [], ...partial };
}

describe("safeRecapKind — 모르는 종류·물려받은 이름은 「기록」으로 떨어뜨린다", () => {
  it('"call" → "call"', () => {
    expect(safeRecapKind("call")).toBe("call");
  });
  it('"무언가" → "note"', () => {
    expect(safeRecapKind("무언가")).toBe("note");
  });
  it('"toString" → "note" — Object 내장 함수를 종류로 쓰지 않는다', () => {
    expect(safeRecapKind("toString")).toBe("note");
  });
  it('"constructor" → "note"', () => {
    expect(safeRecapKind("constructor")).toBe("note");
  });
  it('undefined / null / 숫자 → "note"', () => {
    expect(safeRecapKind(undefined)).toBe("note");
    expect(safeRecapKind(null)).toBe("note");
    expect(safeRecapKind(42)).toBe("note");
  });
});

describe("safeRecapLines — 카드가 그릴 수 있는 모양만 남긴다", () => {
  it("멀쩡한 facts·nextSteps 는 그대로", () => {
    expect(
      safeRecapLines(
        recap({
          facts: [{ label: "상대", value: "김세무사" }],
          nextSteps: ["다음 주 연락"],
        }),
      ),
    ).toEqual({
      facts: [{ label: "상대", value: "김세무사" }],
      nextSteps: ["다음 주 연락"],
    });
  });

  it("facts 에 null 항목이 섞이면 그것만 버린다", () => {
    expect(
      safeRecapLines(
        recap({
          facts: [{ label: "상대", value: "김세무사" }, null, { label: "결과", value: "완료" }] as never,
        }),
      ),
    ).toEqual({
      facts: [
        { label: "상대", value: "김세무사" },
        { label: "결과", value: "완료" },
      ],
      nextSteps: [],
    });
  });

  it("label 이나 value 가 객체·숫자면 그 줄을 버린다", () => {
    expect(
      safeRecapLines(
        recap({
          facts: [
            { label: "상대", value: { name: "김" } },
            { label: "금액", value: 1000 },
            { label: { k: 1 }, value: "완료" },
            { label: "상태", value: "진행" },
          ] as never,
        }),
      ),
    ).toEqual({
      facts: [{ label: "상태", value: "진행" }],
      nextSteps: [],
    });
  });

  it("label 또는 value 가 빈 글자면 그 줄을 버린다", () => {
    expect(
      safeRecapLines(
        recap({
          facts: [
            { label: "", value: "김세무사" },
            { label: "상대", value: "" },
            { label: "상대", value: "김세무사" },
          ],
        }),
      ),
    ).toEqual({
      facts: [{ label: "상대", value: "김세무사" }],
      nextSteps: [],
    });
  });

  it("facts 가 배열이 아니면(문자열·undefined) 빈 배열", () => {
    expect(safeRecapLines(recap({ facts: "깨짐" as never })).facts).toEqual([]);
    expect(safeRecapLines(recap({ facts: undefined as never })).facts).toEqual([]);
  });

  it("nextSteps 에 객체가 섞이면 그것만 버린다", () => {
    expect(
      safeRecapLines(
        recap({
          nextSteps: ["다음 주 연락", { todo: "메일" }, "서류 확인"] as never,
        }),
      ),
    ).toEqual({
      facts: [],
      nextSteps: ["다음 주 연락", "서류 확인"],
    });
  });

  it("nextSteps 가 배열이 아니면 빈 배열", () => {
    expect(safeRecapLines(recap({ nextSteps: "깨짐" as never })).nextSteps).toEqual([]);
    expect(safeRecapLines(recap({ nextSteps: undefined as never })).nextSteps).toEqual([]);
  });
});

describe("★buildKakaoReport — 카톡에 그대로 붙일 수 있는 보고문", () => {
  const recap = {
    v: 2, kind: "call" as const,
    headline: "대표님과 통화, 대출 의사 확인",
    facts: [{ label: "확인 사항", value: "기업회생체크 확인함" }, { label: "고객 의사", value: "대출 받고 싶다고 함" }],
    nextSteps: ["통장사본 회수하기"],
  };

  it("★마크다운 기호가 하나도 안 남는다 — 카톡은 별표를 글자 그대로 보여 준다", () => {
    const r = buildKakaoReport({ ...recap, headline: "**굵게** ## 제목 `코드` ~취소~" }, { kindLabel: "통화" });
    expect(r).not.toMatch(/[*_`~#>|]/);
  });

  it("★한 줄에 한 항목만 — 사실 개수 + 할 일 개수만큼 줄이 는다", () => {
    const 줄 = buildKakaoReport(recap, { kindLabel: "통화" }).split("\n").filter((l) => l.startsWith("· "));
    expect(줄).toHaveLength(3);
  });

  it("종류와 핵심 한 줄이 맨 위에 온다", () => {
    expect(buildKakaoReport(recap, { kindLabel: "통화" }).split("\n")[0]).toBe("[통화] 대표님과 통화, 대출 의사 확인");
  });

  it("날짜를 주면 둘째 줄에 넣고, 안 주면 그 줄을 뺀다", () => {
    expect(buildKakaoReport(recap, { kindLabel: "통화", at: "2026.08.27" }).split("\n")[1]).toBe("2026.08.27");
    expect(buildKakaoReport(recap, { kindLabel: "통화" }).split("\n")[1]).toBe("");
  });

  it("★빈 구역은 제목째 뺀다 — 「다음 할 일」만 덩그러니 남지 않게", () => {
    const r = buildKakaoReport({ ...recap, nextSteps: [] }, { kindLabel: "통화" });
    expect(r).not.toContain("다음 할 일");
    const r2 = buildKakaoReport({ ...recap, facts: [] }, { kindLabel: "통화" });
    expect(r2).toContain("다음 할 일");
    expect(r2).not.toContain("· 확인 사항");
  });

  it("★줄바꿈이 든 값도 한 줄로 눌러 담는다", () => {
    const r = buildKakaoReport({ ...recap, headline: "첫째\n둘째" }, { kindLabel: "통화" });
    expect(r.split("\n")[0]).toBe("[통화] 첫째 둘째");
  });

  it("빈 줄이 세 개 이상 이어지지 않는다", () => {
    expect(buildKakaoReport(recap, { kindLabel: "통화" })).not.toMatch(/\n{3,}/);
  });

  it("앞뒤에 빈 줄이 남지 않는다", () => {
    const r = buildKakaoReport(recap, { kindLabel: "통화" });
    expect(r).toBe(r.trim());
  });

  it("자료가 이상해도 안 죽는다", () => {
    expect(() => buildKakaoReport({ v: 2, kind: "note", headline: "", facts: [], nextSteps: [] } as never)).not.toThrow();
  });
});

describe("★kakaoReportDate — 보고문 날짜는 실제 날짜여야 한다", () => {
  it("한국시간 기준 YYYY.MM.DD 로 만든다", () => {
    // 2026-08-27T15:30:00Z = 한국시간 8월 28일 0시 30분 → 날짜가 하루 넘어간다.
    expect(kakaoReportDate("2026-08-27T15:30:00.000Z")).toBe("2026.08.28");
    expect(kakaoReportDate("2026-08-27T01:00:00.000Z")).toBe("2026.08.27");
  });

  it("★상대 시각 글자를 그대로 돌려주지 않는다 — 「3일 전」은 며칠 뒤에 읽으면 뜻이 달라진다", () => {
    expect(kakaoReportDate("3일 전")).toBe("");
    expect(kakaoReportDate("방금")).toBe("");
  });

  it("값이 이상하면 빈 글자 — 그러면 보고문에서 날짜 줄이 빠진다", () => {
    for (const v of [null, undefined, "", "아무 글자", 0]) expect(kakaoReportDate(v)).toBe("");
  });

  it("보고문 둘째 줄에 실제로 실린다", () => {
    const recap = { v: 2, kind: "call" as const, headline: "통화 완료", facts: [], nextSteps: [] };
    const r = buildKakaoReport(recap, { kindLabel: "통화", at: kakaoReportDate("2026-08-27T01:00:00.000Z") });
    expect(r.split("\n")[1]).toBe("2026.08.27");
  });
});

describe("★카드가 실제 날짜를 넘기는가 — 상대 시각으로 되돌아가지 못하게", () => {
  it("HistoryPanel 이 kakaoReportDate 로 넘긴다", () => {
    const src = readFileSync(new URL("../components/HistoryPanel.tsx", import.meta.url), "utf8");
    expect(src).toContain("at={kakaoReportDate(c.createdAt)}");
    expect(src).not.toContain("at={tf(c.createdAt)}");
  });
});
