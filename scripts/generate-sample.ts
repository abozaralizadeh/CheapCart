import path from "node:path";
import { loadConfig } from "../src/lib/config";
import { generateSample } from "../src/lib/sample";

// Writes made-up sample data. Run it again to move the dates up to today.
const cfg = loadConfig();
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "data/sample");
const counts = generateSample(out, new Date(), cfg.currency);
console.log(`Wrote SAMPLE data to ${out}`);
console.log(counts);
