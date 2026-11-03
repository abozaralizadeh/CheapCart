import type {
  Catalog,
  CompareResult,
  Item,
  LineResult,
  Offer,
  Point,
  Price,
  Product,
  Shop,
  ShopGroup,
  Summary,
} from "./types";
import { distanceKm } from "./geo";
import { matchItem, type MatchIndex } from "./matching";
import { parseLine } from "./text";
import { daysBetween, toIsoDate } from "./validate";

export interface CompareInput {
  lines: string[];
  origin: Point;
  radiusKm: number;
  areaId?: string;
  now?: Date;
}

export interface CompareOptions {
  freshnessDays: number;
  currency: string;
}

const round4 = (n: number) => Math.round(n * 10_000);

/** Cheapest per unit first. Ties go to the nearer shop, then to the lower id so results are stable. */
function offerOrder(a: Offer, b: Offer): number {
  return (
    round4(a.unitPriceMinor) - round4(b.unitPriceMinor) ||
    a.distanceKm - b.distanceKm ||
    a.shop.id.localeCompare(b.shop.id) ||
    a.product.id.localeCompare(b.product.id)
  );
}

/** The newest price for each shop and product. History stays in the data, only the latest counts. */
export function latestPrices(prices: Price[]): Price[] {
  const map = new Map<string, Price>();
  for (const p of prices) {
    const key = `${p.shopId}|${p.productId}`;
    const cur = map.get(key);
    if (!cur || p.seenOn >= cur.seenOn) map.set(key, p);
  }
  return [...map.values()];
}

export function isFresh(p: Price, now: Date, freshnessDays: number): boolean {
  const age = daysBetween(p.seenOn, now);
  if (age < -1 || age > freshnessDays) return false;
  if (p.isPromo && p.promoEnds && p.promoEnds < toIsoDate(now)) return false;
  return true;
}

