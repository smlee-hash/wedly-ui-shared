// 숫자 입력칸의 판단 두 가지 — React 없이 도는 순수 함수라 시험이 직접 부른다.
//
// ★왜 나눠 두나: 이 저장소의 시험은 브라우저 없이 node 에서 돈다(vitest environment: "node",
//  react·testing-library 를 안 쓴다). 화면 부품 안에 숨겨 두면 「타자 중에 넘기는가」를
//  시험으로 못 박을 수 없어, 아래 사고가 다시 나도 아무도 모른다.

/** 소수점 오차를 정리한다(0.1 + 0.2 같은 꼬리를 자른다). */
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * 칸을 떠날 때·단추를 누를 때 쓰는 자르기. 숫자가 아니면 0 을 범위로 자른다.
 */
export function clampNumberInput(n: number, min: number, max: number): number {
  return round(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : Math.max(min, Math.min(max, 0)));
}

/**
 * **타자 중에** 이 값을 바로 넘길까 — 넘길 값이면 그 숫자, 아니면 `null`.
 *
 * ★왜 필요한가 (독립 화면 검사 2026-09-05 · 높음):
 *  예전에는 친 값을 **칸을 떠날 때(onBlur)만** 넘기고 타자 중엔 화면 글자만 바꿨다.
 *  그래서 ERP 이관 설정 화면에서 `20` 을 지우고 `25` 를 친 뒤 **곧장 「설정 저장」을 누르면**
 *  옛 값(20)이 저장되고 칸에는 25 가 남았다 — 보이는 값과 저장된 값이 달랐다.
 *  (단추로 올린 값은 즉시 넘어가서, 같은 화면에서 방법에 따라 결과가 달랐다.)
 *
 * ★그렇다고 아무 값이나 바로 넘기면 안 된다:
 *  `250` 을 치려고 `2` 를 친 순간 최솟값으로 잘리거나, 지우려고 칸을 비운 순간 0 이 저장되면
 *  타자를 방해한다. 그래서 **범위 안의 온전한 숫자**일 때만 바로 넘기고,
 *  범위 밖·빈 값·부호만 남은 상태는 화면 글자로만 두었다가 칸을 떠날 때 잘라 넘긴다.
 */
export function commitWhileTyping(raw: string, min: number, max: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return round(n);
}
