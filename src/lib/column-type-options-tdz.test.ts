import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * 순환 import → TDZ 재발 방지 시험.
 *
 * 배포본에서 `/admin/settings/common-fields` 가 아래 예외로 죽었다:
 *   ReferenceError: Cannot access 'DEFAULT_COLUMN_TYPE_OPTIONS' before initialization
 *
 * 사슬:
 *   components/ColumnToggleModal.tsx → "@wedly/detail-modal-shared"(배럴)
 *   → detail-modal-shared/SettlementInfoTab·round-term-rules → "@wedly/ui-shared"(배럴 재진입)
 *   → index.ts → unified-detail/UnifiedDetailView.tsx → ./lib/column-type-options
 *   → 그 파일이 모듈 최상위에서 `...DEFAULT_COLUMN_TYPE_OPTIONS` 를 편다.
 * ColumnToggleModal 이 먼저 평가되는 순서(배포 번들의 청크 순서)에서는
 * 그 상수를 담은 ColumnToggleModal 본문이 아직 안 돌았으므로 TDZ 다.
 *
 * 「상수가 있다」를 재는 시험은 이 결함을 못 잡는다. 그래서 두 가지를 잰다:
 *  1) 상수를 정의하는 모듈이 import 가 0개인 「잎」인가 — 잎은 어떤 평가 순서에서도
 *     자기를 부르는 모듈보다 먼저 끝나므로 TDZ 가 구조적으로 불가능해진다.
 *  2) ESM 평가 순서를 실제로 흉내 내서, 어느 파일에서 시작하든 상수 정의 모듈이
 *     「모듈 최상위에서 그 상수를 읽는 모듈」보다 먼저 실행되는가.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "DEFAULT_COLUMN_TYPE_OPTIONS";
const BARREL = join(SRC, "index.ts");

/**
 * 이웃 꾸러미가 이쪽 배럴을 되부르는 역방향 모서리(2026-09-11 실측):
 *   detail-modal-shared/src/index.ts:11 → components/SettlementInfoTab.tsx:48 → `isStepOp` 등 값 import
 *   detail-modal-shared/src/components/round-term-rules.ts:1 → `isStepOp` 값 import
 * 이 모서리가 순환을 만든다. 그래프에 노드 하나로 넣어 실제 순환을 재현한다.
 */
const BACK_EDGE_PKG = "@wedly/detail-modal-shared";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(p);
  }
  return out;
}

const FILES = walk(SRC).sort();
const rel = (p: string): string => (p === BACK_EDGE_PKG ? p : relative(SRC, p));

/**
 * 주석을 공백으로 지운다. `blankStrings` 이면 문자열·템플릿 리터럴 속도 함께 지운다.
 * - import 지정자를 읽을 때는 문자열을 남겨야 한다(`blankStrings: false`).
 * - 중괄호 깊이를 셀 때는 문자열 속 `{}` 가 섞이면 안 되므로 지운다(`blankStrings: true`).
 * 줄 번호가 어긋나지 않게 지운 자리는 같은 길이의 공백/줄바꿈으로 바꾼다.
 */
