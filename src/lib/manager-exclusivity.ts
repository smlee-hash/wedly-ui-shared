// 조회 담당자 ↔ 다지기 담당자 상호배타 (3앱 공통 person 칸).
// 두 칸은 상세창 기본정보의 공통 person 칸(전역 공통 저장소 basic-fields-common, 3앱 공유)이라
// key가 세 앱 동일. 라벨이 아니라 key로 식별 → 관리자가 칸 이름을 바꿔도 유지된다.
export const INQUIRY_MANAGER_KEY = "custom_1780658876045";        // 조회 담당자
export const CONSOLIDATION_MANAGER_KEY = "custom_1782646739357";  // 다지기 담당자

export const INQUIRY_MANAGER_LABEL = "조회 담당자";
export const CONSOLIDATION_MANAGER_LABEL = "다지기 담당자";

// person 값(문자열; 여러 명이면 쉼표/세미콜론) 이 채워졌는지 — 공백만 있으면 빈값 취급.
export function isManagerFilled(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

// 한 회사 값묶음(row)에서 두 칸이 모두 채워졌는지 — 경고/강조 판정.
export function bothManagersFilled(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  return isManagerFilled(row[INQUIRY_MANAGER_KEY]) && isManagerFilled(row[CONSOLIDATION_MANAGER_KEY]);
}

// 특정 칸(key)이 상호배타로 잠겨야 하는지 — "상대 칸이 채워졌고 + 이 칸은 비었을 때"만 잠금.
// 둘 다 채워진 예외 데이터는 둘 다 잠기지 않는다(하나를 지워 고칠 수 있어야 하므로).
// 대상 두 칸이 아니면 항상 잠금 없음(모든 칸에 안전하게 호출 가능).
export function managerLockState(
  key: string,
  row: Record<string, unknown> | null | undefined,
): { locked: boolean; reason?: string } {
  if (!row) return { locked: false };
  if (key !== INQUIRY_MANAGER_KEY && key !== CONSOLIDATION_MANAGER_KEY) return { locked: false };
  if (isManagerFilled(row[key])) return { locked: false }; // 내 칸이 이미 차 있으면 안 잠금
  if (key === INQUIRY_MANAGER_KEY && isManagerFilled(row[CONSOLIDATION_MANAGER_KEY])) {
    return { locked: true, reason: `${CONSOLIDATION_MANAGER_LABEL}가 지정되어 잠김` };
  }
  if (key === CONSOLIDATION_MANAGER_KEY && isManagerFilled(row[INQUIRY_MANAGER_KEY])) {
    return { locked: true, reason: `${INQUIRY_MANAGER_LABEL}가 지정되어 잠김` };
  }
  return { locked: false };
}
