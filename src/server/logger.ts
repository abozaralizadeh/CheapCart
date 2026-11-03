import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config";

type Level = "info" | "warn" | "error";

/** Moves app.log to app.log.1 and so on, dropping the oldest. */
export function rotateIfNeeded(file: string, maxBytes: number, keep: number): void {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return;
  }
  if (size < maxBytes) return;
  for (let i = keep - 1; i >= 1; i--) {
    const from = `${file}.${i}`;
    if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i + 1}`);
  }
  fs.renameSync(file, `${file}.1`);
  const oldest = `${file}.${keep + 1}`;
  if (fs.existsSync(oldest)) fs.rmSync(oldest);
}

/**
 * One JSON line per event, in a file with a size limit.
 * Callers pass short facts only. Never pass request bodies, locations or list text.
 */
export function log(level: Level, event: string, fields: Record<string, string | number | boolean> = {}): void {
  const cfg = loadConfig();
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
  try {
    fs.mkdirSync(cfg.logDir, { recursive: true });
    const file = path.join(cfg.logDir, "app.log");
    rotateIfNeeded(file, cfg.logMaxBytes, cfg.logKeep);
    fs.appendFileSync(file, line + "\n");
  } catch {
    // Logging must never break a request.
  }
}