export function compare(
  catalog: Catalog,
  index: MatchIndex,
  input: CompareInput,
  opts: CompareOptions,
): CompareResult {
  const now = input.now ?? new Date();
  const shopsInRange = catalog.shops
    .filter((s) => s.active && (!input.areaId || s.area === input.areaId))
    .map((shop) => ({ shop, d: distanceKm(input.origin, shop) }))
    .filter((x) => x.d <= input.radiusKm);
  const distByShop = new Map(shopsInRange.map((x) => [x.shop.id, x.d]));
  const shopById = new Map(shopsInRange.map((x) => [x.shop.id, x.shop]));
  const productById = new Map(catalog.products.map((p) => [p.id, p]));

  const productsByItem = new Map<string, Product[]>();
  for (const p of catalog.products) {
    const list = productsByItem.get(p.itemId) ?? [];
    list.push(p);
    productsByItem.set(p.itemId, list);
  }

  const offersByProduct = new Map<string, Offer[]>();
  for (const price of latestPrices(catalog.prices)) {
    const shop = shopById.get(price.shopId);
    const product = productById.get(price.productId);
    if (!shop || !product || !isFresh(price, now, opts.freshnessDays)) continue;
    const offer: Offer = {
      shop,
      product,
      amountMinor: price.amountMinor,
      unitPriceMinor: price.amountMinor / product.packSize,
      distanceKm: distByShop.get(shop.id)!,
      seenOn: price.seenOn,
      ageDays: Math.max(0, daysBetween(price.seenOn, now)),
      isPromo: price.isPromo,
      source: price.source,
    };
    const list = offersByProduct.get(product.id) ?? [];
    list.push(offer);
    offersByProduct.set(product.id, list);
  }

  const offersForItem = (item: Item): Offer[] =>
    (productsByItem.get(item.id) ?? [])
      .filter((p) => p.packSize >= item.minSize && p.packSize <= item.maxSize)
      .flatMap((p) => offersByProduct.get(p.id) ?? []);

  const lines: LineResult[] = [];
  const priced: { line: LineResult; item: Item; offers: Offer[] }[] = [];

  for (const raw of input.lines) {
    const parsed = parseLine(raw);
    if (!parsed) continue;
    const hit = matchItem(index, parsed.name);
    if (!hit) {
      lines.push({ raw: parsed.raw, quantity: parsed.quantity, status: "not_found", alternatives: [] });
      continue;
    }
    const item = hit.item;
    const offers = offersForItem(item).sort(offerOrder);
    const itemInfo = { id: item.id, name: item.name, unit: item.unit };
    if (offers.length === 0) {
      lines.push({ raw: parsed.raw, quantity: parsed.quantity, status: "no_price_nearby", item: itemInfo, alternatives: [] });
      continue;
    }
    const best = offers[0];
    const seenShops = new Set([best.shop.id]);
    const alternatives: Offer[] = [];
    for (const o of offers.slice(1)) {
      if (seenShops.has(o.shop.id)) continue;
      seenShops.add(o.shop.id);
      alternatives.push(o);
      if (alternatives.length === 2) break;
    }
    const line: LineResult = {
      raw: parsed.raw,
      quantity: parsed.quantity,
      status: "ok",
      item: itemInfo,
      best: { ...best, lineTotalMinor: best.amountMinor * parsed.quantity },
      alternatives,
    };
    lines.push(line);
    priced.push({ line, item, offers });
  }

  // Group the per-item answer by shop.
  const groups = new Map<string, ShopGroup>();
  for (const { line } of priced) {
    const best = line.best!;
    const g = groups.get(best.shop.id) ?? {
      shop: best.shop,
      distanceKm: best.distanceKm,
      lines: [],
      subtotalMinor: 0,
    };
    g.lines.push({
      raw: line.raw,
      itemName: line.item!.name,
      quantity: line.quantity,
      offer: best,
      lineTotalMinor: best.lineTotalMinor,
    });
    g.subtotalMinor += best.lineTotalMinor;
    groups.set(best.shop.id, g);
  }
  const shopGroups = [...groups.values()].sort((a, b) => a.distanceKm - b.distanceKm || a.shop.id.localeCompare(b.shop.id));

  const totalMinor = priced.reduce((s, p) => s + p.line.best!.lineTotalMinor, 0);

  // Best single shop: covers the most items, then costs least, then is nearest.
  const candidates = shopsInRange.map(({ shop, d }) => {
    let covered = 0;
    let cost = 0;
    const perLine = new Map<number, number>();
    priced.forEach(({ line, offers }, idx) => {
      const mine = offers.filter((o) => o.shop.id === shop.id);
      if (mine.length === 0) return;
      covered++;
      perLine.set(idx, mine[0].amountMinor * line.quantity);
      cost += mine[0].amountMinor * line.quantity;
    });
    return { shop, d, covered, cost, perLine };
  });
  candidates.sort((a, b) => b.covered - a.covered || a.cost - b.cost || a.d - b.d || a.shop.id.localeCompare(b.shop.id));
  const top = candidates[0] && candidates[0].covered > 0 ? candidates[0] : undefined;

  let comparedCount = 0;
  let perItemOnCompared = 0;
  let singleOnCompared = 0;
  if (top) {
    priced.forEach(({ line }, idx) => {
      const single = top.perLine.get(idx);
      if (single === undefined) return;
      comparedCount++;
      perItemOnCompared += line.best!.lineTotalMinor;
      singleOnCompared += single;
    });
  }
  const savingMinor = singleOnCompared - perItemOnCompared;

  const summary: Summary = {
    currency: opts.currency,
    totalMinor,
    pricedCount: priced.length,
    unpricedCount: lines.length - priced.length,
    shopsNeeded: shopGroups.length,
    sample: priced.some((p) => p.line.best!.source === "sample"),
    bestSingleShop: top
      ? { shop: top.shop, distanceKm: top.d, coveredCount: top.covered, totalMinor: top.cost }
      : undefined,
    comparedCount,
    perItemOnComparedMinor: perItemOnCompared,
    singleShopOnComparedMinor: singleOnCompared,
    savingMinor,
    savingPct: singleOnCompared > 0 ? Math.round((savingMinor / singleOnCompared) * 1000) / 10 : 0,
  };

  return {
    lines,
    shops: shopGroups,
    summary,
    meta: { freshnessDays: opts.freshnessDays, radiusKm: input.radiusKm, shopsInRange: shopsInRange.length },
  };
}

export type { Shop };
