"use client";

// 상세창 맨 위에서 일어난 "분야 행 목록을 못 불러왔다"를 아래 부품(정부지원금 패널 등)까지 나른다.
//
// 왜 props 로 안 나르나 — 상세창 → 분야 본문 → 커스텀 패널까지 4겹을 관통해야 하고,
// 그 파일이 3앱에서 서로 달라 한 곳만 빠뜨리기 쉽다. 상자를 안 감싼 호출부는 기본값
// { rowsLoadFailed: false } 를 받아 **지금 그대로** 동작한다.

import { createContext, useContext, useMemo, type ReactNode } from "react";

export type DetailLoadState = {
  /** 분야 행 목록을 못 불러왔나(권한 없음·서버 오류·연결 끊김). "행이 0건"과 구분된다. */
  rowsLoadFailed: boolean;
};

const DEFAULT_STATE: DetailLoadState = { rowsLoadFailed: false };

const Ctx = createContext<DetailLoadState>(DEFAULT_STATE);

export function DetailLoadStateProvider({
  rowsLoadFailed,
  children,
}: {
  rowsLoadFailed: boolean;
  children: ReactNode;
}) {
  const value = useMemo<DetailLoadState>(() => ({ rowsLoadFailed }), [rowsLoadFailed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 상자에서 값을 꺼낸다. 상자가 없으면 "실패 아님". */
export function useDetailLoadState(): DetailLoadState {
  return useContext(Ctx);
}
