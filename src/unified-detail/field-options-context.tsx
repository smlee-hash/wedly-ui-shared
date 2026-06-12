"use client";

import { createContext, useContext } from "react";
import type { FieldOptionsBundle } from "./adapter-types";

const FieldOptionsContext = createContext<FieldOptionsBundle | null>(null);

export function FieldOptionsProvider({
  value,
  children,
}: {
  value: FieldOptionsBundle;
  children: React.ReactNode;
}) {
  return (
    <FieldOptionsContext.Provider value={value}>
      {children}
    </FieldOptionsContext.Provider>
  );
}

export function useFieldOptions(): FieldOptionsBundle {
  const ctx = useContext(FieldOptionsContext);
  if (ctx === null) {
    throw new Error("useFieldOptions must be used within FieldOptionsProvider");
  }
  return ctx;
}
