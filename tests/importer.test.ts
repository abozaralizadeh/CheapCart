import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateSample } from "../src/lib/sample";
import { importCatalog, importPrices } from "../src/lib/importer";
import { readCatalog } from "../src/lib/store";
import { parseCsvRecords } from "../src/lib/csv";
import { NOW, tmpConfig } from "./helpers";

function setup() {
  const t = tmpConfig();
  generateSample(t.cfg.dataDir, NOW);
  return t;
}
const row = (o: Record<string, string>) => ({
  product_id: "p0001",
  shop_id: "s01",
  amount_minor: "100",
  currency: "EUR",
  is_promo: "false",
  promo_ends: "",
  seen_on: "2026-11-02",
  source: "hand",
  ...o,
});

describe("importPrices", () => {
  it("adds good rows and keeps history", () => {
    const { cfg } = setup();
    const before = readCatalog(cfg, NOW).prices.length;
    const r = importPrices(cfg, [row({})], { now: NOW });
    expect(r.added).toBe(1);
    expect(readCatalog(cfg, NOW).prices.length).toBe(before + 1);
  });

  it("reports bad rows with the row number and loads nothing from them", () => {
    const { cfg } = setup();
    const r = importPrices(
      cfg,
      [
        row({ amount_minor: "-5" }),
        row({ shop_id: "nope" }),
        row({ product_id: "nope" }),
        row({ seen_on: "2030-01-01" }),
        row({ seen_on: "not a date" }),
        row({ amount_minor: "12.5" }),
      ],
      { now: NOW },
    );
    expect(r.added).toBe(0);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("skips duplicates of the same shop, product and day", () => {
    const { cfg } = setup();
    importPrices(cfg, [row({ seen_on: "2026-11-01" })], { now: NOW });
    const again = importPrices(cfg, [row({ seen_on: "2026-11-01", amount_minor: "105" })], { now: NOW });
    expect(again.duplicates).toBe(1);
    expect(again.added).toBe(0);
  });

  it("holds back a big jump until a person accepts it", () => {
    const { cfg } = setup();
    importPrices(cfg, [row({ seen_on: "2026-11-01", amount_minor: "100" })], { now: NOW });
    const r = importPrices(cfg, [row({ seen_on: "2026-11-02", amount_minor: "400" })], { now: NOW });
    expect(r.flagged).toBe(1);
    expect(r.added).toBe(0);
    const flagged = parseCsvRecords(fs.readFileSync(path.join(cfg.dataDir, "flagged.csv"), "utf8"));
    expect(flagged[0].amount_minor).toBe("400");
    const ok = importPrices(cfg, flagged, { now: NOW, acceptFlagged: true });
    expect(ok.added).toBe(1);
  });
});

describe("importCatalog", () => {
  it("adds and updates by id and rejects unknown items", () => {
    const { cfg } = setup();
    const shop = { id: "s99", name: "New (sample)", chain: "X", address: "1 St", lat: "10", lng: "-30", area: "sample-town", active: "true" };
    expect(importCatalog(cfg, "shops", [shop]).added).toBe(1);
    expect(importCatalog(cfg, "shops", [{ ...shop, name: "Renamed" }]).updated).toBe(1);
    expect(readCatalog(cfg, NOW).shops.find((s) => s.id === "s99")?.name).toBe("Renamed");
    const bad = importCatalog(cfg, "products", [{ id: "p9999", item_id: "i999", brand: "B", pack_size: "1", barcode: "" }]);
    expect(bad.errors).toHaveLength(1);
    expect(importCatalog(cfg, "shops", [{ ...shop, lat: "999" }]).errors).toHaveLength(1);
  });
});
