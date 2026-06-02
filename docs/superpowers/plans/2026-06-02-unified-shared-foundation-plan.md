# 통합 보기 공용 토대(1단계) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하이브에 있는 "통합 보기"의 순수 로직(묶음·탭 계산, 탭 순서·이름 적용)과 "앱별 설정 틀" 타입을 공용 보관함 `@wedly/ui-shared`로 옮겨, 2단계(ERP 페이지)·3단계(세 앱 공용화)의 안전한 바닥을 만든다.

**Architecture:** `@wedly/ui-shared`에 새 폴더 `src/unified/`를 만들어 (1) 탭 순서·이름 적용 순수 함수, (2) 묶음·하위탭·기본정보 계산 순수 함수, (3) 앱별 설정 틀 타입을 둔다. 옮기는 코드는 하이브의 검증된 원본을 **거의 그대로 복사**(외부 의존이 컬럼 타입 하나뿐이며, 그 타입은 보관함에 동일하게 존재 → 불러오는 경로만 교체). 보관함엔 테스트 장치가 없으므로 vitest를 신설하고, 하이브의 기존 테스트를 옮겨 "계산 결과가 이전과 똑같다"를 기계로 확인한다. **이번 단계는 추가만 한다 — 하이브·일루아·ERP 코드는 건드리지 않고, 어떤 앱도 배포하지 않는다.**

**Tech Stack:** TypeScript(빌드 없이 소스 그대로 배포되는 패키지), vitest 2.x(node 환경, 순수 함수 단위 테스트).

**작업 위치:** `/Users/00.logico.l/wedly-ui-shared`, 브랜치 `feat/unified-view-shared-foundation`(이미 생성됨, 설계서 커밋 `b51e8d9` 위).

**핵심 사실(확인됨, 추측 아님):**
- 보관함 `src/types/columns.ts`의 `ColumnDef` 타입은 하이브 `src/app/(main)/_components/columns.ts`의 `ColumnDef`와 **글자 단위로 동일**(보관함이 원본, 앱이 사본). → 옮길 때 타입 변환 불필요.
- 옮길 원본: 하이브 `src/lib/unified-sections.ts`(301줄, 외부 import는 `ColumnDef` 하나), `src/lib/unified-tab-config.ts`(91줄, import 0).
- 보관함 현재 상태: `tsconfig.json` 없음, vitest 미설치, devDeps에 `typescript ^5.5.0` 있음, `src/index.ts` 끝에 `__MODULE_VERSION__ = "0.18.0"`.

---

## File Structure

- Create: `vitest.config.ts` — 테스트 실행 설정(하이브 것 미러)
- Create: `tsconfig.json` — 타입 검사 설정(새 폴더 + 타입 폴더만 검사, 기존 React 부품은 제외해 사전 오류 회피)
- Modify: `package.json` — `vitest` devDep + `test`/`typecheck` 스크립트 추가
- Create: `src/unified/tab-config.ts` — 탭 순서·이름 적용 순수 함수(하이브 원본 그대로)
- Create: `src/unified/tab-config.test.ts` — 위 함수 테스트(하이브 9건 이전)
- Create: `src/unified/sections.ts` — 묶음·하위탭·기본정보 계산 순수 함수(하이브 원본, import 1줄만 교체)
- Create: `src/unified/sections.test.ts` — 위 함수 테스트(하이브 3건 이전 + 신규 확장)
- Create: `src/unified/config.ts` — 앱별 설정 틀 타입(`DomainGroup`, `UnifiedViewConfig`)
- Create: `src/unified/index.ts` — 위 3개 재노출
- Modify: `src/index.ts` — `export * from "./unified"` 추가 + 버전 0.19.0

---

## Task 1: 테스트·타입검사 장치 신설

**Files:**
- Create: `vitest.config.ts`
- Create: `tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: vitest 설치(하이브와 같은 버전)**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm install -D vitest@^2.1.9`
Expected: 설치 성공, `node_modules/.bin/vitest` 생성.

