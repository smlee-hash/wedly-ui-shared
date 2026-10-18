import { describe, expect, it } from "vitest";
import { basicRecoveryIdentity, customerKeyFromTaxRow } from "./customer-detail";
describe("phone normalization at the recovery identity boundary", () => {
  it.each(["tax-amendment", "government-subsidy"])("accepts server-normalized Korean phone in %s", domain => {
    const row = (phone: string) => domain === "government-subsidy"
      ? { _id: "r", "03대표연락처": phone }
      : { _id: "r", "04연락처": phone };
    for (const input of ["+82 10-2222-2222", "82 10 2222 2222", "0082-10-2222-2222", "+82 (0)10-2222-2222"]) {
      expect(basicRecoveryIdentity(row(input), domain)).toBe(basicRecoveryIdentity(row("010-2222-2222"), domain));
    }
    expect(basicRecoveryIdentity(row("010-2222-2222"), domain)).not.toBe(basicRecoveryIdentity(row("010-3333-3333"), domain));
  });
  it("does not change customer lookup keys or merge foreign and invalid numbers", () => {
    const row = (phone: string) => ({ _id: "r", "04연락처": phone });
    expect(customerKeyFromTaxRow(row("+82 10-2222-2222"))).toBe("p:821022222222");
    for (const [left, right] of [["+1 202 555 0123", "02025550123"], ["+82 123", "0123"], ["memo +82 10-2222-2222", "010-2222-2222"]]) {
      expect(basicRecoveryIdentity(row(left))).not.toBe(basicRecoveryIdentity(row(right)));
    }
  });

  it.each([
    ["+82 2-222-2222", "02-222-2222"],
    ["0082 02 2222 2222", "02-2222-2222"],
    ["82 31 222 2222", "031-222-2222"],
    ["+82 31-2222-2222", "031-2222-2222"],
    ["+82 502-222-2222", "0502-222-2222"],
    ["  +82.10.2222.2222  ", "010-2222-2222"],
  ])("accepts server-formatted %s as %s", (international, domestic) => {
    expect(basicRecoveryIdentity({ "04연락처": international })).toBe(
      basicRecoveryIdentity({ "04연락처": domestic }),
    );
  });

  it.each([
    ["+82 123", "0123"],
    ["+82 10-2222-222222", "0102222222222"],
    ["+82 10-222-222", "010222222"],
    ["+82 2-2222-22222", "02222222222"],
    ["+82 502-22-2222", "0502222222"],
    ["+82 502-2222-2222", "050222222222"],
    ["+1 202 555 0123", "02025550123"],
    ["001 202 555 0123", "012025550123"],
    ["0083 10-2222-2222", "010-2222-2222"],
    ["memo +82 10-2222-2222", "010-2222-2222"],
    ["+82 10-2222-2222 / 내선 7", "010222222227"],
  ])("keeps unformatted %s distinct from %s", (input, other) => {
    for (const domain of ["tax-amendment", "government-subsidy"]) {
      const row = (phone: string) => domain === "government-subsidy"
        ? { _id: "r", "03대표연락처": phone }
        : { _id: "r", "04연락처": phone };
      expect(basicRecoveryIdentity(row(input), domain)).not.toBe(
        basicRecoveryIdentity(row(other), domain),
      );
      const key = `p:${input.replace(/[^0-9]/g, "")}`;
      expect(basicRecoveryIdentity(row(input), domain)).toBe(JSON.stringify([domain, key]));
    }
  });

  it("handles numeric phones without inventing a missing domestic zero", () => {
    const domestic = basicRecoveryIdentity({ "04연락처": "010-2222-2222" });
    expect(basicRecoveryIdentity({ "04연락처": 821022222222 })).toBe(domestic);
    expect(basicRecoveryIdentity({ "04연락처": 1022222222 })).not.toBe(domestic);
    expect(basicRecoveryIdentity({ "04연락처": 0 })).toBe('["tax-amendment","p:0"]');
  });

  it("keeps row and domain fallbacks when there are no phone digits", () => {
    for (const phone of [undefined, null, "", "  ", "문의요망", "() -"]) {
      expect(basicRecoveryIdentity({ _id: "r", "04연락처": phone })).toBe(
        '["tax-amendment","i:tax-amendment:r"]',
      );
      expect(basicRecoveryIdentity({ _id: "r", "03대표연락처": phone }, "government-subsidy")).toBe(
        '["government-subsidy","i:government-subsidy:r"]',
      );
    }
    expect(basicRecoveryIdentity({ _id: "r" })).not.toBe(basicRecoveryIdentity({ _id: "other" }));
    expect(basicRecoveryIdentity({ _id: "r" }, "government-subsidy")).not.toBe(
      basicRecoveryIdentity({ _id: "r" }),
    );
  });

  it("preserves business precedence, aliases and domain boundaries", () => {
    const raw = { _id: "raw", "04사업자번호": "123-45-67890", "03대표연락처": "+82 10-2222-2222" };
    const alias = { _id: "alias", "15사업자번호": "1234567890", "04연락처": "010-3333-3333" };
    expect(basicRecoveryIdentity(raw, "government-subsidy")).toBe(
      basicRecoveryIdentity(alias, "government-subsidy"),
    );
    expect(basicRecoveryIdentity({ ...alias, "15사업자번호": "9999999999" }, "government-subsidy")).not.toBe(
      basicRecoveryIdentity(alias, "government-subsidy"),
    );
    expect(basicRecoveryIdentity({ "03대표연락처": "+82 10-2222-2222" }, "government-subsidy")).toBe(
      basicRecoveryIdentity({ "04연락처": "010-2222-2222" }, "government-subsidy"),
    );
    const phone = { "04연락처": "010-2222-2222" };
    expect(basicRecoveryIdentity(phone, "government-subsidy")).not.toBe(basicRecoveryIdentity(phone));
    expect(basicRecoveryIdentity({ _id: "r", "04연락처": "", "03대표연락처": raw["03대표연락처"] }, "government-subsidy")).toBe(
      '["government-subsidy","i:government-subsidy:r"]',
    );
  });

  it("preserves lookup keys and the original row after a recovery comparison", () => {
    const row = { _id: "r", "04연락처": "0082-10-2222-2222" };
    expect(customerKeyFromTaxRow(row)).toBe("p:00821022222222");
    expect(basicRecoveryIdentity(row)).toBe(basicRecoveryIdentity({ "04연락처": "010-2222-2222" }));
    expect(customerKeyFromTaxRow(row)).toBe("p:00821022222222");
    expect(row["04연락처"]).toBe("0082-10-2222-2222");
  });
});
