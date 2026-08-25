"use client";

/**
 * 페이지 위쪽 컨트롤 묶음 — 1줄·2줄·3줄
 * (SubsidyClient.tsx 모듈화 A, 2026-05-25)
 *
 * 1줄(어드민): [새 업체][관리 도구]  — 50%/50% 균등
 * 2줄: [검색창]  100% 너비
 * (선택 행 있을 때만) 동작 줄: [일괄 수정][삭제][알림톡]
 * (비어드민) 새로고침 줄
 * 3줄: [보기][표시][페이지 이동]  — 1·1.2·2 가중치 (PC), 모바일 100% wrap
 *
 * PC 최대 폭 820px 통일.
 */

import { cn } from "../lib/cn";
import { SettingsDropdown, type SettingsMenuItem, type SettingsCustomItem } from "./SettingsDropdown";

type Props = {
  isAdmin: boolean;
  // 비관리자도 '새 업체'를 쓸 수 있는 화면이면 true(기본 false — 하이브·일루아 무영향).
  canCreate?: boolean;

  // 1줄
  onCreateNew: () => void;
  // 관리 도구 (어드민만)
  settingsBaseMenus: SettingsMenuItem[];
  cfActiveCount: number;
  settingsMenuOrder: string[];
  persistSettingsMenuOrder: (next: string[]) => void;
  settingsMenuLabelOverrides: Record<string, string>;
  persistSettingsMenuLabel: (id: string, label: string) => void;
  settingsMenuHidden: string[];
  persistSettingsMenuHidden: (next: string[]) => void;
  settingsMenuCustom: SettingsCustomItem[];
  persistSettingsMenuCustom: (
    updater: SettingsCustomItem[] | ((prev: SettingsCustomItem[]) => SettingsCustomItem[]),
  ) => void;
  isSafeMenuUrl: (url: string) => boolean;
  onToast: (msg: { message: string; type: "success" | "error" }) => void;

  // 2줄
  searchInput: string;
  setSearchInput: (s: string) => void;

  // 선택 행 동작
  checkedCount: number;
  onBulkEdit: () => void; // 어드민
  onBulkDelete: () => void; // 어드민
  deleting: boolean;
  onBulkAlimtalk: () => void;
  /** 알림톡 일괄 버튼 표시 여부(기본 true). 알림톡 미사용 화면에서 false 로 숨김. */
  showBulkAlimtalk?: boolean;

  // 비어드민 새로고침
  onRefresh: () => void;
  loading: boolean;

  // 3줄 — 보기
  mobileViewMode: "card" | "table";
  setMobileView: (v: "card" | "table") => void;

  // 3줄 — 표시 개수
  pageSize: number; // Infinity 가능
  setPageSizeAndStore: (n: number) => void;

  // 3줄 — 페이지 이동
  currentPage: number;
  setCurrentPage: (n: number | ((p: number) => number)) => void;
  totalPages: number;
  totalRows: number;

  // 3줄(보기/표시/페이지) 렌더 여부 — 캘린더 뷰 등에서는 false
  showPageBox: boolean;

  // 3줄 우측 끝에 붙일 추가 컨트롤(정렬 패널·표 최대화 버튼 등). 보기/표시/페이지와 같은 줄.
  trailingControls?: import("react").ReactNode;
};

