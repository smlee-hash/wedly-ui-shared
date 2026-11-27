// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDetailAdapter } from "./adapter-types";
import CertReportButton from "./CertReportButton";

// 「기업인증 리포트 생성」 단추(NO.818 2차 수정) — 진행 중 잠금·겹쳐 누르기 막기·브라우저 내려받기 없음·onSaved 호출·실패 안내.

type CertAdapter = NonNullable<UnifiedDetailAdapter["certReport"]>;
type GenerateResult = Awaited<ReturnType<CertAdapter["generate"]>>;

const IDLE_TEXT = "기업인증 리포트 생성";
const BUSY_TEXT = "기업인증 리포트 만드는 중…";
const DEFAULT_ERROR = "기업인증 리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.";
const ROW = { _id: "row-1" } as Record<string, unknown>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const okResult = (fileName = "기업인증리포트_가상 주식회사.pdf"): GenerateResult => ({
  ok: true,
  fileName,
});

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let savedActEnv: boolean | undefined;

async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(adapter: CertAdapter, opts: { row?: Record<string, unknown>; onSaved?: () => void } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<CertReportButton row={opts.row ?? ROW} adapter={adapter} onSaved={opts.onSaved} />);
  });
  await flush();
  return {
    container,
    text: () => container.textContent ?? "",
    button: () => {
      const found = Array.from(container.querySelectorAll("button"));
      if (found.length !== 1) throw new Error(`단추가 ${found.length}개`);
      return found[0];
    },
    alert: () => container.querySelector('[role="alert"]'),
    status: () => container.querySelector('[role="status"]'),
    async click() {
      await act(async () => {
        this.button().click();
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
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.restoreAllMocks();
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("CertReportButton — 누르기·잠금", () => {
  it("처음엔 「기업인증 리포트 생성」 단추만 보이고 아직 요청하지 않는다", async () => {
    const generate = vi.fn(async () => okResult());
    const view = await mount({ generate });

    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain("최대 2분");
    expect(view.alert()).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("누르면 generate(row) 를 한 번 부르고, 기다리는 동안 단추를 잠근다", async () => {
    const pending = deferred<GenerateResult>();
    const generate = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(ROW);
    expect(view.button().textContent).toBe(BUSY_TEXT);
    expect(view.button().disabled).toBe(true);
    expect(view.text()).toContain("최대 2분 정도 걸릴 수 있습니다");
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(okResult());
    });
    await flush();

    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain("최대 2분");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("기다리는 동안 다시 눌러도 generate 는 한 번만 나간다", async () => {
    const pending = deferred<GenerateResult>();
    const generate = vi.fn(() => pending.promise);
    const view = await mount({ generate });

    await view.click();
    await view.click();
    await view.click();

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("같은 순간에 두 번 눌려도(잠금 반영 전) generate 는 한 번만 나간다", async () => {
    const pending = deferred<GenerateResult>();
    const generate = vi.fn(() => pending.promise);
    const view = await mount({ generate });

    await act(async () => {
      const button = view.button();
      button.click();
      button.click();
    });
    await flush();

    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("CertReportButton — 성공(다운로드 없이 상세창 업로드 + 새로 읽기)", () => {
  it("성공하면 브라우저 내려받기 없이 onSaved() 를 부르고 완료 안내를 보인다", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const generate = vi.fn(async () => okResult("기업인증리포트_가상 주식회사.pdf"));
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(document.body.querySelectorAll("a[download]").length).toBe(0);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(view.status()?.textContent).toContain("기업인증리포트_가상 주식회사.pdf");
    expect(view.alert()).toBeNull();
  });

  it("끝난 뒤에는 다시 눌러 새 리포트로 갱신할 수 있다", async () => {
    const generate = vi.fn(async () => okResult());
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();
    await view.click();

    expect(generate).toHaveBeenCalledTimes(2);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });
});

describe("CertReportButton — 실패", () => {
  it("ok:false 면 message 를 붉은 글로 보이고 onSaved 를 부르지 않는다", async () => {
    const generate = vi.fn(async () => ({
      ok: false as const,
      message: "택스봇 자료가 없어 기업인증 리포트를 만들 수 없습니다.",
    }));
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();

    expect(view.alert()?.textContent).toBe("택스봇 자료가 없어 기업인증 리포트를 만들 수 없습니다.");
    expect(view.alert()?.className).toContain("text-wedly-red-ink");
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
  });

  it("generate 가 예외를 던지면 기본 안내를 보이고 단추를 되살린다", async () => {
    const generate = vi.fn(async () => {
      throw new Error("boom");
    });
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();

    expect(view.alert()?.textContent).toBe(DEFAULT_ERROR);
    expect(view.text()).not.toContain("boom");
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.button().disabled).toBe(false);
  });

  it("실패 뒤 다시 누르면 앞 안내는 사라지고, 성공하면 onSaved 를 부른다", async () => {
    const generate = vi
      .fn<CertAdapter["generate"]>()
      .mockResolvedValueOnce({ ok: false, message: "택스봇 자료를 받는 중입니다. 잠시 후 다시 눌러 주세요." })
      .mockResolvedValueOnce(okResult());
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();
    expect(view.alert()?.textContent).toContain("받는 중입니다");

    await view.click();
    expect(view.alert()).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("CertReportButton — 닫힌 뒤 늦게 온 응답", () => {
  it("상세창이 닫힌 뒤 도착한 성공 응답은 onSaved 를 부르지 않는다", async () => {
    const pending = deferred<GenerateResult>();
    const generate = vi.fn(() => pending.promise);
    const onSaved = vi.fn();
    const view = await mount({ generate }, { onSaved });

    await view.click();
    await view.unmount();
    await act(async () => {
      pending.resolve(okResult());
    });
    await flush();

    expect(onSaved).not.toHaveBeenCalled();
  });
});
