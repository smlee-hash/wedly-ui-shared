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

/** 맨 앞 안내 줄(아무것도 안 고른 상태). */
const HEAD: TabFieldOption = { value: "", label: "항목 선택…" };

/**
 * 항목 목록 → 드롭다운 줄 목록.
 * 묶음 이름이 바뀌는 자리마다 소제목 줄을 끼운다(같은 이름이 떨어져 두 번 나오면 두 번 끼운다 —
 * 목록 차례를 임의로 바꾸지 않기 위해). 소제목 이름표 값은 번호를 붙여 서로 겹치지 않게 한다.
 */
export function fieldSelectOptions(fields: TabFieldDef[]): TabFieldOption[] {
  if (!fields.some((f) => f.group)) {
    return [HEAD, ...fields.map((f) => ({ value: f.key, label: f.label }))];
  }
  const out: TabFieldOption[] = [HEAD];
  let last: string | undefined;
  let seq = 0;
  for (const f of fields) {
    const group = f.group ?? "";
    if (group !== last) {
      if (group) out.push({ value: `${GROUP_VALUE_PREFIX}${seq++}:${group}`, label: group, isHeader: true });
      last = group;
    }
    out.push({ value: f.key, label: f.label });
  }
  return out;
}
