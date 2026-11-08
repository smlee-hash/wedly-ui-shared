// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDetailAdapter } from "./adapter-types";
import ReportRegenerateControl, {
  formatSeoulMinute,
  isReportRegenerateColumn,
  type ReportRegenStatus,
} from "./ReportRegenerateControl";

// 「리포트 최신 버전으로 재생성」 단추(NO.611) — 남은 횟수·잠금·진행 중 폴링·끝남 전환·기록 보기.
// 진짜 부품을 진짜 react-dom 으로 그리고, 앱이 주는 load/start 만 가짜로 바꾼다. 시간은 가짜 타이머로 움직인다.

type RegenAdapter = NonNullable<UnifiedDetailAdapter["reportRegenerate"]>;

const NOW = new Date("2026-10-29T05:30:00Z"); // 한국 시간 14:30
const BUTTON_TEXT = "리포트 최신 버전으로 재생성";
const ROW = { _id: "row-1" } as Record<string, unknown>;

function makeStatus(over: Partial<ReportRegenStatus> = {}): ReportRegenStatus {
  return { limit: 2, used: 0, remaining: 2, running: null, last: null, logs: [], disabledReason: null, ...over };
}

function runningOf(startedAt: string, phaseLabel = "리포트 만드는 중"): NonNullable<ReportRegenStatus["running"]> {
  return { id: "run-1", phase: "building", phaseLabel, startedAt, app: "erp", actorName: "홍길동" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let savedActEnv: boolean | undefined;

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mount(
  adapter: RegenAdapter,
  onSaved?: () => void,
  row: Record<string, unknown> = ROW,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const view = (r: Record<string, unknown>) => (
    <ReportRegenerateControl row={r} adapter={adapter} onSaved={onSaved} />
  );
  await act(async () => {
    root.render(view(row));
  });
  await flush();
  return {
    container,
    text: () => container.textContent ?? "",
    button: () => {
      const found = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === BUTTON_TEXT);
      if (found.length !== 1) throw new Error(`재생성 단추가 ${found.length}개`);
      return found[0];
    },
    byText: (label: string) => {
      const found = Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === label);
      if (found.length !== 1) throw new Error(`「${label}」 단추가 ${found.length}개`);
      return found[0];
    },
    async click(el: HTMLElement) {
      await act(async () => {
        el.click();
      });
      await flush();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

beforeEach(() => {
  savedActEnv = actEnv.IS_REACT_ACT_ENVIRONMENT;
  actEnv.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("ReportRegenerateControl — 남은 횟수와 잠금", () => {
  it("상태를 읽는 동안 단추를 잠그고, 읽고 나면 오늘 남은 횟수를 보여 준다", async () => {
    const pending = deferred<ReportRegenStatus>();
    const load = vi.fn(() => pending.promise);
    const view = await mount({ load, start: vi.fn() });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(ROW);
    expect(view.button().disabled).toBe(true);

    await act(async () => {
      pending.resolve(makeStatus({ limit: 2, used: 1, remaining: 1 }));
    });
    await flush();

    expect(view.text()).toContain("오늘 남은 횟수 1/2");
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain("모두 사용");
  });

  it("오늘 횟수를 다 쓰면 단추를 잠그고 안내를 보여 준다(숫자는 limit 값)", async () => {
    const load = vi.fn(async () => makeStatus({ limit: 3, used: 3, remaining: 0 }));
    const view = await mount({ load, start: vi.fn() });

    expect(view.text()).toContain("오늘 남은 횟수 0/3");
    expect(view.text()).toContain("오늘 3회 모두 사용 · 내일 다시 가능");
    expect(view.button().disabled).toBe(true);
  });

  it("앱이 막은 사유(disabledReason)가 있으면 그 글자를 안내로 보여 주고 단추를 잠근다", async () => {
    const load = vi.fn(async () => makeStatus({ disabledReason: "택스봇 압축이 아직 올라오지 않았습니다" }));
    const view = await mount({ load, start: vi.fn() });

    expect(view.text()).toContain("택스봇 압축이 아직 올라오지 않았습니다");
    expect(view.button().disabled).toBe(true);
  });

  it("상태를 읽지 못하면 붉은 안내를 보여 주고, 다시 읽기로 복구한다", async () => {
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(makeStatus());
    const view = await mount({ load, start: vi.fn() });

    expect(view.text()).toContain("남은 횟수를 확인하지 못했습니다");
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.button().disabled).toBe(true);

    await view.click(view.byText("다시 읽기"));

    expect(load).toHaveBeenCalledTimes(2);
    expect(view.text()).toContain("오늘 남은 횟수 2/2");
    expect(view.button().disabled).toBe(false);
  });

  it("확인 창(confirm)을 띄우지 않고 바로 시작한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const start = vi.fn(async () => ({ ok: true as const, status: makeStatus({ used: 1, remaining: 1, running: runningOf(NOW.toISOString()) }) }));
    const view = await mount({ load: vi.fn(async () => makeStatus()), start });

    await view.click(view.button());

    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(ROW);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("ReportRegenerateControl — 진행 중", () => {
  it("진행 중이면 단추를 잠그고 단계 이름과 지난 분을 보여 준다(남은 횟수 0이어도 「모두 사용」은 안 보임)", async () => {
    const load = vi.fn(async () =>
      makeStatus({ used: 2, remaining: 0, running: runningOf("2026-10-29T05:20:00Z", "리포트 만드는 중") }),
    );
    const view = await mount({ load, start: vi.fn() });

    expect(view.text()).toContain("리포트 만드는 중 — 10분 지남");
    expect(view.button().disabled).toBe(true);
    expect(view.text()).not.toContain("모두 사용");
  });

  it("방금 시작했으면 「방금 시작」으로 보여 준다", async () => {
    const load = vi.fn(async () => makeStatus({ running: runningOf("2026-10-29T05:29:40Z", "파일 모으는 중") }));
    const view = await mount({ load, start: vi.fn() });

    expect(view.text()).toContain("파일 모으는 중 — 방금 시작");
  });

  it("진행 중에는 5초마다 다시 읽고, 앞 요청이 끝나기 전에는 새 요청을 내지 않는다", async () => {
    const slow = deferred<ReportRegenStatus>();
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockResolvedValueOnce(makeStatus({ running: runningOf(NOW.toISOString()) }))
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue(makeStatus({ running: runningOf(NOW.toISOString()) }));
    await mount({ load, start: vi.fn() });

    expect(load).toHaveBeenCalledTimes(1);
    await flush(5000);
    expect(load).toHaveBeenCalledTimes(2);
    await flush(15000); // 둘째 요청이 아직 끝나지 않았으니 새 요청은 없다
    expect(load).toHaveBeenCalledTimes(2);

    await act(async () => {
      slow.resolve(makeStatus({ running: runningOf(NOW.toISOString()) }));
    });
    await flush(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("진행 중이 아닐 때는 다시 읽지 않는다", async () => {
    const load = vi.fn(async () => makeStatus());
    await mount({ load, start: vi.fn() });

    await flush(30000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("진행 중에 읽다 한 번 실패해도 다음 간격에 다시 읽는다", async () => {
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockResolvedValueOnce(makeStatus({ running: runningOf(NOW.toISOString()) }))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(makeStatus({ running: runningOf(NOW.toISOString()) }));
    const view = await mount({ load, start: vi.fn() });

    await flush(5000);
    await flush(5000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(view.text()).not.toContain("확인하지 못했습니다");
  });

  it("닫으면(언마운트) 타이머를 정리하고, 늦게 온 응답은 onSaved 를 부르지 않는다", async () => {
    const slow = deferred<ReportRegenStatus>();
    const onSaved = vi.fn();
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockResolvedValueOnce(makeStatus({ running: runningOf(NOW.toISOString()) }))
      .mockReturnValueOnce(slow.promise);
    const view = await mount({ load, start: vi.fn() }, onSaved);

    await flush(5000);
    expect(load).toHaveBeenCalledTimes(2);
    await view.unmount();

    await act(async () => {
      slow.resolve(makeStatus({ last: { id: "run-1", status: "success", reason: null, finishedAt: NOW.toISOString() } }));
    });
    await flush(20000);

    expect(load).toHaveBeenCalledTimes(2);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("ReportRegenerateControl — 끝남 전환", () => {
  it("진행 중에서 끝나면 onSaved 를 한 번만 부르고 성공 안내를 보여 주며 더는 다시 읽지 않는다", async () => {
    const onSaved = vi.fn();
    const done = makeStatus({
      used: 1,
      remaining: 1,
      last: { id: "run-1", status: "success", reason: null, finishedAt: NOW.toISOString() },
    });
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockResolvedValueOnce(makeStatus({ used: 1, remaining: 1, running: runningOf(NOW.toISOString()) }))
      .mockResolvedValue(done);
    const view = await mount({ load, start: vi.fn() }, onSaved);
    expect(onSaved).not.toHaveBeenCalled();

    await flush(5000);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain("최신 리포트를 붙였습니다");
    expect(view.button().disabled).toBe(false);

    await flush(30000);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("실패로 끝나면 붉은 안내에 사유를 보여 주고 onSaved 도 한 번 부른다", async () => {
    const onSaved = vi.fn();
    const load = vi
      .fn<RegenAdapter["load"]>()
      .mockResolvedValueOnce(makeStatus({ running: runningOf(NOW.toISOString()) }))
      .mockResolvedValue(
        makeStatus({ last: { id: "run-1", status: "failed", reason: "택스봇 응답이 없습니다", finishedAt: NOW.toISOString() } }),
      );
    const view = await mount({ load, start: vi.fn() }, onSaved);

    await flush(5000);

    expect(view.text()).toContain("다시 만들지 못했습니다 — 택스봇 응답이 없습니다");
    expect(view.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.text()).not.toContain("최신 리포트를 붙였습니다");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("처음 읽었을 때 이미 끝나 있었다면 onSaved 도 결과 안내도 없다", async () => {
    const onSaved = vi.fn();
    const load = vi.fn(async () =>
      makeStatus({ last: { id: "run-0", status: "failed", reason: "옛 실패", finishedAt: "2026-10-28T01:00:00Z" } }),
    );
    const view = await mount({ load, start: vi.fn() }, onSaved);

    expect(onSaved).not.toHaveBeenCalled();
    expect(view.text()).not.toContain("다시 만들지 못했습니다");
  });

  it("단추로 시작 → 진행 중 반영 → 끝남까지 이어지고 onSaved 는 한 번이다", async () => {
    const onSaved = vi.fn();
    const started = makeStatus({ used: 1, remaining: 1, running: runningOf(NOW.toISOString(), "파일 모으는 중") });
    const done = makeStatus({
      used: 1,
      remaining: 1,
      last: { id: "run-1", status: "success", reason: null, finishedAt: NOW.toISOString() },
    });
    const load = vi.fn<RegenAdapter["load"]>().mockResolvedValueOnce(makeStatus()).mockResolvedValue(done);
    const start = vi.fn(async () => ({ ok: true as const, status: started }));
    const view = await mount({ load, start }, onSaved);

    await view.click(view.button());
    expect(view.text()).toContain("파일 모으는 중 — 방금 시작");
    expect(view.text()).toContain("오늘 남은 횟수 1/2");
    expect(view.button().disabled).toBe(true);

    await flush(5000);

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain("최신 리포트를 붙였습니다");
    expect(view.button().disabled).toBe(false);
  });
});

describe("ReportRegenerateControl — 시작 실패", () => {
  it("start 가 ok:false 를 주면 message 를 붉은 안내로 보여 주고 함께 온 status 를 반영한다", async () => {
    const start = vi.fn(async () => ({
      ok: false as const,
      message: "오늘 횟수를 모두 사용했습니다",
      status: makeStatus({ used: 2, remaining: 0 }),
    }));
    const view = await mount({ load: vi.fn(async () => makeStatus({ used: 1, remaining: 1 })), start });

    await view.click(view.button());

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("오늘 횟수를 모두 사용했습니다");
    expect(view.text()).toContain("오늘 남은 횟수 0/2");
    expect(view.text()).toContain("오늘 2회 모두 사용 · 내일 다시 가능");
    expect(view.button().disabled).toBe(true);
  });

  it("status 없이 ok:false 면 상태는 그대로 두고 다시 누를 수 있다", async () => {
    const start = vi.fn(async () => ({ ok: false as const, message: "서버가 바쁩니다" }));
    const view = await mount({ load: vi.fn(async () => makeStatus()), start });

    await view.click(view.button());

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("서버가 바쁩니다");
    expect(view.text()).toContain("오늘 남은 횟수 2/2");
    expect(view.button().disabled).toBe(false);
  });

  it("start 가 예외를 던져도 붉은 안내를 보여 주고 단추를 되살린다", async () => {
    const start = vi.fn(async () => {
      throw new Error("boom");
    });
    const view = await mount({ load: vi.fn(async () => makeStatus()), start });

    await view.click(view.button());

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("다시 만들기를 시작하지 못했습니다");
    expect(view.button().disabled).toBe(false);
  });

  it("보내는 중에는 단추가 잠겨 두 번 눌러도 start 는 한 번만 나간다", async () => {
    const pending = deferred<{ ok: true; status: ReportRegenStatus }>();
    const start = vi.fn(() => pending.promise);
    const view = await mount({ load: vi.fn(async () => makeStatus()), start });

    await view.click(view.button());
    expect(view.button().disabled).toBe(true);
    await view.click(view.button());
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ ok: true, status: makeStatus({ used: 1, remaining: 1, running: runningOf(NOW.toISOString()) }) });
    });
    await flush();
    expect(view.text()).toContain("방금 시작");
  });
});

describe("ReportRegenerateControl — 기록 보기", () => {
  const logs: ReportRegenStatus["logs"] = [
    { id: "l3", createdAt: "2026-10-29T05:05:00Z", finishedAt: "2026-10-29T05:09:00Z", app: "erp", actorName: "홍길동", status: "success", reason: null },
    { id: "l2", createdAt: "2026-10-28T15:00:00Z", finishedAt: "2026-10-28T15:02:00Z", app: "hive", actorName: "김하이브", status: "failed", reason: "택스봇 응답 없음" },
    { id: "l1", createdAt: "2026-10-28T03:09:00Z", finishedAt: null, app: "erp", actorName: "이아영", status: "running", reason: null },
  ];

  it("처음에는 접혀 있고, 누르면 한 줄씩 한국 시간·앱·이름·결과를 보여 준다", async () => {
    const view = await mount({ load: vi.fn(async () => makeStatus({ logs })), start: vi.fn() });
    expect(view.text()).not.toContain("10/29 14:05");

    await view.click(view.byText("기록 보기"));

    const lines = Array.from(view.container.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([
      "10/29 14:05 · ERP · 홍길동 · 성공",
      "10/29 00:00 · 하이브 · 김하이브 · 실패 — 택스봇 응답 없음",
      "10/28 12:09 · ERP · 이아영 · 진행 중",
    ]);

    await view.click(view.byText("기록 보기"));
    expect(view.container.querySelectorAll("li").length).toBe(0);
  });

  it("기록이 없으면 「아직 기록이 없습니다」를 보여 준다", async () => {
    const view = await mount({ load: vi.fn(async () => makeStatus({ logs: [] })), start: vi.fn() });

    await view.click(view.byText("기록 보기"));

    expect(view.text()).toContain("아직 기록이 없습니다");
  });
});

describe("보조 함수", () => {
  it("formatSeoulMinute — 한국 시간 MM/DD HH:mm, 자정은 00 시", () => {
    expect(formatSeoulMinute("2026-10-29T05:05:00Z")).toBe("10/29 14:05");
    expect(formatSeoulMinute("2026-10-28T15:00:00Z")).toBe("10/29 00:00");
    expect(formatSeoulMinute("읽을 수 없는 값")).toBe("읽을 수 없는 값");
  });

  it("isReportRegenerateColumn — 이름이나 키가 정확히 「리포트」인 칸만", () => {
    expect(isReportRegenerateColumn({ key: "리포트", label: "리포트" })).toBe(true);
    expect(isReportRegenerateColumn({ key: "검토보고서", label: "리포트" })).toBe(true);
    expect(isReportRegenerateColumn({ key: "리포트", label: "첨부" })).toBe(true);
    expect(isReportRegenerateColumn({ key: "__taxbot_report__", label: "택스봇 자동 리포트" })).toBe(false);
    expect(isReportRegenerateColumn({ key: "정부지원금리포트", label: "정부지원금 리포트" })).toBe(false);
    expect(isReportRegenerateColumn({ key: "서류", label: "리포트 " })).toBe(false);
  });
});
