"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "./cn";

/**
 * 표준 표 (2026-08-23 신설 — 사장님 「표 부품이 없다」 지적) — 바로 불러다 쓰는 정렬 가능한 표.
 *
 * ★머리 띠는 2026-08-25 에 남색 → 주 파랑(#006AFF)으로 바꿨다 (사장님 결정).
 *  wedly.kr 홈페이지를 재 보니 **남색이 전 페이지에서 0회**였다 — 앱만 남색을 표 머리처럼
 *  넓은 면에 써서 두 매체의 톤이 갈렸다. 흰 글자 대비 4.66 으로 기준(4.5)을 넘는다.
 *  로고·문서 표지의 남색은 브랜드 자산이라 그대로 둔다.
 * 8개 시스템 중 5곳 보유 유형. 협업 화면의 대량 자료는 공용 DesktopTable, 그 외 일반 표는 이 부품.
 * 변형: 정렬(sortable 칸)·줄무늬(striped, 기본 켬)·오른쪽 정렬(align)·빈 상태 문구.
 * 머리 칸은 이 파일 전용 — 공용 머리 칸 클래스를 쓰면 다른 표까지 남색이 번진다.
 */
export type TableColumn<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** 정렬 기준 값 — 없으면 render 전 원본 값을 못 알므로 sortable 칸엔 필수 */
  sortValue?: (row: T) => string | number;
  render: (row: T) => ReactNode;
};

/**
 * 표 칸 클래스 — ERP `src/components/ui/Insight.tsx` 의 `TD_CELL` 과 **같은 값**이어야 한다.
 * 그쪽은 ERP 화면들이 손으로 짜는 표가 쓰고, 이쪽은 이 부품이 쓴다.
 * 옮겨 오기 전에는 그 파일에서 가져다 썼는데, 공용 꾸러미에서는 앱 전용 경로를 부를 수 없다.
 * 값이 어긋나면 ERP 배포 전 시험(`__tests__/shared-shell.test.ts`)이 잡는다.
 */
const TD_CELL = "border-b border-wedly-bd/50 px-3 py-2 text-wedly-sub text-wedly-t1";

const TABLE_TH = "px-3 py-2 text-wedly-tablehead font-semibold text-white";

export function Table<T>({
  columns,
  rows,
  rowKey,
  striped = true,
  emptyText = "표시할 자료가 없습니다",
  className,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  striped?: boolean;
  emptyText?: string;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    return [...rows].sort((a, b) => {
      const av = sv(a);
      const bv = sv(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);
  const alignCls = (a?: "left" | "right" | "center") => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <div className="overflow-hidden rounded-lg border border-wedly-bd">
        <table className="w-full border-collapse text-left">
          <thead className="bg-wedly-accent text-wedly-tablehead">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(TABLE_TH, alignCls(col.align))}
                  aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {col.sortable && col.sortValue ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) => (s?.key === col.key ? (s.dir === "asc" ? { key: col.key, dir: "desc" } : null) : { key: col.key, dir: "asc" }))
                      }
                      className={cn("inline-flex items-center gap-1 text-white hover:text-white/80", col.align === "right" && "flex-row-reverse")}
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-70" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cn(!striped && "divide-y divide-wedly-bd/60")}>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={cn(TD_CELL, "py-6 text-center text-wedly-muted")}>
                  {emptyText}
                </td>
              </tr>
            )}
            {sorted.map((row, i) => (
              <tr key={rowKey(row)} className={cn(striped && i % 2 === 1 && "bg-wedly-bg-gray")}>
                {columns.map((col) => (
                  <td key={col.key} className={cn(TD_CELL, alignCls(col.align), col.align === "right" && "tabular-nums")}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
