import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/lib/config";
import { generateSample } from "../src/lib/sample";

// Sample prices carry dates, so they go stale. Refresh them when the sample folder is
// missing or a day old. Does nothing when DATA_DIR points at real data.
const cfg = loadConfig();
const sampleDir = path.join(process.cwd(), "data/sample");
if (path.resolve(cfg.dataDir) === sampleDir) {
  const f = path.join(sampleDir, "prices.csv");
  const old = !fs.existsSync(f) || Date.now() - fs.statSync(f).mtimeMs > 86_400_000;
  if (old) {
    const c = generateSample(sampleDir, new Date(), cfg.currency);
    console.log(`Refreshed SAMPLE data (${c.prices} made-up prices).`);
  }
}
