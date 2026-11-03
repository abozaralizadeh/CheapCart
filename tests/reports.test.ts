import { describe, expect, it } from "vitest";
import { freshnessReport, qualityReport } from "../src/lib/reports";
import { generateSample, SAMPLE_LABEL } from "../src/lib/sample";
import { readAreas, readCatalog } from "../src/lib/store";
import { loadConfig } from "../src/lib/config";
import { buildIndex } from "../src/lib/matching";
import { tmpConfig } from "./helpers";
import fs from "node:fs";
import path from "node:path";

describe("sample data", () => {
  const { cfg } = tmpConfig();
  const counts = generateSample(cfg.dataDir, new Date());
  const cat = readCatalog(cfg);

  it("has at least 100 items and is labelled as made up", () => {
    expect(counts.items).toBeGreaterThanOrEqual(100);
    expect(fs.readFileSync(path.join(cfg.dataDir, "SAMPLE-DATA.txt"), "utf8")).toContain(SAMPLE_LABEL);
    expect(cat.prices.every((p) => p.source === "sample")).toBe(true);
    expect(cat.shops.every((s) => s.name.includes("(sample)"))).toBe(true);
  });

  it("links every product to an item and every price to a shop and product", () => {
    const items = new Set(cat.items.map((i) => i.id));
    const products = new Set(cat.products.map((p) => p.id));
    const shops = new Set(cat.shops.map((s) => s.id));
    expect(cat.products.every((p) => items.has(p.itemId))).toBe(true);
    expect(cat.prices.every((p) => products.has(p.productId) && shops.has(p.shopId))).toBe(true);
    expect(cat.aliases.every((a) => items.has(a.itemId))).toBe(true);
  });

  it("gives every item a product inside its band, with bulk packs left outside it", () => {
    const item = new Map(cat.items.map((i) => [i.id, i]));
    const inBand = (p: (typeof cat.products)[number]) => p.packSize >= item.get(p.itemId)!.minSize && p.packSize <= item.get(p.itemId)!.maxSize;
    for (const i of cat.items) expect(cat.products.some((p) => p.itemId === i.id && inBand(p))).toBe(true);
    expect(cat.products.some((p) => !inBand(p))).toBe(true);
  });

  it("matches every item by its own name", async () => {
    const { matchItem } = await import("../src/lib/matching");
    const index = buildIndex(cat);
    const misses = cat.items.filter((i) => matchItem(index, i.name)?.item.id !== i.id).map((i) => i.name);
    expect(misses).toEqual([]);
  });

  it("is the same every time except for the dates", () => {
    const a = tmpConfig().cfg;
    generateSample(a.dataDir, new Date("2026-11-02T00:00:00Z"));
    const b = tmpConfig().cfg;
    generateSample(b.dataDir, new Date("2026-11-02T00:00:00Z"));
    expect(fs.readFileSync(path.join(a.dataDir, "prices.csv"), "utf8")).toBe(fs.readFileSync(path.join(b.dataDir, "prices.csv"), "utf8"));
  });

  it("builds a freshness report that counts stale rows", () => {
    const r = freshnessReport(cat, cfg);
    expect(r.total).toBe(r.fresh + r.nearLimit + r.stale);
    expect(r.stale).toBeGreaterThan(0);
    expect(r.fresh).toBeGreaterThan(0);
  });

  it("builds a quality report per area", () => {
    const areas = readAreas(cfg);
    const town = qualityReport(cat, areas.find((a) => a.id === "sample-town")!, cfg);
    expect(town.shops).toBe(5);
    expect(town.itemCoveragePct).toBeGreaterThan(80);
    expect(town.ready).toBe(true);
    const village = qualityReport(cat, areas.find((a) => a.id === "sample-village")!, cfg);
    expect(village.shops).toBe(4);
  });

  it("uses the Proposed defaults", () => {
    const d = loadConfig({ NODE_ENV: "test" });
    expect([d.freshnessDays, d.defaultRadiusKm, d.minRadiusKm, d.maxRadiusKm]).toEqual([14, 3, 1, 10]);
  });
});
