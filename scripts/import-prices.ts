import { importPrices } from "../src/lib/importer";
import { CsvFileSource } from "../src/lib/sources";
import { fileArg, hasFlag, setup } from "./_args";

// Usage: npm run import:prices <file.csv> [-- --accept-flagged]
const cfg = setup();
const rows = await new CsvFileSource(fileArg()).load();
const report = importPrices(cfg, rows, { acceptFlagged: hasFlag("--accept-flagged") });
console.log(`Into ${cfg.dataDir}: ${report.added} added, ${report.duplicates} duplicates, ${report.flagged} flagged, ${report.errors.length} errors`);
report.errors.forEach((e) => console.log(`  row ${e.row}: ${e.error}`));
if (report.flagged) console.log("Flagged rows are in flagged.csv. Check them, then import that file again with --accept-flagged.");
process.exit(report.errors.length ? 1 : 0);
