// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedDetailAdapter } from "./adapter-types";
import CertReportButton from "./CertReportButton";

// 「기업인증 리포트」 PDF 내려받기 단추(NO.818) — 진행 중 잠금·겹쳐 누르기 막기·저장 동작·실패 안내.
// 진짜 부품을 진짜 react-dom 으로 그리고, 앱이 주는 download 만 가짜로 바꾼다.

type CertAdapter = NonNullable<UnifiedDetailAdapter["certReport"]>;
type DownloadResult = Awaited<ReturnType<CertAdapter["download"]>>;

const IDLE_TEXT = "기업인증 리포트";
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

const okResult = (filename = "기업인증리포트_가상 주식회사.pdf"): DownloadResult => ({
  ok: true,
  blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  filename,
});

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let savedActEnv: boolean | undefined;
let savedCreate: PropertyDescriptor | undefined;
let savedRevoke: PropertyDescriptor | undefined;
// 내려받기 눌림 기록 — 앵커 click 을 가로채서 이름·주소를 남긴다(jsdom 은 실제 저장을 못 한다).
let clicked: Array<{ download: string; href: string }>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function mount(adapter: CertAdapter, row: Record<string, unknown> = ROW) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<CertReportButton row={row} adapter={adapter} />);
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
  savedCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  savedRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  createObjectURL = vi.fn(() => "blob:cert-report");
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: revokeObjectURL });
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.restoreAllMocks();
  if (savedCreate) Object.defineProperty(URL, "createObjectURL", savedCreate);
  else delete (URL as { createObjectURL?: unknown }).createObjectURL;
  if (savedRevoke) Object.defineProperty(URL, "revokeObjectURL", savedRevoke);
  else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("CertReportButton — 누르기·잠금", () => {
  it("처음엔 「기업인증 리포트」 단추만 보이고 아직 아무것도 받지 않는다", async () => {
    const download = vi.fn(async () => okResult());
    const view = await mount({ download });

    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain("최대 2분");
    expect(view.alert()).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("누르면 download(row) 를 한 번 부르고, 기다리는 동안 단추를 잠가 「만드는 중…」과 걸리는 시간을 알린다", async () => {
    const pending = deferred<DownloadResult>();
    const download = vi.fn(() => pending.promise);
    const view = await mount({ download });

    await view.click();

    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith(ROW);
    expect(view.button().textContent).toBe(BUSY_TEXT);
    expect(view.button().disabled).toBe(true);
    expect(view.text()).toContain("최대 2분 정도 걸릴 수 있습니다");
    expect(clicked).toEqual([]);

    await act(async () => {
      pending.resolve(okResult());
    });
    await flush();

    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
    expect(view.text()).not.toContain("최대 2분");
  });

  it("기다리는 동안 다시 눌러도 download 는 한 번만 나간다", async () => {
    const pending = deferred<DownloadResult>();
    const download = vi.fn(() => pending.promise);
    const view = await mount({ download });

    await view.click();
    await view.click();
    await view.click();

    expect(download).toHaveBeenCalledTimes(1);
  });

  it("같은 순간에 두 번 눌려도(잠금 반영 전) download 는 한 번만 나간다", async () => {
    const pending = deferred<DownloadResult>();
    const download = vi.fn(() => pending.promise);
    const view = await mount({ download });

    await act(async () => {
      const button = view.button();
      button.click();
      button.click();
    });
    await flush();

    expect(download).toHaveBeenCalledTimes(1);
  });
});

describe("CertReportButton — 성공", () => {
  it("받은 PDF 를 어댑터가 준 이름으로 내려받고 임시 주소를 바로 치운다", async () => {
    const result = okResult("기업인증리포트_가상 주식회사.pdf");
    const download = vi.fn(async () => result);
    const view = await mount({ download });

    await view.click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(result.ok ? result.blob : null);
    expect(clicked).toEqual([{ download: "기업인증리포트_가상 주식회사.pdf", href: "blob:cert-report" }]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cert-report");
    expect(document.body.querySelectorAll("a[download]").length).toBe(0); // 임시 링크는 남기지 않는다
    expect(view.alert()).toBeNull();
  });

  it("끝난 뒤에는 다시 눌러 새로 받을 수 있다", async () => {
    const download = vi.fn(async () => okResult());
    const view = await mount({ download });

    await view.click();
    await view.click();

    expect(download).toHaveBeenCalledTimes(2);
    expect(clicked.length).toBe(2);
  });
});

describe("CertReportButton — 실패", () => {
  it("ok:false 면 message 를 단추 아래 붉은 글로 보이고 내려받지 않으며 단추를 되살린다", async () => {
    const download = vi.fn(async () => ({
      ok: false as const,
      message: "택스봇 자료가 없어 기업인증 리포트를 만들 수 없습니다.",
    }));
    const view = await mount({ download });

    await view.click();

    expect(view.alert()?.textContent).toBe("택스봇 자료가 없어 기업인증 리포트를 만들 수 없습니다.");
    expect(view.alert()?.className).toContain("text-wedly-red-ink");
    expect(clicked).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(view.button().textContent).toBe(IDLE_TEXT);
    expect(view.button().disabled).toBe(false);
    // 안내는 단추 뒤에 온다.
    expect(view.button().compareDocumentPosition(view.alert() as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("download 가 예외를 던지면 기본 안내를 보이고 단추를 되살린다", async () => {
    const download = vi.fn(async () => {
      throw new Error("boom");
    });
    const view = await mount({ download });

    await view.click();

    expect(view.alert()?.textContent).toBe(DEFAULT_ERROR);
    expect(view.text()).not.toContain("boom");
    expect(clicked).toEqual([]);
    expect(view.button().disabled).toBe(false);
  });

  it("실패 뒤 다시 누르면 앞 안내는 사라지고, 성공하면 내려받는다", async () => {
    const download = vi
      .fn<CertAdapter["download"]>()
      .mockResolvedValueOnce({ ok: false, message: "택스봇 자료를 받는 중입니다. 잠시 후 다시 눌러 주세요." })
      .mockResolvedValueOnce(okResult());
    const view = await mount({ download });

    await view.click();
    expect(view.alert()?.textContent).toContain("받는 중입니다");

    await view.click();
    expect(view.alert()).toBeNull();
    expect(clicked.length).toBe(1);
  });

  it("다시 누르는 순간(기다리는 동안)에는 앞 실패 안내를 지운다", async () => {
    const pending = deferred<DownloadResult>();
    const download = vi
      .fn<CertAdapter["download"]>()
      .mockResolvedValueOnce({ ok: false, message: "일시 오류" })
      .mockImplementationOnce(() => pending.promise);
    const view = await mount({ download });

    await view.click();
    expect(view.alert()?.textContent).toBe("일시 오류");

    await view.click();
    expect(view.alert()).toBeNull();
    expect(view.button().disabled).toBe(true);
  });
});

describe("CertReportButton — 닫힌 뒤 늦게 온 응답", () => {
  it("상세창이 닫힌 뒤 도착한 PDF 는 내려받지 않는다", async () => {
    const pending = deferred<DownloadResult>();
    const download = vi.fn(() => pending.promise);
    const view = await mount({ download });

    await view.click();
    await view.unmount();
    await act(async () => {
      pending.resolve(okResult());
    });
    await flush();

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });
});
