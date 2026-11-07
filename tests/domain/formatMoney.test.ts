import { describe, expect, it } from "vitest";
import { formatMoney } from "../../src/i18n/format";

/** Feature 014 R8: money per language. */

const dollar = { currency: { symbol: "$" } };
const pound = { currency: { symbol: "£" } };
const credit = { currency: { symbol: "₡" } };

describe("formatMoney", () => {
  it("Spanish keeps today's dot separator", () => {
    expect(formatMoney(1200, dollar, "es")).toBe("$1.200");
    expect(formatMoney(-40, credit, "es")).toBe("−₡40");
    expect(formatMoney(630, pound, "es")).toBe("£630");
    expect(formatMoney(1234567, dollar, "es")).toBe("$1.234.567");
  });

  it("English uses a comma separator", () => {
    expect(formatMoney(1200, dollar, "en")).toBe("$1,200");
    expect(formatMoney(-40, credit, "en")).toBe("−₡40");
    expect(formatMoney(630, pound, "en")).toBe("£630");
    expect(formatMoney(1234567, dollar, "en")).toBe("$1,234,567");
    expect(formatMoney(-12000, dollar, "en")).toBe("−$12,000");
  });

  it("zero is plain in both", () => {
    expect(formatMoney(0, dollar, "es")).toBe("$0");
    expect(formatMoney(0, dollar, "en")).toBe("$0");
  });
});
