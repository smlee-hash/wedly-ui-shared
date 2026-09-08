import type { DomainRowLite } from "./lib/customer-detail";

/** Missing source rows mean an incomplete load, not a successful empty result. */
export function detailActionRows(detail: unknown): DomainRowLite[] | null {
  if (!detail || typeof detail !== "object") return null;
  const rows = (detail as { domainRows?: unknown }).domainRows;
  return Array.isArray(rows) ? rows : null;
}
