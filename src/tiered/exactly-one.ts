// src/tiered/exactly-one.ts
// "정확히 하나" 판정 — 정산 기준표의 줄(규칙)마다 맞음(T)·안 맞음(F)·모름(U)을 가린 결과로
// 계산해도 되는지, 안 되면 어떤 이유인지를 정한다. 순수 함수만 둔다(칸 값을 읽는 일은 index.ts 가 한다).
//
// 판정 규칙(요청 「계약·정산 수식 설정 기능 정리 및 정산 기준표 재적용」):
//   - 맞는 줄(T) 둘 이상            → 「조건 중복 - 확인 필요」 (결과가 같아도 막는다)
//   - 맞는 줄 ≤ 1 이고 모름(U) 있음  → 처음 모름의 이유(날짜·주소·착수일 …)로 막는다
//   - 맞는 줄 0 이고 모름 0          → 「정산 기준 확인 필요」
//   - 맞는 줄 1 이고 모름 0          → 그 줄의 식으로 계산
//   - 한 줄에서 펼친 규칙(같은 gid)은 하나로 센다. gid 가 없으면 규칙마다 하나다.
import type { FormulaBlock } from "./index";

export const REASON_DUPLICATE = "조건 중복 - 확인 필요";
export const REASON_NO_MATCH = "정산 기준 확인 필요";

export type RowState = "T" | "F" | "U";

export interface RowJudgement {
  /** cond.rules 안 원래 번호 */
  idx: number;
  /** 같은 줄에서 펼친 규칙끼리 같은 값 */
  gid: string;
  state: RowState;
  /** state === "U" 일 때 — 이유 문구(없으면 「정산 기준 확인 필요」) */
  reason?: string;
  /** state === "U" 일 때 — 참조한 수식 칸이 막혀 모르는 경우의 원래 막힘 */
  cause?: FormulaBlock;
}

export type ExactlyOneOutcome =
  | { kind: "one"; idx: number }
  | { kind: "duplicate"; ruleIdx: number[] }
  | { kind: "unknown"; reason: string; cause?: FormulaBlock }
  | { kind: "none" };

/** 줄별 판정을 모아 결과를 정한다. rows 는 규칙 순서대로. */
export function judgeExactlyOne(rows: RowJudgement[]): ExactlyOneOutcome {
  const groups = new Map<string, RowJudgement[]>();
  for (const r of rows) {
    const list = groups.get(r.gid);
    if (list) list.push(r);
    else groups.set(r.gid, [r]);
  }
  const tGroups: RowJudgement[][] = [];
  let firstUnknown: RowJudgement | undefined;
  for (const list of groups.values()) {
    if (list.some((r) => r.state === "T")) {
      tGroups.push(list.filter((r) => r.state === "T"));
    } else {
      const u = list.find((r) => r.state === "U");
      if (u && (!firstUnknown || u.idx < firstUnknown.idx)) firstUnknown = u;
    }
  }
  if (tGroups.length >= 2) {
    return { kind: "duplicate", ruleIdx: tGroups.flat().map((r) => r.idx).sort((a, b) => a - b) };
  }
  if (firstUnknown) {
    return { kind: "unknown", reason: firstUnknown.reason ?? REASON_NO_MATCH, cause: firstUnknown.cause };
  }
  if (tGroups.length === 1) return { kind: "one", idx: tGroups[0][0].idx };
  return { kind: "none" };
}
