// 분야 패널의 하위 탭 「정본」.
//
// 왜 필요한가 — wide(2·3분할)는 패널 안 탭 줄을 숨기고(hideSubTabBar) 같은 탭들을 오른쪽 줄에
// 다시 그린다. 그 오른쪽 줄 목록을 손으로 적어 두면 패널이 실제로 가진 탭과 어긋나는 순간
// 그 탭을 아예 못 누르게 된다(2026-09-03 적대적 리뷰: 「ownDomain 이면 정산 없음」으로 단정해
// 일루아 정부지원금 = 자기분야의 「정산정보」가 사라졌다).
// → 패널이 쓰는 배열과 오른쪽 줄이 이 파일 하나를 같이 본다.

export type SectionSubTabKey = "history" | "contract" | "settlement" | "refund" | "meetings" | "files";

export type SectionSubTab = { key: SectionSubTabKey; label: string };

/** 자기분야 패널(OwnDomainPanel)이 그리는 하위 탭 — 이 배열이 곧 화면이다. */
export const OWN_DOMAIN_SUB_TABS: SectionSubTab[] = [
  { key: "history", label: "히스토리" },
  { key: "contract", label: "계약정보" },
  { key: "settlement", label: "정산정보" },
  { key: "refund", label: "환불정보" },
  { key: "meetings", label: "미팅정보" },
];

/** 그 외 분야 패널(SectionDetailPanel)이 그리는 하위 탭. */
export const SECTION_SUB_TABS: SectionSubTab[] = [
  { key: "history", label: "히스토리" },
  { key: "contract", label: "계약정보" },
  { key: "settlement", label: "정산정보" },
  { key: "refund", label: "환불정보" },
  { key: "meetings", label: "미팅정보" },
];

/**
 * 이 분야 그룹의 하위 탭 목록.
 *
 * - 어댑터가 그 그룹의 목록을 직접 알려 주면(`sectionSubTabs`) 그것이 이긴다. 자기 패널을 주입한
 *   그룹(예: 일루아 정부지원금 = detail-modal-shared 의 GOV_SUB_TABS)이 여기에 해당한다.
 * - 알려 주지 않았는데 자기 패널이 있으면 **모름(null)** — 그 패널이 실제로 가진 탭을 단정할 수
 *   없다(일루아 경정청구 패널은 「정산정보」가 아예 없다). null 이면 부르는 쪽은 「패널 안 탭 줄을
 *   숨기지 않는다」로 가야 하고, 대신 그 그룹으로 되돌아올 단추 하나를 따로 그려야 한다.
 */
export function subTabsOfGroup(
  groupKey: string,
  ownDomain: string,
  hasCustomPanel: boolean,
  adapterSubTabs?: SectionSubTab[] | null,
): SectionSubTab[] | null {
  if (adapterSubTabs?.length) return adapterSubTabs;
  if (hasCustomPanel) return null;
  return groupKey === ownDomain ? OWN_DOMAIN_SUB_TABS : SECTION_SUB_TABS;
}

/**
 * wide 오른쪽 줄에 직접 그릴 세부 탭 — 패널 목록에서 오른쪽 줄이 따로 가진 단추(히스토리·파일)만 뺀다.
 * 목록을 모르면 빈 배열(부르는 쪽이 패널 안 탭 줄을 그대로 살린다).
 */
export function rightRailSubTabs(
  tabs: SectionSubTab[] | null,
  hiddenKeys: readonly string[] = ["history", "files"],
): SectionSubTab[] {
  if (!tabs) return [];
  return tabs.filter((t) => !hiddenKeys.includes(t.key));
}
