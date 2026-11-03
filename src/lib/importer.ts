import fs from "node:fs";
import path from "node:path";
import type { Config } from "./config";
import { appendCsv, parseCsvRecords, toCsv, type CsvRecord } from "./csv";
import { latestPrices } from "./compare";
import type { Catalog, Result } from "./types";
import { FILES, parseAliasRow, parseItemRow, parseProductRow, parsePriceRow, parseShopRow } from "./validate";
import { readCatalog } from "./store";

export interface ImportReport {
  added: number;
  updated: number;
  duplicates: number;
  flagged: number;
  errors: { row: number; error: string }[];
}

type Kind = "shops" | "items" | "aliases" | "products";

const PARSERS: Record<Kind, (r: CsvRecord) => Result<unknown>> = {
  shops: parseShopRow,
  items: parseItemRow,
  aliases: parseAliasRow,
  products: parseProductRow,
};

const KEY: Record<Kind, (r: CsvRecord) => string> = {
  shops: (r) => r.id,
  items: (r) => r.id,
  products: (r) => r.id,
  aliases: (r) => `${r.item_id}|${r.text.toLowerCase()}`,
};

export function csvHeaders(kind: Kind | "prices"): string[] {
  return [...FILES[kind].headers];
}

/** Adds new rows and updates existing ones (matched by id) in the data folder. Bad rows are reported, not loaded. */
export function importCatalog(cfg: Config, kind: Kind, rows: CsvRecord[]): ImportReport {
  const report: ImportReport = { added: 0, updated: 0, duplicates: 0, flagged: 0, errors: [] };
  const file = path.join(cfg.dataDir, FILES[kind].file);
  const headers = csvHeaders(kind);
  const current = fs.existsSync(file) ? parseCsvRecords(fs.readFileSync(file, "utf8")) : [];
  const byKey = new Map(current.map((r) => [KEY[kind](r), r]));
  const catalog = readCatalogSafe(cfg);
  const itemIds = new Set([...catalog.items.map((i) => i.id), ...(kind === "items" ? rows.map((r) => r.id) : [])]);

  rows.forEach((r, i) => {
    const res = PARSERS[kind](r);
    if (!res.ok) return void report.errors.push({ row: i + 2, error: res.error });
    if ((kind === "products" || kind === "aliases") && !itemIds.has(r.item_id)) {
      return void report.errors.push({ row: i + 2, error: `unknown item ${r.item_id}` });
    }
    const key = KEY[kind](r);
    if (byKey.has(key)) report.updated++;
    else report.added++;
    byKey.set(key, r);
  });

  if (report.added + report.updated > 0) {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    fs.writeFileSync(file, toCsv(headers, [...byKey.values()].map((r) => headers.map((h) => r[h] ?? ""))));
  }
  return report;
}

function readCatalogSafe(cfg: Config): Catalog {
  try {
    return readCatalog(cfg);
  } catch {
    return { shops: [], items: [], aliases: [], products: [], prices: [] };
  }
}

/**
 * Checks every price row, then appends the good ones as new records so history is kept.
 * A price far from the last known one is held back in flagged.csv until a person accepts it.
 */
export function importPrices(cfg: Config, rows: CsvRecord[], opts: { acceptFlagged?: boolean; now?: Date } = {}): ImportReport {
  const now = opts.now ?? new Date();
  const report: ImportReport = { added: 0, updated: 0, duplicates: 0, flagged: 0, errors: [] };
  const catalog = readCatalog(cfg, now);
  const shops = new Set(catalog.shops.map((s) => s.id));
  const products = new Set(catalog.products.map((p) => p.id));
  const last = new Map(latestPrices(catalog.prices).map((p) => [`${p.shopId}|${p.productId}`, p.amountMinor]));
  const seen = new Set(catalog.prices.map((p) => `${p.shopId}|${p.productId}|${p.seenOn}`));

  const good: (string | number | boolean)[][] = [];
  const flagged: (string | number | boolean)[][] = [];
  const headers = csvHeaders("prices");

  rows.forEach((r, i) => {
    const res = parsePriceRow(r, now);
    const fail = (error: string) => report.errors.push({ row: i + 2, error });
    if (!res.ok) return fail(res.error);
    const p = res.value;
    if (!shops.has(p.shopId)) return fail(`unknown shop ${p.shopId}`);
    if (!products.has(p.productId)) return fail(`unknown product ${p.productId}`);
    const key = `${p.shopId}|${p.productId}|${p.seenOn}`;
    if (seen.has(key)) {
      report.duplicates++;
      return;
    }
    seen.add(key);
    const row = [p.productId, p.shopId, p.amountMinor, p.currency, p.isPromo, p.promoEnds, p.seenOn, p.source];
    const before = last.get(`${p.shopId}|${p.productId}`);
    if (!opts.acceptFlagged && before && Math.abs(p.amountMinor - before) / before > cfg.priceJumpPct) {
      flagged.push(row);
      report.flagged++;
      return;
    }
    good.push(row);
    report.added++;
  });

  appendCsv(path.join(cfg.dataDir, FILES.prices.file), headers, good);
  appendCsv(path.join(cfg.dataDir, "flagged.csv"), headers, flagged);
  return report;
}
