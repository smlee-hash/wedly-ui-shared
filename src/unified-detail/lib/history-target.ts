// 목록 말풍선(히스토리) 클릭 시 "처음 열 분야"를 고른다(NO.80b/NO.80c).
// 선호 분야(ERP=경정청구 tax-amendment, 일루아=정부지원금 government-subsidy)에 히스토리가 있으면 그 분야,
// 없으면 히스토리가 있는 첫 분야(orderedKeys 순서). 아무 곳에도 히스토리가 없으면 null(폴백은 호출측 결정).
// forcePreferred=true(일루아)면 선호 분야가 목록에 있는 한 히스토리 유무와 무관하게 항상 선호 분야로 — 다른 분야로 폴백하지 않는다(NO.80c).
export function pickHistoryTargetGroup(
  orderedKeys: string[],
  hasHistory: (key: string) => boolean,
  preferred?: string,
  forcePreferred = false,
): string | null {
  if (preferred && orderedKeys.includes(preferred) && (forcePreferred || hasHistory(preferred))) return preferred;
  for (const k of orderedKeys) if (hasHistory(k)) return k;
  return null;
}
