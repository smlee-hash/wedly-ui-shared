// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RowData } from "../collab/collab-table-core";
import type { FieldOptionsBundle, UnifiedDetailAdapter, UnifiedDetailApi } from "./adapter-types";
import type { CustomerDetailLite } from "./lib/customer-detail";
import UnifiedDetailView from "./UnifiedDetailView";

// 분야 기록(히스토리)을 공용 보관함에서 처음 불러올 때의 실패 안내 — 하이브 NO.771 후속 개선 줄.
//  - 다시 읽기(reloadHistory)는 403 에 서버가 실어 보낸 한국어 까닭을 안내하는데,
//    처음 불러오기는 403 을 늘 「로그인이 풀렸습니다」로 안내해 같은 실패가 두 길에서 다르게 보였다.
//  - 처음 불러오기도 같은 판정(failureFromResponse)을 써서 까닭이 있으면 그 까닭을, 없으면 예전 안내를 보인다.
// 진짜 UnifiedDetailView·SectionDetailPanel 을 쓰고, 기록 부품은 받은 loadError 를 그대로 보이는 탐침으로 바꾼다.
vi.mock("../index", async () => {
  const { createElement } = await import("react");
  const override = {};
  const hiddenColumns: string[] = [];
  return {
    SectionAdminMenu: () => null,
    EditableTitle: () => createElement("span", null, "상호명"),
    DraggableFieldsSection: () => null,
    DEFAULT_COLUMN_TYPE_OPTIONS: [],
    getCachedCommonOverride: () => override,
    fetchCommonFieldsOverride: async () => override,
    refreshCommonFieldsOverride: async () => override,
    resolveCommonFieldId: () => "",
    fetchHiddenBasicColumns: async () => hiddenColumns,
    isBasicColumnHidden: () => false,
    subscribeHiddenBasicColumns: () => () => {},
  };
});
vi.mock("./editors", async () => {
  const { createElement } = await import("react");
  return {
    EditableFieldRow: ({ col }: { col: { key: string } }) => createElement("div", { "data-probe-row": col.key }),
    BasicScopeBadge: () => null,
  };
});
vi.mock("./BasicFilesField", () => ({ default: () => null }));
vi.mock("./HistoryPanel", () => ({ default: () => null }));
vi.mock("./SectionHistoryPanel", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ loadError }: { loadError?: string | null }) =>
      createElement("div", { "data-probe-history": "", "data-load-error": loadError ?? "" }),
  };
});
vi.mock("./CommonFieldsLauncher", () => ({ CommonFieldsLauncher: () => null }));

const HIDDEN = "하이브에서는 이 분야를 보거나 고칠 수 없습니다.";

const syntheticDetail = (): CustomerDetailLite => ({
  key: "i:tax-amendment:row-1",
  bizno: "1234567890",
  company: "가상 주식회사",
  ceo: "가상 대표",
  phone: "",
  domainRows: [],
});

function makeRow(): RowData {
  return { _id: "row-1", "02상호명": "가상 주식회사", "03대표자명": "가상 대표", "15사업자번호": "123-45-67890" } as unknown as RowData;
}

function buildAdapter(): UnifiedDetailAdapter {
  const api: Partial<UnifiedDetailApi> = {
    loadDomainRows: async () => syntheticDetail(),
    getCachedDomainRows: () => null,
    loadTabConfig: async () => ({ success: true, data: {} }),
    saveTabConfig: async () => {},
    loadColumnConfig: async () => ({ data: {} }),
    saveColumnConfig: async () => {},
    loadManagers: async () => [],
    saveOwnField: async () => {},
    // 사업자번호가 있으면 기본정보 공용 보관함도 읽는다 — 이 시험과 무관해 "아직 저장 안 함"으로 답한다.
    loadBasicStore: async () => null,
    saveBasicField: async () => null,
  };
  const adapter: Partial<UnifiedDetailAdapter> = {
    appName: "HIVE",
    ownDomain: "tax-amendment",
    ownColumns: [],
    configScope: "unified-collab",
    domains: [],
    api: api as UnifiedDetailApi,
    fieldOptions: {} as FieldOptionsBundle,
    components: {
      SettlementInfoTab: () => null,
      MeetingsTab: () => null,
      ErpFilesPanel: () => null,
      SectionSettlementTab: () => null,
    } as UnifiedDetailAdapter["components"],
    ownFileFields: [],
    getAllFiles: () => [],
  };
  return adapter as UnifiedDetailAdapter;
}

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
/** 분야 보관함의 기록(kind=history) 읽기 응답만 바꾸고, 나머지는 빈 성공으로 답한다. */
function stubFetch(history: FakeResponse | "offline") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/section-store/") && u.includes("kind=history")) {
        if (history === "offline") throw new TypeError("Failed to fetch");
        return history;
      }
      return { ok: true, status: 200, json: async () => (u.includes("/api/auth/me") ? { role: "MEMBER" } : { success: true, data: null }) };
    }),
  );
}

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
let savedMatchMedia: PropertyDescriptor | undefined;
let savedActEnv: boolean | undefined;
const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

