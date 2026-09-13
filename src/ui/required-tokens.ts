/**
 * 부품이 실제로 쓰는 WEDLY 이름과 CSS 변수 계약.
 * Tailwind는 정의하지 않은 이름의 CSS를 생성하지 않으므로 소비 앱이 각 변수를 제공해야 한다.
 * 기존 이름 목록은 호환성을 위해 유지한다. 정확한 변수 이름은 REQUIRED_WEDLY_CSS_VARIABLES를 쓴다.
 * hint·label·sub·value·tablehead는 --text- 글자 크기이며, 색상 클래스는 --color-를 쓴다.
 * var()로 직접 읽는 --wedly-accent와 --wedly-gold-ink도 별도로 필요하다.
 * required-tokens.test.ts가 실제 부품의 사용과 두 목록을 대조한다.
 */
// 2026-09-13: 현재 부품이 쓰는 이름으로 갱신. 실제 사용 대조 시험으로 지킨다.
export const REQUIRED_WEDLY_TOKENS = [
  "wedly-accent",
  "wedly-accent-ink",
  "wedly-bd",
  "wedly-bg-blue",
  "wedly-bg-gray",
  "wedly-bg-sidebar",
  "wedly-gold",
  "wedly-gold-ink",
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
  "wedly-tablehead",
  "wedly-teal",
  "wedly-value",
] as const;

/** 소비 앱의 globals.css가 제공할 정확한 CSS 변수 이름. */
export const REQUIRED_WEDLY_CSS_VARIABLES = [
  "--color-wedly-accent",
  "--color-wedly-accent-ink",
  "--color-wedly-bd",
  "--color-wedly-bg-blue",
  "--color-wedly-bg-gray",
  "--color-wedly-bg-sidebar",
  "--color-wedly-gold",
  "--color-wedly-green",
  "--color-wedly-muted",
  "--color-wedly-navy",
  "--color-wedly-pink",
  "--color-wedly-purple",
  "--color-wedly-red",
  "--color-wedly-t1",
  "--color-wedly-t2",
  "--color-wedly-teal",
  "--text-wedly-hint",
  "--text-wedly-label",
  "--text-wedly-sub",
  "--text-wedly-tablehead",
  "--text-wedly-value",
  "--wedly-accent",
  "--wedly-gold-ink",
] as const;
