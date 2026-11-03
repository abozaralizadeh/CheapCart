import fs from "node:fs";
import path from "node:path";
import type { Area, Catalog } from "./types";
import type { Config } from "./config";
import { readCsvFile } from "./csv";
import { buildIndex, type MatchIndex } from "./matching";
import {
  FILES,
  parseAliasRow,
  parseItemRow,
  parseProductRow,
  parsePriceRow,
  parseShopRow,
} from "./validate";
import type { Result } from "./types";

export const USER_PRICES_FILE = "user-prices.csv";

function readRows<T>(file: string, parse: (r: Record<string, string>) => Result<T>): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  readCsvFile(file).forEach((r, i) => {
    const res = parse(r);
    if (!res.ok) throw new Error(`${path.basename(file)} row ${i + 2}: ${res.error}`);
    out.push(res.value);
  });
  return out;
}

/** Reads the catalog and all prices from disk. Throws a clear error on a bad row. */
export function readCatalog(cfg: Config, now = new Date()): Catalog {
  const d = cfg.dataDir;
  const prices = [
    ...readRows(path.join(d, FILES.prices.file), (r) => parsePriceRow(r, now)),
    ...readRows(path.join(cfg.runtimeDir, USER_PRICES_FILE), (r) => parsePriceRow(r, now)),
  ];
  return {
    shops: readRows(path.join(d, FILES.shops.file), parseShopRow),
    items: readRows(path.join(d, FILES.items.file), parseItemRow),
    aliases: readRows(path.join(d, FILES.aliases.file), parseAliasRow),
    products: readRows(path.join(d, FILES.products.file), parseProductRow),
    prices,
  };
}

export function readAreas(cfg: Config): Area[] {
  const raw = JSON.parse(fs.readFileSync(cfg.areasFile, "utf8")) as { areas: Area[] };
  return raw.areas
    .filter((a) => a.enabled !== false)
    .filter((a) => cfg.launchAreas.length === 0 || cfg.launchAreas.includes(a.id));
}

export interface Context {
  cfg: Config;
  catalog: Catalog;
  index: MatchIndex;
  areas: Area[];
}

let cache: { sig: string; ctx: Context } | null = null;

function signature(cfg: Config): string {
  const files = [
    ...Object.values(FILES).map((f) => path.join(cfg.dataDir, f.file)),
    path.join(cfg.runtimeDir, USER_PRICES_FILE),
    cfg.areasFile,
  ];
  const parts = files.map((f) => {
    try {
      const s = fs.statSync(f);
      return `${f}:${s.mtimeMs}:${s.size}`;
    } catch {
      return `${f}:none`;
    }
  });
  return [cfg.launchAreas.join(","), ...parts].join("|");
}

/** The loaded data, reloaded only when a file changes. */
export function getContext(cfg: Config): Context {
  const sig = signature(cfg);
  if (cache && cache.sig === sig) return cache.ctx;
  const catalog = readCatalog(cfg);
  const ctx = { cfg, catalog, index: buildIndex(catalog), areas: readAreas(cfg) };
  cache = { sig, ctx };
  return ctx;
}

export function clearContextCache(): void {
  cache = null;
}
