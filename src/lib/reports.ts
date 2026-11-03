import type { Area, Catalog } from "./types";
import type { Config } from "./config";
import { isFresh, latestPrices } from "./compare";
import { daysBetween } from "./validate";

export interface FreshnessReport {
  total: number;
  fresh: number;
  nearLimit: number;
  stale: number;
  oldestDays: number;
  byShop: { shopId: string; shop: string; fresh: number; nearLimit: number; stale: number }[];
}

/** Counts the latest price of each product and shop by age. */
export function freshnessReport(catalog: Catalog, cfg: Config, now = new Date()): FreshnessReport {
  const shopName = new Map(catalog.shops.map((s) => [s.id, s.name]));
  const byShop = new Map<string, { fresh: number; nearLimit: number; stale: number }>();
  const latest = latestPrices(catalog.prices);
  let fresh = 0;
  let nearLimit = 0;
  let stale = 0;
  let oldestDays = 0;
  for (const p of latest) {
    const row = byShop.get(p.shopId) ?? { fresh: 0, nearLimit: 0, stale: 0 };
    const age = daysBetween(p.seenOn, now);
    oldestDays = Math.max(oldestDays, age);
    if (!isFresh(p, now, cfg.freshnessDays)) {
      stale++;
      row.stale++;
    } else if (age >= cfg.freshnessDays - 3) {
      nearLimit++;
      row.nearLimit++;
    } else {
      fresh++;
      row.fresh++;
    }
    byShop.set(p.shopId, row);
  }
  return {
    total: latest.length,
    fresh,
    nearLimit,
    stale,
    oldestDays,
    byShop: [...byShop.entries()].map(([shopId, r]) => ({ shopId, shop: shopName.get(shopId) ?? shopId, ...r })),
  };
}

export interface QualityReport {
  area: string;
  shops: number;
  items: number;
  itemsWithFreshPrice: number;
  itemCoveragePct: number;
  itemsWithOneShopOnly: number;
  avgPriceAgeDays: number;
  shopCoveragePct: { shop: string; pct: number }[];
  ready: boolean;
}

/** How good the data is in one area. "Ready" needs most items priced and a spread of shops. */
export function qualityReport(catalog: Catalog, area: Area, cfg: Config, now = new Date()): QualityReport {
  const shops = catalog.shops.filter((s) => s.area === area.id && s.active);
  const shopIds = new Set(shops.map((s) => s.id));
  const productItem = new Map(catalog.products.map((p) => [p.id, p.itemId]));
  const fresh = latestPrices(catalog.prices).filter((p) => shopIds.has(p.shopId) && isFresh(p, now, cfg.freshnessDays));

  const shopsPerItem = new Map<string, Set<string>>();
  let ageSum = 0;
  for (const p of fresh) {
    ageSum += Math.max(0, daysBetween(p.seenOn, now));
    const item = productItem.get(p.productId);
    if (!item) continue;
    const set = shopsPerItem.get(item) ?? new Set();
    set.add(p.shopId);
    shopsPerItem.set(item, set);
  }
  const itemsWithFreshPrice = shopsPerItem.size;
  const itemCoveragePct = catalog.items.length ? Math.round((itemsWithFreshPrice / catalog.items.length) * 100) : 0;
  const itemsWithOneShopOnly = [...shopsPerItem.values()].filter((s) => s.size === 1).length;
  const shopCoveragePct = shops.map((s) => ({
    shop: s.name,
    pct: catalog.products.length
      ? Math.round((fresh.filter((p) => p.shopId === s.id).length / catalog.products.length) * 100)
      : 0,
  }));
  return {
    area: area.name,
    shops: shops.length,
    items: catalog.items.length,
    itemsWithFreshPrice,
    itemCoveragePct,
    itemsWithOneShopOnly,
    avgPriceAgeDays: fresh.length ? Math.round((ageSum / fresh.length) * 10) / 10 : 0,
    shopCoveragePct,
    ready: shops.length >= 3 && itemCoveragePct >= 80,
  };
}
