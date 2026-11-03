export type Unit = "kg" | "L" | "each";

export interface Shop {
  id: string;
  name: string;
  chain: string;
  address: string;
  lat: number;
  lng: number;
  area: string;
  active: boolean;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  unit: Unit;
  minSize: number;
  maxSize: number;
}

export interface Alias {
  itemId: string;
  text: string;
}

export interface Product {
  id: string;
  itemId: string;
  brand: string;
  packSize: number;
  barcode: string;
}

export interface Price {
  productId: string;
  shopId: string;
  /** Whole minor units (cents) so there are no rounding errors. */
  amountMinor: number;
  currency: string;
  isPromo: boolean;
  promoEnds: string;
  /** ISO date, YYYY-MM-DD. */
  seenOn: string;
  source: string;
}

export interface Catalog {
  shops: Shop[];
  items: Item[];
  aliases: Alias[];
  products: Product[];
  prices: Price[];
}

export interface Point {
  lat: number;
  lng: number;
}

export interface Postcode extends Point {
  code: string;
}

export interface Area {
  id: string;
  name: string;
  enabled: boolean;
  sample: boolean;
  coverageKm: number;
  center: Point;
  postcodes: Postcode[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ParsedLine {
  raw: string;
  name: string;
  quantity: number;
}

export interface Offer {
  shop: Shop;
  product: Product;
  amountMinor: number;
  /** Minor units per kg, L or each. */
  unitPriceMinor: number;
  distanceKm: number;
  seenOn: string;
  ageDays: number;
  isPromo: boolean;
  source: string;
}

export type LineStatus = "ok" | "not_found" | "no_price_nearby";

export interface LineResult {
  raw: string;
  quantity: number;
  status: LineStatus;
  item?: { id: string; name: string; unit: Unit };
  best?: Offer & { lineTotalMinor: number };
  alternatives: Offer[];
}

export interface ShopGroup {
  shop: Shop;
  distanceKm: number;
  lines: { raw: string; itemName: string; quantity: number; offer: Offer; lineTotalMinor: number }[];
  subtotalMinor: number;
}

export interface Summary {
  currency: string;
  totalMinor: number;
  pricedCount: number;
  unpricedCount: number;
  shopsNeeded: number;
  sample: boolean;
  bestSingleShop?: {
    shop: Shop;
    distanceKm: number;
    coveredCount: number;
    totalMinor: number;
  };
  /** Items that both the per-item answer and the best single shop cover. */
  comparedCount: number;
  perItemOnComparedMinor: number;
  singleShopOnComparedMinor: number;
  savingMinor: number;
  savingPct: number;
}

export interface CompareResult {
  lines: LineResult[];
  shops: ShopGroup[];
  summary: Summary;
  meta: { freshnessDays: number; radiusKm: number; shopsInRange: number };
}
