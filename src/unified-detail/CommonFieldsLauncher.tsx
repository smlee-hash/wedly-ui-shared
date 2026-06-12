"use client";
// 관리자만 보는 "공통·앱별 칸 설정" 진입 — 회사 상세창 기본정보 머리말 옆 버튼.
// 누르면 그 자리에서 설정 팝업이 열린다(공용 부품 CommonFieldsAdmin 임베드).
import { useState } from "react";
import { CommonFieldsAdmin } from "../unified/CommonFieldsAdmin";

export function CommonFieldsLauncher({ appSpecificLabels = [] }: { appSpecificLabels?: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2 py-1 text-[11px] font-medium text-wedly-t2 hover:bg-wedly-bg-gray transition-colors"
        title="공통·앱별 칸 설정 (관리자 전용)"
      >
        <span aria-hidden>⚙</span> 공통·앱별
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="mt-[8vh] w-full max-w-lg rounded-2xl border border-wedly-bd bg-white p-5 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-wedly-t1">공통 · 앱별 칸 설정</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-0.5 text-[13px] text-wedly-muted hover:bg-wedly-bg-gray transition-colors"
              >
                닫기
              </button>
            </div>
            <p className="mb-3 text-[12px] text-wedly-muted">변경은 화면 새로고침 후 반영됩니다.</p>
            <CommonFieldsAdmin appSpecificLabels={appSpecificLabels} />
          </div>
        </div>
      )}
    </>
  );
}
