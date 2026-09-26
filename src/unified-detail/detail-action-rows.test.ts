import { describe, expect, it } from "vitest";
import { detailActionRows } from "./detail-action-rows";

describe("detail action source boundary", () => {
  it("does not treat a partial or malformed response as an empty successful load", () => {
    for (const partial of [null, undefined, {}, { domainRows: null }, { domainRows: {} }, { domainRows: "[]" }]) {
      expect(detailActionRows(partial)).toBeNull();
    }
  });
  it("preserves complete empty results and the original domain record identities", () => {
    expect(detailActionRows({ domainRows: [] })).toEqual([]);
    const rows = [{ domain: "policy-fund", entryId: "source-42", row: { "01업체명": "WEDLY QA" } }];
    expect(detailActionRows({ domainRows: rows })).toBe(rows);
  });
});
