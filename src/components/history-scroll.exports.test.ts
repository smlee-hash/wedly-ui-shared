// 「맨 아래로 따라가기」 판정(history-scroll)을 앱이 `@wedly/ui-shared/history-scroll` 로 가져다 쓸 수 있는지 본다.
// 앱(ERP)에는 공용 HistoryPanel 을 쓰지 않고 자체 목록을 그리는 상세창이 남아 있어, 같은 판정을 한 곳에서 계산해야 한다.
// package.json `exports` 에 길이 없으면 앱이 import 할 수 없다(루트 index.ts 에도 없다).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, "../..");

type ExportEntry = string | { types?: string; default?: string };

function readExports(): Record<string, ExportEntry> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    exports: Record<string, ExportEntry>;
  };
  return pkg.exports;
}

describe("history-scroll 내보내기", () => {
  it("package.json 하위 경로 ./history-scroll 이 history-scroll.ts 를 가리킨다", () => {
    expect(readExports()["./history-scroll"]).toEqual({
      types: "./src/components/history-scroll.ts",
      default: "./src/components/history-scroll.ts",
    });
  });

  it("가리키는 파일이 실제로 있고 앱이 쓰는 세 가지를 내놓는다", async () => {
    const entry = readExports()["./history-scroll"];
    const target = typeof entry === "string" ? entry : entry?.default;
    expect(target).toBeTruthy();
    const file = join(ROOT, target as string);
    expect(existsSync(file)).toBe(true);
    const mod = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
    expect(typeof mod.isNearBottom).toBe("function");
    expect(typeof mod.shouldScrollToBottom).toBe("function");
    expect(mod.STICK_THRESHOLD_PX).toBe(48);
  });
});