function stripOut(code: string, blankStrings: boolean): string {
  let out = "";
  let i = 0;
  const blank = (c: string): string => (c === "\n" ? "\n" : " ");
  while (i < code.length) {
    const c = code[i];
    const n = code[i + 1];
    if (c === "/" && n === "/") {
      while (i < code.length && code[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && n === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? code.length : end + 2;
      for (; i < stop; i++) out += blank(code[i]);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < code.length) {
        if (code[i] === "\\") { out += blankStrings ? "  " : code.slice(i, i + 2); i += 2; continue; }
        if (code[i] === c) { out += c; i++; break; }
        out += blankStrings ? blank(code[i]) : code[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 값(런타임) import 의 모듈 지정자만 소스 순서대로 뽑는다. `import type` 은 번들러가 지우므로 뺀다. */
function importSpecs(file: string): string[] {
  const code = stripOut(readFileSync(file, "utf8"), false);
  const found: { at: number; spec: string }[] = [];

  const withFrom = /^[ \t]*(import|export)\b([^;]*?)\bfrom\s*["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = withFrom.exec(code)) !== null) {
    if (/^\s*type\b/.test(m[2])) continue; // `import type … from` / `export type … from`
    found.push({ at: m.index, spec: m[3] });
  }

  const sideEffect = /^[ \t]*import\s*["']([^"']+)["']/gm;
  while ((m = sideEffect.exec(code)) !== null) found.push({ at: m.index, spec: m[1] });

  found.sort((a, b) => a.at - b.at);
  return found.map((f) => f.spec);
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (spec === BACK_EDGE_PKG) return BACK_EDGE_PKG;
  if (!spec.startsWith(".")) return null; // 그 밖의 외부 꾸러미는 이 그래프 밖
  const base = resolve(dirname(fromFile), spec);
  const cands = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  for (const c of cands) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const DEPS = new Map<string, string[]>();
for (const f of FILES) {
  DEPS.set(
    f,
    importSpecs(f)
      .map((s) => resolveSpec(f, s))
      .filter((x): x is string => x !== null),
  );
}
DEPS.set(BACK_EDGE_PKG, [BARREL]);

/** ESM 평가 순서 — 깊이 우선 후위, 소스 순서, 순환 모서리는 건너뜀. */
function evalOrder(entry: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (m: string): void => {
    if (seen.has(m)) return; // 평가 중(순환) 또는 완료 → 건너뜀
    seen.add(m);
    for (const d of DEPS.get(m) ?? []) visit(d);
    order.push(m);
  };
  visit(entry);
  return order;
}

const definers = FILES.filter((f) =>
  new RegExp(`export\\s+const\\s+${NAME}\\b`).test(readFileSync(f, "utf8")),
);

/** 모듈 최상위(중괄호 깊이 0)에서 상수를 값으로 읽는 줄 번호. import/export 절은 `{}` 안이라 걸리지 않는다. */
function topLevelUseLines(file: string): number[] {
  const code = stripOut(readFileSync(file, "utf8"), true);
  const lines: number[] = [];
  let depth = 0;
  let line = 1;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\n") { line++; continue; }
    if (c === "{") { depth++; continue; }
    if (c === "}") { depth--; continue; }
    if (depth !== 0) continue;
    if (c !== NAME[0]) continue;
    if (code.slice(i, i + NAME.length) !== NAME) continue;
    const before = i === 0 ? "" : code[i - 1];
    const after = code[i + NAME.length] ?? "";
    if (/[A-Za-z0-9_$]/.test(before) || /[A-Za-z0-9_$]/.test(after)) continue;
    lines.push(line);
  }
  return lines;
}

describe(`${NAME} 순환 import TDZ 방지`, () => {
  it("상수를 정의하는 모듈은 정확히 하나다", () => {
    expect(definers.map(rel)).toHaveLength(1);
  });

  it("상수를 정의하는 모듈은 import 가 0개인 잎 모듈이다", () => {
    const definer = definers[0]!;
    const specs = importSpecs(definer);
    expect(
      { 정의모듈: rel(definer), import: specs },
      "정의 모듈이 무언가를 import 하면 그 사슬이 한 바퀴 돌아 자기를 다시 부를 수 있다 → TDZ 재발",
    ).toEqual({ 정의모듈: rel(definer), import: [] });
  });

  it("어떤 파일에서 시작해도 상수 정의가 모듈 최상위 사용보다 먼저 평가된다", () => {
    const definer = definers[0]!;
    const consumers = FILES.filter((f) => f !== definer && topLevelUseLines(f).length > 0);
    expect(consumers.length, "모듈 최상위에서 상수를 읽는 곳이 하나도 없으면 이 시험이 헛돈다").toBeGreaterThan(0);

    const bad: string[] = [];
    for (const entry of [...FILES, BACK_EDGE_PKG]) {
      const order = evalOrder(entry);
      const dAt = order.indexOf(definer);
      for (const c of consumers) {
        const cAt = order.indexOf(c);
        if (cAt === -1) continue;
        if (dAt === -1 || dAt > cAt) {
          bad.push(
            `진입 ${rel(entry)}: ${rel(c)}(줄 ${topLevelUseLines(c).join(",")}) 본문이 ` +
              `${rel(definer)} 본문보다 먼저 실행됨 → TDZ`,
          );
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("공개 export 경로가 그대로다 — ColumnToggleModal 과 배럴이 계속 내보낸다", () => {
    const modal = readFileSync(join(SRC, "components/ColumnToggleModal.tsx"), "utf8");
    const barrel = readFileSync(BARREL, "utf8");
    const modalExports =
      new RegExp(`export\\s+const\\s+${NAME}\\b`).test(modal) ||
      new RegExp(`export\\s*\\{[^}]*\\b${NAME}\\b`).test(modal);
    expect(modalExports, "@wedly/ui-shared 를 무는 3앱이 이 경로로 상수를 가져간다").toBe(true);
    expect(
      barrel.includes(`export { ColumnToggleModal, ${NAME} } from "./components/ColumnToggleModal";`),
    ).toBe(true);
  });
});
