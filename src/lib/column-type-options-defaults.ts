/**
 * 칸 형식(타입) 기본 선택지 — **import 가 하나도 없는 잎 모듈**.
 *
 * ★이 파일이 아무것도 import 하지 않는 것이 핵심이다. 원래 이 상수는
 *  `components/ColumnToggleModal.tsx` 안에 있었는데, 그 파일이
 *  `@wedly/detail-modal-shared` 배럴을 부르고 → 그 꾸러미가 다시 `@wedly/ui-shared`
 *  배럴을 부르고 → 배럴이 `unified-detail/UnifiedDetailView` 를 부르고
 *  → 그게 `unified-detail/lib/column-type-options` 를 불러 모듈 최상위에서
 *  이 상수를 펴는 한 바퀴가 생겼다. ColumnToggleModal 이 먼저 평가되는 순서에서는
 *  자기 본문(상수 정의)에 닿기 전에 그 한 바퀴가 돌아 아직 없는 상수를 읽어
 *  배포본이 아래 예외로 죽었다:
 *      ReferenceError: Cannot access 'DEFAULT_COLUMN_TYPE_OPTIONS' before initialization
 *
 *  import 가 0개인 모듈은 어떤 평가 순서에서도 자기를 부르는 모듈보다 먼저 끝나고,
 *  순환에 낄 수도 없다. 그래서 여기에 두면 TDZ 가 구조적으로 불가능하다.
 *  **이 파일에 import 를 추가하지 말 것** — `lib/column-type-options-tdz.test.ts` 가 막는다.
 *
 * 공개 경로는 그대로다: `@wedly/ui-shared` 배럴과 `components/ColumnToggleModal` 이
 * 이 상수를 계속 내보낸다. 3앱은 쓰던 경로를 안 고쳐도 된다.
 */

// 칸 추가/수정 시 고를 수 있는 타입 — 드롭다운은 단일 선택/다중 선택으로 구분.
export const DEFAULT_COLUMN_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "text", label: "글자" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "select", label: "단일 선택" },
  { value: "multi_select", label: "다중 선택" },
  { value: "checkbox", label: "체크박스" },
];
