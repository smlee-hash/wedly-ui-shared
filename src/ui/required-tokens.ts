/**
 * **이 부품들이 쓰는 WEDLY 이름 목록** — 새 앱이 `@wedly/ui-shared/ui` 를 쓰기 전에 반드시 정의해야 한다.
 *
 * ★왜 목록이 따로 필요한가 (2026-08-24 적대적 리뷰가 잡아낸 사고):
 *  Tailwind v4 는 **모르는 이름을 그냥 안 만든다.** 오류도 경고도 없다.
 *  그래서 어떤 앱에 `wedly-bg-sidebar` 가 정의돼 있지 않으면, 그 앱에서 로딩 자리표시자(Skeleton)·
 *  진행 막대(ProgressBar)·단계 표시(Stepper) 는 **배경이 통째로 없는 채로** 그려진다.
 *  사람 이름 동그라미(Avatar)는 흰 글자 + 투명 배경이 되어 이니셜이 아예 안 보인다.
 *  「빌드도 통과하고 오류도 없는데 화면에서만 사라지는」 최악의 유형이라 목록으로 못 박는다.
 *
 *  2026-08-24 실측: ERP 는 25종 전부 정의. **하이브·일루아는 3종이 없다**
 *  (`wedly-bg-sidebar` · `wedly-teal` · `wedly-pink`) — 두 앱이 이 꾸러미를 물기 전에 먼저 넣어야 한다.
 *
 * 이 목록이 낡지 않게 `required-tokens.test.ts` 가 실제 부품 파일에서 다시 뽑아 대조한다.
 *
 * 쓰는 앱의 `globals.css` 에 `--color-<이름>` 또는 `--text-<이름>` 으로 정의돼 있어야 한다.
 * (`wedly-hint`·`wedly-label`·`wedly-sub`·`wedly-value` 는 글자 크기 층이라 `--text-`, 나머지는 `--color-`.)
 */
export const REQUIRED_WEDLY_TOKENS = [
  "wedly-accent",
  "wedly-bd",
  "wedly-bd-blue",
  "wedly-bd-green",
  "wedly-bd-red",
  "wedly-bg-blue",
  "wedly-bg-gray",
  "wedly-bg-green",
  "wedly-bg-red",
  "wedly-bg-sidebar",
  "wedly-bg-yellow",
  "wedly-gold",
  "wedly-green",
  "wedly-hint",
  "wedly-label",
  "wedly-muted",
  "wedly-navy",
  "wedly-pink",
  "wedly-purple",
  "wedly-red",
  "wedly-sub",
  "wedly-t1",
  "wedly-t2",
  "wedly-teal",
  "wedly-value",
] as const;
