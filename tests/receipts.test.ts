import { describe, expect, it } from "vitest";
import { FakeReceiptReader, isSensitive, matchReceiptLine, parseReceiptText, ReaderError } from "../src/lib/receipts";
import { buildIndex } from "../src/lib/matching";
import { smallCatalog } from "./helpers";

const text = `SHOP: Chain A
DATE: 2026-11-01
Milk 1L        1.29
Egg 12         3,10
Butter 250g    2.10
CARD **** **** **** 1234
Loyalty member 99887766
Total          6.49
jane@example.com
Thank you`;

describe("parseReceiptText", () => {
  const r = parseReceiptText(text);
  it("reads the shop, the date and the priced lines", () => {
    expect(r.shopName).toBe("Chain A");
    expect(r.date).toBe("2026-11-01");
    expect(r.lines).toEqual([
      { text: "Milk 1L", amountMinor: 129 },
      { text: "Egg 12", amountMinor: 310 },
      { text: "Butter 250g", amountMinor: 210 },
    ]);
  });
  it("drops card, loyalty, email and total lines", () => {
    expect(JSON.stringify(r)).not.toMatch(/1234|99887766|example\.com|Total/i);
  });
});

describe("isSensitive", () => {
  it("catches long digit runs and personal words", () => {
    expect(isSensitive("4111 1111 1111 1111")).toBe(true);
    expect(isSensitive("Customer: Sam")).toBe(true);
    expect(isSensitive("Milk 1L 1.29")).toBe(false);
  });
});

describe("FakeReceiptReader", () => {
  it("reads text and refuses photos honestly", async () => {
    const reader = new FakeReceiptReader();
    const ok = await reader.read({ bytes: new TextEncoder().encode(text), mime: "text/plain" });
    expect(ok.lines).toHaveLength(3);
    await expect(reader.read({ bytes: new Uint8Array([1, 2]), mime: "image/jpeg" })).rejects.toBeInstanceOf(ReaderError);
  });
});

describe("matchReceiptLine", () => {
  const cat = smallCatalog();
  const index = buildIndex(cat);
  it("picks the product by size", () => {
    expect(matchReceiptLine(cat, index, { text: "Milk 1L", amountMinor: 129 }).productId).toBe("pm1");
    expect(matchReceiptLine(cat, index, { text: "Milk 2L", amountMinor: 200 }).productId).toBe("pm2");
  });
  it("offers candidates when it cannot tell", () => {
    const m = matchReceiptLine(cat, index, { text: "Milk", amountMinor: 129 });
    expect(m.productId).toBeUndefined();
    expect(m.candidates.map((c) => c.productId)).toEqual(["pm1", "pm2"]);
  });
  it("leaves unknown text unmatched", () => {
    const m = matchReceiptLine(cat, index, { text: "Unicorn dust", amountMinor: 500 });
    expect(m.itemId).toBeUndefined();
    expect(m.candidates).toEqual([]);
  });
});
