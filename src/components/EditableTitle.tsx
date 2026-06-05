"use client";

import { useState } from "react";

// 업체 상세창 "맨 위 상호명" 공용 편집 부품 — ERP·하이브·일루아 모든 상세 모달이 똑같이 쓴다.
// 평소엔 제목(연필 아이콘은 마우스 올릴 때만), 클릭하면 그 자리에서 입력칸으로 바뀐다.
// 저장/취소 동작은 한 곳(이 부품)에만 있어, 한 번 고치면 세 앱·모든 분야 모달이 같이 바뀐다.
//
// - value   : 현재 상호명(원본 값). 빈 값이면 placeholder 글자를 회색처럼 보여준다.
// - onSave  : 새 값으로 바뀌었을 때 호출. 실제 저장(서버 반영)은 각 모달이 가진 저장 함수가 맡는다.
// - readOnly: 보기 전용일 때(아주 드묾). 기본은 "보이면 수정 가능"이라 false.
export function EditableTitle({
  value,
  placeholder = "업체 상세",
  onSave,
  className = "",
  readOnly = false,
}: {
  value: string;
  placeholder?: string;
  onSave: (next: string) => void;
  className?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const raw = value ?? "";
  const display = raw.trim() || placeholder;

  if (readOnly) {
    return (
      <h2 className={`text-[16px] sm:text-lg font-bold text-wedly-navy truncate ${className}`}>
        {display}
      </h2>
    );
  }

  if (editing) {
    return (
      <input
        type="text"
        defaultValue={raw}
        autoFocus
        onBlur={(e) => {
          const v = e.target.value;
          setEditing(false);
          if (v !== raw) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.currentTarget.value = raw;
            e.currentTarget.blur();
          }
        }}
        className={`min-w-0 flex-1 text-[16px] sm:text-lg font-bold text-wedly-navy bg-transparent border-b border-wedly-bd focus:border-wedly-accent outline-none ${className}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`group min-w-0 flex-1 inline-flex items-center gap-1.5 text-left ${className}`}
      title="클릭해서 상호명 수정"
    >
      <h2 className="text-[16px] sm:text-lg font-bold text-wedly-navy truncate">{display}</h2>
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        className="flex-shrink-0 text-wedly-muted opacity-0 group-hover:opacity-70 transition-opacity"
      >
        <path
          d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