- [ ] **Step 2: `vitest.config.ts` 생성 (하이브 설정 미러)**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: `tsconfig.json` 생성 (새 순수 코드만 검사 — 기존 부품 제외)**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/unified/**/*.ts", "src/types/**/*.ts"],
  "exclude": ["**/*.test.ts", "node_modules"]
}
```

> 주의: `include`를 `src/unified`·`src/types`로만 좁혔다. 기존 React 부품(`src/components/*`)은 지금까지 자체 타입검사를 한 적이 없어, 전체를 검사하면 이번 작업과 무관한 사전 오류가 날 수 있으므로 일부러 범위 밖에 둔다.

- [ ] **Step 4: `package.json` 스크립트 추가**

`"scripts"` 블록을 다음으로 교체(기존 `lint` 유지):
```json
  "scripts": {
    "lint": "echo 'lint pending'",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 5: 빈 상태에서 장치 동작 확인**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm test`
Expected: 테스트 0건이지만 `--passWithNoTests` 덕에 통과(초록).

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm run typecheck`
Expected: 검사 대상 파일이 아직 없으므로 오류 0(통과).

- [ ] **Step 6: 커밋**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git add vitest.config.ts tsconfig.json package.json package-lock.json
git commit -m "chore(unified): 공용 보관함에 vitest·tsconfig 테스트/검사 장치 신설

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 탭 순서·이름 적용 순수 함수 이전 (`tab-config`)

**Files:**
- Create: `src/unified/tab-config.test.ts`
- Create: `src/unified/tab-config.ts`

- [ ] **Step 1: 테스트 먼저 작성 (하이브 9건 그대로 이전, import 경로만 `./tab-config`)**

`src/unified/tab-config.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { applyTabConfig, EMPTY_TAB_CONFIG, type LabeledItem } from "./tab-config";

const items: LabeledItem[] = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
];

describe("applyTabConfig", () => {
  it("저장 순서대로 정렬하고 나머지는 원래 순서로 뒤에 붙인다", () => {
    const r = applyTabConfig(items, ["c", "a"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["c", "a", "b"]);
  });

  it("저장 순서에 없는(삭제된) 키는 무시한다", () => {
    const r = applyTabConfig(items, ["z", "b"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("중복된 저장 순서는 한 번만 반영한다", () => {
    const r = applyTabConfig(items, ["b", "b", "a"], {}, []);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("라벨을 덮어쓴다(빈 문자열·공백은 무시)", () => {
    const r = applyTabConfig(items, [], { a: "가", b: "  " }, []);
    expect(r.find((x) => x.key === "a")!.label).toBe("가");
    expect(r.find((x) => x.key === "b")!.label).toBe("B");
  });

  it("pinLast 키는 순서를 무시하고 항상 맨 뒤", () => {
    const r = applyTabConfig(items, ["c", "b", "a"], {}, ["c"]);
    expect(r.map((x) => x.key)).toEqual(["b", "a", "c"]);
  });

  it("pinLast 키도 라벨은 덮어쓸 수 있다", () => {
    const r = applyTabConfig(items, [], { c: "다" }, ["c"]);
    expect(r.find((x) => x.key === "c")!.label).toBe("다");
  });

  it("order·label 모두 비면 원본 순서·이름 그대로(불변 입력 보존)", () => {
    const r = applyTabConfig(items, [], {}, []);
    expect(r.map((x) => x.key)).toEqual(["a", "b", "c"]);
    expect(r.map((x) => x.label)).toEqual(["A", "B", "C"]);
  });

  it("원본 배열을 변형하지 않는다", () => {
    const copy = items.map((x) => ({ ...x }));
    applyTabConfig(items, ["c", "a"], { a: "가" }, ["b"]);
    expect(items).toEqual(copy);
  });

  it("EMPTY_TAB_CONFIG 는 빈 설정", () => {
    expect(EMPTY_TAB_CONFIG).toEqual({ topOrder: [], topLabels: {}, subOrder: [], subLabels: {} });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인(모듈 없음)**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm test`
Expected: FAIL — `Cannot find module './tab-config'` (아직 본체 없음).

- [ ] **Step 3: 본체 이전 (하이브 `src/lib/unified-tab-config.ts` 내용을 그대로 복사 — import가 없어 한 글자도 안 바꿈)**

`src/unified/tab-config.ts` 를 만들고, 하이브 `/Users/00.logico.l/wedly-hive-basic-common/src/lib/unified-tab-config.ts` 의 전체 내용(91줄, 주석 포함)을 **그대로** 붙여넣는다. (의존 import가 없어 수정 사항 없음. `TabConfig`, `EMPTY_TAB_CONFIG`, `LabeledItem`, `applyTabConfig`, `normalizeTabConfig` 5개 export.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm test`
Expected: PASS — applyTabConfig 9건 통과.

- [ ] **Step 5: 커밋**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git add src/unified/tab-config.ts src/unified/tab-config.test.ts
git commit -m "feat(unified): 탭 순서·이름 적용 순수 함수 공용화 + 테스트 9건

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 묶음·하위탭·기본정보 계산 순수 함수 이전 (`sections`)

**Files:**
- Create: `src/unified/sections.test.ts`
- Create: `src/unified/sections.ts`

- [ ] **Step 1: 테스트 먼저 작성 (하이브 3건 이전 + 확장)**

`src/unified/sections.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  computeUnifiedSections,
  buildDomainSubTabs,
  buildBasicSection,
  type BasicFieldSpec,
  type ColumnLite,
} from "./sections";

// ── computeUnifiedSections: 시스템/컨테이너 키 제외 (하이브 원본 3건 이전) ──
describe("computeUnifiedSections — 시스템키 제외", () => {
  const cols = [
    { key: "02상호명", label: "상호명", type: "text" },
    { key: "_createdTime", label: "등록일시", type: "last_edited_time" },
  ] as never;

  it("명시 배치된 _createdTime 은 '일반 칸'으로는 안 나온다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명", "_createdTime"] }],
      {}, [], cols, { "02상호명": "A", _createdTime: "2026-06-01" },
    );
    expect(secs.find((s) => s.id === "basic")?.fields.map((f) => f.key)).not.toContain("_createdTime");
  });

  it("내부 컨테이너 키(정산정보)는 명시 배치돼도 계속 제외된다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명", "정산정보"] }],
      {}, [], cols, { "02상호명": "A" },
    );
    expect(secs.find((s) => s.id === "basic")?.fields.map((f) => f.key)).not.toContain("정산정보");
  });

  it("_createdTime 은 '기타'로 자동수집되지 않는다", () => {
    const secs = computeUnifiedSections(
      [{ id: "basic", label: "기본정보", kind: "fields", fieldKeys: ["02상호명"] }],
      {}, [], cols, { "02상호명": "A", _createdTime: "2026-06-01" },
    );
    expect(secs.find((s) => s.id === "other")?.fields.map((f) => f.key) ?? []).not.toContain("_createdTime");
  });
});

// ── buildDomainSubTabs: 하위 탭 구성 (신규 확장) ──
describe("buildDomainSubTabs", () => {
  it("항상 히스토리로 시작하고 파일로 끝난다", () => {
    const tabs = buildDomainSubTabs(true, [], false);
    expect(tabs[0].id).toBe("__history__");
    expect(tabs[tabs.length - 1].id).toBe("__files__");
  });

  it("풍부한 묶음(정산)은 칸이 없어도 탭으로 노출된다", () => {
    const tabs = buildDomainSubTabs(true, [{ id: "set", label: "정산정보", kind: "settlement", fields: [] }], false);
    expect(tabs.map((t) => t.id)).toContain("set");
  });

  it("빈 일반 묶음은 편집모드가 아니면 숨기고, 편집모드면 보인다", () => {
    const plain = [{ id: "memo", label: "메모", kind: "fields", fields: [] }];
    expect(buildDomainSubTabs(true, plain, false).map((t) => t.id)).not.toContain("memo");
    expect(buildDomainSubTabs(true, plain, true).map((t) => t.id)).toContain("memo");
  });

  it("'기타'는 showOtherSection 과 자기영역일 때만 보인다", () => {
    const other = [{ id: "other", label: "기타", kind: "fields", fields: [{ key: "x", label: "x" }] }];
    expect(buildDomainSubTabs(true, other, false, false).map((t) => t.id)).not.toContain("other");
    expect(buildDomainSubTabs(true, other, false, true).map((t) => t.id)).toContain("other");
    expect(buildDomainSubTabs(false, other, false, true).map((t) => t.id)).not.toContain("other");
  });
});

// ── buildBasicSection: 기본정보 표준 묶음 (신규 확장) ──
describe("buildBasicSection", () => {
  const cols: ColumnLite[] = [
    { key: "03대표자명", label: "대표", type: "text" },
    { key: "15사업자번호", label: "사업자번호", type: "text" },
  ];
  const specs: BasicFieldSpec[] = [
    { label: "대표자명", keys: ["03대표자명", "대표자명"], type: "text" },
    { label: "사업자번호", keys: ["15사업자번호", "사업자번호"], type: "text" },
    { label: "없는칸", keys: ["zzz없는키"], type: "text" },
  ];

  it("후보 키 중 실제 있는 첫 키로 연결하고 표준 라벨을 쓴다", () => {
    const sec = buildBasicSection(specs, cols, { "03대표자명": "홍길동" });
    const rep = sec.fields.find((f) => f.key === "03대표자명");
    expect(rep?.label).toBe("대표자명");          // 라벨은 표준 라벨로 통일
    expect(sec.id).toBe("basic");
  });

  it("어느 후보 키도 없으면 그 칸은 건너뛴다", () => {
    const sec = buildBasicSection(specs, cols, {});
    expect(sec.fields.map((f) => f.label)).not.toContain("없는칸");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인(모듈 없음)**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm test`
Expected: FAIL — `Cannot find module './sections'`.

- [ ] **Step 3: 본체 이전 (하이브 원본 복사, import 1줄만 교체)**

`src/unified/sections.ts` 를 만들고, 하이브 `/Users/00.logico.l/wedly-hive-basic-common/src/lib/unified-sections.ts` 의 전체 내용(301줄, 주석 포함)을 그대로 붙여넣되, **딱 한 줄**만 바꾼다:

바꾸기 전(원본 14번째 줄):
```ts
import type { ColumnDef } from "@/app/(main)/_components/columns";
```
바꾼 뒤:
```ts
import type { ColumnDef } from "../types/columns";
```
나머지 287줄은 한 글자도 바꾸지 않는다. (export: `SectionDef`, `ColumnLite`, `UnifiedSection`, `computeUnifiedSections`, `DomainSubTab`, `buildDomainSubTabs`, `BasicFieldSpec`, `BASIC_FIELD_SPECS`, `buildBasicSection`, `ensureBasicTeamFields`, `ensureBasicReportField`.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm test`
Expected: PASS — tab-config 9건 + sections(시스템키 3 + 하위탭 4 + 기본정보 2 = 9)건, 총 18건 통과.

- [ ] **Step 5: 타입 검사 통과 확인**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm run typecheck`
Expected: 오류 0. (`../types/columns` 의 ColumnDef가 원본과 동일하므로 통과.)

- [ ] **Step 6: 커밋**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git add src/unified/sections.ts src/unified/sections.test.ts
git commit -m "feat(unified): 묶음·하위탭·기본정보 계산 순수 함수 공용화 + 테스트 9건

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 앱별 설정 틀 타입 (`config`)

**Files:**
- Create: `src/unified/config.ts`

- [ ] **Step 1: 타입 작성 (하이브 실제 모양 기준 — 런타임 로직 없음)**

`src/unified/config.ts`:
```ts
// 통합 보기 — "앱마다 다른 부분"을 담는 설정 틀.
// 순수 타입만(런타임 로직 없음). 실제 소비는 2단계(ERP 페이지)부터 시작한다.
// 편집 가능 영역 판단은 "위치"가 아니라 primaryDomain "키"로 한다 → 탭 순서를 바꿔도 안전.

// 윗줄 "영역 그룹" 한 개. domains 는 customer-360/ERP 의 실제 도메인 키 목록
// (여러 영역을 한 그룹으로 합쳐 보일 수 있음 — 예: 정책자금·정부지원금·무상지원금 → "정부지원금").
export type DomainGroup = {
  key: string;
  label: string;
  domains: string[];
};

// 한 앱의 통합 보기 설정.
export type UnifiedViewConfig = {
  // 이 앱이 "메인으로 편집·관리"하는 영역 키 (하이브 "tax-amendment", 일루아 "government-subsidy")
  primaryDomain: string;
  // 묶음 배치·순서·이름을 저장/조회하는 범위 이름 (보통 primaryDomain 과 같게 둔다)
  configScope: string;
  // 윗줄 영역 그룹 목록 (기본정보 제외, 표시 순서의 기준)
  domainGroups: DomainGroup[];
};
```

- [ ] **Step 2: 타입 검사 통과 확인**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm run typecheck`
Expected: 오류 0.

- [ ] **Step 3: 커밋**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git add src/unified/config.ts
git commit -m "feat(unified): 앱별 설정 틀 타입(DomainGroup·UnifiedViewConfig)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 공용 보관함 바깥으로 공개 (export)

**Files:**
- Create: `src/unified/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: `src/unified/index.ts` 생성 (3개 모듈 재노출)**

```ts
// 통합 보기 공용 로직 — 묶음·탭 계산, 탭 순서·이름 적용, 앱별 설정 틀.
export * from "./tab-config";
export * from "./sections";
export * from "./config";
```

- [ ] **Step 2: `src/index.ts` 끝부분 수정**

`export const __MODULE_VERSION__ = "0.18.0";` 바로 위에 다음 한 줄을 추가:
```ts
// 통합 보기 공용 로직 — 묶음·탭 계산, 탭 순서·이름 적용, 앱별 설정 틀 (순수 함수/타입)
export * from "./unified";

```
그리고 버전을 올린다:
```ts
export const __MODULE_VERSION__ = "0.19.0";
```

- [ ] **Step 3: 검사·테스트 통과 확인 (이름 충돌 없음 확인)**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm run typecheck && npm test`
Expected: 타입 오류 0(중복 export 없음), 테스트 18건 통과.

- [ ] **Step 4: 커밋**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git add src/unified/index.ts src/index.ts
git commit -m "feat(unified): 통합 보기 공용 로직 export + 버전 0.19.0

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 최종 검증 + 브랜치 올리기 (배포 없음)

- [ ] **Step 1: 전체 검증 한 번 더**

Run: `cd /Users/00.logico.l/wedly-ui-shared && npm run typecheck && npm test`
Expected: 타입 오류 0, 테스트 18건 통과.

- [ ] **Step 2: 다른 앱 영향 없음 확인 (이번 단계는 추가만)**

확인: 이번 단계에서 `wedly-hive-basic-common`·`wedly-illua-linked-customers`·`wedly-erp` 의 파일은 하나도 바뀌지 않았다(추가는 보관함에만). → 어떤 앱도 다시 설치/배포하지 않는다(소비 앱은 다음에 직접 가져갈 때부터 영향).

- [ ] **Step 3: 브랜치 push (PR은 사용자 확인 후)**

```bash
cd /Users/00.logico.l/wedly-ui-shared
git push -u origin feat/unified-view-shared-foundation
```
Expected: 브랜치 업로드 성공. PR 생성·병합은 사용자에게 보고 후 진행.

> **배포 주의:** 공용 보관함을 main에 병합해도 하이브·일루아·ERP는 "다시 설치"하기 전까지 변화 없음. 따라서 이 단계는 운영 영향 0. ERP가 실제로 이 로직을 쓰는 건 2단계이며, 그때 ERP 배포는 **반드시 사용자 승인 후**.

---

## Self-Review (작성자 점검)

- **빈칸(placeholder) 점검:** TBD/임의표현 없음. 옮길 두 파일은 실제 경로의 검증된 원본을 복사하며, 바꾸는 곳은 `sections.ts`의 import 1줄로 명시. 테스트·타입·설정 코드는 전부 전체를 적었다. ✅
- **타입 일관성:** `applyTabConfig`/`computeUnifiedSections`/`buildDomainSubTabs`/`buildBasicSection` 시그니처를 원본과 동일하게 사용. `ColumnLite`/`BasicFieldSpec`는 `sections.ts`에서 export되어 테스트에서 import. `DomainGroup`/`UnifiedViewConfig`는 하이브 실제 모양과 일치. ✅
- **범위:** 1단계만 — 순수 로직 이전 + 테스트 장치 + 설정 틀 타입. 화면·다른 앱·배포는 범위 밖(2·3단계). ✅
- **위험:** 이름 충돌은 Task 5 Step 3의 typecheck로 차단. 기존 React 부품의 사전 타입오류는 tsconfig `include` 범위 제한으로 회피. ✅

## 완료 기준 (1단계)
- 보관함에 통합 보기 순수 로직(탭·묶음·기본정보)과 설정 틀 타입이 추가되고, 테스트 18건 + 타입검사가 통과한다.
- 하이브·일루아·ERP는 변화 없음(추가만). 어떤 앱도 배포하지 않는다.
