import type { Alias, Item, Price, Product, Result, Shop, Unit } from "./types";
import type { CsvRecord } from "./csv";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error });

export const DAY_MS = 86_400_000;

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from isoDate to now. Negative when the date is in the future. */
export function daysBetween(isoDate: string, now: Date): number {
  const a = Date.parse(`${isoDate}T00:00:00Z`);
  const b = Date.parse(`${toIsoDate(now)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

function need(r: CsvRecord, field: string): string | null {
  const v = r[field];
  return v === undefined || v === "" ? null : v;
}

function number(r: CsvRecord, field: string): number | null {
  const v = need(r, field);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: string | undefined, dflt: boolean): boolean | null {
  if (v === undefined || v === "") return dflt;
  const s = v.toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}

export function parseShopRow(r: CsvRecord): Result<Shop> {
  const id = need(r, "id");
  const name = need(r, "name");
  const lat = number(r, "lat");
  const lng = number(r, "lng");
  const area = need(r, "area");
  const active = bool(r.active, true);
  if (!id || !name || !area) return fail("shop needs id, name and area");
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return fail(`shop ${id} has a bad lat or lng`);
  if (active === null) return fail(`shop ${id} has a bad active value`);
  return ok({ id, name, chain: r.chain ?? "", address: r.address ?? "", lat, lng, area, active });
}

const UNITS: Unit[] = ["kg", "L", "each"];

export function parseItemRow(r: CsvRecord): Result<Item> {
  const id = need(r, "id");
  const name = need(r, "name");
  const minSize = number(r, "min_size");
  const maxSize = number(r, "max_size");
  if (!id || !name) return fail("item needs id and name");
  if (!UNITS.includes(r.unit as Unit)) return fail(`item ${id} unit must be kg, L or each`);
  if (minSize === null || maxSize === null || minSize <= 0 || maxSize < minSize) return fail(`item ${id} has a bad size band`);
  return ok({ id, name, category: r.category ?? "", unit: r.unit as Unit, minSize, maxSize });
}

export function parseAliasRow(r: CsvRecord): Result<Alias> {
  const itemId = need(r, "item_id");
  const text = need(r, "text");
  if (!itemId || !text) return fail("alias needs item_id and text");
  return ok({ itemId, text });
}

export function parseProductRow(r: CsvRecord): Result<Product> {
  const id = need(r, "id");
  const itemId = need(r, "item_id");
  const packSize = number(r, "pack_size");
  if (!id || !itemId) return fail("product needs id and item_id");
  if (packSize === null || packSize <= 0) return fail(`product ${id} has a bad pack_size`);
  return ok({ id, itemId, brand: r.brand ?? "", packSize, barcode: r.barcode ?? "" });
}

export function parsePriceRow(r: CsvRecord, now: Date): Result<Price> {
  const productId = need(r, "product_id");
  const shopId = need(r, "shop_id");
  const amount = number(r, "amount_minor");
  const seenOn = need(r, "seen_on");
  const isPromo = bool(r.is_promo, false);
  const promoEnds = r.promo_ends ?? "";
  if (!productId || !shopId) return fail("price needs product_id and shop_id");
  if (amount === null || !Number.isInteger(amount) || amount <= 0) return fail("amount_minor must be a whole number above 0");
  if (!seenOn || !isIsoDate(seenOn)) return fail("seen_on must be a date like 2026-11-02");
  if (daysBetween(seenOn, now) < -1) return fail("seen_on is in the future");
  if (isPromo === null) return fail("is_promo must be true or false");
  if (promoEnds && !isIsoDate(promoEnds)) return fail("promo_ends must be a date");
  return ok({
    productId,
    shopId,
    amountMinor: amount,
    currency: r.currency || "EUR",
    isPromo,
    promoEnds,
    seenOn,
    source: r.source || "unknown",
  });
}

export const FILES = {
  shops: { file: "shops.csv", headers: ["id", "name", "chain", "address", "lat", "lng", "area", "active"] },
  items: { file: "items.csv", headers: ["id", "name", "category", "unit", "min_size", "max_size"] },
  aliases: { file: "aliases.csv", headers: ["item_id", "text"] },
  products: { file: "products.csv", headers: ["id", "item_id", "brand", "pack_size", "barcode"] },
  prices: {
    file: "prices.csv",
    headers: ["product_id", "shop_id", "amount_minor", "currency", "is_promo", "promo_ends", "seen_on", "source"],
  },
} as const;
