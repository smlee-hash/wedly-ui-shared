import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * **공용 부품용 클래스 합치기** — ERP `src/lib/utils/cn.ts` 와 **같은 동작**이어야 한다.
 *
 * 왜 꾸러미 안에 또 두나: 공용 부품은 앱 전용 경로(`@/lib/utils/cn`)를 부를 수 없다.
 * 옆에 있는 `src/lib/cn.ts` 는 합치기가 없는 가벼운 사본이라 쓸 수 없다 —
 * 그걸 쓰면 부품을 쓰는 쪽이 `className` 으로 덮어쓴 값이 조용히 무시된다.
 *
 * ★왜 글자 크기 여섯 층을 등록하나 (ERP 2026-08-17 배포본 실측):
 *  합치기 도구는 `text-...` 로 시작하는 **모르는 이름을 전부 「글자 색」으로 본다.**
 *  그래서 `cn("text-wedly-hint", "text-wedly-muted")` 를 「색이 둘」로 읽고 뒤엣것만 남겨
 *  **크기가 조용히 지워졌다.** 여섯 이름을 「글자 크기」로 등록해 두면 색과 안 부딪힌다.
 *
 * ★새 층을 만들면 반드시 이 목록에도 넣는다.
 *  이 목록이 ERP 쪽과 어긋나면 ERP 배포 전 시험
 *  (`src/components/ui/__tests__/shared-shell.test.ts`)이 잡는다.
 */
export const WEDLY_TEXT_TIERS = [
  "wedly-page",
  "wedly-section",
  "wedly-value",
  "wedly-sub",
  "wedly-hint",
  "wedly-label",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...WEDLY_TEXT_TIERS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
