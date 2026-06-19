"use client";
// 관리자만 보는 "공통 컬럼 관리" 진입 — 회사 상세창 기본정보 머리말 옆 버튼.
// 누르면 설정 팝업이 열린다: ① 추가 칸 관리(CommonColumnManager — 표 불러오기·새 칸·범위)
// ② 기본 공통 칸 토글(CommonFieldsAdmin — 표준 11칸 공통/숨김). ②만 받는 앱(미배선)도 동작.
import { useState } from "react";
import { CommonFieldsAdmin } from "../unified/CommonFieldsAdmin";
import { CommonColumnManager } from "./CommonColumnManager";
import type { BasicColDef } from "../lib/basic-col-manager";

export function CommonFieldsLauncher({
  appSpecificLabels = [],
  ownColumns,
  reservedLabels,
  loadDefs,
  saveDefs,
  onChanged,
}: {
  appSpecificLabels?: string[];
  // 추가 칸 관리(이 둘이 다 있을 때만 노출 — 미배선 앱은 표준 토글만 보임)
  ownColumns?: Array<{ key: string; label: string; type?: string; options?: string[] }>;
  reservedLabels?: string[];
  loadDefs?: () => Promise<BasicColDef[]>;
  saveDefs?: (fields: BasicColDef[]) => Promise<{ ok: boolean; error?: string }>;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const showManager = !!(loadDefs && saveDefs);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-wedly-bd px-2 py-1 text-[11px] font-medium text-wedly-t2 hover:bg-wedly-bg-gray transition-colors"
        title="공통 컬럼 관리 (관리자 전용)"
      >
        <span aria-hidden>⚙</span> 공통 컬럼 관리
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="mt-[6vh] mb-[6vh] w-full max-w-lg rounded-2xl border border-wedly-bd bg-white p-5 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-wedly-t1">공통 컬럼 관리</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-0.5 text-[13px] text-wedly-muted hover:bg-wedly-bg-gray transition-colors"
              >
                닫기
              </button>
            </div>

            {showManager && (
              <div className="mb-5">
                <CommonColumnManager
                  ownColumns={ownColumns}
                  reservedLabels={reservedLabels}
                  loadDefs={loadDefs!}
                  saveDefs={saveDefs!}
                  onChanged={onChanged}
                />
              </div>
            )}

            <div className={showManager ? "border-t border-wedly-bd pt-4" : ""}>
              <h3 className="mb-1 text-[14px] font-semibold text-wedly-t1">기본 공통 칸</h3>
              <p className="mb-3 text-[12px] text-wedly-muted">표준 칸을 공통/앱별로 바꾸거나 이 앱에서 숨깁니다. 변경은 화면 새로고침 후 반영됩니다.</p>
              <CommonFieldsAdmin appSpecificLabels={appSpecificLabels} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
