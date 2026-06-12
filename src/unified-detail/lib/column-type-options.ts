import { DEFAULT_COLUMN_TYPE_OPTIONS } from "../../components/ColumnToggleModal";

// 통합 협업 전용 형식(타입) 선택지 = 공용 기본 목록 + "사람"(직원 선택 드롭다운).
// 컬럼 설정(표)·상세모달 칸 추가 양쪽이 같은 목록을 쓰도록 한 곳에 둔다.
// 공용 DEFAULT_COLUMN_TYPE_OPTIONS 자체는 수정하지 않는다(다른 앱/화면 영향 방지).
export const UNIFIED_TYPE_OPTIONS: { value: string; label: string }[] = [
  ...DEFAULT_COLUMN_TYPE_OPTIONS,
  { value: "person", label: "사람" },
];