function setViewport(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 상세창을 띄우고 「특허」 분야 탭(기본 하위 탭 = 히스토리)을 연 뒤, 기록 부품이 받은 불러오기 실패 안내를 돌려준다. */
async function openSectionHistory(): Promise<string> {
  setViewport(true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => {
    root.render(<UnifiedDetailView row={makeRow()} onClose={() => {}} adapter={buildAdapter()} />);
  });
  await settle();
  const tab = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "특허");
  if (!tab) throw new Error("「특허」 탭을 찾지 못했습니다");
  await act(async () => {
    (tab as HTMLElement).click();
  });
  await settle();
  const probe = container.querySelector("[data-probe-history]");
  if (!probe) throw new Error("기록 부품이 그려지지 않았습니다");
  return probe.getAttribute("data-load-error") ?? "";
}

beforeEach(() => {
  savedMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
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
  vi.unstubAllGlobals();
  if (savedMatchMedia) Object.defineProperty(window, "matchMedia", savedMatchMedia);
  else delete (window as { matchMedia?: unknown }).matchMedia;
  actEnv.IS_REACT_ACT_ENVIRONMENT = savedActEnv;
});

describe("분야 기록 처음 불러오기 실패 안내", () => {
  it("★403 에 서버가 한국어 까닭을 실어 보내면 「로그인이 풀렸습니다」 대신 그 까닭을 안내한다", async () => {
    stubFetch({ ok: false, status: 403, json: async () => ({ success: false, error: HIDDEN }) });
    const msg = await openSectionHistory();
    expect(msg).toBe(HIDDEN);
    expect(msg).not.toContain("로그인");
  });

  it("403 의 까닭이 { message } 모양이어도 그 까닭을 안내한다", async () => {
    stubFetch({ ok: false, status: 403, json: async () => ({ success: false, error: { code: "FORBIDDEN", message: "관리자만 쓸 수 있습니다." } }) });
    expect(await openSectionHistory()).toBe("관리자만 쓸 수 있습니다.");
  });

  it("403 인데 까닭이 없으면 예전처럼 로그인 만료로 안내한다", async () => {
    stubFetch({ ok: false, status: 403, json: async () => null });
    expect(await openSectionHistory()).toContain("로그인이 풀렸습니다");
  });

  it("401 은 본문 까닭과 상관없이 로그인 만료로 안내한다(세션이 풀린 것)", async () => {
    stubFetch({ ok: false, status: 401, json: async () => ({ success: false, error: "인증 필요" }) });
    expect(await openSectionHistory()).toContain("로그인이 풀렸습니다");
  });

  it("서버 오류(500)는 서버가 받지 못했다고 안내한다", async () => {
    stubFetch({ ok: false, status: 500, json: async () => ({ success: false, error: "저장 실패" }) });
    expect(await openSectionHistory()).toContain("서버가 요청을 받지 못했습니다");
  });

  it("연결이 끊기면 연결 안내를 보인다", async () => {
    stubFetch("offline");
    expect(await openSectionHistory()).toContain("연결이 끊겼습니다");
  });

  it("불러오기에 성공하면 실패 안내가 없다", async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) });
    expect(await openSectionHistory()).toBe("");
  });
});
