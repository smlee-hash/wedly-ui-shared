// 목록 말풍선(히스토리) 클릭 시 "처음 열 분야"를 고른다(NO.80b).
// 선호 분야(ERP=경정청구 tax-amendment, 일루아=정부지원금 government-subsidy)에 히스토리가 있으면 그 분야,
// 없으면 히스토리가 있는 첫 분야(orderedKeys 순서). 아무 곳에도 히스토리가 없으면 null(폴백은 호출측 결정).
export function pickHistoryTargetGroup(
  orderedKeys: string[],
  hasHistory: (key: string) => boolean,
  preferred?: string,
): string | null {
  if (preferred && orderedKeys.includes(preferred) && hasHistory(preferred)) return preferred;
  for (const k of orderedKeys) if (hasHistory(k)) return k;
  return null;
}
