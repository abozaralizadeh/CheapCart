import fs from "node:fs";
import path from "node:path";
import type { Config } from "../lib/config";
import { appendCsv, parseCsvRecords, toCsv } from "../lib/csv";
import { daysBetween, toIsoDate } from "../lib/validate";
import { normalize } from "../lib/text";

const FILE = "unmatched.csv";
const HEADERS = ["date", "text"];

/** Saves the text of list lines we could not match. No location, no client details. */
export function logUnmatched(cfg: Config, texts: string[], now = new Date()): void {
  const rows = texts
    .map((t) => normalize(t).slice(0, 60))
    .filter(Boolean)
    .map((t) => [toIsoDate(now), t]);
  appendCsv(path.join(cfg.runtimeDir, FILE), HEADERS, rows);
}

/** Drops rows older than the retention limit and returns the most common texts. */
export function unmatchedReport(cfg: Config, now = new Date(), top = 20): { text: string; count: number }[] {
  const file = path.join(cfg.runtimeDir, FILE);
  if (!fs.existsSync(file)) return [];
  const rows = parseCsvRecords(fs.readFileSync(file, "utf8"));
  const kept = rows.filter((r) => daysBetween(r.date, now) <= cfg.unmatchedRetentionDays);
  if (kept.length !== rows.length) {
    fs.writeFileSync(file, toCsv(HEADERS, kept.map((r) => [r.date, r.text])));
  }
  const counts = new Map<string, number>();
  for (const r of kept) counts.set(r.text, (counts.get(r.text) ?? 0) + 1);
  return [...counts.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, top);
}