export function TopControls({
  isAdmin,
  canCreate = false,
  onCreateNew,
  settingsBaseMenus,
  cfActiveCount,
  settingsMenuOrder,
  persistSettingsMenuOrder,
  settingsMenuLabelOverrides,
  persistSettingsMenuLabel,
  settingsMenuHidden,
  persistSettingsMenuHidden,
  settingsMenuCustom,
  persistSettingsMenuCustom,
  isSafeMenuUrl,
  onToast,
  searchInput,
  setSearchInput,
  checkedCount,
  onBulkEdit,
  onBulkDelete,
  deleting,
  onBulkAlimtalk,
  showBulkAlimtalk = true,
  onRefresh,
  loading,
  mobileViewMode,
  setMobileView,
  pageSize,
  setPageSizeAndStore,
  currentPage,
  setCurrentPage,
  totalPages,
  totalRows,
  showPageBox,
  trailingControls,
}: Props) {
  return (
    <>
      {/* 페이지 최상단 — 3줄 구조 (PC·모바일 동일). PC 컨테이너 폭 820px */}
      <div className="flex flex-col gap-2 md:max-w-[820px]">
        {/* 1줄 — 새 업체(어드민 또는 생성 권한자) + 관리 도구(어드민만) */}
        {(isAdmin || canCreate) && (
          <div className={isAdmin ? "grid grid-cols-2 gap-2" : "flex"}>
            <button
              onClick={onCreateNew}
              className="w-full inline-flex items-center justify-center gap-1.5 h-[44px] md:h-[36px] px-3 text-[13px] font-semibold text-white bg-wedly-accent rounded-lg hover:bg-wedly-accent/90 transition-colors shadow-sm whitespace-nowrap"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              새 업체
            </button>
            {isAdmin && (
            <SettingsDropdown
              baseMenus={settingsBaseMenus}
              cfActiveCount={cfActiveCount}
              settingsMenuOrder={settingsMenuOrder}
              persistSettingsMenuOrder={persistSettingsMenuOrder}
              settingsMenuLabelOverrides={settingsMenuLabelOverrides}
              persistSettingsMenuLabel={persistSettingsMenuLabel}
              settingsMenuHidden={settingsMenuHidden}
              persistSettingsMenuHidden={persistSettingsMenuHidden}
              settingsMenuCustom={settingsMenuCustom}
              persistSettingsMenuCustom={persistSettingsMenuCustom}
              isSafeMenuUrl={isSafeMenuUrl}
              onToast={onToast}
            />
            )}
          </div>
        )}

        {/* 2줄 — 검색창 */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-wedly-muted" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="업체명, 대표자명, 연락처, 사업자번호 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 h-[44px] md:h-[36px] text-sm border border-wedly-bd rounded-lg focus:outline-none focus:ring-2 focus:ring-wedly-accent/20 focus:border-wedly-accent bg-white"
          />
        </div>

        {/* 선택 행 있을 때 동작 버튼 */}
        {checkedCount > 0 && (isAdmin || showBulkAlimtalk) && (
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <button
                onClick={onBulkEdit}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-wedly-accent rounded-lg hover:bg-wedly-accent/90 transition-colors"
                title="선택한 행의 한 컬럼 값을 한 번에 바꿉니다"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                일괄 수정 ({checkedCount})
              </button>
            )}
            {isAdmin && (
              <button
                onClick={onBulkDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-wedly-red rounded-lg hover:bg-wedly-red/90 transition-colors disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V3h4v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {deleting ? "삭제 중..." : `삭제 (${checkedCount})`}
              </button>
            )}
            {showBulkAlimtalk && (
            <button
              onClick={onBulkAlimtalk}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-bold bg-[#FEE500] text-[#3C1E1E] rounded-lg hover:brightness-95 transition-all"
              title="선택한 업체에 알림톡 일괄 발송"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.53-.96 3.4-.99 3.62 0 0-.02.17.09.24.11.06.24.01.24.01.32-.05 3.7-2.44 4.28-2.86.56.08 1.14.12 1.72.12 5.52 0 10-3.58 10-7.94S17.52 3 12 3z" />
              </svg>
              알림톡 ({checkedCount})
            </button>
            )}
          </div>
        )}

        {/* 비어드민 새로고침 */}
        {!isAdmin && (
          <div className="flex">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-wedly-muted border border-wedly-bd rounded-lg hover:bg-wedly-bg-gray transition-colors disabled:opacity-50"
              title="데이터 새로고침"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={loading ? "animate-spin" : ""}>
                <path d="M14 8A6 6 0 114.8 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M14 2v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loading ? "새로고침 중..." : "새로고침"}
            </button>
          </div>
        )}
      </div>

      {/* 3줄 — 보기/표시/페이지(내용 크기, 좌측) + 정렬·표최대화(우측 끝, 표 오른쪽에 맞춤). 박스는 안 늘려 빈 공간 없이, 도구는 떨어뜨려 분리. 캘린더 뷰 등에서는 안 그림 */}
      {showPageBox && (
      <div className={cn("flex flex-wrap items-center gap-2 text-[13px] mt-2", !trailingControls && "md:max-w-[820px]")}>
        {/* 그룹 1: 보기 (카드/표). trailingControls 있는 화면(통합협업·하이브)은 내용 크기, 없는 화면(고객360 등)은 기존처럼 꽉 채움 */}
        <div className={cn("flex-1 inline-flex items-center gap-1.5 bg-white border border-wedly-bd rounded-lg px-2.5 h-[44px] md:h-[36px] shadow-sm", trailingControls ? "md:flex-none" : "md:flex-1 md:min-w-0")}>
          <span className="whitespace-nowrap font-semibold text-[12px] leading-none flex-shrink-0 inline-flex items-center gap-1">
            <span className="text-wedly-muted">보기</span>
            <span className="text-wedly-muted/50 font-normal">|</span>
          </span>
          <div className="flex-1 md:flex-initial inline-flex items-center gap-0.5 whitespace-nowrap">
            <button
              onClick={() => setMobileView("card")}
              className={cn(
                "flex-1 md:flex-initial h-[28px] md:h-[24px] inline-flex items-center justify-center px-2.5 rounded-full text-[12px] leading-none font-semibold transition-colors whitespace-nowrap",
                mobileViewMode === "card" ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              카드
            </button>
            <button
              onClick={() => setMobileView("table")}
              className={cn(
                "flex-1 md:flex-initial h-[28px] md:h-[24px] inline-flex items-center justify-center px-2.5 rounded-full text-[12px] leading-none font-semibold transition-colors whitespace-nowrap",
                mobileViewMode === "table" ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              표
            </button>
          </div>
        </div>

        {/* 그룹 2: 표시 개수 */}
        <div className={cn("flex-1 inline-flex items-center gap-1.5 bg-white border border-wedly-bd rounded-lg px-3 h-[44px] md:h-[36px] shadow-sm", trailingControls ? "md:flex-none" : "md:flex-[1.2] md:min-w-0")}>
          <span className="whitespace-nowrap font-semibold text-[12px] leading-none flex-shrink-0 inline-flex items-center gap-1">
            <span className="text-wedly-muted">표시</span>
            <span className="text-wedly-muted/50 font-normal">|</span>
          </span>
          <div className="flex-1 md:flex-initial inline-flex items-center gap-0.5 whitespace-nowrap">
            {[10, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => setPageSizeAndStore(n)}
                className={cn(
                  "flex-1 md:flex-initial h-[28px] md:h-[24px] inline-flex items-center justify-center px-2 rounded-full text-[12px] leading-none font-semibold transition-colors whitespace-nowrap md:min-w-[32px]",
                  pageSize === n ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray",
                )}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPageSizeAndStore(Infinity)}
              className={cn(
                "flex-1 md:flex-initial h-[28px] md:h-[24px] inline-flex items-center justify-center px-2 rounded-full text-[12px] leading-none font-semibold transition-colors whitespace-nowrap md:min-w-[36px]",
                pageSize === Infinity ? "bg-wedly-bg-blue text-wedly-accent-ink" : "text-wedly-t2 hover:bg-wedly-bg-gray",
              )}
            >
              전체
            </button>
          </div>
        </div>

        {/* 그룹 3: 페이지 이동 (Infinity 가 아니고 1페이지 이상일 때만) */}
        {pageSize !== Infinity && totalPages > 1 && (
          <div className={cn("w-full md:w-auto flex items-center bg-white border border-wedly-bd rounded-lg px-3 h-[44px] md:h-[36px] shadow-sm gap-2", trailingControls ? "md:flex-none" : "md:flex-[2] md:min-w-0")}>
            <span className="whitespace-nowrap font-semibold text-[12px] leading-none flex-shrink-0 inline-flex items-center gap-1">
              <span className="text-wedly-muted">페이지</span>
              <span className="text-wedly-muted/50 font-normal">|</span>
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="flex-shrink-0 min-w-[40px] md:min-w-[36px] h-[36px] md:h-[28px] px-2 text-[22px] md:text-[18px] leading-none text-wedly-t2 rounded-full hover:bg-wedly-bg-gray hover:text-wedly-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold inline-flex items-center justify-center"
                title="처음 페이지"
              >
                «
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex-shrink-0 min-w-[40px] md:min-w-[36px] h-[36px] md:h-[28px] px-2 text-[22px] md:text-[18px] leading-none text-wedly-t2 rounded-full hover:bg-wedly-bg-gray hover:text-wedly-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold inline-flex items-center justify-center"
                title="이전 페이지"
              >
                ‹
              </button>
            </div>
            <div className="flex-1 flex justify-center min-w-0 mx-4 md:mx-3">
              <span className="min-w-[60px] md:min-w-[56px] h-[36px] md:h-[28px] text-[12px] font-bold text-wedly-accent-ink bg-wedly-bg-blue rounded-full tabular-nums text-center inline-flex items-center justify-center px-2.5 whitespace-nowrap">
                {currentPage}/{totalPages}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex-shrink-0 min-w-[40px] md:min-w-[36px] h-[36px] md:h-[28px] px-2 text-[22px] md:text-[18px] leading-none text-wedly-t2 rounded-full hover:bg-wedly-bg-gray hover:text-wedly-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold inline-flex items-center justify-center"
                title="다음 페이지"
              >
                ›
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="flex-shrink-0 min-w-[40px] md:min-w-[36px] h-[36px] md:h-[28px] px-2 text-[22px] md:text-[18px] leading-none text-wedly-t2 rounded-full hover:bg-wedly-bg-gray hover:text-wedly-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-bold inline-flex items-center justify-center"
                title="끝 페이지"
              >
                »
              </button>
            </div>
            <span className="ml-1 text-wedly-muted text-[11px] tabular-nums whitespace-nowrap flex-shrink-0 hidden md:inline">
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalRows)} / {totalRows}건
            </span>
          </div>
        )}
        {/* Infinity 또는 단일 페이지 + 데이터 있을 때만 — 건수 표시 */}
        {(pageSize === Infinity || totalPages <= 1) && totalRows > 0 && (
          <span className="text-wedly-muted text-[11px] tabular-nums whitespace-nowrap">총 {totalRows}건</span>
        )}
        {/* 우측 끝 — 정렬 패널 + 표 최대화 버튼(같은 줄, 구분선으로 페이지 컨트롤과 분리) */}
        {trailingControls && (
          <div className="ml-auto flex items-center gap-2 flex-shrink-0 md:pl-3 md:border-l md:border-wedly-bd">{trailingControls}</div>
        )}
        </div>
        )}
    </>
  );
}
