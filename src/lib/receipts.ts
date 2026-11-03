import type { Catalog, Product } from "./types";
import type { Config } from "./config";
import { matchItem, type MatchIndex } from "./matching";
import { normalize } from "./text";
import { isIsoDate } from "./validate";

export interface ReceiptReadingLine {
  text: string;
  amountMinor: number;
}

export interface ReceiptReading {
  shopName?: string;
  date?: string;
  lines: ReceiptReadingLine[];
}

export interface ReceiptReader {
  name: string;
  /** The bytes are read in memory only. Nothing is saved. */
  read(input: { bytes: Uint8Array; mime: string }): Promise<ReceiptReading>;
}

export class ReaderError extends Error {}

/**
 * Words and shapes that point at personal details. A line with any of them is
 * dropped and never leaves this function.
 */
const SENSITIVE = [
  /(?:\d[ -]?){12,19}/,
  /\*{2,}/,
  /@/,
  /\b\d{9,}\b/,
  /\b(card|visa|mastercard|maestro|loyalty|member|membership|clubcard|account|iban|phone|tel|cashier|customer|name|address)\b/i,
];

export function isSensitive(line: string): boolean {
  return SENSITIVE.some((re) => re.test(line));
}

const NOT_AN_ITEM = /\b(total|subtotal|sub total|change|cash|vat|tax|balance|rounding|saved|discount)\b/i;

/** Parses plain text such as "Milk 1L   1.29". Lines with personal details are skipped. */
export function parseReceiptText(text: string): ReceiptReading {
  const out: ReceiptReading = { lines: [] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const shop = line.match(/^shop\s*:\s*(.+)$/i);
    if (shop) {
      out.shopName = shop[1].trim().slice(0, 60);
      continue;
    }
    const date = line.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})$/i);
    if (date) {
      if (isIsoDate(date[1])) out.date = date[1];
      continue;
    }
    if (isSensitive(line) || NOT_AN_ITEM.test(line)) continue;
    const m = line.match(/^(.*?\S)\s+(\d{1,4}[.,]\d{2})$/);
    if (!m) continue;
    const amountMinor = Math.round(Number(m[2].replace(",", ".")) * 100);
    if (amountMinor <= 0) continue;
    out.lines.push({ text: m[1].slice(0, 60), amountMinor });
  }
  return out;
}

/**
 * Stand-in for a real vision provider. It only reads plain text receipts.
 * A real provider can replace it by implementing ReceiptReader, nothing else changes.
 */
export class FakeReceiptReader implements ReceiptReader {
  name = "fake";
  async read(input: { bytes: Uint8Array; mime: string }): Promise<ReceiptReading> {
    if (!input.mime.startsWith("text/")) {
      throw new ReaderError(
        "The built-in reader only reads plain text receipts. Reading photos needs a vision provider, which is not connected yet.",
      );
    }
    return parseReceiptText(new TextDecoder().decode(input.bytes));
  }
}

export function getReader(cfg: Config): ReceiptReader {
  if (cfg.receiptReader === "fake") return new FakeReceiptReader();
  throw new ReaderError(`Receipt reader "${cfg.receiptReader}" is not built. Use RECEIPT_READER=fake.`);
}

export interface ReceiptLineMatch extends ReceiptReadingLine {
  itemId?: string;
  productId?: string;
  candidates: { productId: string; label: string }[];
}

function sizeOf(text: string): { value: number; unit: "kg" | "L" } | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cl)\b/i);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  switch (m[2].toLowerCase()) {
    case "kg":
      return { value: v, unit: "kg" };
    case "g":
      return { value: v / 1000, unit: "kg" };
    case "l":
      return { value: v, unit: "L" };
    case "ml":
      return { value: v / 1000, unit: "L" };
    default:
      return { value: v / 100, unit: "L" };
  }
}

const label = (p: Product, unit: string) => `${p.brand || "Unbranded"} ${p.packSize} ${unit}`;

/** Finds the item and, when the text is clear enough, the exact product. */
export function matchReceiptLine(catalog: Catalog, index: MatchIndex, line: ReceiptReadingLine): ReceiptLineMatch {
  const base: ReceiptLineMatch = { ...line, candidates: [] };
  const hit = matchItem(index, line.text);
  if (!hit) return base;
  const item = hit.item;
  const products = catalog.products.filter((p) => p.itemId === item.id);
  base.itemId = item.id;
  base.candidates = products.map((p) => ({ productId: p.id, label: label(p, item.unit) }));

  let pool = products;
  const size = sizeOf(line.text);
  if (size && size.unit === item.unit) {
    const sized = products.filter((p) => Math.abs(p.packSize - size.value) < 1e-6);
    if (sized.length) pool = sized;
  }
  if (pool.length > 1) {
    const words = normalize(line.text);
    const branded = pool.filter((p) => p.brand && words.includes(normalize(p.brand)));
    if (branded.length) pool = branded;
  }
  if (pool.length === 1) base.productId = pool[0].id;
  return base;
}
