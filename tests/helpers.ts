import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, type Config } from "../src/lib/config";
import { buildIndex } from "../src/lib/matching";
import type { Catalog, Price } from "../src/lib/types";
import { clearContextCache } from "../src/lib/store";

export const NOW = new Date("2026-11-02T12:00:00Z");

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cheapcart-"));
}

/** A config that keeps all files inside one temporary folder. */
export function tmpConfig(extra: Record<string, string> = {}): { cfg: Config; dir: string } {
  const dir = tmpDir();
  const env = {
    DATA_DIR: path.join(dir, "data"),
    DATA_RUNTIME_DIR: path.join(dir, "runtime"),
    LOG_DIR: path.join(dir, "logs"),
    ...extra,
  };
  Object.assign(process.env, env);
  clearContextCache();
  return { cfg: loadConfig({ ...process.env, ...env }), dir };
}

const price = (productId: string, shopId: string, amountMinor: number, seenOn = "2026-10-30", extra: Partial<Price> = {}): Price => ({
  productId,
  shopId,
  amountMinor,
  currency: "EUR",
  isPromo: false,
  promoEnds: "",
  seenOn,
  source: "test",
  ...extra,
});

/**
 * Origin is lat 0, lng 0. One 0.0045 degree step of latitude is about 0.5 km.
 * Shops A, B, C are within 3 km. D is about 5.5 km away.
 */
export function smallCatalog(): Catalog {
  const shop = (id: string, steps: number) => ({
    id,
    name: `Shop ${id}`,
    chain: `Chain ${id}`,
    address: "",
    lat: steps * 0.0045,
    lng: 0,
    area: "test",
    active: true,
  });
  return {
    shops: [shop("A", 1), shop("B", 2), shop("C", 4), shop("D", 11)],
    items: [
      { id: "milk", name: "Milk", category: "dairy", unit: "L", minSize: 0.9, maxSize: 1.1 },
      { id: "bread", name: "White bread", category: "bakery", unit: "each", minSize: 1, maxSize: 1 },
      { id: "eggs", name: "Egg", category: "dairy", unit: "each", minSize: 10, maxSize: 12 },
      { id: "butter", name: "Butter", category: "dairy", unit: "kg", minSize: 0.2, maxSize: 0.3 },
    ],
    aliases: [
      { itemId: "milk", text: "whole milk" },
      { itemId: "bread", text: "bread" },
      { itemId: "eggs", text: "eggs" },
    ],
    products: [
      { id: "pm1", itemId: "milk", brand: "Own", packSize: 1, barcode: "" },
      { id: "pm2", itemId: "milk", brand: "Big", packSize: 2, barcode: "" },
      { id: "pb", itemId: "bread", brand: "Own", packSize: 1, barcode: "" },
      { id: "pe", itemId: "eggs", brand: "Own", packSize: 12, barcode: "" },
      { id: "pbu", itemId: "butter", brand: "Own", packSize: 0.25, barcode: "" },
    ],
    prices: [
      price("pm1", "A", 120),
      price("pm1", "B", 100),
      price("pm1", "C", 100),
      price("pm1", "D", 50),
      price("pm2", "B", 150), // 2 L pack, outside the size band for "Milk"
      price("pb", "A", 150),
      price("pb", "B", 200),
      price("pb", "C", 140),
      price("pe", "A", 300),
      price("pe", "C", 200, "2026-10-10"), // 23 days old, too old
      price("pbu", "C", 400, "2026-10-30", { isPromo: true, promoEnds: "2026-11-01" }), // promotion ended
      price("pm1", "A", 999, "2026-10-01"), // older record for A, newer one above wins
    ],
  };
}

export function smallIndex() {
  return buildIndex(smallCatalog());
}
