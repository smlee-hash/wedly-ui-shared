/**
 * 요구 이름 목록이 낡지 않게, **부품 파일에서 직접 다시 뽑아** 대조한다.
 * 부품에 새 WEDLY 이름을 쓰면서 목록에 안 넣으면 여기서 걸린다 —
 * 그러면 그 이름이 없는 앱에서 화면이 조용히 사라진다(2026-08-24 적대적 리뷰).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_WEDLY_TOKENS } from "./required-tokens";

const 여기 = dirname(fileURLToPath(import.meta.url));

describe("공용 부품이 요구하는 WEDLY 이름 목록", () => {
  it("부품 파일에서 실제로 쓰는 이름과 목록이 정확히 같다", () => {
    const 쓰는이름 = new Set<string>();
    for (const f of readdirSync(여기).filter((f) => f.endsWith(".tsx"))) {
      for (const m of readFileSync(join(여기, f), "utf8").matchAll(/\b[a-z-]*?(wedly-[a-z0-9-]+)/g)) {
        쓰는이름.add(m[1]);
      }
    }
    expect([...쓰는이름].sort()).toEqual([...REQUIRED_WEDLY_TOKENS].sort());
  });
});
