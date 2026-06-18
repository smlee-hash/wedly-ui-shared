// 컬럼 타입 정의 — 양쪽 앱 공유. 구체 컬럼 목록(COLUMNS·DEFAULT_VISIBLE)은
// 각 앱의 도메인이므로 보관함에 두지 않고 앱별 _components/columns.ts 에 위치.

// 수식 컬럼 세부 정의 — formula 타입의 customColumns 만 사용. 단순 식 1개만 지원.
// 예: { refKey: "예상수수료", op: "*", operand: 0.3 } → 예상수수료 × 30%
export type FormulaSpec = {
  refKey: string;                        // 참조할 다른 컬럼의 키
  op: "*" | "+" | "-" | "/";             // 연산자
  operand: number;                       // 곱·더·빼·나눌 숫자 (퍼센트는 0.3 형태로 저장)
};

export type ColumnDef = {
  key: string;
  label: string;
  type:
    | "title"
    | "text"
    | "number"
    | "percent"
    | "date"
    | "datetime"  // date + 시간(예: 방문일시). 표시는 값에 시간 있으면 자동 포함.
    | "select"
    | "multi_select"
    | "person"
    | "checkbox"
    | "formula"
    | "file"
    | "email"
    | "phone_number"
    | "status"
    | "auto_increment_id"
    | "last_edited_time"
    | "last_edited_by";
  defaultVisible: boolean;
  width?: number;
  sticky?: boolean;
  format?: "currency";
  formula?: FormulaSpec;                 // type === "formula" 일 때만 사용 (customColumns 한정)
};
