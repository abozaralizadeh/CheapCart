import fs from "node:fs";
import path from "node:path";
import type { Config } from "../lib/config";
import type { Catalog, Price } from "../lib/types";
import { appendCsv, parseCsvRecords } from "../lib/csv";
import { isFresh, latestPrices } from "../lib/compare";
import { FILES, daysBetween, isIsoDate, toIsoDate } from "../lib/validate";
import { USER_PRICES_FILE } from "../lib/store";

export interface SubmittedLine {
  text: string;
  amountMinor: number;
  productId?: string;
}

export interface Submission {
  shopId: string;
  date: string;
  lines: SubmittedLine[];
}

export type LineOutcome =
  | { status: "accepted"; text: string }
  | { status: "pending"; text: string; reason: string; reviewId: string }
  | { status: "rejected"; text: string; reason: string };

export interface QueueEntry {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  shopId: string;
  productId: string;
  text: string;
  amountMinor: number;
  seenOn: string;
}

const QUEUE_FILE = "review-queue.json";
const REPORTS_FILE = "reports.csv";

const queuePath = (cfg: Config) => path.join(cfg.runtimeDir, QUEUE_FILE);

export function readQueue(cfg: Config): QueueEntry[] {
  try {
    return JSON.parse(fs.readFileSync(queuePath(cfg), "utf8")) as QueueEntry[];
  } catch {
    return [];
  }
}

function writeQueue(cfg: Config, q: QueueEntry[]): void {
  fs.mkdirSync(cfg.runtimeDir, { recursive: true });
  fs.writeFileSync(queuePath(cfg), JSON.stringify(q, null, 2));
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function writePrice(cfg: Config, p: { productId: string; shopId: string; amountMinor: number; seenOn: string; currency: string }): void {
  const row: (string | number | boolean)[] = [p.productId, p.shopId, p.amountMinor, p.currency, false, "", p.seenOn, "user"];
  appendCsv(path.join(cfg.runtimeDir, USER_PRICES_FILE), [...FILES.prices.headers], [row]);
}

function enqueue(cfg: Config, entry: Omit<QueueEntry, "id" | "createdAt" | "status">, now: Date): string {
  const q = readQueue(cfg);
  const id = `r${String(q.length + 1).padStart(4, "0")}`;
  q.push({ ...entry, id, createdAt: now.toISOString(), status: "pending" });
  writeQueue(cfg, q);
  return id;
}

/**
 * Checks each line of a sent-in price list. Clear lines go live. Lines that
 * look odd wait in the review queue for a person. Broken lines are rejected.
 */
export function submitPrices(cfg: Config, catalog: Catalog, sub: Submission, now = new Date()): LineOutcome[] {
  const shop = catalog.shops.find((s) => s.id === sub.shopId && s.active);
  const productsById = new Map(catalog.products.map((p) => [p.id, p]));
  const out: LineOutcome[] = [];
  const dateOk = typeof sub.date === "string" && isIsoDate(sub.date);
  const age = dateOk ? daysBetween(sub.date, now) : NaN;

  const latest = latestPrices(catalog.prices).filter((p) => isFresh(p, now, cfg.freshnessDays));

  for (const line of sub.lines) {
    const text = String(line.text ?? "").slice(0, 60);
    const reject = (reason: string): LineOutcome => ({ status: "rejected", text, reason });
    if (!shop) {
      out.push(reject("Unknown shop."));
      continue;
    }
    // One day of slack so a shopper ahead of UTC can send today's date.
    if (!dateOk || age < -1 || age > cfg.receiptMaxAgeDays) {
      out.push(reject(`The date must be within the last ${cfg.receiptMaxAgeDays} days and not in the future.`));
      continue;
    }
    if (!Number.isInteger(line.amountMinor) || line.amountMinor <= 0 || line.amountMinor > cfg.maxPriceMinor) {
      out.push(reject("The price is not a sensible amount."));
      continue;
    }
    const product = line.productId ? productsById.get(line.productId) : undefined;
    const common = { shopId: shop.id, text, amountMinor: line.amountMinor, seenOn: sub.date };
    if (!product) {
      const reviewId = enqueue(cfg, { ...common, productId: "", reason: "no product matched" }, now);
      out.push({ status: "pending", text, reason: "We could not tell which product this is. A person will check it.", reviewId });
      continue;
    }
    const refs = latest.filter((p) => p.productId === product.id && p.shopId !== shop.id).map((p) => p.amountMinor);
    if (refs.length < 2) {
      const reviewId = enqueue(cfg, { ...common, productId: product.id, reason: "not enough other prices to check against" }, now);
      out.push({ status: "pending", text, reason: "Not enough other prices to check this one. A person will look at it.", reviewId });
      continue;
    }
    const med = median(refs);
    if (Math.abs(line.amountMinor - med) / med > cfg.outlierPct) {
      const reviewId = enqueue(cfg, { ...common, productId: product.id, reason: "far from other shops" }, now);
      out.push({ status: "pending", text, reason: "This price is far from the others. A person will check it.", reviewId });
      continue;
    }
    writePrice(cfg, { productId: product.id, shopId: shop.id, amountMinor: line.amountMinor, seenOn: sub.date, currency: cfg.currency });
    out.push({ status: "accepted", text });
  }
  return out;
}

export function approve(cfg: Config, catalog: Catalog, id: string, productId?: string): QueueEntry {
  const q = readQueue(cfg);
  const e = q.find((x) => x.id === id);
  if (!e) throw new Error(`No review item ${id}`);
  if (e.status !== "pending") throw new Error(`${id} is already ${e.status}`);
  const pid = productId || e.productId;
  if (!pid || !catalog.products.some((p) => p.id === pid)) throw new Error("Give a valid product id with --product");
  e.productId = pid;
  e.status = "approved";
  writePrice(cfg, { productId: pid, shopId: e.shopId, amountMinor: e.amountMinor, seenOn: e.seenOn, currency: cfg.currency });
  writeQueue(cfg, q);
  return e;
}

export function reject(cfg: Config, id: string): QueueEntry {
  const q = readQueue(cfg);
  const e = q.find((x) => x.id === id);
  if (!e) throw new Error(`No review item ${id}`);
  if (e.status !== "pending") throw new Error(`${id} is already ${e.status}`);
  e.status = "rejected";
  writeQueue(cfg, q);
  return e;
}

/** A report that a shown price was wrong. Only ids and a short note, nothing about the person. */
export function reportWrongPrice(cfg: Config, shopId: string, productId: string, note: string, now = new Date()): void {
  const clean = note.replace(/[\r\n]+/g, " ").slice(0, 200);
  appendCsv(path.join(cfg.runtimeDir, REPORTS_FILE), ["date", "shop_id", "product_id", "note"], [[toIsoDate(now), shopId, productId, clean]]);
}

export function readReports(cfg: Config): Record<string, string>[] {
  const file = path.join(cfg.runtimeDir, REPORTS_FILE);
  return fs.existsSync(file) ? parseCsvRecords(fs.readFileSync(file, "utf8")) : [];
}

export type { Price };
