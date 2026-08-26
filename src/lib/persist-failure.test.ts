import { describe, it, expect } from "vitest";
import {
  checkApiResult,
  classifyHttpStatus,
  makePersistError,
  persistKindOf,
  failureReason,
  saveFailureMessage,
  loadFailureMessage,
} from "./persist-failure";

describe("classifyHttpStatus", () => {
  it("401·403 은 로그인 만료", () => {
    expect(classifyHttpStatus(401)).toBe("auth");
    expect(classifyHttpStatus(403)).toBe("auth");
  });

  it("★405 도 로그인 만료 — 세션이 풀리면 로그인 화면으로 넘겨져 405 로 온다(실측)", () => {
    expect(classifyHttpStatus(405)).toBe("auth");
  });

  it("그 밖의 400 이상은 서버 거절", () => {
    expect(classifyHttpStatus(400)).toBe("server");
    expect(classifyHttpStatus(404)).toBe("server");
    expect(classifyHttpStatus(500)).toBe("server");
  });

  it("2xx 는 성공", () => {
    expect(classifyHttpStatus(200)).toBe("none");
    expect(classifyHttpStatus(204)).toBe("none");
  });
});

describe("checkApiResult", () => {
  it("상태가 성공이고 success:true 면 성공", () => {
    expect(checkApiResult({ ok: true, status: 200 }, { success: true, data: [] })).toBe("none");
  });

  it("★저장된 적 없는 회사(success:true, data:null)는 실패가 아니다 — 옛 값 폴백을 유지해야 한다", () => {
    expect(checkApiResult({ ok: true, status: 200 }, { success: true, data: null })).toBe("none");
  });

  it("상태 401 이면 로그인 만료 (본문은 보지 않는다)", () => {
    expect(checkApiResult({ ok: false, status: 401 }, { success: false, error: "인증 필요" })).toBe("auth");
  });

  it("상태 405 이면 로그인 만료", () => {
    expect(checkApiResult({ ok: false, status: 405 }, null)).toBe("auth");
  });

  it("상태는 성공인데 success 가 true 가 아니면 서버 거절", () => {
    expect(checkApiResult({ ok: true, status: 200 }, { success: false, error: "잘못된 분야" })).toBe("server");
  });

  it("본문을 못 읽어 null 이어도(응답이 HTML 등) 서버 거절로 본다", () => {
    expect(checkApiResult({ ok: true, status: 200 }, null)).toBe("server");
  });
});

describe("persistKindOf", () => {
  it("우리가 만든 오류는 종류를 그대로 돌려준다", () => {
    expect(persistKindOf(makePersistError("auth", "로그인이 풀렸습니다"))).toBe("auth");
    expect(persistKindOf(makePersistError("server", "거절"))).toBe("server");
  });

  it("모르는 오류(통신 끊김 등)는 연결 끊김으로 본다", () => {
    expect(persistKindOf(new Error("Failed to fetch"))).toBe("network");
    expect(persistKindOf(null)).toBe("network");
    expect(persistKindOf("이상한 값")).toBe("network");
  });
});

describe("saveFailureMessage", () => {
  it("로그인 만료면 다시 로그인하라고 안내하고, 입력한 내용을 안 지웠다고 알린다", () => {
    const msg = saveFailureMessage(makePersistError("auth", ""), "히스토리");
    expect(msg).toContain("로그인");
    expect(msg).toContain("지우지 않았습니다");
  });

  it("★부품 바깥(어댑터)이 준 자기 안내 문구가 있으면 그대로 살린다 — 하이브 '작성 불가' 안내가 뭉개지면 안 된다", () => {
    const err = new Error("이 앱에서는 정부지원금 히스토리를 작성할 수 없습니다.");
    const msg = saveFailureMessage(err, "히스토리");
    expect(msg).toContain("이 앱에서는 정부지원금 히스토리를 작성할 수 없습니다.");
  });

  it("안내 문구가 없는 오류는 기본 안내 + 대상 이름", () => {
    const msg = saveFailureMessage(makePersistError("server", ""), "정산정보");
    expect(msg).toContain("정산정보");
  });
});

describe("loadFailureMessage", () => {
  it("종류별로 다른 이유를 붙인다", () => {
    expect(loadFailureMessage(makePersistError("auth", ""))).toContain("로그인");
    expect(loadFailureMessage(makePersistError("network", ""))).toContain("연결");
  });

  it("★불러오기 안내에는 '지우지 않았습니다' 를 붙이지 않는다(입력칸 얘기가 아니다)", () => {
    expect(loadFailureMessage(makePersistError("server", ""))).not.toContain("지우지 않았습니다");
  });
});

describe("failureReason", () => {
  it("성공(none)에는 이유가 없다", () => {
    expect(failureReason("none")).toBe("");
  });
});
