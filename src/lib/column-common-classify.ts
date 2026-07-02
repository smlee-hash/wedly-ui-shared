import { resolveCommonFieldId, type CommonFieldOverride } from "../unified/sections";

/**
 * 표 칸들 중 "상세창 기본정보 공통 칸"에 해당하는 것을, 상세창 파랑 판정과 같은 기준으로 추린다.
 *
 * - 판정: resolveCommonFieldId(key, 라벨, override) 가 null 이 아니면 공통(= 상세창 파랑 배지와 동일 기준).
 * - commonBasicFields: 서버 공통칸 정의(키→정식 라벨). 표 원본 라벨이 달라도 정식 라벨로 판정/표시.
 * - 반환 commonLabelByKey: 공통 칸의 정식 표시 이름(예: 키 "검토보고서" → "리포트").
 *
 * 컬럼 설정 모달과 상세창이 이 한 함수를 공유해 목록·이름이 어긋나지 않게 한다.
 */
export function pickCommonColumns(
  columns: { key: string; label: string }[],
  override: CommonFieldOverride | null | undefined,
  commonBasicFields?: { key: string; label: string }[],
): { commonColumnKeys: string[]; commonLabelByKey: Record<string, string> } {
  const managed = new Map((commonBasicFields ?? []).map((c) => [c.key, c.label] as const));
  const commonColumnKeys: string[] = [];
  const commonLabelByKey: Record<string, string> = {};
  for (const c of columns) {
    if (!c || typeof c.key !== "string") continue;
    const effLabel = managed.get(c.key) ?? c.label ?? "";
    const fieldId = resolveCommonFieldId(c.key, effLabel, override);
    if (fieldId == null) continue;
    commonColumnKeys.push(c.key);
    commonLabelByKey[c.key] = fieldId;
  }
  return { commonColumnKeys, commonLabelByKey };
}
