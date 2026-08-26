// 탭 편집창 '항목 선택' 드롭다운 줄 만들기.
//
// 왜 따로 뺐나: 차수카드 칸을 분야·카드별로 갈라 보여 달라는 요청(이아영 2026-08-21) 때문에
// 목록에 '소제목 줄'이 필요해졌다. 소제목은 드롭다운 부품(CustomSelect)이 이미 isHeader 로
// 지원하므로 여기서는 '어디에 소제목을 끼울지'만 정한다. 순수 함수라 시험으로 규칙을 못 박는다.
//
// 뒤로 호환: 묶음 이름(group)을 아무도 안 주면 예전과 글자 하나 안 다른 평면 목록을 돌려준다.
// → 이 부품을 쓰는 다른 화면 4곳과 하이브·일루아 앱은 영향이 없다.

/** 거르기 조건에서 고를 수 있는 항목. group 을 주면 그 이름으로 묶어 소제목을 끼운다. */
export type TabFieldDef = { key: string; label: string; type: string; group?: string };

/** 드롭다운 한 줄. isHeader 인 줄은 고를 수 없는 소제목이다. */
export type TabFieldOption = { value: string; label: string; isHeader?: boolean };

/** 소제목 줄의 이름표 값 앞머리 — 실제 항목 이름표와 절대 안 겹치게 하는 표식. */
export const GROUP_VALUE_PREFIX = "__group__:";

/** 소제목 줄의 값인가 — 조건 항목으로 저장되면 안 되는 값. */
export function isGroupHeaderValue(value: string): boolean {
  return value.startsWith(GROUP_VALUE_PREFIX);
}

/** 맨 앞 안내 줄(아무것도 안 고른 상태). */
const HEAD: TabFieldOption = { value: "", label: "항목 선택…" };

/**
 * 항목 목록 → 드롭다운 줄 목록.
 * 묶음이 하나라도 있으면 묶음 없는 항목을 안내 줄 바로 뒤에 원래 차례로 모은 뒤,
 * 묶음 있는 항목을 원래 차례대로 놓고 묶음이 바뀌는 자리마다 소제목을 끼운다
 * (같은 이름이 떨어져 두 번 나오면 두 번 끼운다). 소제목 이름표 값은 번호를 붙여 서로 겹치지 않게 한다.
 * 묶음이 하나도 없으면 예전과 같은 평면 목록.
 */
export function fieldSelectOptions(fields: TabFieldDef[]): TabFieldOption[] {
  if (!fields.some((f) => f.group)) {
    return [HEAD, ...fields.map((f) => ({ value: f.key, label: f.label }))];
  }
  const ungrouped: TabFieldDef[] = [];
  const grouped: TabFieldDef[] = [];
  for (const f of fields) {
    if (f.group) grouped.push(f);
    else ungrouped.push(f);
  }
  const out: TabFieldOption[] = [HEAD, ...ungrouped.map((f) => ({ value: f.key, label: f.label }))];
  let last: string | undefined;
  let seq = 0;
  for (const f of grouped) {
    const group = f.group ?? "";
    if (group !== last) {
      if (group) out.push({ value: `${GROUP_VALUE_PREFIX}${seq++}:${group}`, label: group, isHeader: true });
      last = group;
    }
    out.push({ value: f.key, label: f.label });
  }
  return out;
}
