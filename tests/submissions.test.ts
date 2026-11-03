import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { approve, readQueue, readReports, reject, reportWrongPrice, submitPrices } from "../src/server/submissions";
import { readCsvFile } from "../src/lib/csv";
import { NOW, smallCatalog, tmpConfig } from "./helpers";

const sub = (over: Partial<{ shopId: string; date: string; lines: { text: string; amountMinor: number; productId?: string }[] }> = {}) => ({
  shopId: "D",
  date: "2026-11-01",
  lines: [{ text: "Milk 1L", amountMinor: 110, productId: "pm1" }],
  ...over,
});

describe("submitPrices", () => {
  it("accepts a normal price and stores it as a user price", () => {
    const { cfg } = tmpConfig();
    const out = submitPrices(cfg, smallCatalog(), sub(), NOW);
    expect(out[0].status).toBe("accepted");
    const rows = readCsvFile(path.join(cfg.runtimeDir, "user-prices.csv"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ product_id: "pm1", shop_id: "D", amount_minor: "110", source: "user", seen_on: "2026-11-01" });
  });

  it("accepts tomorrow's date, so a shopper ahead of UTC can send today's", () => {
    const { cfg } = tmpConfig();
    expect(submitPrices(cfg, smallCatalog(), sub({ date: "2026-11-03" }), NOW)[0].status).toBe("accepted");
  });

  it("holds an odd price for a person instead of publishing it", () => {
    const { cfg } = tmpConfig();
    const out = submitPrices(cfg, smallCatalog(), sub({ lines: [{ text: "Milk", amountMinor: 400, productId: "pm1" }] }), NOW);
    expect(out[0].status).toBe("pending");
    expect(fs.existsSync(path.join(cfg.runtimeDir, "user-prices.csv"))).toBe(false);
    expect(readQueue(cfg)).toHaveLength(1);
  });

  it("holds lines with no matched product", () => {
    const { cfg } = tmpConfig();
    const out = submitPrices(cfg, smallCatalog(), sub({ lines: [{ text: "Mystery", amountMinor: 100 }] }), NOW);
    expect(out[0].status).toBe("pending");
  });

  it("holds a price with too little to check against", () => {
    const { cfg } = tmpConfig();
    const out = submitPrices(cfg, smallCatalog(), sub({ lines: [{ text: "Egg", amountMinor: 250, productId: "pe" }] }), NOW);
    expect(out[0].status).toBe("pending");
  });

  it("rejects broken input", () => {
    const { cfg } = tmpConfig();
    const cat = smallCatalog();
    const status = (s: ReturnType<typeof sub>) => submitPrices(cfg, cat, s, NOW)[0].status;
    expect(status(sub({ shopId: "nope" }))).toBe("rejected");
    expect(status(sub({ date: "2026-12-01" }))).toBe("rejected");
    expect(status(sub({ date: "2026-11-04" }))).toBe("rejected");
    expect(status(sub({ date: "2026-10-01" }))).toBe("rejected");
    expect(status(sub({ date: "garbage" }))).toBe("rejected");
    expect(status(sub({ lines: [{ text: "x", amountMinor: 0, productId: "pm1" }] }))).toBe("rejected");
    expect(status(sub({ lines: [{ text: "x", amountMinor: 99_999_999, productId: "pm1" }] }))).toBe("rejected");
    expect(status(sub({ lines: [{ text: "x", amountMinor: 1.5, productId: "pm1" }] }))).toBe("rejected");
  });
});

describe("review", () => {
  it("approve publishes the price, reject does not", () => {
    const { cfg } = tmpConfig();
    const cat = smallCatalog();
    submitPrices(
      cfg,
      cat,
      sub({
        lines: [
          { text: "Milk", amountMinor: 400, productId: "pm1" },
          { text: "Mystery", amountMinor: 100 },
          { text: "Milk again", amountMinor: 500, productId: "pm1" },
        ],
      }),
      NOW,
    );
    const [first, second, third] = readQueue(cfg);
    approve(cfg, cat, first.id);
    expect(readCsvFile(path.join(cfg.runtimeDir, "user-prices.csv"))).toHaveLength(1);
    expect(() => approve(cfg, cat, second.id)).toThrow(/product/);
    approve(cfg, cat, second.id, "pb");
    expect(readCsvFile(path.join(cfg.runtimeDir, "user-prices.csv"))).toHaveLength(2);
    reject(cfg, third.id);
    expect(readCsvFile(path.join(cfg.runtimeDir, "user-prices.csv"))).toHaveLength(2);
    expect(readQueue(cfg).map((e) => e.status)).toEqual(["approved", "approved", "rejected"]);
    expect(() => reject(cfg, first.id)).toThrow(/already/);
    expect(() => reject(cfg, "r9999")).toThrow(/No review item/);
  });
});

describe("reports", () => {
  it("stores a short note with no personal details", () => {
    const { cfg } = tmpConfig();
    reportWrongPrice(cfg, "A", "pm1", "wrong, \"really\"\nnew line " + "x".repeat(300), NOW);
    const r = readReports(cfg);
    expect(r).toHaveLength(1);
    expect(r[0].note.length).toBeLessThanOrEqual(200);
    expect(r[0].note).not.toMatch(/\n/);
  });
});
